// Audio device switcher — lists active output (render) and input (capture)
// endpoints and sets the system default. Windows has no public API for setting
// the default device, so we use the undocumented IPolicyConfig COM interface
// (the same approach NirCmd / SoundSwitch / AudioDeviceCmdlets use).

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    /// "output" (render) or "input" (capture)
    pub direction: String,
    pub is_default: bool,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AudioSession {
    /// Stable per-session-instance id (not the pid — a process can own more
    /// than one session, e.g. one per browser tab), used to target a single
    /// slider on the next set_session_volume/mute call.
    pub id: String,
    pub pid: u32,
    pub name: String,
    pub volume: f32,
    pub muted: bool,
}

#[cfg(target_os = "windows")]
mod imp {
    use super::AudioDevice;
    use windows::core::{Interface, GUID, HRESULT, PCWSTR};
    use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
    use windows::Win32::Media::Audio::{
        eCapture, eConsole, eRender, EDataFlow, IMMDeviceEnumerator, MMDeviceEnumerator,
        DEVICE_STATE_ACTIVE,
    };
    use windows::Win32::System::Com::StructuredStorage::PropVariantClear;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_ALL, COINIT_MULTITHREADED,
        STGM_READ,
    };
    use windows::Win32::System::Variant::VT_LPWSTR;

    fn com_init() {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
    }

    unsafe fn default_id(enumr: &IMMDeviceEnumerator, flow: EDataFlow) -> Option<String> {
        let dev = enumr.GetDefaultAudioEndpoint(flow, eConsole).ok()?;
        let id = dev.GetId().ok()?;
        let s = id.to_string().ok();
        CoTaskMemFree(Some(id.0 as *const _));
        s
    }

    unsafe fn list_flow(
        enumr: &IMMDeviceEnumerator,
        flow: EDataFlow,
        dir: &str,
        out: &mut Vec<AudioDevice>,
    ) {
        let def = default_id(enumr, flow);
        let coll = match enumr.EnumAudioEndpoints(flow, DEVICE_STATE_ACTIVE) {
            Ok(c) => c,
            Err(_) => return,
        };
        let count = coll.GetCount().unwrap_or(0);
        for i in 0..count {
            let Ok(dev) = coll.Item(i) else { continue };
            let id = match dev.GetId() {
                Ok(p) => {
                    let s = p.to_string().unwrap_or_default();
                    CoTaskMemFree(Some(p.0 as *const _));
                    s
                }
                Err(_) => continue,
            };
            let name = friendly_name(&dev).unwrap_or_else(|| "Unknown device".into());
            out.push(AudioDevice {
                is_default: def.as_deref() == Some(id.as_str()),
                id,
                name,
                direction: dir.to_string(),
            });
        }
    }

    unsafe fn friendly_name(dev: &windows::Win32::Media::Audio::IMMDevice) -> Option<String> {
        let store = dev.OpenPropertyStore(STGM_READ).ok()?;
        let mut pv = store.GetValue(&PKEY_Device_FriendlyName).ok()?;
        let mut result = None;
        if pv.Anonymous.Anonymous.vt == VT_LPWSTR {
            result = pv.Anonymous.Anonymous.Anonymous.pwszVal.to_string().ok();
        }
        let _ = PropVariantClear(&mut pv);
        result
    }

    pub fn list() -> Vec<AudioDevice> {
        com_init();
        let mut out = Vec::new();
        unsafe {
            if let Ok(enumr) =
                CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL)
            {
                list_flow(&enumr, eRender, "output", &mut out);
                list_flow(&enumr, eCapture, "input", &mut out);
            }
        }
        out
    }

    // ---- Per-app session volumes (IAudioSessionManager2) ------------------
    use super::AudioSession;
    use windows::Win32::Media::Audio::{
        IAudioSessionControl2, IAudioSessionManager2, ISimpleAudioVolume, AudioSessionStateExpired,
    };

    unsafe fn session_manager() -> windows::core::Result<IAudioSessionManager2> {
        let enumr: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        let device = enumr.GetDefaultAudioEndpoint(eRender, eConsole)?;
        device.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None)
    }

    // Display name for a pid: the exe's FileDescription (what Windows' own
    // mixer shows, e.g. "Google Chrome"), falling back to the process name.
    // Cached per exe path — the widget polls every 1.5s and version resources
    // never change for a given file.
    fn process_name(pid: u32) -> Option<String> {
        use std::collections::HashMap;
        use std::path::PathBuf;
        use std::sync::{Mutex, OnceLock};
        use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

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
            return Some(fallback);
        };

        let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
        if let Some(hit) = cache.lock().ok().and_then(|c| c.get(&exe).cloned()) {
            return Some(hit);
        }
        let name = unsafe { file_description(&exe) }.unwrap_or(fallback);
        if let Ok(mut c) = cache.lock() {
            c.insert(exe, name.clone());
        }
        Some(name)
    }

    unsafe fn file_description(path: &std::path::Path) -> Option<String> {
        use std::os::windows::ffi::OsStrExt;
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

    unsafe fn each_session(
        mut f: impl FnMut(&IAudioSessionControl2, &ISimpleAudioVolume, u32) -> bool,
    ) -> bool {
        com_init();
        let Ok(mgr) = session_manager() else { return false };
        let Ok(sessions) = mgr.GetSessionEnumerator() else { return false };
        let count = sessions.GetCount().unwrap_or(0);
        for i in 0..count {
            let Ok(ctrl) = sessions.GetSession(i) else { continue };
            let Ok(ctrl2) = ctrl.cast::<IAudioSessionControl2>() else { continue };
            if matches!(ctrl2.GetState(), Ok(s) if s == AudioSessionStateExpired) {
                continue;
            }
            let Ok(vol) = ctrl2.cast::<ISimpleAudioVolume>() else { continue };
            let pid = ctrl2.GetProcessId().unwrap_or(0);
            if f(&ctrl2, &vol, pid) {
                return true;
            }
        }
        false
    }

    pub fn list_sessions() -> Vec<AudioSession> {
        let mut out: Vec<AudioSession> = Vec::new();
        unsafe {
            each_session(|ctrl2, vol, pid| {
                let is_system = pid == 0;
                let id = ctrl2
                    .GetSessionInstanceIdentifier()
                    .ok()
                    .and_then(|p| {
                        let s = p.to_string().ok();
                        CoTaskMemFree(Some(p.0 as *const _));
                        s
                    })
                    .unwrap_or_else(|| format!("pid-{pid}"));
                let name = if is_system {
                    "System Sounds".to_string()
                } else {
                    process_name(pid).unwrap_or_else(|| format!("PID {pid}"))
                };
                let volume = vol.GetMasterVolume().unwrap_or(-1.0);
                if volume < 0.0 {
                    return false;
                }
                let muted = vol.GetMute().map(|b| b.as_bool()).unwrap_or(false);
                out.push(AudioSession {
                    id,
                    pid,
                    name,
                    volume,
                    muted,
                });
                false
            });
        }
        out
    }

    pub fn set_session_volume(id: &str, level: f32) -> bool {
        let level = level.clamp(0.0, 1.0);
        unsafe {
            each_session(|ctrl2, vol, pid| {
                if session_matches(ctrl2, id, pid) {
                    let _ = vol.SetMasterVolume(level, std::ptr::null());
                    return true;
                }
                false
            })
        }
    }

    pub fn set_session_mute(id: &str, muted: bool) -> bool {
        unsafe {
            each_session(|ctrl2, vol, pid| {
                if session_matches(ctrl2, id, pid) {
                    let _ = vol.SetMute(muted, std::ptr::null());
                    return true;
                }
                false
            })
        }
    }

    unsafe fn session_matches(ctrl2: &IAudioSessionControl2, id: &str, pid: u32) -> bool {
        let this_id = ctrl2
            .GetSessionInstanceIdentifier()
            .ok()
            .and_then(|p| {
                let s = p.to_string().ok();
                CoTaskMemFree(Some(p.0 as *const _));
                s
            })
            .unwrap_or_else(|| format!("pid-{pid}"));
        this_id == id
    }

    // ---- IPolicyConfig (undocumented) -------------------------------------
    const CLSID_POLICY_CONFIG_CLIENT: GUID =
        GUID::from_u128(0x870af99c_171d_4f9e_af0d_e63df40c2bc9);
    const IID_IPOLICY_CONFIG: GUID = GUID::from_u128(0xf8679f50_850a_41cf_9c72_430f290290c8);

    // Vtable layout of IPolicyConfig. We only call SetDefaultEndpoint (entry 14:
    // 3 IUnknown slots + 10 IPolicyConfig methods before it); the rest are left
    // opaque so we never have to model their signatures.
    #[repr(C)]
    struct IPolicyConfigVtbl {
        query_interface: unsafe extern "system" fn(
            *mut core::ffi::c_void,
            *const GUID,
            *mut *mut core::ffi::c_void,
        ) -> HRESULT,
        add_ref: unsafe extern "system" fn(*mut core::ffi::c_void) -> u32,
        release: unsafe extern "system" fn(*mut core::ffi::c_void) -> u32,
        _get_mix_format: usize,
        _get_device_format: usize,
        _reset_device_format: usize,
        _set_device_format: usize,
        _get_processing_period: usize,
        _set_processing_period: usize,
        _get_share_mode: usize,
        _set_share_mode: usize,
        _get_property_value: usize,
        _set_property_value: usize,
        set_default_endpoint:
            unsafe extern "system" fn(*mut core::ffi::c_void, PCWSTR, i32) -> HRESULT,
        _set_endpoint_visibility: usize,
    }

    pub fn set_default(device_id: &str) -> bool {
        com_init();
        let id_w: Vec<u16> = device_id.encode_utf16().chain(std::iter::once(0)).collect();
        unsafe {
            let unknown: windows::core::IUnknown =
                match CoCreateInstance(&CLSID_POLICY_CONFIG_CLIENT, None, CLSCTX_ALL) {
                    Ok(u) => u,
                    Err(_) => return false,
                };
            let mut ppv: *mut core::ffi::c_void = core::ptr::null_mut();
            let hr = (Interface::vtable(&unknown).QueryInterface)(
                unknown.as_raw(),
                &IID_IPOLICY_CONFIG,
                &mut ppv,
            );
            if hr.is_err() || ppv.is_null() {
                return false;
            }
            let vtbl = *(ppv as *mut *mut IPolicyConfigVtbl);
            let set_default_endpoint = (*vtbl).set_default_endpoint;
            let mut ok = true;
            // eConsole = 0, eMultimedia = 1, eCommunications = 2 — set all roles.
            for role in [0i32, 1, 2] {
                if set_default_endpoint(ppv, PCWSTR(id_w.as_ptr()), role).is_err() {
                    ok = false;
                }
            }
            ((*vtbl).release)(ppv);
            ok
        }
    }
}

