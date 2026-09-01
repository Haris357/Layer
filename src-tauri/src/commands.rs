use crate::storage;
use crate::window::SharedHits;
use std::path::Path;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub fn set_hit_regions(state: State<SharedHits>, regions: Vec<[i32; 4]>) {
    if let Ok(mut hits) = state.lock() {
        hits.regions = regions;
    }
}

#[tauri::command]
pub fn set_front(app: AppHandle, front: bool) {
    if let Some(window) = app.get_webview_window("main") {
        crate::window::set_layer(&window, front);
    }
}

#[tauri::command]
pub fn set_force_interactive(state: State<SharedHits>, force: bool) {
    if let Ok(mut hits) = state.lock() {
        hits.force = force;
    }
}

#[tauri::command]
pub fn save_canvas(app: AppHandle, json: String) -> Result<(), String> {
    storage::write_canvas(&app, &json)
}

#[tauri::command]
pub fn load_canvas(app: AppHandle) -> Result<String, String> {
    storage::read_canvas(&app)
}

#[tauri::command]
pub fn reset_all(app: AppHandle) -> Result<(), String> {
    storage::clear_canvas(&app)
}

#[tauri::command]
pub fn save_journal(app: AppHandle, json: String) -> Result<(), String> {
    storage::write_journal(&app, &json)
}

#[tauri::command]
pub fn load_journal(app: AppHandle) -> Result<String, String> {
    storage::read_journal(&app)
}

#[tauri::command]
pub fn save_spaces(app: AppHandle, json: String) -> Result<(), String> {
    storage::write_templates(&app, &json)
}

#[tauri::command]
pub fn load_spaces(app: AppHandle) -> Result<String, String> {
    storage::read_templates(&app)
}

#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn quit_app() {
    // Hard-exit: never wait on teardown (a stuck thread/COM call could
    // otherwise leave the window "not responding" instead of closing).
    std::process::exit(0);
}

#[tauri::command]
pub fn get_app_version(app: AppHandle) -> Result<String, String> {
    Ok(app.package_info().version.to_string())
}

// "screensaver" when Windows launched us with /s, otherwise "normal". The
// frontend uses this to decide which view to render.
#[tauri::command]
pub fn get_launch_mode(state: State<crate::screensaver::Launch>) -> String {
    if state.screensaver {
        "screensaver".into()
    } else {
        "normal".into()
    }
}

// Called by the ambient view on any key/mouse activity to dismiss the
// screensaver.
#[tauri::command]
pub fn exit_screensaver(app: AppHandle) {
    app.exit(0);
}

// Returns the desktop's dominant accent colour as a #rrggbb hex string,
// sampled from the current wallpaper (saturation-weighted so the accent is
// vibrant rather than a muddy average).
#[tauri::command]
pub async fn get_wallpaper_accent() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        // Decode + sample on a blocking thread so the (potentially large)
        // wallpaper image never freezes the UI.
        tauri::async_runtime::spawn_blocking(|| -> Result<String, String> {
            use windows_sys::Win32::UI::WindowsAndMessaging::{
                SystemParametersInfoW, SPI_GETDESKWALLPAPER,
            };
            let mut buf = [0u16; 520];
            let ok = unsafe {
                SystemParametersInfoW(
                    SPI_GETDESKWALLPAPER,
                    buf.len() as u32,
                    buf.as_mut_ptr() as *mut std::ffi::c_void,
                    0,
                )
            };
            if ok == 0 {
                return Err("no wallpaper".into());
            }
            let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
            let path = String::from_utf16_lossy(&buf[..end]);
            if path.is_empty() {
                return Err("empty wallpaper path".into());
            }

            let img = image::open(&path).map_err(|e| e.to_string())?;
            let small = img
                .resize(48, 48, image::imageops::FilterType::Triangle)
                .to_rgb8();

            let (mut wr, mut wg, mut wb, mut wsum) = (0f64, 0f64, 0f64, 0f64);
            for p in small.pixels() {
                let (r, g, b) = (p[0] as f64, p[1] as f64, p[2] as f64);
                let max = r.max(g).max(b);
                let min = r.min(g).min(b);
                let sat = if max == 0.0 { 0.0 } else { (max - min) / max };
                // Vibrant pixels dominate; tiny base so flat walls still average.
                let w = sat * sat + 0.02;
                wr += r * w;
                wg += g * w;
                wb += b * w;
                wsum += w;
            }
            if wsum == 0.0 {
                return Err("no pixels".into());
            }
            let r = (wr / wsum).round() as u32;
            let g = (wg / wsum).round() as u32;
            let b = (wb / wsum).round() as u32;
            Ok(format!("#{:02x}{:02x}{:02x}", r, g, b))
        })
        .await
        .map_err(|e| e.to_string())?
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("unsupported".into())
    }
}

// Opens the system file explorer with the given file selected.
#[tauri::command]
pub fn show_in_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        std::process::Command::new("explorer")
            .raw_arg(format!("/select,\"{}\"", path))
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        Err("unsupported".into())
    }
}

// Settings toggle: install or remove Layer as the active Windows screensaver.
#[tauri::command]
pub fn set_screensaver_enabled(enabled: bool) {
    crate::screensaver::set_enabled(enabled);
}

// Settings "Preview" button: show the screensaver right now.
#[tauri::command]
pub fn preview_screensaver() {
    crate::screensaver::preview();
}

// Screensaver theme (ambient / minimal / quote), persisted to a file so the
// separate screensaver process can read it.
#[tauri::command]
pub fn set_screensaver_theme(theme: String) {
    crate::screensaver::set_theme(&theme);
}

#[tauri::command]
pub fn get_screensaver_theme() -> String {
    crate::screensaver::get_theme()
}

