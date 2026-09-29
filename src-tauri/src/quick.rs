// Quick toggles: dark mode, desktop icons, Night Light, Recycle Bin, lock.
// All plain registry / shell calls except Night Light, which has no public
// API — its state lives in an undocumented CloudStore blob (see night_light).

#[derive(serde::Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct QuickState {
    pub dark: bool,
    pub icons_hidden: bool,
    /// None = blob missing or in a shape we don't recognise; the UI then
    /// opens Windows' Night Light settings instead of toggling.
    pub night_light: Option<bool>,
    pub recycle_items: i64,
    pub recycle_bytes: i64,
}

#[cfg(target_os = "windows")]
mod imp {
    use super::QuickState;
    use core::ffi::c_void;
    use windows_sys::core::PCWSTR;
    use windows_sys::w;
    use windows_sys::Win32::System::Registry::{
        RegGetValueW, RegSetKeyValueW, HKEY_CURRENT_USER, REG_BINARY, REG_DWORD, RRF_RT_REG_BINARY,
        RRF_RT_REG_DWORD,
    };

    const PERSONALIZE: PCWSTR = w!("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize");
    const ADVANCED: PCWSTR = w!("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced");
    const NIGHT: PCWSTR = w!("Software\\Microsoft\\Windows\\CurrentVersion\\CloudStore\\Store\\DefaultAccount\\Current\\default$windows.data.bluelightreduction.bluelightreductionstate\\windows.data.bluelightreduction.bluelightreductionstate");

    fn read_dword(key: PCWSTR, name: PCWSTR) -> Option<u32> {
        let mut v: u32 = 0;
        let mut len: u32 = 4;
        let r = unsafe {
            RegGetValueW(
                HKEY_CURRENT_USER,
                key,
                name,
                RRF_RT_REG_DWORD,
                core::ptr::null_mut(),
                &mut v as *mut u32 as *mut c_void,
                &mut len,
            )
        };
        (r == 0).then_some(v)
    }

    fn write_dword(key: PCWSTR, name: PCWSTR, v: u32) -> bool {
        unsafe {
            RegSetKeyValueW(
                HKEY_CURRENT_USER,
                key,
                name,
                REG_DWORD,
                &v as *const u32 as *const c_void,
                4,
            ) == 0
        }
    }

    fn read_binary(key: PCWSTR, name: PCWSTR) -> Option<Vec<u8>> {
        unsafe {
            let mut len: u32 = 0;
            if RegGetValueW(
                HKEY_CURRENT_USER,
                key,
                name,
                RRF_RT_REG_BINARY,
                core::ptr::null_mut(),
                core::ptr::null_mut(),
                &mut len,
            ) != 0
            {
                return None;
            }
            let mut buf = vec![0u8; len as usize];
            if RegGetValueW(
                HKEY_CURRENT_USER,
                key,
                name,
                RRF_RT_REG_BINARY,
                core::ptr::null_mut(),
                buf.as_mut_ptr() as *mut c_void,
                &mut len,
            ) != 0
            {
                return None;
            }
            buf.truncate(len as usize);
            Some(buf)
        }
    }

    fn write_binary(key: PCWSTR, name: PCWSTR, data: &[u8]) -> bool {
        unsafe {
            RegSetKeyValueW(
                HKEY_CURRENT_USER,
                key,
                name,
                REG_BINARY,
                data.as_ptr() as *const c_void,
                data.len() as u32,
            ) == 0
        }
    }

    // ---- Dark mode ---------------------------------------------------------

    fn is_dark() -> bool {
        read_dword(PERSONALIZE, w!("AppsUseLightTheme")) == Some(0)
    }

    pub fn set_dark(dark: bool) -> bool {
        let light = if dark { 0 } else { 1 };
        let ok = write_dword(PERSONALIZE, w!("AppsUseLightTheme"), light)
            & write_dword(PERSONALIZE, w!("SystemUsesLightTheme"), light);
        // Tell running apps + the taskbar to re-read the theme. Bounded
        // timeout so one hung window can't stall us.
        unsafe {
            use windows_sys::Win32::UI::WindowsAndMessaging::{
                SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_SETTINGCHANGE,
            };
            let mut res: usize = 0;
            SendMessageTimeoutW(
                HWND_BROADCAST,
                WM_SETTINGCHANGE,
                0,
                w!("ImmersiveColorSet") as isize,
                SMTO_ABORTIFHUNG,
                200,
                &mut res,
            );
        }
        ok
    }

