// GPU stats for the System widget: usage, dedicated VRAM and temperature of the
// main GPU (the one with the most dedicated memory). A background thread
// samples once a second so the command itself never blocks.
//
//  - name + total VRAM: DXGI adapter description.
//  - usage: Windows' "GPU Engine" performance counters, the same numbers Task
//    Manager uses. Like Task Manager, it's the busiest engine type (3D,
//    compute, video…), summed across apps. Works for every vendor.
//  - VRAM in use: the "GPU Adapter Memory" counters.
//  - temperature: the driver's adapter performance data (WDDM 2.4+, what Task
//    Manager shows). Not every driver reports it; then it's left empty.

use serde::Serialize;
use std::sync::Mutex;

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct GpuStats {
    pub name: String,
    pub usage: Option<f32>,
    pub vram_used: Option<u64>,
    pub vram_total: u64,
    pub temperature: Option<f32>,
}

static LATEST: Mutex<Option<GpuStats>> = Mutex::new(None);

pub fn latest() -> Option<GpuStats> {
    LATEST.lock().ok().and_then(|g| g.clone())
}

#[cfg(target_os = "windows")]
pub fn start() {
    std::thread::spawn(|| {
        let Some((name, total, luid)) = main_adapter() else { return };
        let luid_key = format!("luid_0x{:08x}_0x{:08x}", luid.HighPart as u32, luid.LowPart).to_lowercase();
        let pdh = Pdh::open();
        loop {
            let (usage, vram_used) = match &pdh {
                Some(p) => p.sample(&luid_key),
                None => (None, None),
            };
            let stats = GpuStats {
                name: name.clone(),
                usage,
                vram_used,
                vram_total: total,
                temperature: temperature(luid.HighPart, luid.LowPart),
            };
            if let Ok(mut g) = LATEST.lock() {
                *g = Some(stats);
            }
            std::thread::sleep(std::time::Duration::from_millis(1000));
        }
    });
}
#[cfg(not(target_os = "windows"))]
pub fn start() {}

/// The hardware GPU with the most dedicated memory (skips the software one).
#[cfg(target_os = "windows")]
fn main_adapter() -> Option<(String, u64, windows::Win32::Foundation::LUID)> {
    use windows::Win32::Graphics::Dxgi::{CreateDXGIFactory1, IDXGIFactory1, DXGI_ADAPTER_FLAG_SOFTWARE};
    unsafe {
        let factory: IDXGIFactory1 = CreateDXGIFactory1().ok()?;
        let mut best: Option<(String, u64, windows::Win32::Foundation::LUID)> = None;
        let mut i = 0;
        while let Ok(adapter) = factory.EnumAdapters1(i) {
            i += 1;
            let Ok(desc) = adapter.GetDesc1() else { continue };
            if desc.Flags & DXGI_ADAPTER_FLAG_SOFTWARE.0 as u32 != 0 {
                continue;
            }
            let mem = desc.DedicatedVideoMemory as u64;
            if best.as_ref().map_or(true, |b| mem > b.1) {
                let len = desc.Description.iter().position(|&c| c == 0).unwrap_or(desc.Description.len());
                let name = String::from_utf16_lossy(&desc.Description[..len]).trim().to_string();
                best = Some((name, mem, desc.AdapterLuid));
            }
        }
        best
    }
}

#[cfg(target_os = "windows")]
struct Pdh {
    query: windows_sys::Win32::System::Performance::PDH_HQUERY,
    engine: windows_sys::Win32::System::Performance::PDH_HCOUNTER,
    memory: windows_sys::Win32::System::Performance::PDH_HCOUNTER,
}
// The handles are only ever used from the sampler thread.
#[cfg(target_os = "windows")]
unsafe impl Send for Pdh {}

#[cfg(target_os = "windows")]
impl Pdh {
    fn open() -> Option<Self> {
        use windows_sys::w;
        use windows_sys::Win32::System::Performance::{PdhAddEnglishCounterW, PdhCollectQueryData, PdhOpenQueryW};
        unsafe {
            let mut query = core::ptr::null_mut();
            if PdhOpenQueryW(core::ptr::null(), 0, &mut query) != 0 {
                return None;
            }
            let mut engine = core::ptr::null_mut();
            let mut memory = core::ptr::null_mut();
            PdhAddEnglishCounterW(query, w!("\\GPU Engine(*)\\Utilization Percentage"), 0, &mut engine);
            PdhAddEnglishCounterW(query, w!("\\GPU Adapter Memory(*)\\Dedicated Usage"), 0, &mut memory);
            // Rates need two samples; prime the first one.
            PdhCollectQueryData(query);
            Some(Self { query, engine, memory })
        }
    }

