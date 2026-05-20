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
        resize_to_virtual_desktop(&window);
        set_noactivate(&window, true);
        set_layer(&window, false);
        start_hit_poll(window, hits);
    }
    Ok(())
}

// Toggles the WS_EX_NOACTIVATE extended window style. With it on, clicking
// a Layer widget never steals focus from whatever app the user was on —
// the foreground app stays foreground. We turn it off in edit mode so
// keyboard input (typing in notes, journal, etc.) works.
#[cfg(target_os = "windows")]
fn set_noactivate(window: &WebviewWindow, enabled: bool) {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_NOACTIVATE,
    };
    let hwnd: HWND = match window.hwnd() {
        Ok(handle) => handle.0 as HWND,
        Err(_) => return,
    };
    unsafe {
        let cur = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let flag = WS_EX_NOACTIVATE as isize;
        let next = if enabled { cur | flag } else { cur & !flag };
        if next != cur {
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, next);
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn set_noactivate(_window: &WebviewWindow, _enabled: bool) {}

// Returns (x, y, width, height) of the entire virtual desktop (the union
// of every connected monitor). On a single-monitor machine this collapses
// to the primary screen.
#[cfg(target_os = "windows")]
fn virtual_screen_rect() -> (i32, i32, i32, i32) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN,
        SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
    };
    unsafe {
        (
            GetSystemMetrics(SM_XVIRTUALSCREEN),
            GetSystemMetrics(SM_YVIRTUALSCREEN),
            GetSystemMetrics(SM_CXVIRTUALSCREEN),
            GetSystemMetrics(SM_CYVIRTUALSCREEN),
        )
    }
}

#[cfg(not(target_os = "windows"))]
fn virtual_screen_rect() -> (i32, i32, i32, i32) {
    (0, 0, 1920, 1080)
}

#[cfg(target_os = "windows")]
fn resize_to_virtual_desktop(window: &WebviewWindow) {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER,
    };
    let hwnd: HWND = match window.hwnd() {
        Ok(handle) => handle.0 as HWND,
        Err(_) => return,
    };
    let (x, y, w, h) = virtual_screen_rect();
    unsafe {
        SetWindowPos(
            hwnd,
            std::ptr::null_mut(),
            x,
            y,
            w,
            h,
            SWP_NOACTIVATE | SWP_NOZORDER,
        );
    }
}

#[cfg(not(target_os = "windows"))]
fn resize_to_virtual_desktop(_window: &WebviewWindow) {}

// Layer always sits at the bottom of the z-order — a true desktop layer.
// `front` is now just a no-op hint: edit/view mode is purely a UI state in
// the canvas, never a window-level change. The window is always
// NOACTIVATE so clicking widgets never claims focus from your apps, and
// we never call SetForegroundWindow / HWND_TOP.
#[cfg(target_os = "windows")]
pub fn set_layer(window: &WebviewWindow, _front: bool) {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, ShowWindow, HWND_BOTTOM, SWP_NOACTIVATE, SW_SHOWNOACTIVATE,
    };
    let hwnd: HWND = match window.hwnd() {
        Ok(handle) => handle.0 as HWND,
        Err(_) => return,
    };
    set_noactivate(window, true);
    unsafe {
        // Make sure the window is visible (un-minimized) but without taking
        // focus, then pin to bottom.
        ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        let (x, y, w, h) = virtual_screen_rect();
        SetWindowPos(hwnd, HWND_BOTTOM, x, y, w, h, SWP_NOACTIVATE);
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

// Polls the cursor and toggles per-region click-through, AND continuously
// snaps the window to the bottom of the z-order so Layer is pinned to the
// desktop — it can never float above another app, even momentarily.
fn start_hit_poll(window: WebviewWindow, hits: SharedHits) {
    thread::spawn(move || {
        let mut ignoring = true;
        loop {
            let (cx, cy) = cursor_pos();
            let (ox, oy) = match window.outer_position() {
                Ok(p) => (p.x, p.y),
                Err(_) => (0, 0),
            };
            let lx = cx - ox;
            let ly = cy - oy;
            let inside = {
                let state = hits.lock().unwrap();
                state.force
                    || state.regions.iter().any(|r| {
                        lx >= r[0]
                            && lx < r[0] + r[2]
                            && ly >= r[1]
                            && ly < r[1] + r[3]
                    })
            };
            let want_ignore = !inside;
            if want_ignore != ignoring {
                let _ = window.set_ignore_cursor_events(want_ignore);
                ignoring = want_ignore;
            }

            // Re-pin to the bottom every tick — at 120 Hz this is faster
            // than the eye can resolve, so any incidental bump above other
            // apps is corrected before the next frame paints.
            pin_to_bottom(&window);

            thread::sleep(Duration::from_millis(8));
        }
    });
}

#[cfg(target_os = "windows")]
fn pin_to_bottom(window: &WebviewWindow) {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, HWND_BOTTOM, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
        SWP_NOSENDCHANGING,
    };
    let hwnd: HWND = match window.hwnd() {
        Ok(handle) => handle.0 as HWND,
        Err(_) => return,
    };
    unsafe {
        SetWindowPos(
            hwnd,
            HWND_BOTTOM,
            0,
            0,
            0,
            0,
            SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_NOSENDCHANGING,
        );
    }
}

#[cfg(not(target_os = "windows"))]
fn pin_to_bottom(_window: &WebviewWindow) {}
