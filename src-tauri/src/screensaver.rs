// Windows screensaver support. The same Layer binary doubles as the
// screensaver: Windows runs a `.scr` (just a renamed copy of our exe) with
// one of three flags — /s (show), /p (preview), /c (configure). We detect
// the flag at startup and, in /s mode, render a calm full-screen ambient view
// instead of the desktop canvas.

// What mode the process was launched in.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum LaunchMode {
    Normal,
    Screensaver,
}

// Managed so the frontend can ask which view to render.
pub struct Launch {
    pub screensaver: bool,
}

// Parses the screensaver CLI flag. /p and /c are terminal — they handle
// themselves and exit, so this only ever returns for /s or a normal launch.
pub fn launch_mode_from_args() -> LaunchMode {
    let arg = std::env::args().nth(1).unwrap_or_default().to_lowercase();

    // Preview pane in the Windows screensaver settings dialog. We don't draw
    // a live preview into the host window — just bow out.
    if arg.starts_with("/p") {
        std::process::exit(0);
    }
    // "Settings" button. Layer's screensaver has nothing to configure.
    if arg.starts_with("/c") {
        show_no_config_message();
        std::process::exit(0);
    }
    if arg.starts_with("/s") {
        LaunchMode::Screensaver
    } else {
        LaunchMode::Normal
    }
}

#[cfg(target_os = "windows")]
fn show_no_config_message() {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        MessageBoxW, MB_ICONINFORMATION, MB_OK,
    };
    let text: Vec<u16> =
        "Layer's screensaver shows a calm view of your clock and day.\n\nThere's nothing to set up here — everything else lives inside the Layer app.\0"
            .encode_utf16()
            .collect();
    let title: Vec<u16> = "Layer screensaver\0".encode_utf16().collect();
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            text.as_ptr(),
            title.as_ptr(),
            MB_OK | MB_ICONINFORMATION,
        );
    }
}

#[cfg(not(target_os = "windows"))]
fn show_no_config_message() {}

// Reflects the user's on/off setting. `enabled` installs Layer as the active
// Windows screensaver; `!enabled` steps back down if (and only if) Layer is
// the current one. Runs off-thread so it never blocks the UI.
pub fn set_enabled(enabled: bool) {
    if enabled {
        enable();
    } else {
        disable();
    }
}

// Keeps a runnable Layer.scr in a user-writable spot and, when appropriate,
// makes it the active Windows screensaver — all without admin rights.
#[cfg(target_os = "windows")]
fn enable() {
    use std::fs;
    use std::path::PathBuf;

    // Never register a dev build as the screensaver: it loads its UI from the
    // dev server (localhost) and would show an unrecoverable error page on idle.
    if cfg!(debug_assertions) {
        return;
    }

    std::thread::spawn(|| {
        let exe = match std::env::current_exe() {
            Ok(p) => p,
            Err(_) => return,
        };
        let local = match std::env::var("LOCALAPPDATA") {
            Ok(v) => v,
            Err(_) => return,
        };
        let mut dir = PathBuf::from(local);
        dir.push("Layer");
        let _ = fs::create_dir_all(&dir);
        let mut scr = dir.clone();
        scr.push("Layer.scr");

        // (Re)create the .scr copy when it's missing or the app is newer, so
        // updates keep the screensaver in sync with the installed version.
        let need_copy = match (fs::metadata(&exe), fs::metadata(&scr)) {
            (Ok(s), Ok(d)) => match (s.modified(), d.modified()) {
                (Ok(sm), Ok(dm)) => sm > dm,
                _ => true,
            },
            (Ok(_), Err(_)) => true,
            _ => false,
        };
        if need_copy {
            let _ = fs::copy(&exe, &scr);
        }
        let scr_str = scr.to_string_lossy().to_string();

        // Respect the user: only take over when no screensaver is configured,
        // or Layer's is already the selected one (refresh its path).
        let val = reg_query("SCRNSAVE.EXE");
        let has_other = val.contains(".scr") && !val.contains("layer.scr");
        if has_other {
            return;
        }

        reg_set("SCRNSAVE.EXE", &scr_str);
        reg_set("ScreenSaveActive", "1");

        // Give it a sane idle delay only if the user hasn't set one.
        if !reg_query("ScreenSaveTimeOut").contains("screensavetimeout") {
            reg_set("ScreenSaveTimeOut", "300");
        }
    });
}

#[cfg(not(target_os = "windows"))]
fn enable() {}

// Turn Layer back off as the screensaver — but only if it's the one currently
// set, so we never disturb another screensaver the user chose.
#[cfg(target_os = "windows")]
fn disable() {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    std::thread::spawn(|| {
        if !reg_query("SCRNSAVE.EXE").contains("layer.scr") {
            return;
        }
        let _ = Command::new("reg")
            .args([
                "delete",
                "HKCU\\Control Panel\\Desktop",
                "/v",
                "SCRNSAVE.EXE",
                "/f",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        reg_set("ScreenSaveActive", "0");
    });
}

#[cfg(not(target_os = "windows"))]
fn disable() {}

// Launch the screensaver right now (for the preview hotkey / button). Spawns a
// fresh instance of ourselves with /s, exactly as Windows would.
pub fn preview() {
    if let Ok(exe) = std::env::current_exe() {
        let _ = std::process::Command::new(exe).arg("/s").spawn();
    }
}

// The screensaver runs as a separate process with its own webview storage, so
// the chosen theme is persisted to a small file the main app writes and the
// screensaver reads.
fn theme_file() -> Option<std::path::PathBuf> {
    let local = std::env::var("LOCALAPPDATA").ok()?;
    let mut p = std::path::PathBuf::from(local);
    p.push("Layer");
    p.push("screensaver-theme.txt");
    Some(p)
}

pub fn set_theme(theme: &str) {
    if let Some(p) = theme_file() {
        if let Some(dir) = p.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(p, theme);
    }
}

pub fn get_theme() -> String {
    if let Some(p) = theme_file() {
        if let Ok(s) = std::fs::read_to_string(p) {
            let t = s.trim().to_string();
            if !t.is_empty() {
                return t;
            }
        }
    }
    "ambient".into()
}

#[cfg(target_os = "windows")]
fn reg_query(value: &str) -> String {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    Command::new("reg")
        .args(["query", "HKCU\\Control Panel\\Desktop", "/v", value])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_lowercase())
        .unwrap_or_default()
}

#[cfg(target_os = "windows")]
fn reg_set(value: &str, data: &str) {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let _ = Command::new("reg")
        .args([
            "add",
            "HKCU\\Control Panel\\Desktop",
            "/v",
            value,
            "/t",
            "REG_SZ",
            "/d",
            data,
            "/f",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
}
