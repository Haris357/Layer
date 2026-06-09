// Layer Notch — a separate always-on-top, never-activating window pinned to the
// top-right of a monitor. Fully isolated from the `main` desktop overlay: its
// own window, own z-order (TOPMOST), own click-through poll.
//
// IMPORTANT — why this file only uses raw Win32 (and never Tauri's
// `available_monitors`/`primary_monitor`/`set_position`):
//   Those high-level Tauri/tao methods BLOCK the calling thread and round-trip
//   through the shared main event loop. The notch is a second window in the same
//   process as `main`, so calling them from a command (which runs ON the main
//   thread) or from the poll thread stalls the loop that pumps messages for ALL
//   windows — which froze the whole app (widgets stopped painting, the dock
//   stopped hovering). The proven-stable `window.rs` deliberately does every
//   geometry op with raw Win32 on a cached HWND; this mirrors it exactly.

use std::sync::atomic::{AtomicI32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Manager, WebviewWindow};

// The visible pill/panel rect in window-local CSS px [x, y, w, h], reported by
// the frontend. The poll uses it to toggle click-through so the collapsed strip
// never eats clicks on app title bars beneath it.
pub type SharedNotchHit = Arc<Mutex<[i32; 4]>>;

// Which monitor the notch lives on (-1 = primary). Read by the reposition poll.
static NOTCH_MONITOR: AtomicI32 = AtomicI32::new(-1);
// The dock window's physical size, computed once at creation (logical * DPI
// scale). Used by the raw-Win32 positioner so the poll never asks Tauri for the
// scale factor.
static NOTCH_W_PHYS: AtomicI32 = AtomicI32::new(380);
static NOTCH_H_PHYS: AtomicI32 = AtomicI32::new(620);

// The dock window is a FIXED-size, transparent canvas pinned to the right edge,
// vertically centred. It never resizes while in use — the visible sliver/panel
// is drawn inside it via CSS, and click-through is toggled by the hitbox. Wide
// enough for the slide-out feature panel + the dock rail.
const NOTCH_W: f64 = 380.0;
const NOTCH_H: f64 = 620.0;

pub fn create_notch_window(app: &AppHandle, hit: SharedNotchHit, monitor: i32) {
    NOTCH_MONITOR.store(monitor, Ordering::Relaxed);

    if let Some(w) = app.get_webview_window("notch") {
        let _ = w.show();
        position_notch(&w, monitor);
        return;
    }

    let built = tauri::WebviewWindowBuilder::new(
        app,
        "notch",
        tauri::WebviewUrl::App("index.html".into()),
    )
    .transparent(true)
    .decorations(false)
    .skip_taskbar(true)
    .focused(false)
    .visible(false)
    .inner_size(NOTCH_W, NOTCH_H)
    .build();

    if let Ok(w) = built {
        // Cache the physical size ONCE here, on the creating (main) thread —
        // scale_factor() is safe to call here, but never from the poll thread.
        let scale = w.scale_factor().unwrap_or(1.0);
        NOTCH_W_PHYS.store((NOTCH_W * scale) as i32, Ordering::Relaxed);
        NOTCH_H_PHYS.store((NOTCH_H * scale) as i32, Ordering::Relaxed);

        set_noactivate(&w);
        set_toolwindow(&w);
        let _ = w.set_ignore_cursor_events(true);
        set_topmost(&w, true);
        position_notch(&w, monitor);
        let _ = w.show();
        start_notch_poll(app.clone(), hit);
    }
}

pub fn close_notch_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("notch") {
        let _ = w.close();
    }
}

pub fn reposition_notch(app: &AppHandle, monitor: i32) {
    NOTCH_MONITOR.store(monitor, Ordering::Relaxed);
    if let Some(w) = app.get_webview_window("notch") {
        position_notch(&w, monitor);
    }
}

// No-op: the notch window is a fixed size now (the visible pill is drawn inside
// it via CSS). Kept so the existing command/handler stays valid.
pub fn set_notch_size(_app: &AppHandle, _width: f64, _height: f64) {}

