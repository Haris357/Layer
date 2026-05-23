import { useEffect } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { setScreensaverEnabled } from '../lib/ipc'

// Keeps the OS in sync with the screensaver setting: registers Layer as the
// active Windows screensaver when on (default), and steps aside when off.
// Runs on startup and whenever the toggle changes.
export function useScreensaver() {
  const enabled = useSettingsStore((s) => s.screensaverEnabled)
  useEffect(() => {
    setScreensaverEnabled(enabled).catch(() => {})
  }, [enabled])
}