// Settings toggle: enable/disable the top-left hot corner that cycles spaces.
#[tauri::command]
pub fn set_hotcorner(enabled: bool) {
    crate::window::set_hotcorner(enabled);
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    std::process::Command::new("cmd")
        .args(["/C", "start", "", &url])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn import_asset(app: AppHandle, source_path: String) -> Result<String, String> {
    let assets = storage::assets_dir(&app)?;
    let source = Path::new(&source_path);
    let ext = source
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("bin");
    let new_name = format!("{}.{}", uuid::Uuid::new_v4(), ext);
    let dest = assets.join(&new_name);
    std::fs::copy(source, &dest).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
pub fn delete_asset(asset_path: String) -> Result<(), String> {
    let path = Path::new(&asset_path);
    if path.exists() {
        std::fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(serde::Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SystemStats {
    cpu: f32,
    mem_used: u64,
    mem_total: u64,
    disk_used: u64,
    disk_total: u64,
    battery: i32,
    charging: bool,
}

#[cfg(target_os = "windows")]
fn battery_status() -> (i32, bool) {
    use windows_sys::Win32::System::Power::{
        GetSystemPowerStatus, SYSTEM_POWER_STATUS,
    };
    let mut status: SYSTEM_POWER_STATUS = unsafe { std::mem::zeroed() };
    let ok = unsafe { GetSystemPowerStatus(&mut status) };
    if ok == 0 {
        return (-1, false)
    }
    let pct = if status.BatteryLifePercent == 255 {
        -1
    } else {
        status.BatteryLifePercent as i32
    };
    (pct, status.ACLineStatus == 1)
}

#[cfg(not(target_os = "windows"))]
fn battery_status() -> (i32, bool) {
    (-1, false)
}

#[tauri::command]
pub async fn get_system_stats() -> SystemStats {
    // Runs on a blocking pool thread — it samples CPU with a 220ms sleep, which
    // must never run on the main thread (would stall the UI every poll).
    tauri::async_runtime::spawn_blocking(|| {
        use sysinfo::{Disks, System};
        let mut sys = System::new();
        sys.refresh_cpu_usage();
        std::thread::sleep(std::time::Duration::from_millis(220));
        sys.refresh_cpu_usage();
        sys.refresh_memory();

        let disks = Disks::new_with_refreshed_list();
        let mut disk_total = 0u64;
        let mut disk_avail = 0u64;
        for disk in &disks {
            disk_total += disk.total_space();
            disk_avail += disk.available_space();
        }

        let (battery, charging) = battery_status();

        SystemStats {
            cpu: sys.global_cpu_usage(),
            mem_used: sys.used_memory(),
            mem_total: sys.total_memory(),
            disk_used: disk_total.saturating_sub(disk_avail),
            disk_total,
            battery,
            charging,
        }
    })
    .await
    .unwrap_or_default()
}

#[derive(serde::Serialize)]
pub struct AppEntry {
    name: String,
    path: String,
}

fn scan_lnks(dir: &Path, out: &mut Vec<AppEntry>) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            scan_lnks(&path, out);
        } else if path
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s.eq_ignore_ascii_case("lnk"))
            .unwrap_or(false)
        {
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                out.push(AppEntry {
                    name: stem.to_string(),
                    path: path.to_string_lossy().to_string(),
                });
            }
        }
    }
}

#[tauri::command]
pub async fn list_apps() -> Vec<AppEntry> {
    // Recursive Start-Menu directory scan — off the main thread so the disk
    // walk never stalls the UI.
    tauri::async_runtime::spawn_blocking(|| {
        let mut out: Vec<AppEntry> = Vec::new();
        if let Ok(program_data) = std::env::var("ProgramData") {
            scan_lnks(
                &Path::new(&program_data)
                    .join("Microsoft\\Windows\\Start Menu\\Programs"),
                &mut out,
            );
        }
        if let Ok(app_data) = std::env::var("APPDATA") {
            scan_lnks(
                &Path::new(&app_data)
                    .join("Microsoft\\Windows\\Start Menu\\Programs"),
                &mut out,
            );
        }
        out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        out.dedup_by(|a, b| a.name.eq_ignore_ascii_case(&b.name));
        out
    })
    .await
    .unwrap_or_default()
}

