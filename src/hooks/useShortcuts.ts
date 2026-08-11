import { useEffect } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import type { SecondaryShortcut, ShortcutSetting } from '../store/settingsStore'
import { setShortcuts, type ShortcutDef } from '../lib/ipc'

// Build the full shortcut list from the current settings. Shared by the mount
// hook and the Settings rebind flow so they stay in sync.
export function buildShortcuts(
  hotkey: string,
  secondary: Record<SecondaryShortcut, ShortcutSetting>,
): ShortcutDef[] {
  return [
    { action: 'toggle', accelerator: hotkey, enabled: true },
    { action: 'capture', ...secondary.capture },
    { action: 'screensaver', ...secondary.screensaver },
    { action: 'cycle', ...secondary.cycle },
  ]
}

// Push the current global-shortcut config to the Rust side on mount and whenever
// it changes. The main edit-mode toggle (`hotkey`) is always registered; the
// three secondary shortcuts are registered only when enabled — so a disabled
// one frees its key combo for other apps.
export function useShortcuts() {
  const hotkey = useSettingsStore((s) => s.hotkey)
  const secondary = useSettingsStore((s) => s.secondaryShortcuts)

  useEffect(() => {
    setShortcuts(buildShortcuts(hotkey, secondary)).catch(() => {})
  }, [hotkey, secondary])
}
