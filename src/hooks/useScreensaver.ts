import { useEffect } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { setScreensaverEnabled, setScreensaverTheme } from '../lib/ipc'
import { IS_STORE } from '../lib/dist'

// Keeps the OS in sync with the screensaver setting: registers Layer as the
// active Windows screensaver when turned on (off by default), and steps aside
// when off. Also persists the chosen theme so the screensaver process reads it.
export function useScreensaver() {
  const enabled = useSettingsStore((s) => s.screensaverEnabled)
  const theme = useSettingsStore((s) => s.screensaverTheme)
  useEffect(() => {
    // The Store build never registers one: Store users can't see the switch,
    // and a Store uninstall can't clean it up. Stepping aside here also undoes
    // a registration made by earlier Store versions.
    setScreensaverEnabled(IS_STORE ? false : enabled).catch(() => {})
  }, [enabled])
  useEffect(() => {
    setScreensaverTheme(theme).catch(() => {})
  }, [theme])
}
