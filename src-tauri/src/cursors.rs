// Pointer themes (the Pointer widget). The artwork is Prism Pointer's
// pre-rendered .cur/.ani files, bundled in resources/cursors/<theme>-<size>/
// (scripts/sync-cursors.mjs). Applying works like Prism Pointer:
//  1. copy the 17 role files to Layer's data folder (a fresh folder each time,
//     so the active scheme's files are never overwritten mid-use),
//  2. back up the user's original cursor paths once,
//  3. point HKCU\Control Panel\Cursors at the new files and ask Windows to
//     reload (SPI_SETCURSORS), rolling back if anything fails,
//  4. also set them for the running session (SetSystemCursor), re-done at
//     startup. In the Store build Windows may keep registry/AppData writes in
//     the package's private copy; the session cursors still take effect.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

use crate::storage;

/// The 17 Windows cursor roles: (registry value, OCR_* id for SetSystemCursor).
const ROLES: [(&str, u32); 17] = [
    ("Arrow", 32512),
    ("Help", 32651),
    ("AppStarting", 32650),
    ("Wait", 32514),
    ("Crosshair", 32515),
    ("IBeam", 32513),
    ("NWPen", 32631),
    ("No", 32648),
    ("SizeNS", 32645),
    ("SizeWE", 32644),
    ("SizeNWSE", 32642),
    ("SizeNESW", 32643),
    ("SizeAll", 32646),
    ("UpArrow", 32516),
    ("Hand", 32649),
    ("Pin", 32671),
    ("Person", 32672),
];
const SIZES: [u32; 5] = [28, 30, 32, 48, 64];

fn file_of(role: &str) -> String {
    let animated = role == "AppStarting" || role == "Wait";
    format!("{role}.{}", if animated { "ani" } else { "cur" })
}

/// Only known theme ids and sizes, so nothing outside the bundle is reachable.
fn check(theme: &str, size: u32) -> Result<(), String> {
    if theme.is_empty() || !theme.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        return Err("unknown theme".into());
    }
    if !SIZES.contains(&size) {
        return Err("unknown size".into());
    }
    Ok(())
}

pub fn bundle_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .resolve("resources/cursors", tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())
}
fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let d = storage::layer_dir(app)?.join("cursors");
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

