use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{App, Emitter, Manager, WebviewWindow};

// Hot corner: flicking to the top-left corner cycles spaces.
static HOTCORNER: AtomicBool = AtomicBool::new(false);

pub fn set_hotcorner(on: bool) {
    HOTCORNER.store(on, Ordering::Relaxed);
}

// True while the given virtual key is physically held down.
#[cfg(target_os = "windows")]
fn key_down(vk: i32) -> bool {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
    unsafe { (GetAsyncKeyState(vk) as u16 & 0x8000) != 0 }
}
#[cfg(not(target_os = "windows"))]
fn key_down(_vk: i32) -> bool {
    false
}

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

// Screensaver mode: the same window, repurposed to sit on top of everything,
// span all monitors, and take input (so any key/mouse can dismiss it). The
// opposite of the normal desktop-pinned behaviour — so we skip the hit poll
// and never push it to the bottom.
pub fn setup_screensaver(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_skip_taskbar(true);
        set_noactivate(&window, false); // we want focus + key/mouse input
        let _ = window.set_ignore_cursor_events(false);
        // True fullscreen via Tauri so it fills the whole monitor at native
        // resolution regardless of display scaling (manual sizing landed at the
        // logical, not physical, size on scaled displays).
        let _ = window.set_fullscreen(true);
        set_topmost(&window, true);
        let _ = window.show();
        let _ = window.set_focus();
        bring_to_front(&window);
        // Cover every other display too, so no monitor shows the desktop.
        spawn_extra_screensaver_windows(app, &window);
    }
    // OS-level failsafe: dismiss on any input even if the webview never loads,
    // so the screensaver can never get "stuck" on screen.
    start_screensaver_input_watch();
    Ok(())
}

// Opens a fullscreen screensaver window on each display other than the one the
// main window already covers. All windows live in this one process, so the
// single input watcher dismisses them all at once.
#[cfg(target_os = "windows")]
fn spawn_extra_screensaver_windows(app: &App, main: &WebviewWindow) {
    let primary = main.primary_monitor().ok().flatten().map(|m| {
        let p = m.position();
        (p.x, p.y)
    });
    let monitors = match main.available_monitors() {
        Ok(m) => m,
        Err(_) => return,
    };
    for (i, m) in monitors.iter().enumerate() {
        let pos = m.position();
        // Skip the primary monitor — the main window already covers it.
        if Some((pos.x, pos.y)) == primary {
            continue;
        }
        let label = format!("ss-{i}");
        let built = tauri::WebviewWindowBuilder::new(
            app,
            label,
            tauri::WebviewUrl::App("index.html".into()),
        )
        .transparent(true)
        .decorations(false)
        .skip_taskbar(true)
        .focused(false)
        .visible(false)
        .build();
        if let Ok(w) = built {
            let _ = w.set_position(tauri::PhysicalPosition::new(pos.x, pos.y));
            let _ = w.set_fullscreen(true);
            set_topmost(&w, true);
            let _ = w.show();
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn spawn_extra_screensaver_windows(_app: &App, _main: &WebviewWindow) {}

// Watches for any mouse movement, mouse button, or key press and exits the
// process — independent of the webview's own dismiss handler.
#[cfg(target_os = "windows")]
fn start_screensaver_input_watch() {
    use windows_sys::Win32::Foundation::POINT;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
    use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;
    thread::spawn(|| {
        // Grace period + baseline so the launch click/move doesn't dismiss it.
        thread::sleep(Duration::from_millis(900));
        let mut base = POINT { x: 0, y: 0 };
        unsafe {
            GetCursorPos(&mut base);
        }
        loop {
            thread::sleep(Duration::from_millis(60));
            unsafe {
                let mut p = POINT { x: 0, y: 0 };
                GetCursorPos(&mut p);
                let moved = (p.x - base.x).abs() > 6 || (p.y - base.y).abs() > 6;
                let mut key_down = false;
                for vk in 1..=254i32 {
                    if (GetAsyncKeyState(vk) as u16 & 0x8000) != 0 {
                        key_down = true;
                        break;
                    }
                }
                if moved || key_down {
                    std::process::exit(0);
                }
            }
        }
    });
}

#[cfg(not(target_os = "windows"))]
fn start_screensaver_input_watch() {}

#[cfg(target_os = "windows")]
fn set_topmost(window: &WebviewWindow, on: bool) {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, HWND_NOTOPMOST, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE,
        SWP_NOSIZE,
    };
    let hwnd: HWND = match window.hwnd() {
        Ok(h) => h.0 as HWND,
        Err(_) => return,
    };
    let after = if on { HWND_TOPMOST } else { HWND_NOTOPMOST };
    unsafe {
        SetWindowPos(
            hwnd,
            after,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        );
    }
}

#[cfg(not(target_os = "windows"))]
fn set_topmost(_window: &WebviewWindow, _on: bool) {}

#[cfg(target_os = "windows")]
fn bring_to_front(window: &WebviewWindow) {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SetForegroundWindow, ShowWindow, SW_SHOW,
    };
    let hwnd: HWND = match window.hwnd() {
        Ok(h) => h.0 as HWND,
        Err(_) => return,
    };
    unsafe {
        ShowWindow(hwnd, SW_SHOW);
        SetForegroundWindow(hwnd);
    }
}

#[cfg(not(target_os = "windows"))]
fn bring_to_front(_window: &WebviewWindow) {}

// Polls the cursor and toggles per-region click-through, AND continuously
// snaps the window to the bottom of the z-order so Layer is pinned to the
// desktop — it can never float above another app, even momentarily.
fn start_hit_poll(window: WebviewWindow, hits: SharedHits) {
    thread::spawn(move || {
        let mut ignoring = true;
        let mut was_corner = false;
        let mut was_peek = false;
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

            // Peek: hold Ctrl+Shift+` to float Layer above apps; release to
            // send it back to the desktop. Polled (not a global hotkey) so the
            // hold/release is reliable and doesn't steal the combo from apps.
            let peek =
                key_down(0x11) && key_down(0x10) && key_down(0xC0); // Ctrl+Shift+`
            if peek {
                set_topmost(&window, true);
            } else {
                // Re-pin to the bottom every tick (faster than the eye can
                // resolve). Clear topmost first when leaving a peek.
                if was_peek {
                    set_topmost(&window, false);
                }
                pin_to_bottom(&window);
            }
            was_peek = peek;

            // Hot corner: flick into the top-left corner to cycle spaces.
            if HOTCORNER.load(Ordering::Relaxed) {
                let in_corner = cx <= ox + 3 && cy <= oy + 3;
                if in_corner && !was_corner {
                    let _ = window.emit("cycle-space", ());
                }
                was_corner = in_corner;
            } else {
                was_corner = false;
            }

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