    // ---- Desktop icons -----------------------------------------------------

    // The desktop's SHELLDLL_DefView normally sits under Progman, but moves
    // under a WorkerW once a wallpaper engine (Lively, Wallpaper Engine) has
    // split the desktop, so check both.
    unsafe fn desktop_defview() -> Option<windows_sys::Win32::Foundation::HWND> {
        use windows_sys::Win32::UI::WindowsAndMessaging::{FindWindowExW, FindWindowW};
        let progman = FindWindowW(w!("Progman"), core::ptr::null());
        if !progman.is_null() {
            let dv = FindWindowExW(progman, core::ptr::null_mut(), w!("SHELLDLL_DefView"), core::ptr::null());
            if !dv.is_null() {
                return Some(dv);
            }
        }
        let mut after = core::ptr::null_mut();
        loop {
            let ww = FindWindowExW(core::ptr::null_mut(), after, w!("WorkerW"), core::ptr::null());
            if ww.is_null() {
                return None;
            }
            let dv = FindWindowExW(ww, core::ptr::null_mut(), w!("SHELLDLL_DefView"), core::ptr::null());
            if !dv.is_null() {
                return Some(dv);
            }
            after = ww;
        }
    }

    fn icons_hidden() -> bool {
        read_dword(ADVANCED, w!("HideIcons")) == Some(1)
    }

    pub fn set_icons_hidden(hidden: bool) -> bool {
        if icons_hidden() == hidden {
            return true;
        }
        unsafe {
            use windows_sys::Win32::UI::WindowsAndMessaging::{PostMessageW, WM_COMMAND};
            // 0x7402 = the desktop context menu's View → "Show desktop icons"
            // command. It's a toggle, and Explorer persists HideIcons itself.
            match desktop_defview() {
                Some(dv) => PostMessageW(dv, WM_COMMAND, 0x7402, 0) != 0,
                None => false,
            }
        }
    }

    // ---- Night Light -------------------------------------------------------
    //
    // Known blob layout (Win10 1903+ / Win11):
    //   [0..4]   43 42 01 00          header
    //   [8..10]  2a 06                timestamp tag
    //   [10..15] 5-byte LEB128 unix time (must increase or Windows ignores us)
    //   [15..18] 2a 2b 0e
    //   [18]     0x15 = on, 0x13 = off
    //   [19..23] 43 42 01 00
    //   [23..25] 10 00  — present only when on
    // Anything that doesn't match exactly is left alone.

    fn night_state(d: &[u8]) -> Option<bool> {
        if d.len() < 25
            || d[0..4] != [0x43, 0x42, 0x01, 0x00]
            || d[8..10] != [0x2a, 0x06]
            || d[14] & 0x80 != 0
            || d[10..14].iter().any(|b| b & 0x80 == 0)
            || d[15..18] != [0x2a, 0x2b, 0x0e]
            || d[19..23] != [0x43, 0x42, 0x01, 0x00]
        {
            return None;
        }
        match d[18] {
            0x15 if d[23..25] == [0x10, 0x00] => Some(true),
            0x13 if d[23] != 0x10 => Some(false),
            _ => None,
        }
    }

    fn night_light() -> Option<bool> {
        night_state(&read_binary(NIGHT, w!("Data"))?)
    }

    pub fn set_night_light(on: bool) -> bool {
        let Some(mut d) = read_binary(NIGHT, w!("Data")) else { return false };
        let Some(current) = night_state(&d) else { return false };
        if current == on {
            return true;
        }
        let mut old: u64 = 0;
        for (i, b) in d[10..15].iter().enumerate() {
            old |= ((b & 0x7f) as u64) << (7 * i);
        }
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let mut ts = now.max(old + 1);
        for i in 0..5 {
            let b = (ts & 0x7f) as u8;
            ts >>= 7;
            d[10 + i] = if i < 4 { b | 0x80 } else { b };
        }
        if on {
            d[18] = 0x15;
            d.splice(23..23, [0x10, 0x00]);
        } else {
            d[18] = 0x13;
            d.drain(23..25);
        }
        write_binary(NIGHT, w!("Data"), &d)
    }

