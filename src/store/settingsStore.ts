import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type ThemePref = 'light' | 'dark' | 'system'
export type ScreensaverTheme = 'ambient' | 'minimal' | 'quote'

// The remappable/disable-able secondary global shortcuts. The main edit-mode
// toggle stays in `hotkey`. Each of these can be rebound or turned off so it
// doesn't clash with other apps (e.g. Ctrl+Shift+S vs "Save As").
export type SecondaryShortcut = 'capture' | 'screensaver' | 'cycle' | 'hideAll'
export interface ShortcutSetting {
  accelerator: string
  enabled: boolean
}

interface SettingsState {
  gridSize: number
  snapEnabled: boolean
  hotkey: string
  clockFormat24h: boolean
  // First day of the week in the Calendar widget: 0 = Sunday, 1 = Monday.
  weekStart: 0 | 1
  secondaryShortcuts: Record<SecondaryShortcut, ShortcutSetting>
  // Remembers which Space was last active for a given monitor setup (keyed by
  // a signature of connected monitor resolutions — see useMonitorProfiles).
  // Written passively as you use the app; read on launch/monitor-change to
  // auto-switch back to it, e.g. office multi-monitor vs. laptop-only.
  monitorSpaceMap: Record<string, string>
  // UI language code (e.g. 'en', 'es'). i18n reads this from the persisted blob
  // on boot; the Settings picker drives changes via lib/i18n's changeLanguage.
  language: string
  theme: ThemePref
  autostartInit: boolean
  screensaverEnabled: boolean
  screensaverTheme: ScreensaverTheme
  wallpaperAccent: boolean
  hotCorner: boolean
  // Which monitor the pill + modals anchor to. -1 = auto (primary monitor).
  uiMonitor: number
  onboarded: boolean
  // Layer Notch (separate top-center window).
  notchEnabled: boolean
  notchMonitor: number
  setGridSize: (size: number) => void
  setSnapEnabled: (enabled: boolean) => void
  setHotkey: (hotkey: string) => void
  setClockFormat24h: (value: boolean) => void
  setWeekStart: (value: 0 | 1) => void
  setSecondaryShortcut: (
    action: SecondaryShortcut,
    patch: Partial<ShortcutSetting>,
  ) => void
  setMonitorSpace: (signature: string, spaceId: string) => void
  setLanguage: (value: string) => void
  setTheme: (theme: ThemePref) => void
  setAutostartInit: (value: boolean) => void
  setScreensaverEnabled: (value: boolean) => void
  setScreensaverTheme: (value: ScreensaverTheme) => void
  setWallpaperAccent: (value: boolean) => void
  setHotCorner: (value: boolean) => void
  setUiMonitor: (value: number) => void
  setOnboarded: (value: boolean) => void
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
      weekStart: 0,
      secondaryShortcuts: {
        capture: { accelerator: 'Ctrl+Shift+N', enabled: true },
        screensaver: { accelerator: 'Ctrl+Shift+S', enabled: true },
        cycle: { accelerator: 'Ctrl+Shift+E', enabled: true },
        hideAll: { accelerator: 'Ctrl+Shift+H', enabled: true },
      },
      monitorSpaceMap: {},
      language: 'en',
      theme: 'system',
      autostartInit: false,
      screensaverEnabled: true,
      screensaverTheme: 'ambient',
      wallpaperAccent: false,
      hotCorner: false,
      uiMonitor: -1,
      onboarded: false,
      notchEnabled: false,
      notchMonitor: -1,
      setGridSize: (gridSize) => set({ gridSize }),
      setSnapEnabled: (snapEnabled) => set({ snapEnabled }),
      setHotkey: (hotkey) => set({ hotkey }),
      setClockFormat24h: (clockFormat24h) => set({ clockFormat24h }),
      setWeekStart: (weekStart) => set({ weekStart }),
      setSecondaryShortcut: (action, patch) =>
        set((s) => ({
          secondaryShortcuts: {
            ...s.secondaryShortcuts,
            [action]: { ...s.secondaryShortcuts[action], ...patch },
          },
        })),
      setMonitorSpace: (signature, spaceId) =>
        set((s) => ({
          monitorSpaceMap: { ...s.monitorSpaceMap, [signature]: spaceId },
        })),
      setLanguage: (language) => set({ language }),
      setTheme: (theme) => set({ theme }),
      setAutostartInit: (autostartInit) => set({ autostartInit }),
      setScreensaverEnabled: (screensaverEnabled) =>
        set({ screensaverEnabled }),
      setScreensaverTheme: (screensaverTheme) => set({ screensaverTheme }),
      setWallpaperAccent: (wallpaperAccent) => set({ wallpaperAccent }),
      setHotCorner: (hotCorner) => set({ hotCorner }),
      setUiMonitor: (uiMonitor) => set({ uiMonitor }),
      setOnboarded: (onboarded) => set({ onboarded }),
      setNotchEnabled: (notchEnabled) => set({ notchEnabled }),
      setNotchMonitor: (notchMonitor) => set({ notchMonitor }),
    }),
    {
      name: 'layer-settings',
      // zustand's default merge is shallow, so a saved `secondaryShortcuts`
      // blob from before a new shortcut existed (e.g. hideAll) would wholesale
      // replace the defaults object and drop the new key — undefined, and the
      // Settings → Shortcuts tab crashes reading `.enabled` off it. Deep-merge
      // just that one nested object so old installs pick up new shortcuts with
      // their defaults while keeping every rebind/disable the user already made.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>
        return {
          ...current,
          ...p,
          secondaryShortcuts: {
            ...current.secondaryShortcuts,
            ...(p.secondaryShortcuts ?? {}),
          },
        }
      },
    },
  ),
)
