import { useEffect } from 'react'
import { enable } from '@tauri-apps/plugin-autostart'
import { useSettingsStore } from '../store/settingsStore'
import { isTauri } from '../lib/ipc'

export function useStartup(): void {
  const autostartInit = useSettingsStore((s) => s.autostartInit)
  const setAutostartInit = useSettingsStore((s) => s.setAutostartInit)

  useEffect(() => {
    if (!isTauri() || autostartInit) return
    enable()
      .catch(() => {})
      .finally(() => setAutostartInit(true))
  }, [autostartInit, setAutostartInit])
}