#[tauri::command]
pub fn launch_app(path: String) -> Result<(), String> {
    std::process::Command::new("cmd")
        .args(["/C", "start", "", &path])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn extract_icon(path: &str) -> Option<String> {
    use base64::Engine;
    use windows::core::PCWSTR;
    use windows::Win32::Graphics::Gdi::{
        DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ,
    };
    use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;
    use windows::Win32::UI::Shell::{
        SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        DestroyIcon, GetIconInfo, ICONINFO,
    };

    let wide: Vec<u16> =
        path.encode_utf16().chain(std::iter::once(0)).collect();

    unsafe {
        let mut shfi = SHFILEINFOW::default();
        let ok = SHGetFileInfoW(
            PCWSTR(wide.as_ptr()),
            FILE_FLAGS_AND_ATTRIBUTES(0),
            Some(&mut shfi),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON,
        );
        if ok == 0 {
            return None;
        }
        let hicon = shfi.hIcon;

        let mut info = ICONINFO::default();
        if GetIconInfo(hicon, &mut info).is_err() {
            let _ = DestroyIcon(hicon);
            return None;
        }
        let hbm_color = info.hbmColor;

        let mut bmp = BITMAP::default();
        GetObjectW(
            HGDIOBJ(hbm_color.0),
            std::mem::size_of::<BITMAP>() as i32,
            Some(&mut bmp as *mut _ as *mut core::ffi::c_void),
        );
        let w = bmp.bmWidth;
        let h = bmp.bmHeight;

        let cleanup = || {
            let _ = DeleteObject(HGDIOBJ(hbm_color.0));
            let _ = DeleteObject(HGDIOBJ(info.hbmMask.0));
            let _ = DestroyIcon(hicon);
        };

        if w <= 0 || h <= 0 || w > 512 || h > 512 {
            cleanup();
            return None;
        }

        let mut bi = BITMAPINFO::default();
        bi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        bi.bmiHeader.biWidth = w;
        bi.bmiHeader.biHeight = -h;
        bi.bmiHeader.biPlanes = 1;
        bi.bmiHeader.biBitCount = 32;
        bi.bmiHeader.biCompression = BI_RGB.0 as u32;

        let mut buf = vec![0u8; (w * h * 4) as usize];
        let dc = GetDC(None);
        let lines = GetDIBits(
            dc,
            hbm_color,
            0,
            h as u32,
            Some(buf.as_mut_ptr() as *mut core::ffi::c_void),
            &mut bi,
            DIB_RGB_COLORS,
        );
        ReleaseDC(None, dc);
        cleanup();

        if lines == 0 {
            return None;
        }

        let count = (w * h) as usize;
        let any_alpha = (0..count).any(|i| buf[i * 4 + 3] != 0);
        let mut rgba = Vec::with_capacity(count * 4);
        for i in 0..count {
            rgba.push(buf[i * 4 + 2]);
            rgba.push(buf[i * 4 + 1]);
            rgba.push(buf[i * 4]);
            rgba.push(if any_alpha { buf[i * 4 + 3] } else { 255 });
        }

        let mut png_bytes: Vec<u8> = Vec::new();
        {
            let mut encoder =
                png::Encoder::new(&mut png_bytes, w as u32, h as u32);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            let mut writer = encoder.write_header().ok()?;
            writer.write_image_data(&rgba).ok()?;
        }
        let b64 =
            base64::engine::general_purpose::STANDARD.encode(&png_bytes);
        Some(format!("data:image/png;base64,{}", b64))
    }
}

#[cfg(target_os = "windows")]
fn capture_screen_png() -> Option<Vec<u8>> {
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC,
        DeleteObject, GetDC, GetDIBits, ReleaseDC, SelectObject, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ, SRCCOPY,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN,
    };

    unsafe {
        let w = GetSystemMetrics(SM_CXSCREEN);
        let h = GetSystemMetrics(SM_CYSCREEN);
        if w <= 0 || h <= 0 {
            return None
        }
        let screen = GetDC(None);
        let memdc = CreateCompatibleDC(Some(screen));
        let bmp = CreateCompatibleBitmap(screen, w, h);
        let old = SelectObject(memdc, HGDIOBJ(bmp.0));
        let blit = BitBlt(memdc, 0, 0, w, h, Some(screen), 0, 0, SRCCOPY);

        let mut bi = BITMAPINFO::default();
        bi.bmiHeader.biSize =
            std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        bi.bmiHeader.biWidth = w;
        bi.bmiHeader.biHeight = -h;
        bi.bmiHeader.biPlanes = 1;
        bi.bmiHeader.biBitCount = 32;
        bi.bmiHeader.biCompression = BI_RGB.0 as u32;

        let mut buf = vec![0u8; (w * h * 4) as usize];
        let lines = GetDIBits(
            memdc,
            bmp,
            0,
            h as u32,
            Some(buf.as_mut_ptr() as *mut core::ffi::c_void),
            &mut bi,
            DIB_RGB_COLORS,
        );

        SelectObject(memdc, old);
        let _ = DeleteObject(HGDIOBJ(bmp.0));
        let _ = DeleteDC(memdc);
        ReleaseDC(None, screen);

        if blit.is_err() || lines == 0 {
            return None
        }

        let count = (w * h) as usize;
        let mut rgba = Vec::with_capacity(count * 4);
        for i in 0..count {
            rgba.push(buf[i * 4 + 2]);
            rgba.push(buf[i * 4 + 1]);
            rgba.push(buf[i * 4]);
            rgba.push(255);
        }

        let mut png_bytes: Vec<u8> = Vec::new();
        {
            let mut encoder =
                png::Encoder::new(&mut png_bytes, w as u32, h as u32);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            let mut writer = encoder.write_header().ok()?;
            writer.write_image_data(&rgba).ok()?;
        }
        Some(png_bytes)
    }
}

#[tauri::command]
pub fn capture_screen(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let png = capture_screen_png().ok_or("Screen capture failed")?;
        std::fs::write(&path, png).map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        Err("Unsupported platform".to_string())
    }
}

#[tauri::command]
pub fn capture_screen_base64() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use base64::Engine;
        let png = capture_screen_png().ok_or("Screen capture failed")?;
        Ok(base64::engine::general_purpose::STANDARD.encode(&png))
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Unsupported platform".to_string())
    }
}

#[tauri::command]
pub fn write_binary_file(path: String, data_base64: String) -> Result<(), String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64.as_bytes())
        .map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_binary_file(path: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

#[tauri::command]
pub async fn get_app_icon(path: String) -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        // Shell icon extraction is blocking I/O — keep it off the main thread.
        tauri::async_runtime::spawn_blocking(move || extract_icon(&path))
            .await
            .ok()
            .flatten()
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        None
    }
}

#[cfg(target_os = "windows")]
fn ensure_com() {
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }
}

// Drive a WinRT async op to completion via its completion handler + a channel
// with a timeout — instead of `IAsyncOperation::get()`, whose internal blocking
// wait never wakes in this process (the request just hangs forever). Returns
// None on timeout/error so a stuck media app can never freeze us.
#[cfg(target_os = "windows")]
fn await_op<T>(op: windows::Foundation::IAsyncOperation<T>, ms: u64) -> Option<T>
where
    T: windows::core::RuntimeType + Send + 'static,
{
    use windows::Foundation::AsyncOperationCompletedHandler;
    let (tx, rx) = std::sync::mpsc::channel::<windows::core::Result<T>>();
    let handler = AsyncOperationCompletedHandler::<T>::new(move |op, _status| {
        if let Ok(o) = op.ok() {
            let _ = tx.send(o.GetResults());
        }
        Ok(())
    });
    if op.SetCompleted(&handler).is_err() {
        return None;
    }
    rx.recv_timeout(std::time::Duration::from_millis(ms)).ok()?.ok()
}