    // ---- Recycle Bin / lock ------------------------------------------------

    fn recycle_info() -> (i64, i64) {
        use windows_sys::Win32::UI::Shell::{SHQueryRecycleBinW, SHQUERYRBINFO};
        let mut info = SHQUERYRBINFO {
            cbSize: core::mem::size_of::<SHQUERYRBINFO>() as u32,
            i64Size: 0,
            i64NumItems: 0,
        };
        let hr = unsafe { SHQueryRecycleBinW(core::ptr::null(), &mut info) };
        if hr < 0 {
            return (0, 0);
        }
        (info.i64NumItems, info.i64Size)
    }

    pub fn empty_recycle_bin() -> bool {
        use windows_sys::Win32::UI::Shell::{
            SHEmptyRecycleBinW, SHERB_NOCONFIRMATION, SHERB_NOPROGRESSUI, SHERB_NOSOUND,
        };
        if recycle_info().0 == 0 {
            return true;
        }
        let hr = unsafe {
            SHEmptyRecycleBinW(
                core::ptr::null_mut(),
                core::ptr::null(),
                SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI | SHERB_NOSOUND,
            )
        };
        hr >= 0
    }

    pub fn lock() -> bool {
        unsafe { windows_sys::Win32::System::Shutdown::LockWorkStation() != 0 }
    }

    pub fn state() -> QuickState {
        let (recycle_items, recycle_bytes) = recycle_info();
        QuickState {
            dark: is_dark(),
            icons_hidden: icons_hidden(),
            night_light: night_light(),
            recycle_items,
            recycle_bytes,
        }
    }

    #[cfg(test)]
    mod tests {
        use super::night_state;

        const OFF: [u8; 41] = [
            0x43, 0x42, 0x01, 0x00, 0x0a, 0x02, 0x01, 0x00, 0x2a, 0x06, 0xd4, 0xbf, 0xb6, 0xd4,
            0x06, 0x2a, 0x2b, 0x0e, 0x13, 0x43, 0x42, 0x01, 0x00, 0xd0, 0x0a, 0x02, 0xc6, 0x14,
            0x95, 0xd8, 0xf2, 0xea, 0x9f, 0x93, 0xcd, 0xee, 0x01, 0x00, 0x00, 0x00, 0x00,
        ];

        #[test]
        fn parses_known_shapes() {
            assert_eq!(night_state(&OFF), Some(false));
            let mut on = OFF.to_vec();
            on[18] = 0x15;
            on.splice(23..23, [0x10, 0x00]);
            assert_eq!(night_state(&on), Some(true));
        }

        #[test]
        fn rejects_unknown_shapes() {
            let mut bad = OFF.to_vec();
            bad[18] = 0x14;
            assert_eq!(night_state(&bad), None);
            assert_eq!(night_state(&OFF[..20]), None);
            let mut bad_hdr = OFF.to_vec();
            bad_hdr[0] = 0;
            assert_eq!(night_state(&bad_hdr), None);
        }
    }
}

#[cfg(target_os = "windows")]
pub use imp::{empty_recycle_bin, lock, set_dark, set_icons_hidden, set_night_light, state};

#[cfg(not(target_os = "windows"))]
pub fn state() -> QuickState {
    QuickState::default()
}
#[cfg(not(target_os = "windows"))]
pub fn set_dark(_: bool) -> bool {
    false
}
#[cfg(not(target_os = "windows"))]
pub fn set_icons_hidden(_: bool) -> bool {
    false
}
#[cfg(not(target_os = "windows"))]
pub fn set_night_light(_: bool) -> bool {
    false
}
#[cfg(not(target_os = "windows"))]
pub fn empty_recycle_bin() -> bool {
    false
}
#[cfg(not(target_os = "windows"))]
pub fn lock() -> bool {
    false
}
