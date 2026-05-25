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
  ambientEffects: boolean
  hotCorner: boolean
  onboarded: boolean
  setGridSize: (size: number) => void
  setSnapEnabled: (enabled: boolean) => void
  setHotkey: (hotkey: string) => void
  setClockFormat24h: (value: boolean) => void
  setTheme: (theme: ThemePref) => void
  setAutostartInit: (value: boolean) => void
  setScreensaverEnabled: (value: boolean) => void
  setScreensaverTheme: (value: ScreensaverTheme) => void
  setWallpaperAccent: (value: boolean) => void
  setAmbientEffects: (value: boolean) => void
  setHotCorner: (value: boolean) => void
  setOnboarded: (value: boolean) => void
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
      ambientEffects: false,
      hotCorner: false,
      onboarded: false,
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
      setAmbientEffects: (ambientEffects) => set({ ambientEffects }),
      setHotCorner: (hotCorner) => set({ hotCorner }),
      setOnboarded: (onboarded) => set({ onboarded }),
    }),
    { name: 'layer-settings' },
  ),
)