// Pin the fixed-size window to the top-right of the chosen monitor (or primary)
// using ONLY raw Win32 — no Tauri monitor/position calls that would block the
// shared event loop. Mirrors `window.rs`'s SetWindowPos approach, including
// SWP_NOSENDCHANGING to suppress the WM_WINDOWPOSCHANGING storm.
#[cfg(target_os = "windows")]
fn position_notch(window: &WebviewWindow, monitor: i32) {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, SWP_NOACTIVATE, SWP_NOSENDCHANGING, SWP_NOSIZE, SWP_NOZORDER,
    };
    let hwnd: HWND = match window.hwnd() {
        Ok(h) => h.0 as HWND,
        Err(_) => return,
    };
    let mons = monitor_rects();
    if mons.is_empty() {
        return;
    }
    let target = if monitor >= 0 {
        mons.get(monitor as usize)
    } else {
        None
    }
    .or_else(|| mons.iter().find(|m| m.primary))
    .or_else(|| mons.first());
    let Some(m) = target else { return };
    let w_phys = NOTCH_W_PHYS.load(Ordering::Relaxed);
    let h_phys = NOTCH_H_PHYS.load(Ordering::Relaxed);
    // Right edge, vertically centred on the target monitor.
    let x = m.x + m.w - w_phys;
    let y = m.y + ((m.h - h_phys) / 2).max(0);
    unsafe {
        SetWindowPos(
            hwnd,
            std::ptr::null_mut(),
            x,
            y,
            0,
            0,
            SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOSENDCHANGING,
        );
    }
}

#[cfg(not(target_os = "windows"))]
fn position_notch(_window: &WebviewWindow, _monitor: i32) {}

fn start_notch_poll(app: AppHandle, hit: SharedNotchHit) {
    thread::spawn(move || {
        // Cache the scale once (set at creation). Only touch the window when
        // something actually changes. Every per-tick op here is either a raw
        // Win32 call or `outer_position()` — the exact same calls the stable
        // main-window poll makes 125×/sec without issue.
        let scale = (NOTCH_W_PHYS.load(Ordering::Relaxed) as f64 / NOTCH_W).max(0.1);
        let mut ignoring = true;
        let mut last_virtual = virtual_screen_rect();
        let mut tick: u32 = 0;
        loop {
            thread::sleep(Duration::from_millis(40));
            let Some(w) = app.get_webview_window("notch") else {
                return; // window closed → end the thread
            };

            // Click-through: interactive only while the cursor is over the
            // reported pill/panel rect. Only flip the flag on a real change.
            let origin = match w.outer_position() {
                Ok(p) => p,
                Err(_) => continue,
            };
            let rect = hit.lock().map(|r| *r).unwrap_or([0, 0, 0, 0]);
            let (cx, cy) = cursor_pos();
            let rx = origin.x + (rect[0] as f64 * scale) as i32;
            let ry = origin.y + (rect[1] as f64 * scale) as i32;
            let rw = (rect[2] as f64 * scale) as i32;
            let rh = (rect[3] as f64 * scale) as i32;
            let inside =
                rw > 0 && rh > 0 && cx >= rx && cx < rx + rw && cy >= ry && cy < ry + rh;
            let want = !inside;
            if want != ignoring {
                let _ = w.set_ignore_cursor_events(want);
                ignoring = want;
            }

            // Reassert topmost + handle monitor changes occasionally (~2s).
            // Both are raw Win32; no blocking Tauri calls.
            tick = tick.wrapping_add(1);
            if tick % 50 == 0 {
                set_topmost(&w, true);
                let now_virtual = virtual_screen_rect();
                if now_virtual != last_virtual {
                    last_virtual = now_virtual;
                    position_notch(&w, NOTCH_MONITOR.load(Ordering::Relaxed));
                }
            }
        }
    });
}

// ---------- Win32 helpers (self-contained) ----------

// A monitor's bounding rect in physical pixels (the process is per-monitor DPI
// aware, so these match the coordinate space SetWindowPos uses).
#[derive(Clone, Copy)]
struct MonRect {
    x: i32,
    y: i32,
    w: i32,
    h: i32,
    primary: bool,
}