#[cfg(target_os = "windows")]
pub fn list_devices() -> Vec<AudioDevice> {
    imp::list()
}
#[cfg(target_os = "windows")]
pub fn set_default_device(id: &str) -> bool {
    imp::set_default(id)
}

#[cfg(target_os = "windows")]
pub fn list_sessions() -> Vec<AudioSession> {
    imp::list_sessions()
}
#[cfg(target_os = "windows")]
pub fn set_session_volume(id: &str, level: f32) -> bool {
    imp::set_session_volume(id, level)
}
#[cfg(target_os = "windows")]
pub fn set_session_mute(id: &str, muted: bool) -> bool {
    imp::set_session_mute(id, muted)
}

#[cfg(not(target_os = "windows"))]
pub fn list_devices() -> Vec<AudioDevice> {
    Vec::new()
}
#[cfg(not(target_os = "windows"))]
pub fn set_default_device(_id: &str) -> bool {
    false
}
#[cfg(not(target_os = "windows"))]
pub fn list_sessions() -> Vec<AudioSession> {
    Vec::new()
}
#[cfg(not(target_os = "windows"))]
pub fn set_session_volume(_id: &str, _level: f32) -> bool {
    false
}
#[cfg(not(target_os = "windows"))]
pub fn set_session_mute(_id: &str, _muted: bool) -> bool {
    false
}