#[derive(Serialize, Deserialize, Clone)]
struct Saved {
    name: String,
    value: Option<String>,
    kind: u32,
}
#[derive(Serialize, Deserialize, Clone)]
struct Applied {
    theme: String,
    size: u32,
    // role → absolute file path (canonical, so it's the real on-disk file)
    files: Vec<(String, String)>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PointerStatus {
    /// Theme id + size currently applied by Layer, if any.
    pub theme: Option<String>,
    pub size: Option<u32>,
    /// A backup of the user's original cursors exists (Restore is possible).
    pub has_backup: bool,
    /// The folder with the bundled themes (for previews).
    pub bundle: String,
}

#[tauri::command]
pub fn pointer_status(app: AppHandle) -> Result<PointerStatus, String> {
    let d = data_dir(&app)?;
    let applied: Option<Applied> = std::fs::read_to_string(d.join("applied.json")).ok().and_then(|s| serde_json::from_str(&s).ok());
    Ok(PointerStatus {
        theme: applied.as_ref().map(|a| a.theme.clone()),
        size: applied.as_ref().map(|a| a.size),
        has_backup: d.join("original-cursors.json").exists(),
        bundle: bundle_dir(&app)?.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn pointer_apply(app: AppHandle, theme: String, size: u32, name: String) -> Result<(), String> {
    check(&theme, size)?;
    let from = bundle_dir(&app)?.join(format!("{theme}-{size}"));
    let d = data_dir(&app)?;
    let to = d.join(format!("{theme}-{size}-{}", uuid::Uuid::new_v4().simple()));
    std::fs::create_dir_all(&to).map_err(|e| e.to_string())?;
    let mut files = Vec::new();
    for (role, _) in ROLES {
        let f = file_of(role);
        let dest = to.join(&f);
        std::fs::copy(from.join(&f), &dest).map_err(|e| format!("{f}: {e}"))?;
        // Canonical = the real path (in the Store build AppData is redirected).
        let real = std::fs::canonicalize(&dest).unwrap_or(dest);
        let real = real.to_string_lossy().trim_start_matches(r"\\?\").to_string();
        if !win::loads(&real) {
            return Err(format!("Windows could not load {f}"));
        }
        files.push((role.to_string(), real));
    }

    win::apply(&d, &files, &format!("Layer · {name}"))?;
    let applied = Applied { theme: theme.clone(), size, files };
    std::fs::write(d.join("applied.json"), serde_json::to_string(&applied).unwrap_or_default()).map_err(|e| e.to_string())?;
    prune(&d, &to);
    Ok(())
}

#[tauri::command]
pub fn pointer_restore(app: AppHandle) -> Result<(), String> {
    let d = data_dir(&app)?;
    win::restore(&d)?;
    let _ = std::fs::remove_file(d.join("applied.json"));
    Ok(())
}

/// Copy a whole theme (Extras included) into `dest`/Layer-<Name>-<size>.
#[tauri::command]
pub fn pointer_export(app: AppHandle, theme: String, size: u32, name: String, dest: String) -> Result<String, String> {
    check(&theme, size)?;
    let from = bundle_dir(&app)?.join(format!("{theme}-{size}"));
    let safe: String = name.chars().map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' { c } else { '_' }).collect();
    let to = Path::new(&dest).join(format!("Layer-{}-{size}", safe.trim()));
    copy_dir(&from, &to).map_err(|e| e.to_string())?;
    Ok(to.to_string_lossy().to_string())
}

/// At startup: re-apply the session cursors for the theme Layer applied (see
/// the header — this is what keeps the Store build's cursors after a restart).
pub fn restore_session(app: &AppHandle) {
    let Ok(d) = data_dir(app) else { return };
    let Some(applied) = std::fs::read_to_string(d.join("applied.json")).ok().and_then(|s| serde_json::from_str::<Applied>(&s).ok()) else {
        return;
    };
    if applied.files.iter().all(|(_, p)| Path::new(p).exists()) {
        win::set_session(&applied.files);
    }
}

fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for e in std::fs::read_dir(from)? {
        let e = e?;
        let p = e.path();
        if p.is_dir() {
            copy_dir(&p, &to.join(e.file_name()))?;
        } else {
            std::fs::copy(&p, to.join(e.file_name()))?;
        }
    }
    Ok(())
}

/// Keep the active folder and the one before it; delete older applied copies.
fn prune(d: &Path, keep: &Path) {
    let Ok(rd) = std::fs::read_dir(d) else { return };
    let mut dirs: Vec<(std::time::SystemTime, PathBuf)> = rd
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_dir() && p != keep)
        .filter_map(|p| Some((std::fs::metadata(&p).ok()?.modified().ok()?, p)))
        .collect();
    dirs.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, p) in dirs.into_iter().skip(1) {
        let _ = std::fs::remove_dir_all(p);
    }
}

#[cfg(target_os = "windows")]
mod win {
    use super::{Saved, ROLES};
    use std::path::Path;
    use windows_sys::w;
    use windows_sys::Win32::Foundation::ERROR_SUCCESS;
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegDeleteValueW, RegFlushKey, RegQueryValueExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_READ, KEY_WRITE,
        REG_EXPAND_SZ, REG_OPTION_NON_VOLATILE, REG_SZ,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{DestroyCursor, LoadCursorFromFileW, SetSystemCursor, SystemParametersInfoW, SPIF_SENDCHANGE, SPI_SETCURSORS};

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    pub fn loads(path: &str) -> bool {
        unsafe {
            let h = LoadCursorFromFileW(wide(path).as_ptr());
            if h.is_null() {
                return false;
            }
            DestroyCursor(h);
            true
        }
    }

    struct Key(HKEY);
    impl Drop for Key {
        fn drop(&mut self) {
            unsafe {
                RegCloseKey(self.0);
            }
        }
    }
    fn open() -> Result<Key, String> {
        let mut k: HKEY = core::ptr::null_mut();
        let r = unsafe {
            RegCreateKeyExW(HKEY_CURRENT_USER, w!("Control Panel\\Cursors"), 0, core::ptr::null(), REG_OPTION_NON_VOLATILE, KEY_READ | KEY_WRITE, core::ptr::null(), &mut k, core::ptr::null_mut())
        };
        if r != ERROR_SUCCESS {
            return Err(format!("could not open the cursor settings ({r})"));
        }
        Ok(Key(k))
    }
    fn get(k: &Key, name: &str) -> Saved {
        let n = wide(name);
        let mut kind = 0u32;
        let mut size = 0u32;
        unsafe {
            if RegQueryValueExW(k.0, n.as_ptr(), core::ptr::null(), &mut kind, core::ptr::null_mut(), &mut size) != ERROR_SUCCESS {
                return Saved { name: name.into(), value: None, kind: REG_SZ };
            }
            let mut buf = vec![0u16; (size as usize).div_ceil(2) + 1];
            RegQueryValueExW(k.0, n.as_ptr(), core::ptr::null(), &mut kind, buf.as_mut_ptr() as *mut u8, &mut size);
            let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
            Saved { name: name.into(), value: Some(String::from_utf16_lossy(&buf[..len])), kind }
        }
    }
    fn set(k: &Key, name: &str, value: &str, kind: u32) {
        let n = wide(name);
        let v = wide(value);
        unsafe {
            RegSetValueExW(k.0, n.as_ptr(), 0, kind, v.as_ptr() as *const u8, (v.len() * 2) as u32);
        }
    }
    fn write(k: &Key, values: &[Saved]) {
        for s in values {
            match &s.value {
                Some(v) => set(k, &s.name, v, if s.kind == REG_EXPAND_SZ { REG_EXPAND_SZ } else { REG_SZ }),
                None => unsafe {
                    RegDeleteValueW(k.0, wide(&s.name).as_ptr());
                },
            }
        }
        unsafe {
            RegFlushKey(k.0);
        }
    }
    fn capture(k: &Key) -> Vec<Saved> {
        ROLES.iter().map(|(r, _)| get(k, r)).chain(std::iter::once(get(k, ""))).collect()
    }
    fn reload() -> bool {
        unsafe { SystemParametersInfoW(SPI_SETCURSORS, 0, core::ptr::null_mut(), SPIF_SENDCHANGE) != 0 }
    }

    pub fn set_session(files: &[(String, String)]) {
        for (role, path) in files {
            let Some((_, ocr)) = ROLES.iter().find(|(r, _)| r == role) else { continue };
            unsafe {
                // SetSystemCursor takes ownership of (and destroys) the handle.
                let h = LoadCursorFromFileW(wide(path).as_ptr());
                if !h.is_null() {
                    SetSystemCursor(h, *ocr);
                }
            }
        }
    }

    pub fn apply(dir: &Path, files: &[(String, String)], scheme: &str) -> Result<(), String> {
        let k = open()?;
        let previous = capture(&k);
        let backup = dir.join("original-cursors.json");
        if !backup.exists() {
            let tmp = dir.join("original-cursors.json.tmp");
            std::fs::write(&tmp, serde_json::to_string(&previous).unwrap_or_default()).map_err(|e| e.to_string())?;
            std::fs::rename(&tmp, &backup).map_err(|e| e.to_string())?;
        }
        for (role, path) in files {
            set(&k, role, path, REG_EXPAND_SZ);
        }
        set(&k, "", scheme, REG_SZ);
        unsafe {
            RegFlushKey(k.0);
        }
        if !reload() {
            write(&k, &previous);
            reload();
            return Err("Windows could not reload the cursors".into());
        }
        set_session(files);
        Ok(())
    }

    pub fn restore(dir: &Path) -> Result<(), String> {
        let raw = std::fs::read_to_string(dir.join("original-cursors.json")).map_err(|_| "No backup of your original cursors yet".to_string())?;
        let values: Vec<Saved> = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        let k = open()?;
        let previous = capture(&k);
        write(&k, &values);
        if !reload() {
            write(&k, &previous);
            reload();
            return Err("Windows could not reload the cursors".into());
        }
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
mod win {
    use super::Saved;
    use std::path::Path;
    pub fn loads(_: &str) -> bool {
        false
    }
    pub fn set_session(_: &[(String, String)]) {}
    pub fn apply(_: &Path, _: &[(String, String)], _: &str) -> Result<(), String> {
        Err("Windows only".into())
    }
    pub fn restore(_: &Path) -> Result<(), String> {
        let _: Option<Saved> = None;
        Err("Windows only".into())
    }
}