#[cfg(target_os = "windows")]
fn monitor_rects() -> Vec<MonRect> {
    use windows_sys::Win32::Foundation::{LPARAM, RECT};
    use windows_sys::Win32::Graphics::Gdi::{
        EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO,
    };

    // MONITORINFOF_PRIMARY isn't re-exported by windows-sys 0.60; it's a stable
    // Win32 constant (0x1).
    const PRIMARY_FLAG: u32 = 0x0000_0001;

    unsafe extern "system" fn cb(
        h: HMONITOR,
        _hdc: HDC,
        _rc: *mut RECT,
        data: LPARAM,
    ) -> i32 {
        let list = &mut *(data as *mut Vec<MonRect>);
        let mut mi: MONITORINFO = std::mem::zeroed();
        mi.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        if GetMonitorInfoW(h, &mut mi) != 0 {
            let rc = mi.rcMonitor;
            list.push(MonRect {
                x: rc.left,
                y: rc.top,
                w: rc.right - rc.left,
                h: rc.bottom - rc.top,
                primary: (mi.dwFlags & PRIMARY_FLAG) != 0,
            });
        }
        1
    }

    let mut list: Vec<MonRect> = Vec::new();
    unsafe {
        EnumDisplayMonitors(
            std::ptr::null_mut(),
            std::ptr::null(),
            Some(cb),
            &mut list as *mut _ as LPARAM,
        );
    }
    list
}

#[cfg(not(target_os = "windows"))]
fn monitor_rects() -> Vec<MonRect> {
    vec![MonRect {
        x: 0,
        y: 0,
        w: 1920,
        h: 1080,
        primary: true,
    }]
}

#[cfg(target_os = "windows")]
fn cursor_pos() -> (i32, i32) {
    use windows_sys::Win32::Foundation::POINT;
    use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;
    let mut p = POINT { x: 0, y: 0 };
    unsafe {
        GetCursorPos(&mut p);
    }
    (p.x, p.y)
}
#[cfg(not(target_os = "windows"))]
fn cursor_pos() -> (i32, i32) {
    (0, 0)
}

#[cfg(target_os = "windows")]
fn virtual_screen_rect() -> (i32, i32, i32, i32) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN,
        SM_YVIRTUALSCREEN,
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
fn set_topmost(window: &WebviewWindow, on: bool) {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, HWND_NOTOPMOST, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE,
        SWP_NOSENDCHANGING, SWP_NOSIZE,
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
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOSENDCHANGING,
        );
    }
}
#[cfg(not(target_os = "windows"))]
fn set_topmost(_window: &WebviewWindow, _on: bool) {}

#[cfg(target_os = "windows")]
fn set_ex_style(window: &WebviewWindow, flag: isize) {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE,
    };
    let hwnd: HWND = match window.hwnd() {
        Ok(h) => h.0 as HWND,
        Err(_) => return,
    };
    unsafe {
        let cur = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let next = cur | flag;
        if next != cur {
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, next);
        }
    }
}

#[cfg(target_os = "windows")]
fn set_noactivate(window: &WebviewWindow) {
    use windows_sys::Win32::UI::WindowsAndMessaging::WS_EX_NOACTIVATE;
    set_ex_style(window, WS_EX_NOACTIVATE as isize);
}
#[cfg(not(target_os = "windows"))]
fn set_noactivate(_window: &WebviewWindow) {}

#[cfg(target_os = "windows")]
fn set_toolwindow(window: &WebviewWindow) {
    use windows_sys::Win32::UI::WindowsAndMessaging::WS_EX_TOOLWINDOW;
    set_ex_style(window, WS_EX_TOOLWINDOW as isize);
}
#[cfg(not(target_os = "windows"))]
fn set_toolwindow(_window: &WebviewWindow) {}

// True when the Windows desktop (shell) is the foreground surface — i.e. no
// app window is focused/covering it. Used to show the notch's "edit" button.
#[cfg(target_os = "windows")]
pub fn is_desktop_foreground() -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetClassNameW, GetForegroundWindow};
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_null() {
            return true;
        }
        let mut buf = [0u16; 256];
        let len = GetClassNameW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
        if len <= 0 {
            return false;
        }
        let class = String::from_utf16_lossy(&buf[..len as usize]);
        class == "Progman" || class == "WorkerW"
    }
}
#[cfg(not(target_os = "windows"))]
pub fn is_desktop_foreground() -> bool {
    false
}
