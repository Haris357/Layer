// Friendly app names for a process: the exe's FileDescription (what Windows'
// own Volume Mixer and Task Manager show, e.g. "Google Chrome"), falling back
// to the process name. Shared by the Volume Mixer and Screen Time.

#[derive(Clone, Debug)]
pub struct AppName {
    pub name: String,
    // Lowercased exe path: a stable key, so every window of one app counts
    // as the same app. Falls back to the process name when there's no path.
    pub key: String,
}

#[cfg(target_os = "windows")]
pub fn for_pid(pid: u32) -> Option<AppName> {
    use std::collections::HashMap;
    use std::path::PathBuf;
    use std::sync::{Mutex, OnceLock};
    use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

    // Version resources never change for a given file, and callers poll.
    static CACHE: OnceLock<Mutex<HashMap<PathBuf, String>>> = OnceLock::new();

    let pid = Pid::from_u32(pid);
    let mut sys = System::new();
    sys.refresh_processes_specifics(
        ProcessesToUpdate::Some(&[pid]),
        true,
        ProcessRefreshKind::nothing().with_exe(UpdateKind::OnlyIfNotSet),
    );
    let proc_ = sys.process(pid)?;
    let raw = proc_.name().to_string_lossy().to_string();
    let fallback = raw.strip_suffix(".exe").unwrap_or(&raw).to_string();
    let Some(exe) = proc_.exe().map(|p| p.to_path_buf()) else {
        return Some(AppName { key: raw.to_lowercase(), name: fallback });
    };
    let key = exe.to_string_lossy().to_lowercase();

    let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Some(hit) = cache.lock().ok().and_then(|c| c.get(&exe).cloned()) {
        return Some(AppName { name: hit, key });
    }
    let name = unsafe { file_description(&exe) }.unwrap_or(fallback);
    if let Ok(mut c) = cache.lock() {
        c.insert(exe, name.clone());
    }
    Some(AppName { name, key })
}

#[cfg(not(target_os = "windows"))]
pub fn for_pid(_pid: u32) -> Option<AppName> {
    None
}

#[cfg(target_os = "windows")]
unsafe fn file_description(path: &std::path::Path) -> Option<String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{
        GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW,
    };

    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
    let file = PCWSTR(wide.as_ptr());
    let size = GetFileVersionInfoSizeW(file, None);
    if size == 0 {
        return None;
    }
    let mut data = vec![0u8; size as usize];
    GetFileVersionInfoW(file, None, size, data.as_mut_ptr() as *mut _).ok()?;

    let query = |sub: &str| -> Option<(*const u8, u32)> {
        let sub_w: Vec<u16> = sub.encode_utf16().chain(std::iter::once(0)).collect();
        let mut ptr: *mut core::ffi::c_void = core::ptr::null_mut();
        let mut len: u32 = 0;
        let ok = VerQueryValueW(
            data.as_ptr() as *const _,
            PCWSTR(sub_w.as_ptr()),
            &mut ptr,
            &mut len,
        );
        (ok.as_bool() && !ptr.is_null() && len > 0).then_some((ptr as *const u8, len))
    };

    // Prefer the file's own declared language/codepage, then US English.
    let mut langs: Vec<String> = Vec::new();
    if let Some((p, len)) = query("\\VarFileInfo\\Translation") {
        let pairs = std::slice::from_raw_parts(p as *const u16, (len / 2) as usize);
        for pair in pairs.chunks_exact(2) {
            langs.push(format!("{:04x}{:04x}", pair[0], pair[1]));
        }
    }
    langs.extend(["040904b0".into(), "040904e4".into()]);

    for lang in langs {
        if let Some((p, len)) = query(&format!("\\StringFileInfo\\{lang}\\FileDescription")) {
            // len is in characters, including the trailing NUL.
            let chars = std::slice::from_raw_parts(p as *const u16, len as usize);
            let s = String::from_utf16_lossy(chars);
            let s = s.trim_end_matches('\0').trim();
            if !s.is_empty() {
                return Some(s.to_string());
            }
        }
    }
    None
}
