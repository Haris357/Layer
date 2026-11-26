//! Clipboard history engine.
//!
//! A message-only window on its own thread listens for WM_CLIPBOARDUPDATE
//! (instant, nothing polled) and reads text, files and images, plus which app
//! the copy came from. It also owns the Quick Paste hotkey (Win+Shift+V),
//! which works over any app, unlike Layer's other shortcuts.
//!
//! Privacy: copies marked by their app as sensitive (password managers set
//! ExcludeClipboardContentFromMonitorProcessing / CanIncludeInClipboardHistory
//! = 0) are never recorded, and recording can be paused.
//!
//! Threading (see the native-threading rule): nothing here runs on the main
//! thread except the brief window focus calls, which are posted to it.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClipImage {
    pub path: String,
    pub w: u32,
    pub h: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClipSource {
    pub name: String,
    pub exe: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Clip {
    pub kind: String, // "text" | "files" | "image"
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub files: Option<Vec<String>>,
    #[serde(default)]
    pub image: Option<ClipImage>,
    #[serde(default)]
    pub source: Option<ClipSource>,
}

#[cfg(target_os = "windows")]
mod win {
    use super::*;
    use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
    use std::sync::OnceLock;
    use std::time::Duration;
    use tauri::Manager;
    use windows_sys::Win32::Foundation::{CloseHandle, HWND, LPARAM, LRESULT, POINT, WPARAM};
    use windows_sys::Win32::System::DataExchange::{
        AddClipboardFormatListener, CloseClipboard, EmptyClipboard, GetClipboardData, GetClipboardOwner,
        IsClipboardFormatAvailable, OpenClipboard, RegisterClipboardFormatW, SetClipboardData,
    };
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE};
    use windows_sys::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        RegisterHotKey, SendInput, UnregisterHotKey, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, MOD_NOREPEAT,
        MOD_SHIFT, MOD_WIN, VK_CONTROL, VK_LWIN, VK_RWIN, VK_SHIFT,
    };
    use windows_sys::Win32::UI::Shell::DragQueryFileW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetCursorPos, GetForegroundWindow, GetMessageW,
        GetWindowThreadProcessId, PostMessageW, RegisterClassW, SetForegroundWindow, TranslateMessage, HWND_MESSAGE, MSG,
        WM_APP, WM_CLIPBOARDUPDATE, WM_HOTKEY, WNDCLASSW,
    };

    const CF_UNICODETEXT: u32 = 13;
    const CF_HDROP: u32 = 15;
    const CF_DIB: u32 = 8;
    const WM_SET_HOTKEY: u32 = WM_APP + 1;
    const HOTKEY_ID: i32 = 0x4C50; // "LP"

    static APP: OnceLock<AppHandle> = OnceLock::new();
    static HWND_: AtomicIsize = AtomicIsize::new(0);
    static PREV: AtomicIsize = AtomicIsize::new(0);
    pub static PAUSED: AtomicBool = AtomicBool::new(false);
    pub static WANT_HOTKEY: AtomicBool = AtomicBool::new(true);

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }
    fn fmt(name: &str) -> u32 {
        unsafe { RegisterClipboardFormatW(wide(name).as_ptr()) }
    }

    pub fn start(app: AppHandle) {
        if APP.set(app).is_err() {
            return;
        }
        std::thread::Builder::new()
            .name("layer-clipboard".into())
            .spawn(|| unsafe { run() })
            .ok();
    }

    unsafe fn run() {
        let hinst = GetModuleHandleW(std::ptr::null());
        let class = wide("LayerClipboardListener");
        let wc = WNDCLASSW {
            lpfnWndProc: Some(proc),
            hInstance: hinst,
            lpszClassName: class.as_ptr(),
            ..std::mem::zeroed()
        };
        RegisterClassW(&wc);
        let hwnd = CreateWindowExW(0, class.as_ptr(), class.as_ptr(), 0, 0, 0, 0, 0, HWND_MESSAGE, std::ptr::null_mut(), hinst, std::ptr::null());
        if hwnd.is_null() {
            return;
        }
        HWND_.store(hwnd as isize, Ordering::SeqCst);
        AddClipboardFormatListener(hwnd);
        set_hotkey(hwnd, WANT_HOTKEY.load(Ordering::SeqCst));
        let mut msg: MSG = std::mem::zeroed();
        while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }

    unsafe fn set_hotkey(hwnd: HWND, on: bool) {
        UnregisterHotKey(hwnd, HOTKEY_ID);
        if on {
            RegisterHotKey(hwnd, HOTKEY_ID, MOD_WIN | MOD_SHIFT | MOD_NOREPEAT, b'V' as u32);
        }
    }

    unsafe extern "system" fn proc(hwnd: HWND, msg: u32, w: WPARAM, l: LPARAM) -> LRESULT {
        match msg {
            WM_CLIPBOARDUPDATE => {
                if !PAUSED.load(Ordering::SeqCst) {
                    if let (Some(app), Some(clip)) = (APP.get(), read(hwnd)) {
                        let _ = app.emit("clipboard-changed", clip);
                    }
                }
                0
            }
            WM_HOTKEY if w as i32 == HOTKEY_ID => {
                open_quick_paste();
                0
            }
            WM_SET_HOTKEY => {
                set_hotkey(hwnd, w != 0);
                0
            }
            _ => DefWindowProcW(hwnd, msg, w, l),
        }
    }

    pub fn post_hotkey(on: bool) {
        WANT_HOTKEY.store(on, Ordering::SeqCst);
        let h = HWND_.load(Ordering::SeqCst);
        if h != 0 {
            unsafe { PostMessageW(h as HWND, WM_SET_HOTKEY, on as usize, 0) };
        }
    }

    // ── reading ──────────────────────────────────────────────────────────────
    unsafe fn open(owner: HWND) -> bool {
        for _ in 0..10 {
            if OpenClipboard(owner) != 0 {
                return true;
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        false
    }

    unsafe fn bytes(format: u32) -> Option<Vec<u8>> {
        let h = GetClipboardData(format);
        if h.is_null() {
            return None;
        }
        let p = GlobalLock(h as _) as *const u8;
        if p.is_null() {
            return None;
        }
        let n = GlobalSize(h as _);
        let v = std::slice::from_raw_parts(p, n).to_vec();
        GlobalUnlock(h as _);
        Some(v)
    }

    unsafe fn sensitive() -> bool {
        if IsClipboardFormatAvailable(fmt("ExcludeClipboardContentFromMonitorProcessing")) != 0
            || IsClipboardFormatAvailable(fmt("Clipboard Viewer Ignore")) != 0
        {
            return true;
        }
        let f = fmt("CanIncludeInClipboardHistory");
        if IsClipboardFormatAvailable(f) != 0 {
            if let Some(b) = bytes(f) {
                if b.len() >= 4 && u32::from_le_bytes([b[0], b[1], b[2], b[3]]) == 0 {
                    return true;
                }
            }
        }
        false
    }

    unsafe fn source() -> Option<ClipSource> {
        let mut hwnd = GetClipboardOwner();
        if hwnd.is_null() {
            hwnd = GetForegroundWindow();
        }
        if hwnd.is_null() {
            return None;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == 0 || pid == std::process::id() {
            return None;
        }
        let ph = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if ph.is_null() {
            return None;
        }
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(ph, 0, buf.as_mut_ptr(), &mut len) != 0;
        CloseHandle(ph);
        if !ok {
            return None;
        }
        let exe = String::from_utf16_lossy(&buf[..len as usize]);
        let stem = std::path::Path::new(&exe).file_stem()?.to_string_lossy().to_string();
        let mut name = stem.clone();
        if let Some(c) = name.get_mut(0..1) {
            c.make_ascii_uppercase();
        }
        Some(ClipSource { name, exe })
    }

    unsafe fn read(hwnd: HWND) -> Option<Clip> {
        if !open(hwnd) {
            return None;
        }
        let clip = read_open();
        CloseClipboard();
        // Images are encoded off the clipboard lock.
        match clip {
            Some(Raw::Image(rgba, w, h, src)) => save_image(rgba, w, h).map(|image| Clip { kind: "image".into(), text: None, files: None, image: Some(image), source: src }),
            Some(Raw::Clip(c)) => Some(c),
            None => None,
        }
    }

    enum Raw {
        Clip(Clip),
        Image(Vec<u8>, u32, u32, Option<ClipSource>),
    }

    unsafe fn read_open() -> Option<Raw> {
        if sensitive() {
            return None;
        }
        let src = source();
        if IsClipboardFormatAvailable(CF_HDROP) != 0 {
            let h = GetClipboardData(CF_HDROP);
            if !h.is_null() {
                let n = DragQueryFileW(h as _, u32::MAX, std::ptr::null_mut(), 0);
                let mut files = Vec::new();
                for i in 0..n {
                    let len = DragQueryFileW(h as _, i, std::ptr::null_mut(), 0);
                    let mut buf = vec![0u16; len as usize + 1];
                    DragQueryFileW(h as _, i, buf.as_mut_ptr(), len + 1);
                    files.push(String::from_utf16_lossy(&buf[..len as usize]));
                }
                if !files.is_empty() {
                    return Some(Raw::Clip(Clip { kind: "files".into(), text: None, files: Some(files), image: None, source: src }));
                }
            }
        }
        let png = fmt("PNG");
        if IsClipboardFormatAvailable(png) != 0 {
            if let Some(img) = bytes(png).and_then(|b| image::load_from_memory_with_format(&b, image::ImageFormat::Png).ok()) {
                let rgba = img.to_rgba8();
                let (w, h) = rgba.dimensions();
                return Some(Raw::Image(rgba.into_raw(), w, h, src));
            }
        }
        if IsClipboardFormatAvailable(CF_DIB) != 0 {
            if let Some(dib) = bytes(CF_DIB) {
                if let Some((rgba, w, h)) = decode_dib(&dib) {
                    return Some(Raw::Image(rgba, w, h, src));
                }
            }
        }
        if IsClipboardFormatAvailable(CF_UNICODETEXT) != 0 {
            if let Some(b) = bytes(CF_UNICODETEXT) {
                let u: Vec<u16> = b.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).take_while(|&c| c != 0).collect();
                let text = String::from_utf16_lossy(&u);
                if !text.trim().is_empty() {
                    return Some(Raw::Clip(Clip { kind: "text".into(), text: Some(text), files: None, image: None, source: src }));
                }
            }
        }
        None
    }

    /// CF_DIB → RGBA by wrapping it in a BMP file header.
    fn decode_dib(dib: &[u8]) -> Option<(Vec<u8>, u32, u32)> {
        if dib.len() < 40 {
            return None;
        }
        let rd = |o: usize| u32::from_le_bytes([dib[o], dib[o + 1], dib[o + 2], dib[o + 3]]);
        let header = rd(0);
        let bits = u16::from_le_bytes([dib[14], dib[15]]) as u32;
        let compression = rd(16);
        let used = rd(32);
        let masks = if compression == 3 && header == 40 { 12 } else { 0 };
        let colors = if used != 0 { used } else if bits <= 8 { 1 << bits } else { 0 };
        let offset = 14 + header + masks + colors * 4;
        let mut bmp = Vec::with_capacity(14 + dib.len());
        bmp.extend_from_slice(b"BM");
        bmp.extend_from_slice(&((14 + dib.len()) as u32).to_le_bytes());
        bmp.extend_from_slice(&[0, 0, 0, 0]);
        bmp.extend_from_slice(&offset.to_le_bytes());
        bmp.extend_from_slice(dib);
        let img = image::load_from_memory_with_format(&bmp, image::ImageFormat::Bmp).ok()?;
        let mut rgba = img.to_rgba8();
        // 32-bit DIBs usually leave alpha at 0: treat that as opaque.
        if rgba.pixels().all(|p| p[3] == 0) {
            for p in rgba.pixels_mut() {
                p[3] = 255;
            }
        }
        let (w, h) = rgba.dimensions();
        Some((rgba.into_raw(), w, h))
    }

    fn save_image(rgba: Vec<u8>, w: u32, h: u32) -> Option<ClipImage> {
        use std::hash::{Hash, Hasher};
        let app = APP.get()?;
        let mut hs = std::collections::hash_map::DefaultHasher::new();
        rgba.hash(&mut hs);
        (w, h).hash(&mut hs);
        let dir = crate::storage::layer_dir(app).ok()?.join("assets").join("clipboard");
        std::fs::create_dir_all(&dir).ok()?;
        let path = dir.join(format!("{:016x}.png", hs.finish()));
        if !path.exists() {
            image::save_buffer(&path, &rgba, w, h, image::ExtendedColorType::Rgba8).ok()?;
        }
        Some(ClipImage { path: path.to_string_lossy().to_string(), w, h })
    }

    // ── writing ──────────────────────────────────────────────────────────────
    unsafe fn put(format: u32, data: &[u8]) -> bool {
        let h = GlobalAlloc(GMEM_MOVEABLE, data.len().max(1));
        if h.is_null() {
            return false;
        }
        let p = GlobalLock(h) as *mut u8;
        if p.is_null() {
            return false;
        }
        std::ptr::copy_nonoverlapping(data.as_ptr(), p, data.len());
        GlobalUnlock(h);
        !SetClipboardData(format, h as _).is_null()
    }

    pub fn write(clip: &Clip) -> Result<(), String> {
        // Encode images before taking the clipboard lock.
        let image = match (&clip.kind[..], &clip.image) {
            ("image", Some(i)) => {
                let png = std::fs::read(&i.path).map_err(|e| e.to_string())?;
                let rgba = image::load_from_memory(&png).map_err(|e| e.to_string())?.to_rgba8();
                let (w, h) = rgba.dimensions();
                let mut dib = Vec::with_capacity(40 + (w * h * 4) as usize);
                for v in [40u32, w, h] {
                    dib.extend_from_slice(&v.to_le_bytes());
                }
                dib.extend_from_slice(&1u16.to_le_bytes());
                dib.extend_from_slice(&32u16.to_le_bytes());
                for v in [0u32, w * h * 4, 0, 0, 0, 0] {
                    dib.extend_from_slice(&v.to_le_bytes());
                }
                for y in (0..h).rev() {
                    for x in 0..w {
                        let p = rgba.get_pixel(x, y);
                        dib.extend_from_slice(&[p[2], p[1], p[0], p[3]]);
                    }
                }
                Some((png, dib))
            }
            _ => None,
        };
        unsafe {
            let owner = HWND_.load(Ordering::SeqCst) as HWND;
            if !open(owner) {
                return Err("clipboard busy".into());
            }
            EmptyClipboard();
            let ok = match &clip.kind[..] {
                "files" => {
                    let mut data: Vec<u8> = Vec::new();
                    for v in [20u32, 0, 0, 0, 1] {
                        data.extend_from_slice(&v.to_le_bytes());
                    }
                    for f in clip.files.iter().flatten() {
                        for u in wide(f) {
                            data.extend_from_slice(&u.to_le_bytes());
                        }
                    }
                    data.extend_from_slice(&[0, 0]);
                    put(CF_HDROP, &data)
                }
                "image" => match &image {
                    Some((png, dib)) => {
                        put(fmt("PNG"), png);
                        put(CF_DIB, dib)
                    }
                    None => false,
                },
                _ => {
                    let mut data: Vec<u8> = Vec::new();
                    for u in wide(clip.text.as_deref().unwrap_or("")) {
                        data.extend_from_slice(&u.to_le_bytes());
                    }
                    put(CF_UNICODETEXT, &data)
                }
            };
            CloseClipboard();
            if ok {
                Ok(())
            } else {
                Err("couldn't write to the clipboard".into())
            }
        }
    }

    // ── quick paste ──────────────────────────────────────────────────────────
    fn open_quick_paste() {
        let Some(app) = APP.get() else { return };
        let mut pt = POINT { x: 0, y: 0 };
        unsafe {
            let fg = GetForegroundWindow();
            let mut pid = 0u32;
            GetWindowThreadProcessId(fg, &mut pid);
            if pid != std::process::id() {
                PREV.store(fg as isize, Ordering::SeqCst);
            }
            GetCursorPos(&mut pt);
        }
        let a = app.clone();
        let _ = app.run_on_main_thread(move || {
            if let Some(w) = a.get_webview_window("main") {
                crate::window::focus_capture_window(&w);
            }
            let _ = a.emit("quick-paste", (pt.x, pt.y));
        });
    }

    /// Give focus back to the app Quick Paste opened over, and re-pin Layer.
    pub fn restore(app: &AppHandle) {
        let a = app.clone();
        let _ = app.run_on_main_thread(move || {
            if let Some(w) = a.get_webview_window("main") {
                crate::window::set_layer(&w, false);
            }
        });
        let prev = PREV.load(Ordering::SeqCst);
        if prev != 0 {
            unsafe { SetForegroundWindow(prev as HWND) };
        }
    }

    fn key(vk: u16, up: bool) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT { wVk: vk, wScan: 0, dwFlags: if up { KEYEVENTF_KEYUP } else { 0 }, time: 0, dwExtraInfo: 0 },
            },
        }
    }

    /// Paste into the previous app: focus it, then send Ctrl+V (off the main thread).
    pub fn paste(app: &AppHandle) {
        restore(app);
        std::thread::spawn(|| {
            std::thread::sleep(Duration::from_millis(90));
            let inputs = [
                // let go of anything still held from the hotkey
                key(VK_SHIFT, true),
                key(VK_LWIN, true),
                key(VK_RWIN, true),
                key(VK_CONTROL, false),
                key(b'V' as u16, false),
                key(b'V' as u16, true),
                key(VK_CONTROL, true),
            ];
            unsafe { SendInput(inputs.len() as u32, inputs.as_ptr(), std::mem::size_of::<INPUT>() as i32) };
        });
    }

}

