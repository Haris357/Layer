import { useEffect } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { setHotcorner } from '../lib/ipc'

// Keeps the Rust hot-corner watcher in sync with the setting.
export function useHotcorner(): void {
  const enabled = useSettingsStore((s) => s.hotCorner)
  useEffect(() => {
    setHotcorner(enabled).catch(() => {})
  }, [enabled])
}
