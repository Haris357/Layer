// Screen time: how long each app was in front today. A background thread
// samples the foreground window once a second and credits that second to its
// app — only while the user is actually active (input in the last few
// minutes) and the PC isn't locked. Totals live in memory for today and are
// written to %LOCALAPPDATA%\Layer\screentime\YYYY-MM-DD.json every minute and
// at midnight. Nothing leaves the PC.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

const IDLE_LIMIT_MS: u32 = 5 * 60 * 1000;
const SAVE_EVERY_S: u32 = 60;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
pub struct AppUsage {
    pub name: String,
    pub seconds: u64,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
struct DayFile {
    // exe key -> usage
    apps: HashMap<String, AppUsage>,
}

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DayUsage {
    pub date: String,
    pub total_seconds: u64,
    pub apps: Vec<AppUsage>,
}

struct State {
    date: String,
    day: DayFile,
}

fn state() -> &'static Mutex<Option<State>> {
    static S: OnceLock<Mutex<Option<State>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(None))
}

fn dir() -> Option<std::path::PathBuf> {
    let local = std::env::var("LOCALAPPDATA").ok()?;
    Some(std::path::Path::new(&local).join("Layer").join("screentime"))
}

fn load(date: &str) -> DayFile {
    dir()
        .map(|d| d.join(format!("{date}.json")))
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save(date: &str, day: &DayFile) {
    let Some(d) = dir() else { return };
    if std::fs::create_dir_all(&d).is_err() {
        return;
    }
    if let Ok(s) = serde_json::to_string(day) {
        // Write-then-rename so a crash mid-write can't corrupt the day.
        let tmp = d.join(format!("{date}.json.tmp"));
        if std::fs::write(&tmp, s).is_ok() {
            let _ = std::fs::rename(&tmp, d.join(format!("{date}.json")));
        }
    }
}

fn summarize(date: String, day: &DayFile) -> DayUsage {
    let mut apps: Vec<AppUsage> = day.apps.values().cloned().collect();
    apps.sort_by(|a, b| b.seconds.cmp(&a.seconds).then_with(|| a.name.cmp(&b.name)));
    let total_seconds = apps.iter().map(|a| a.seconds).sum();
    DayUsage { date, total_seconds, apps }
}

/// Usage for a day ("YYYY-MM-DD"); today comes from memory, so it's live.
pub fn day(date: &str) -> DayUsage {
    if let Ok(g) = state().lock() {
        if let Some(s) = g.as_ref() {
            if s.date == date {
                return summarize(s.date.clone(), &s.day);
            }
        }
    }
    summarize(date.to_string(), &load(date))
}

#[cfg(target_os = "windows")]
pub fn today() -> String {
    use windows_sys::Win32::System::SystemInformation::GetLocalTime;
    unsafe {
        let mut t = core::mem::zeroed();
        GetLocalTime(&mut t);
        let t: windows_sys::Win32::Foundation::SYSTEMTIME = t;
        format!("{:04}-{:02}-{:02}", t.wYear, t.wMonth, t.wDay)
    }
}
#[cfg(not(target_os = "windows"))]
pub fn today() -> String {
    String::from("1970-01-01")
}

// Milliseconds since the last keyboard/mouse input anywhere.
#[cfg(target_os = "windows")]
pub fn idle_ms() -> u32 {
    use windows_sys::Win32::System::SystemInformation::GetTickCount;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    unsafe {
        let mut li = LASTINPUTINFO { cbSize: core::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
        if GetLastInputInfo(&mut li) == 0 {
            return 0;
        }
        GetTickCount().wrapping_sub(li.dwTime)
    }
}

// The process that owns the foreground window, unless it's something that
// shouldn't count: nothing in front (locked / secure desktop), the desktop
// itself, Layer, or the lock screen.
#[cfg(target_os = "windows")]
fn foreground_pid() -> Option<u32> {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetClassNameW, GetForegroundWindow, GetWindowThreadProcessId,
    };
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_null() {
            return None;
        }
        let mut buf = [0u16; 64];
        let len = GetClassNameW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
        let class = String::from_utf16_lossy(&buf[..len.max(0) as usize]);
        if matches!(
            class.as_str(),
            "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd" | "LockScreenBackstopFrame"
        ) {
            return None;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut pid);
        (pid != 0 && pid != std::process::id()).then_some(pid)
    }
}

#[cfg(target_os = "windows")]
pub fn start() {
    std::thread::spawn(|| {
        let mut since_save = 0u32;
        loop {
            std::thread::sleep(Duration::from_secs(1));
            let date = today();
            let sample = if idle_ms() < IDLE_LIMIT_MS {
                foreground_pid()
                    .and_then(crate::appname::for_pid)
                    .filter(|a| !a.name.eq_ignore_ascii_case("LockApp"))
            } else {
                None
            };

            let Ok(mut g) = state().lock() else { continue };
            // First tick, or midnight: save the old day, start (or resume) today.
            if g.as_ref().map(|s| s.date != date).unwrap_or(true) {
                if let Some(old) = g.take() {
                    save(&old.date, &old.day);
                }
                *g = Some(State { day: load(&date), date: date.clone() });
                since_save = 0;
            }
            let s = g.as_mut().expect("state set above");
            if let Some(app) = sample {
                let e = s.day.apps.entry(app.key).or_insert_with(|| AppUsage {
                    name: app.name.clone(),
                    seconds: 0,
                });
                e.name = app.name;
                e.seconds += 1;
            }
            since_save += 1;
            if since_save >= SAVE_EVERY_S {
                save(&s.date, &s.day);
                since_save = 0;
            }
        }
    });
}
#[cfg(not(target_os = "windows"))]
pub fn start() {}

/// Flush today's totals (call on quit so the last minute isn't lost).
pub fn flush() {
    if let Ok(g) = state().lock() {
        if let Some(s) = g.as_ref() {
            save(&s.date, &s.day);
        }
    }
}