#[cfg(target_os = "windows")]
pub use win::start;

#[cfg(not(target_os = "windows"))]
pub fn start(_: AppHandle) {}

#[tauri::command]
pub async fn clip_copy(clip: Clip) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        win::write(&clip)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = clip;
        Err("unsupported".into())
    }
}

/// Write the item to the clipboard, close Quick Paste and paste it into the
/// app that was in front.
#[tauri::command]
pub async fn clip_paste(app: AppHandle, clip: Clip) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        win::write(&clip)?;
        win::paste(&app);
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, clip);
        Err("unsupported".into())
    }
}

/// Quick Paste closed without choosing: hand focus back.
#[tauri::command]
pub async fn clip_cancel(app: AppHandle) {
    #[cfg(target_os = "windows")]
    win::restore(&app);
    #[cfg(not(target_os = "windows"))]
    let _ = app;
}

#[tauri::command]
pub fn clip_options(paused: bool, hotkey: bool) {
    #[cfg(target_os = "windows")]
    {
        win::PAUSED.store(paused, std::sync::atomic::Ordering::SeqCst);
        win::post_hotkey(hotkey);
    }
    #[cfg(not(target_os = "windows"))]
    let _ = (paused, hotkey);
}

/// Delete a stored clipboard image (only inside Layer's clipboard folder).
#[tauri::command]
pub fn clip_forget_image(app: AppHandle, path: String) {
    let Ok(dir) = crate::storage::layer_dir(&app).map(|d| d.join("assets").join("clipboard")) else { return };
    let p = std::path::Path::new(&path);
    if let (Ok(a), Ok(b)) = (p.canonicalize(), dir.canonicalize()) {
        if a.starts_with(&b) {
            let _ = std::fs::remove_file(a);
        }
    }
}