    /// (usage %, dedicated VRAM in use) for the adapter whose instance names
    /// contain `luid` (lower-case "luid_0x…_0x…").
    fn sample(&self, luid: &str) -> (Option<f32>, Option<u64>) {
        use std::collections::HashMap;
        use windows_sys::Win32::System::Performance::PdhCollectQueryData;
        unsafe {
            if PdhCollectQueryData(self.query) != 0 {
                return (None, None);
            }
        }
        // Sum per engine type ("engtype_3D", "engtype_VideoDecode"…) across
        // processes; the busiest type is the GPU's usage, as in Task Manager.
        let mut by_type: HashMap<String, f64> = HashMap::new();
        for (name, v) in read_array(self.engine) {
            let lower = name.to_lowercase();
            if !lower.contains(luid) {
                continue;
            }
            let kind = lower.rsplit("engtype_").next().unwrap_or("").to_string();
            *by_type.entry(kind).or_default() += v;
        }
        let usage = if by_type.is_empty() {
            None
        } else {
            Some(by_type.values().cloned().fold(0.0, f64::max).min(100.0) as f32)
        };
        let vram = read_array(self.memory)
            .into_iter()
            .filter(|(n, _)| n.to_lowercase().contains(luid))
            .map(|(_, v)| v as u64)
            .max();
        (usage, vram)
    }
}

/// Every instance of a wildcard counter as (instance name, value).
#[cfg(target_os = "windows")]
fn read_array(counter: windows_sys::Win32::System::Performance::PDH_HCOUNTER) -> Vec<(String, f64)> {
    use windows_sys::Win32::System::Performance::{PdhGetFormattedCounterArrayW, PDH_FMT_COUNTERVALUE_ITEM_W, PDH_FMT_DOUBLE, PDH_MORE_DATA};
    unsafe {
        let mut size = 0u32;
        let mut count = 0u32;
        let r = PdhGetFormattedCounterArrayW(counter, PDH_FMT_DOUBLE, &mut size, &mut count, core::ptr::null_mut());
        if r != PDH_MORE_DATA || size == 0 {
            return Vec::new();
        }
        // u64 backing keeps the item structs aligned.
        let mut buf = vec![0u64; (size as usize).div_ceil(8)];
        let items = buf.as_mut_ptr() as *mut PDH_FMT_COUNTERVALUE_ITEM_W;
        if PdhGetFormattedCounterArrayW(counter, PDH_FMT_DOUBLE, &mut size, &mut count, items) != 0 {
            return Vec::new();
        }
        (0..count as usize)
            .filter_map(|i| {
                let it = &*items.add(i);
                if it.FmtValue.CStatus != 0 || it.szName.is_null() {
                    return None;
                }
                let mut len = 0;
                while *it.szName.add(len) != 0 {
                    len += 1;
                }
                let name = String::from_utf16_lossy(std::slice::from_raw_parts(it.szName, len));
                Some((name, it.FmtValue.Anonymous.doubleValue))
            })
            .collect()
    }
}

/// GPU temperature in °C from the driver's adapter performance data, if it
/// reports one.
#[cfg(target_os = "windows")]
fn temperature(high: i32, low: u32) -> Option<f32> {
    use windows_sys::Wdk::Graphics::Direct3D::{
        D3DKMTCloseAdapter, D3DKMTEnumAdapters2, D3DKMTQueryAdapterInfo, D3DKMT_ADAPTERINFO, D3DKMT_ADAPTER_PERFDATA, D3DKMT_CLOSEADAPTER,
        D3DKMT_ENUMADAPTERS2, D3DKMT_QUERYADAPTERINFO, KMTQAITYPE_ADAPTERPERFDATA,
    };
    unsafe {
        let mut e = D3DKMT_ENUMADAPTERS2::default();
        if D3DKMTEnumAdapters2(&mut e) < 0 || e.NumAdapters == 0 {
            return None;
        }
        let mut list: Vec<D3DKMT_ADAPTERINFO> = vec![core::mem::zeroed(); e.NumAdapters as usize];
        e.pAdapters = list.as_mut_ptr();
        if D3DKMTEnumAdapters2(&mut e) < 0 {
            return None;
        }
        let mut out = None;
        for a in &list[..e.NumAdapters as usize] {
            if a.AdapterLuid.HighPart == high && a.AdapterLuid.LowPart == low {
                let mut perf = D3DKMT_ADAPTER_PERFDATA { PhysicalAdapterIndex: 0, ..Default::default() };
                let mut q = D3DKMT_QUERYADAPTERINFO {
                    hAdapter: a.hAdapter,
                    Type: KMTQAITYPE_ADAPTERPERFDATA,
                    pPrivateDriverData: &mut perf as *mut _ as *mut core::ffi::c_void,
                    PrivateDriverDataSize: core::mem::size_of::<D3DKMT_ADAPTER_PERFDATA>() as u32,
                };
                // Reported in tenths of a degree; 0 means "not supported".
                if D3DKMTQueryAdapterInfo(&mut q) >= 0 && perf.Temperature > 0 {
                    out = Some(perf.Temperature as f32 / 10.0);
                }
            }
            D3DKMTCloseAdapter(&D3DKMT_CLOSEADAPTER { hAdapter: a.hAdapter });
        }
        out
    }
}
