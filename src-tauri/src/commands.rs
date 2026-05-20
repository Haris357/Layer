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
pub fn save_templates(app: AppHandle, json: String) -> Result<(), String> {
    storage::write_templates(&app, &json)
}

#[tauri::command]
pub fn load_templates(app: AppHandle) -> Result<String, String> {
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
pub fn quit_app(app: AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

#[tauri::command]
pub fn get_app_version(app: AppHandle) -> Result<String, String> {
    Ok(app.package_info().version.to_string())
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

#[derive(serde::Serialize)]
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
pub fn get_system_stats() -> SystemStats {
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
pub fn list_apps() -> Vec<AppEntry> {
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
pub fn get_app_icon(path: String) -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        return extract_icon(&path);
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

#[derive(serde::Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NowPlaying {
    has_session: bool,
    title: String,
    artist: String,
    playing: bool,
}

#[tauri::command]
pub fn get_now_playing() -> NowPlaying {
    #[cfg(target_os = "windows")]
    {
        use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager as Mgr;
        use windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status;
        ensure_com();
        let result = (|| -> windows::core::Result<NowPlaying> {
            let mgr = Mgr::RequestAsync()?.get()?;
            let session = mgr.GetCurrentSession()?;
            let mut np = NowPlaying {
                has_session: true,
                ..Default::default()
            };
            if let Ok(props) = session.TryGetMediaPropertiesAsync()?.get() {
                np.title =
                    props.Title().map(|s| s.to_string()).unwrap_or_default();
                np.artist =
                    props.Artist().map(|s| s.to_string()).unwrap_or_default();
            }
            if let Ok(info) = session.GetPlaybackInfo() {
                np.playing = info
                    .PlaybackStatus()
                    .map(|s| s == Status::Playing)
                    .unwrap_or(false);
            }
            Ok(np)
        })();
        if let Ok(np) = result {
            return np;
        }
    }
    NowPlaying::default()
}

#[tauri::command]
pub fn media_control(action: String) {
    #[cfg(target_os = "windows")]
    {
        use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager as Mgr;
        ensure_com();
        let _ = (|| -> windows::core::Result<()> {
            let mgr = Mgr::RequestAsync()?.get()?;
            let session = mgr.GetCurrentSession()?;
            match action.as_str() {
                "next" => {
                    session.TrySkipNextAsync()?.get()?;
                }
                "prev" => {
                    session.TrySkipPreviousAsync()?.get()?;
                }
                _ => {
                    session.TryTogglePlayPauseAsync()?.get()?;
                }
            }
            Ok(())
        })();
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
pub fn get_notifications() -> Vec<NotificationItem> {
    #[cfg(target_os = "windows")]
    {
        use windows::UI::Notifications::Management::UserNotificationListener;
        use windows::UI::Notifications::{
            KnownNotificationBindings, NotificationKinds,
        };
        ensure_com();
        let result = (|| -> windows::core::Result<Vec<NotificationItem>> {
            let listener = UserNotificationListener::Current()?;
            let _ = listener.RequestAccessAsync()?.get();
            let list = listener
                .GetNotificationsAsync(NotificationKinds::Toast)?
                .get()?;
            let mut out = Vec::new();
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
                                    for (i, t) in
                                        (&texts).into_iter().enumerate()
                                    {
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
                out.push(NotificationItem {
                    id,
                    app,
                    title,
                    body,
                })
            }
            Ok(out)
        })();
        if let Ok(items) = result {
            return items;
        }
    }
    Vec::new()
}

#[tauri::command]
pub fn clear_notification(id: u32) {
    #[cfg(target_os = "windows")]
    {
        use windows::UI::Notifications::Management::UserNotificationListener;
        ensure_com();
        if let Ok(listener) = UserNotificationListener::Current() {
            let _ = listener.RemoveNotification(id);
        }
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
pub fn get_volume() -> f32 {
    #[cfg(target_os = "windows")]
    {
        ensure_com();
        unsafe {
            if let Ok(vol) = endpoint_volume() {
                if let Ok(level) = vol.GetMasterVolumeLevelScalar() {
                    return level;
                }
            }
        }
    }
    -1.0
}

#[tauri::command]
pub fn set_volume(level: f32) {
    #[cfg(target_os = "windows")]
    {
        ensure_com();
        unsafe {
            if let Ok(vol) = endpoint_volume() {
                let _ = vol.SetMasterVolumeLevelScalar(
                    level.clamp(0.0, 1.0),
                    std::ptr::null(),
                );
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    let _ = level;
}

#[tauri::command]
pub fn clear_all_notifications() {
    #[cfg(target_os = "windows")]
    {
        use windows::UI::Notifications::Management::UserNotificationListener;
        ensure_com();
        if let Ok(listener) = UserNotificationListener::Current() {
            let _ = listener.ClearNotifications();
        }
    }
}

#[tauri::command]
pub fn register_hotkey(app: AppHandle, accelerator: String) -> Result<(), String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let shortcut = app.global_shortcut();
    let _ = shortcut.unregister_all();
    shortcut
        .register(accelerator.as_str())
        .map_err(|e| e.to_string())?;
    // Re-register the (fixed) quick-capture shortcut so a custom toggle
    // hotkey doesn't take it down with unregister_all.
    let _ = shortcut.register("CmdOrControl+Shift+N");
    Ok(())
}