// Like await_op, but polls the operation's status on the CALLING thread instead
// of routing the result through a completion handler + channel. Needed for
// non-agile (non-Send) results — e.g. media streams — which can't be moved
// across threads. Sleeps between polls (never a blocking `.get()`), so a stuck
// op just times out.
#[cfg(target_os = "windows")]
fn poll_op<T: windows::core::RuntimeType>(
    op: windows::Foundation::IAsyncOperation<T>,
    ms: u64,
) -> Option<T> {
    use windows::Foundation::AsyncStatus;
    let start = std::time::Instant::now();
    loop {
        match op.Status() {
            Ok(AsyncStatus::Completed) => return op.GetResults().ok(),
            Ok(AsyncStatus::Started) => {
                if start.elapsed() >= std::time::Duration::from_millis(ms) {
                    return None;
                }
                std::thread::sleep(std::time::Duration::from_millis(10));
            }
            _ => return None,
        }
    }
}

// The system's current coordinates via the Windows Geolocator, when location
// access is enabled. Runs on a worker thread with a timeout so it can never
// hang the app if the location service is slow or blocked. Returns [lat, lon].
#[tauri::command]
pub async fn get_system_location() -> Result<(f64, f64), String> {
    #[cfg(target_os = "windows")]
    {
        tauri::async_runtime::spawn_blocking(|| -> Result<(f64, f64), String> {
            ensure_com();
            use windows::Devices::Geolocation::Geolocator;
            let locator = Geolocator::new().map_err(|e| e.to_string())?;
            let op = locator.GetGeopositionAsync().map_err(|e| e.to_string())?;
            // Bound the await (GPS can be slow) so a blocked location service
            // can never hang this worker thread forever.
            let pos =
                await_op(op, 8000).ok_or_else(|| "location timed out".to_string())?;
            let basic = (|| -> windows::core::Result<_> {
                Ok(pos.Coordinate()?.Point()?.Position()?)
            })()
            .map_err(|e| e.to_string())?;
            Ok((basic.Latitude, basic.Longitude))
        })
        .await
        .map_err(|e| e.to_string())?
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("unsupported".into())
    }
}

#[derive(serde::Serialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NowPlaying {
    has_session: bool,
    title: String,
    artist: String,
    playing: bool,
    // Album/track art from the media session, as a `data:` URL. Empty if none.
    thumb: String,
    // Source app id (e.g. "Spotify.exe" / a Store AUMID / "msedge.exe").
    source: String,
    // Playback position + track length in seconds (0 when the app reports none).
    position: f64,
    duration: f64,
}

// ── Now Playing via a long-lived SMTC worker ────────────────────────────────
// The session manager is NOT a stateless query object: after RequestAsync it
// populates its session list asynchronously, so creating + dropping one per
// poll always reads empty. Instead we own ONE manager for the app's lifetime
// on a dedicated MTA thread, keep a snapshot, and serve reads from that.

#[cfg(target_os = "windows")]
enum Cmd {
    Next,
    Prev,
    Toggle,
}

#[cfg(target_os = "windows")]
struct Smtc {
    np: std::sync::Arc<std::sync::Mutex<NowPlaying>>,
    tx: std::sync::mpsc::Sender<Cmd>,
}

#[cfg(target_os = "windows")]
static SMTC: std::sync::OnceLock<Smtc> = std::sync::OnceLock::new();

#[cfg(target_os = "windows")]
fn smtc() -> &'static Smtc {
    SMTC.get_or_init(|| {
        let np = std::sync::Arc::new(std::sync::Mutex::new(NowPlaying::default()));
        let (tx, rx) = std::sync::mpsc::channel::<Cmd>();
        let worker = np.clone();
        let _ = std::thread::Builder::new()
            .name("smtc".into())
            .spawn(move || media_thread(worker, rx));
        Smtc { np, tx }
    })
}

#[cfg(target_os = "windows")]
fn media_thread(
    np: std::sync::Arc<std::sync::Mutex<NowPlaying>>,
    rx: std::sync::mpsc::Receiver<Cmd>,
) {
    use std::sync::mpsc::RecvTimeoutError;
    use std::time::Duration;
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager as Mgr;
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }

    // Self-healing: (re)create the manager whenever it's missing or has gone
    // bad, and NEVER exit. If the OS media service wedges (completions stop
    // firing — a Windows state a reboot clears) await_op just times out, so we
    // never hang; we keep retrying and auto-recover once it comes back, instead
    // of staying dead until an app restart.
    let mut mgr: Option<Mgr> = None;
    let mut fails = 0u32;
    // Cache the decoded album art keyed by "title|artist" so we only read the
    // thumbnail stream when the track actually changes (read_session runs ~1×/s).
    let mut thumb_cache: (String, String) = (String::new(), String::new());
    // When a command was applied at the bottom of the previous iteration, skip
    // the album-art read on the next snapshot so back-to-back presses stay fast.
    let mut skip_thumb_next = false;
    loop {
        if mgr.is_none() {
            mgr = Mgr::RequestAsync().ok().and_then(|op| await_op(op, 4000));
            if mgr.is_none() {
                if let Ok(mut g) = np.lock() {
                    *g = NowPlaying::default();
                }
                // Back off, then retry — unless the app is shutting down.
                match rx.recv_timeout(Duration::from_secs(3)) {
                    Err(RecvTimeoutError::Disconnected) => break,
                    _ => continue,
                }
            }
        }
        let m = match mgr.as_ref() {
            Some(m) => m,
            None => continue,
        };
        // Apply any queued commands FIRST so a button press never waits behind
        // a snapshot read (album-art reads can be slow). `did_cmd` makes the
        // following snapshot skip the slower art read so playback stays snappy.
        let mut did_cmd = skip_thumb_next;
        skip_thumb_next = false;
        while let Ok(cmd) = rx.try_recv() {
            apply(m, cmd);
            did_cmd = true;
        }
        match read_session(m, &mut thumb_cache, did_cmd) {
            Ok(snap) => {
                fails = 0;
                if let Ok(mut g) = np.lock() {
                    *g = snap;
                }
            }
            Err(_) => {
                // Manager/COM looks broken — drop it so we rebuild next loop.
                fails += 1;
                if fails >= 3 {
                    fails = 0;
                    mgr = None;
                }
            }
        }
        // Idle until the next command (wakes instantly when one is sent) or a
        // ~0.8s refresh tick. A command applied here skips the next art read so
        // back-to-back presses stay responsive.
        match rx.recv_timeout(Duration::from_millis(800)) {
            Ok(cmd) => {
                if let Some(m2) = mgr.as_ref() {
                    apply(m2, cmd);
                    skip_thumb_next = true;
                }
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => break,
        }
    }
}

