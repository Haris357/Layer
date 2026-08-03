import { useEffect } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { setShortcuts } from '../lib/ipc'

// Push the current global-shortcut config to the Rust side on mount and whenever
// it changes. The main edit-mode toggle (`hotkey`) is always registered; the
// three secondary shortcuts are registered only when enabled — so a disabled
// one frees its key combo for other apps.
export function useShortcuts() {
  const hotkey = useSettingsStore((s) => s.hotkey)
  const secondary = useSettingsStore((s) => s.secondaryShortcuts)

  useEffect(() => {
    setShortcuts([
      { action: 'toggle', accelerator: hotkey, enabled: true },
      {
        action: 'capture',
        accelerator: secondary.capture.accelerator,
        enabled: secondary.capture.enabled,
      },
      {
        action: 'screensaver',
        accelerator: secondary.screensaver.accelerator,
        enabled: secondary.screensaver.enabled,
      },
      {
        action: 'cycle',
        accelerator: secondary.cycle.accelerator,
        enabled: secondary.cycle.enabled,
      },
    ]).catch(() => {})
  }, [hotkey, secondary])
}
