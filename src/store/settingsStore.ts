import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type ThemePref = 'light' | 'dark' | 'system'
export type ScreensaverTheme = 'ambient' | 'minimal' | 'quote'

interface SettingsState {
  gridSize: number
  snapEnabled: boolean
  hotkey: string
  clockFormat24h: boolean
  theme: ThemePref
  autostartInit: boolean
  screensaverEnabled: boolean
  screensaverTheme: ScreensaverTheme
  wallpaperAccent: boolean
  hotCorner: boolean
  // Which monitor the pill + modals anchor to. -1 = auto (primary monitor).
  uiMonitor: number
  onboarded: boolean
  // Cloud sync. `cloudSyncConsented` gates the whole feature behind explicit
  // permission; `cloudSyncEnabled` reflects a signed-in, syncing session.
  cloudSyncConsented: boolean
  cloudSyncEnabled: boolean
  autoSync: boolean
  syncEmail: string | null
  deviceId: string
  lastSyncedAt: string | null
  // Layer Notch (separate top-center window).
  notchEnabled: boolean
  notchMonitor: number
  setGridSize: (size: number) => void
  setSnapEnabled: (enabled: boolean) => void
  setHotkey: (hotkey: string) => void
  setClockFormat24h: (value: boolean) => void
  setTheme: (theme: ThemePref) => void
  setAutostartInit: (value: boolean) => void
  setScreensaverEnabled: (value: boolean) => void
  setScreensaverTheme: (value: ScreensaverTheme) => void
  setWallpaperAccent: (value: boolean) => void
  setHotCorner: (value: boolean) => void
  setUiMonitor: (value: number) => void
  setOnboarded: (value: boolean) => void
  setCloudSyncConsented: (value: boolean) => void
  setCloudSyncEnabled: (value: boolean) => void
  setAutoSync: (value: boolean) => void
  setSyncEmail: (value: string | null) => void
  setDeviceId: (value: string) => void
  setLastSyncedAt: (value: string | null) => void
  setNotchEnabled: (value: boolean) => void
  setNotchMonitor: (value: number) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      gridSize: 20,
      snapEnabled: true,
      hotkey: 'Ctrl+Shift+Space',
      clockFormat24h: false,
      theme: 'system',
      autostartInit: false,
      screensaverEnabled: true,
      screensaverTheme: 'ambient',
      wallpaperAccent: false,
      hotCorner: false,
      uiMonitor: -1,
      onboarded: false,
      cloudSyncConsented: false,
      cloudSyncEnabled: false,
      autoSync: true,
      syncEmail: null,
      deviceId: '',
      lastSyncedAt: null,
      notchEnabled: false,
      notchMonitor: -1,
      setGridSize: (gridSize) => set({ gridSize }),
      setSnapEnabled: (snapEnabled) => set({ snapEnabled }),
      setHotkey: (hotkey) => set({ hotkey }),
      setClockFormat24h: (clockFormat24h) => set({ clockFormat24h }),
      setTheme: (theme) => set({ theme }),
      setAutostartInit: (autostartInit) => set({ autostartInit }),
      setScreensaverEnabled: (screensaverEnabled) =>
        set({ screensaverEnabled }),
      setScreensaverTheme: (screensaverTheme) => set({ screensaverTheme }),
      setWallpaperAccent: (wallpaperAccent) => set({ wallpaperAccent }),
      setHotCorner: (hotCorner) => set({ hotCorner }),
      setUiMonitor: (uiMonitor) => set({ uiMonitor }),
      setOnboarded: (onboarded) => set({ onboarded }),
      setCloudSyncConsented: (cloudSyncConsented) =>
        set({ cloudSyncConsented }),
      setCloudSyncEnabled: (cloudSyncEnabled) => set({ cloudSyncEnabled }),
      setAutoSync: (autoSync) => set({ autoSync }),
      setSyncEmail: (syncEmail) => set({ syncEmail }),
      setDeviceId: (deviceId) => set({ deviceId }),
      setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
      setNotchEnabled: (notchEnabled) => set({ notchEnabled }),
      setNotchMonitor: (notchMonitor) => set({ notchMonitor }),
    }),
    { name: 'layer-settings' },
  ),
)