#[cfg(target_os = "windows")]
fn read_session(
    mgr: &windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager,
    thumb_cache: &mut (String, String),
    skip_thumb: bool,
) -> windows::core::Result<NowPlaying> {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status;

    let list = mgr.GetSessions()?;
    let mut sessions: Vec<_> = (&list).into_iter().collect();

    // Prefer a session that's actually playing; else the OS "current" one;
    // else just the first session that exists.
    let playing_idx = sessions.iter().position(|s| {
        s.GetPlaybackInfo()
            .and_then(|i| i.PlaybackStatus())
            .map(|st| st == Status::Playing)
            .unwrap_or(false)
    });

    let session = match playing_idx {
        Some(i) => sessions.swap_remove(i),
        None => match mgr.GetCurrentSession() {
            Ok(s) => s,
            Err(_) if !sessions.is_empty() => sessions.swap_remove(0),
            // No sessions at all → every media app is closed. Report "nothing
            // playing" (not an error) so the widget clears instead of holding
            // the last track.
            Err(_) => return Ok(NowPlaying::default()),
        },
    };

    let mut np = NowPlaying {
        has_session: true,
        ..Default::default()
    };
    let mut props_opt = None;
    if let Some(props) = await_op(session.TryGetMediaPropertiesAsync()?, 1500) {
        np.title = props.Title().map(|s| s.to_string()).unwrap_or_default();
        np.artist = props.Artist().map(|s| s.to_string()).unwrap_or_default();
        props_opt = Some(props);
    }
    if let Ok(info) = session.GetPlaybackInfo() {
        np.playing = info
            .PlaybackStatus()
            .map(|s| s == Status::Playing)
            .unwrap_or(false);
    }
    if let Ok(src) = session.SourceAppUserModelId() {
        np.source = src.to_string();
    }
    // Timeline (seconds). SMTC reports TimeSpan in 100ns ticks.
    if let Ok(tl) = session.GetTimelineProperties() {
        if let Ok(p) = tl.Position() {
            np.position = p.Duration as f64 / 10_000_000.0;
        }
        if let Ok(e) = tl.EndTime() {
            np.duration = e.Duration as f64 / 10_000_000.0;
        }
    }
    // Album art: only re-read the thumbnail stream when the track changes.
    let key = format!("{}|{}", np.title, np.artist);
    if !skip_thumb && key != thumb_cache.0 {
        thumb_cache.0 = key;
        thumb_cache.1 = props_opt
            .as_ref()
            .and_then(read_thumb)
            .unwrap_or_default();
    }
    np.thumb = thumb_cache.1.clone();
    Ok(np)
}

// Read the media session's thumbnail into a `data:` URL. Bounded by await_op
// timeouts so a stuck media service can never hang the worker.
#[cfg(target_os = "windows")]
fn read_thumb(
    props: &windows::Media::Control::GlobalSystemMediaTransportControlsSessionMediaProperties,
) -> Option<String> {
    use base64::Engine;
    use windows::Storage::Streams::DataReader;

    let thumb_ref = props.Thumbnail().ok()?;
    let stream = poll_op(thumb_ref.OpenReadAsync().ok()?, 700)?;
    let size = stream.Size().ok()?;
    // Skip empty or implausibly large art (defensive).
    if size == 0 || size > 8_000_000 {
        return None;
    }
    let input = stream.GetInputStreamAt(0).ok()?;
    let reader = DataReader::CreateDataReader(&input).ok()?;
    let loaded = poll_op(reader.LoadAsync(size as u32).ok()?, 700)?;
    let mut buf = vec![0u8; loaded as usize];
    reader.ReadBytes(&mut buf).ok()?;
    let mime = stream
        .ContentType()
        .ok()
        .map(|h| h.to_string())
        .filter(|s| s.starts_with("image/"))
        .unwrap_or_else(|| "image/jpeg".into());
    let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);
    Some(format!("data:{};base64,{}", mime, b64))
}

#[cfg(target_os = "windows")]
fn apply(
    mgr: &windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager,
    cmd: Cmd,
) {
    let session = match mgr.GetCurrentSession() {
        Ok(s) => s,
        Err(_) => return,
    };
    let op = match cmd {
        Cmd::Next => session.TrySkipNextAsync(),
        Cmd::Prev => session.TrySkipPreviousAsync(),
        Cmd::Toggle => session.TryTogglePlayPauseAsync(),
    };
    if let Ok(op) = op {
        let _ = await_op(op, 2000);
    }
}

#[tauri::command]
pub fn get_now_playing() -> NowPlaying {
    #[cfg(target_os = "windows")]
    {
        smtc().np.lock().map(|g| g.clone()).unwrap_or_default()
    }
    #[cfg(not(target_os = "windows"))]
    {
        NowPlaying::default()
    }
}

