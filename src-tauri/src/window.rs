use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{App, Manager, WebviewWindow};

#[derive(Default)]
pub struct HitState {
    pub regions: Vec<[i32; 4]>,
    pub force: bool,
}

pub type SharedHits = Arc<Mutex<HitState>>;

pub fn setup_window(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    let hits: SharedHits = Arc::new(Mutex::new(HitState::default()));
    app.manage(hits.clone());

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_skip_taskbar(true);
        let _ = window.set_ignore_cursor_events(true);
        set_layer(&window, false);
        start_hit_poll(window, hits);
    }
    Ok(())
}

#[cfg(target_os = "windows")]
pub fn set_layer(window: &WebviewWindow, front: bool) {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetSystemMetrics, SetWindowPos, HWND_BOTTOM, HWND_TOP, SM_CXSCREEN,
        SM_CYSCREEN, SWP_NOACTIVATE,
    };
    let hwnd: HWND = match window.hwnd() {
        Ok(handle) => handle.0 as HWND,
        Err(_) => return,
    };
    unsafe {
        let width = GetSystemMetrics(SM_CXSCREEN);
        let height = GetSystemMetrics(SM_CYSCREEN);
        let after = if front { HWND_TOP } else { HWND_BOTTOM };
        SetWindowPos(hwnd, after, 0, 0, width, height, SWP_NOACTIVATE);
    }
}

#[cfg(not(target_os = "windows"))]
pub fn set_layer(_window: &WebviewWindow, _front: bool) {}

#[cfg(target_os = "windows")]
fn cursor_pos() -> (i32, i32) {
    use windows_sys::Win32::Foundation::POINT;
    use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;
    let mut point = POINT { x: 0, y: 0 };
    unsafe {
        GetCursorPos(&mut point);
    }
    (point.x, point.y)
}

#[cfg(not(target_os = "windows"))]
fn cursor_pos() -> (i32, i32) {
    (0, 0)
}

fn start_hit_poll(window: WebviewWindow, hits: SharedHits) {
    thread::spawn(move || {
        let mut ignoring = true;
        loop {
            let (cx, cy) = cursor_pos();
            let inside = {
                let state = hits.lock().unwrap();
                state.force
                    || state.regions.iter().any(|r| {
                        cx >= r[0]
                            && cx < r[0] + r[2]
                            && cy >= r[1]
                            && cy < r[1] + r[3]
                    })
            };
            let want_ignore = !inside;
            if want_ignore != ignoring {
                let _ = window.set_ignore_cursor_events(want_ignore);
                ignoring = want_ignore;
            }
            thread::sleep(Duration::from_millis(40));
        }
    });
}
