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

#[cfg(not(target_os = "windows"))]
pub fn list_devices() -> Vec<AudioDevice> {
    Vec::new()
}
#[cfg(not(target_os = "windows"))]
pub fn set_default_device(_id: &str) -> bool {
    false
}