#[tauri::command]
pub fn media_control(action: String) {
    #[cfg(target_os = "windows")]
    {
        // Hand the command to the SMTC worker so it runs on the same thread
        // that owns the live session manager (no cross-thread COM proxying).
        let cmd = match action.as_str() {
            "next" => Cmd::Next,
            "prev" => Cmd::Prev,
            _ => Cmd::Toggle,
        };
        let _ = smtc().tx.send(cmd);
    }
    #[cfg(not(target_os = "windows"))]
    let _ = action;
}

#[derive(serde::Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NotificationItem {
    id: u32,
    app: String,
    title: String,
    body: String,
}

#[tauri::command]
pub async fn get_notifications() -> Vec<NotificationItem> {
    #[cfg(target_os = "windows")]
    {
        tauri::async_runtime::spawn_blocking(|| {
            use windows::UI::Notifications::Management::UserNotificationListener;
            use windows::UI::Notifications::NotificationKinds;
            ensure_com();
            let listener = match UserNotificationListener::Current() {
                Ok(l) => l,
                Err(_) => return Vec::new(),
            };
            // Access status is a Send enum, so await_op is fine here.
            if let Ok(op) = listener.RequestAccessAsync() {
                let _ = await_op(op, 2000);
            }
            match listener.GetNotificationsAsync(NotificationKinds::Toast) {
                Ok(op) => await_notifications(op, 2000),
                Err(_) => Vec::new(),
            }
        })
        .await
        .unwrap_or_default()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Vec::new()
    }
}

