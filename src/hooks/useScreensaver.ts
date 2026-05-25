import { useEffect } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { setScreensaverEnabled, setScreensaverTheme } from '../lib/ipc'

// Keeps the OS in sync with the screensaver setting: registers Layer as the
// active Windows screensaver when on (default), and steps aside when off.
// Also persists the chosen theme so the (separate) screensaver process reads it.
export function useScreensaver() {
  const enabled = useSettingsStore((s) => s.screensaverEnabled)
  const theme = useSettingsStore((s) => s.screensaverTheme)
  useEffect(() => {
    setScreensaverEnabled(enabled).catch(() => {})
  }, [enabled])
  useEffect(() => {
    setScreensaverTheme(theme).catch(() => {})
  }, [theme])
}