// The notification list (IVectorView<UserNotification>) is a non-agile COM type
// that can't cross threads, so we extract the plain fields INSIDE the completion
// handler and send only the Send-safe Vec out — bounded by a timeout so a
// wedged notification service can never hang us.
#[cfg(target_os = "windows")]
fn await_notifications(
    op: windows::Foundation::IAsyncOperation<
        windows::Foundation::Collections::IVectorView<
            windows::UI::Notifications::UserNotification,
        >,
    >,
    ms: u64,
) -> Vec<NotificationItem> {
    use windows::Foundation::Collections::IVectorView;
    use windows::Foundation::AsyncOperationCompletedHandler;
    use windows::UI::Notifications::{KnownNotificationBindings, UserNotification};
    let (tx, rx) = std::sync::mpsc::channel::<Vec<NotificationItem>>();
    let handler = AsyncOperationCompletedHandler::<IVectorView<UserNotification>>::new(
        move |op, _status| {
        let mut out = Vec::new();
        if let Ok(o) = op.ok() {
            if let Ok(list) = o.GetResults() {
                for un in &list {
                    let id = un.Id().unwrap_or(0);
                    let app = un
                        .AppInfo()
                        .and_then(|ai| ai.DisplayInfo())
                        .and_then(|di| di.DisplayName())
                        .map(|s| s.to_string())
                        .unwrap_or_default();
                    let mut title = String::new();
                    let mut body = String::new();
                    if let Ok(notif) = un.Notification() {
                        if let Ok(visual) = notif.Visual() {
                            if let Ok(template) =
                                KnownNotificationBindings::ToastGeneric()
                            {
                                if let Ok(binding) = visual.GetBinding(&template) {
                                    if let Ok(texts) = binding.GetTextElements() {
                                        for (i, t) in (&texts).into_iter().enumerate() {
                                            let s = t
                                                .Text()
                                                .map(|x| x.to_string())
                                                .unwrap_or_default();
                                            if i == 0 {
                                                title = s;
                                            } else if !s.is_empty() {
                                                if !body.is_empty() {
                                                    body.push(' ');
                                                }
                                                body.push_str(&s);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    out.push(NotificationItem { id, app, title, body });
                }
            }
        }
        let _ = tx.send(out);
        Ok(())
    });
    if op.SetCompleted(&handler).is_err() {
        return Vec::new();
    }
    rx.recv_timeout(std::time::Duration::from_millis(ms))
        .unwrap_or_default()
}

#[tauri::command]
pub async fn clear_notification(id: u32) {
    #[cfg(target_os = "windows")]
    {
        let _ = tauri::async_runtime::spawn_blocking(move || {
            use windows::UI::Notifications::Management::UserNotificationListener;
            ensure_com();
            if let Ok(listener) = UserNotificationListener::Current() {
                let _ = listener.RemoveNotification(id);
            }
        })
        .await;
    }
    #[cfg(not(target_os = "windows"))]
    let _ = id;
}

#[cfg(target_os = "windows")]
unsafe fn endpoint_volume(
) -> windows::core::Result<windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume>
{
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::Media::Audio::{
        eMultimedia, eRender, IMMDeviceEnumerator, MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};
    let enumerator: IMMDeviceEnumerator =
        CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
    let device = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia)?;
    device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None)
}

#[tauri::command]
pub async fn get_volume() -> f32 {
    #[cfg(target_os = "windows")]
    {
        // COM audio calls off the main thread so a slow endpoint can't stall UI.
        tauri::async_runtime::spawn_blocking(|| {
            ensure_com();
            unsafe {
                if let Ok(vol) = endpoint_volume() {
                    if let Ok(level) = vol.GetMasterVolumeLevelScalar() {
                        return level;
                    }
                }
            }
            -1.0
        })
        .await
        .unwrap_or(-1.0)
    }
    #[cfg(not(target_os = "windows"))]
    {
        -1.0
    }
}

#[tauri::command]
pub async fn set_volume(level: f32) {
    #[cfg(target_os = "windows")]
    {
        let _ = tauri::async_runtime::spawn_blocking(move || {
            ensure_com();
            unsafe {
                if let Ok(vol) = endpoint_volume() {
                    let _ = vol.SetMasterVolumeLevelScalar(
                        level.clamp(0.0, 1.0),
                        std::ptr::null(),
                    );
                }
            }
        })
        .await;
    }
    #[cfg(not(target_os = "windows"))]
    let _ = level;
}

// List active output + input audio devices (COM runs off the main thread).
#[tauri::command]
pub async fn list_audio_devices() -> Vec<crate::audio::AudioDevice> {
    tauri::async_runtime::spawn_blocking(crate::audio::list_devices)
        .await
        .unwrap_or_default()
}

// Make the given device the system default (for all roles). Returns whether it
// succeeded so the UI can refresh / show an error.
#[tauri::command]
pub async fn set_audio_device(id: String) -> bool {
    tauri::async_runtime::spawn_blocking(move || crate::audio::set_default_device(&id))
        .await
        .unwrap_or(false)
}

#[tauri::command]
pub async fn clear_all_notifications() {
    #[cfg(target_os = "windows")]
    {
        let _ = tauri::async_runtime::spawn_blocking(|| {
            use windows::UI::Notifications::Management::UserNotificationListener;
            ensure_com();
            if let Ok(listener) = UserNotificationListener::Current() {
                let _ = listener.ClearNotifications();
            }
        })
        .await;
    }
}

// One configurable global shortcut, sent from the frontend.
#[derive(serde::Deserialize)]
pub struct ShortcutDef {
    pub action: String,
    pub accelerator: String,
    pub enabled: bool,
}

// The built-in defaults (used at startup before the frontend applies the saved
// config). Matches the frontend's default accelerators.
pub fn default_shortcuts() -> Vec<ShortcutDef> {
    vec![
        ShortcutDef { action: "toggle".into(), accelerator: "CmdOrControl+Shift+Space".into(), enabled: true },
        ShortcutDef { action: "capture".into(), accelerator: "CmdOrControl+Shift+N".into(), enabled: true },
        ShortcutDef { action: "screensaver".into(), accelerator: "CmdOrControl+Shift+S".into(), enabled: true },
        ShortcutDef { action: "cycle".into(), accelerator: "CmdOrControl+Shift+E".into(), enabled: true },
        ShortcutDef { action: "hideAll".into(), accelerator: "CmdOrControl+Shift+H".into(), enabled: true },
    ]
}

// Unregister everything, then register only the enabled shortcuts and record
// which action each maps to. A bad/unparseable accelerator is skipped rather
// than failing the whole set.
pub fn apply_shortcuts(app: &AppHandle, defs: &[ShortcutDef]) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let state = app.state::<crate::SharedShortcuts>();
    let mut map = state.lock().map_err(|e| e.to_string())?;
    map.clear();
    for d in defs {
        if !d.enabled {
            continue;
        }
        let sc: Shortcut = match d.accelerator.parse() {
            Ok(s) => s,
            Err(_) => continue,
        };
        if gs.register(sc.clone()).is_ok() {
            map.push((sc, d.action.clone()));
        }
    }
    Ok(())
}

#[tauri::command]
pub fn set_shortcuts(app: AppHandle, shortcuts: Vec<ShortcutDef>) -> Result<(), String> {
    apply_shortcuts(&app, &shortcuts)
}

// ── DiskInfo widget ─────────────────────────────────────────────────────────

#[derive(serde::Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DiskInfo {
    name: String,
    mount: String,
    fs: String,
    kind: String, // "ssd" | "hdd" | "unknown"
    total: u64,
    available: u64,
    removable: bool,
}

#[tauri::command]
pub async fn get_disks() -> Vec<DiskInfo> {
    // sysinfo disk enumeration off the main thread.
    tauri::async_runtime::spawn_blocking(|| {
        use sysinfo::{DiskKind, Disks};
        let disks = Disks::new_with_refreshed_list();
        disks
            .iter()
            .map(|d| DiskInfo {
                name: d.name().to_string_lossy().trim().to_string(),
                mount: d.mount_point().to_string_lossy().to_string(),
                fs: d.file_system().to_string_lossy().to_string(),
                kind: match d.kind() {
                    DiskKind::SSD => "ssd",
                    DiskKind::HDD => "hdd",
                    _ => "unknown",
                }
                .to_string(),
                total: d.total_space(),
                available: d.available_space(),
                removable: d.is_removable(),
            })
            .collect()
    })
    .await
    .unwrap_or_default()
}

// Live per-physical-disk I/O (read/write bytes/sec + % active time), like Task
// Manager. Pulled from Windows performance counters via PDH — no admin needed.
#[derive(serde::Serialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiskIo {
    name: String, // PDH instance, e.g. "0 C:" or "_Total"
    read_bps: f64,
    write_bps: f64,
    active_pct: f64,
}

#[tauri::command]
pub async fn get_disk_io() -> Vec<DiskIo> {
    #[cfg(target_os = "windows")]
    {
        tauri::async_runtime::spawn_blocking(pdh_disk_io)
            .await
            .unwrap_or_default()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Vec::new()
    }
}

#[cfg(target_os = "windows")]
unsafe fn pdh_add(
    query: windows::Win32::System::Performance::PDH_HQUERY,
    path: windows::core::PCWSTR,
) -> windows::Win32::System::Performance::PDH_HCOUNTER {
    use windows::Win32::System::Performance::{
        PdhAddEnglishCounterW, PDH_HCOUNTER,
    };
    let mut c = PDH_HCOUNTER::default();
    let _ = PdhAddEnglishCounterW(query, path, 0, &mut c);
    c
}

#[cfg(target_os = "windows")]
unsafe fn pdh_array(
    counter: windows::Win32::System::Performance::PDH_HCOUNTER,
) -> Vec<(String, f64)> {
    use windows::Win32::System::Performance::{
        PdhGetFormattedCounterArrayW, PDH_FMT_COUNTERVALUE_ITEM_W, PDH_FMT_DOUBLE,
    };
    let mut size = 0u32;
    let mut count = 0u32;
    // First call sizes the buffer (returns PDH_MORE_DATA).
    let _ =
        PdhGetFormattedCounterArrayW(counter, PDH_FMT_DOUBLE, &mut size, &mut count, None);
    if size == 0 {
        return Vec::new();
    }
    let mut buf = vec![0u8; size as usize];
    let items = buf.as_mut_ptr() as *mut PDH_FMT_COUNTERVALUE_ITEM_W;
    if PdhGetFormattedCounterArrayW(
        counter,
        PDH_FMT_DOUBLE,
        &mut size,
        &mut count,
        Some(items),
    ) != 0
    {
        return Vec::new();
    }
    let slice = std::slice::from_raw_parts(items, count as usize);
    slice
        .iter()
        .filter_map(|it| {
            let name = it.szName.to_string().ok()?;
            Some((name, it.FmtValue.Anonymous.doubleValue))
        })
        .collect()
}

#[cfg(target_os = "windows")]
fn pdh_disk_io() -> Vec<DiskIo> {
    use std::collections::HashMap;
    use windows::core::{w, PCWSTR};
    use windows::Win32::System::Performance::{
        PdhCloseQuery, PdhCollectQueryData, PdhOpenQueryW, PDH_HQUERY,
    };
    unsafe {
        let mut query = PDH_HQUERY::default();
        if PdhOpenQueryW(PCWSTR::null(), 0, &mut query) != 0 {
            return Vec::new();
        }
        let read = pdh_add(query, w!("\\PhysicalDisk(*)\\Disk Read Bytes/sec"));
        let write = pdh_add(query, w!("\\PhysicalDisk(*)\\Disk Write Bytes/sec"));
        let active = pdh_add(query, w!("\\PhysicalDisk(*)\\% Disk Time"));

        // Rate counters need two samples a moment apart.
        if PdhCollectQueryData(query) != 0 {
            let _ = PdhCloseQuery(query);
            return Vec::new();
        }
        std::thread::sleep(std::time::Duration::from_millis(500));
        if PdhCollectQueryData(query) != 0 {
            let _ = PdhCloseQuery(query);
            return Vec::new();
        }

        let mut map: HashMap<String, DiskIo> = HashMap::new();
        for (n, v) in pdh_array(read) {
            let e = map.entry(n.clone()).or_default();
            e.name = n;
            e.read_bps = v;
        }
        for (n, v) in pdh_array(write) {
            let e = map.entry(n.clone()).or_default();
            e.name = n;
            e.write_bps = v;
        }
        for (n, v) in pdh_array(active) {
            let e = map.entry(n.clone()).or_default();
            e.name = n;
            e.active_pct = v;
        }
        let _ = PdhCloseQuery(query);
        map.into_values().collect()
    }
}

// ── Shelf widget ────────────────────────────────────────────────────────────

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfFile {
    name: String,
    path: String,
    size: u64,
    kind: String, // "image" | "video" | "audio" | "file" | "folder"
}

#[cfg(target_os = "windows")]
fn kind_for_ext(ext: &str) -> &'static str {
    match ext {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg" | "avif" => "image",
        "mp4" | "mov" | "webm" | "mkv" | "avi" | "m4v" => "video",
        "mp3" | "wav" | "ogg" | "flac" | "m4a" | "aac" => "audio",
        _ => "file",
    }
}

// Copy a dropped/picked file into the hidden shelf folder and return its
// metadata. Runs off the main thread since the copy can be large/slow.
#[tauri::command]
pub async fn shelf_import(
    app: AppHandle,
    source_path: String,
) -> Result<ShelfFile, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<ShelfFile, String> {
        let dir = storage::shelf_dir(&app)?;
        let source = Path::new(&source_path);
        let orig = source
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("file")
            .to_string();
        // Folders are referenced in place (not copied into the shelf folder).
        if source.is_dir() {
            return Ok(ShelfFile {
                name: orig,
                path: source_path.clone(),
                size: 0,
                kind: "folder".to_string(),
            });
        }
        let ext = source
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        let stored_name = if ext.is_empty() {
            format!("{}", uuid::Uuid::new_v4())
        } else {
            format!("{}.{}", uuid::Uuid::new_v4(), ext)
        };
        let dest = dir.join(&stored_name);
        std::fs::copy(source, &dest).map_err(|e| e.to_string())?;
        let size = std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
        #[cfg(target_os = "windows")]
        let kind = kind_for_ext(&ext).to_string();
        #[cfg(not(target_os = "windows"))]
        let kind = "file".to_string();
        Ok(ShelfFile {
            name: orig,
            path: dest.to_string_lossy().to_string(),
            size,
            kind,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

// Delete a shelved file — guarded so only files inside the shelf folder can go.
#[tauri::command]
pub fn shelf_remove(app: AppHandle, path: String) -> Result<(), String> {
    let dir = storage::shelf_dir(&app)?;
    let target = Path::new(&path);
    // Folders are referenced in place (outside the shelf folder); removing the
    // shelf entry must not touch the real directory — just no-op here.
    if !target.starts_with(&dir) {
        return Ok(());
    }
    if target.is_file() {
        std::fs::remove_file(target).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ---------- Layer Notch ----------

#[tauri::command]
pub fn create_notch_window(
    app: AppHandle,
    state: State<crate::notch::SharedNotchHit>,
    monitor: i32,
) {
    crate::notch::create_notch_window(&app, state.inner().clone(), monitor);
}

#[tauri::command]
pub fn close_notch_window(app: AppHandle) {
    crate::notch::close_notch_window(&app);
}

#[tauri::command]
pub fn reposition_notch(app: AppHandle, monitor: i32) {
    crate::notch::reposition_notch(&app, monitor);
}

#[tauri::command]
pub fn set_notch_size(app: AppHandle, width: f64, height: f64) {
    crate::notch::set_notch_size(&app, width, height);
}

#[tauri::command]
pub fn set_notch_hitbox(state: State<crate::notch::SharedNotchHit>, rect: [i32; 4]) {
    if let Ok(mut h) = state.lock() {
        *h = rect;
    }
}

#[tauri::command]
pub fn is_desktop_foreground() -> bool {
    crate::notch::is_desktop_foreground()
}
