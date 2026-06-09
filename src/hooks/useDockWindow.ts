import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useSettingsStore } from '../store/settingsStore'
import { useCanvasStore } from '../store/canvasStore'
import {
  isTauri,
  createNotchWindow,
  closeNotchWindow,
  repositionNotch,
} from '../lib/ipc'

// Runs in the MAIN window. Owns the floating Layer Dock window's lifecycle (the
// persisted `notchEnabled` setting is the single source of truth) and listens
// for the Dock's request to enter widget edit mode.
//
// The Dock is a SEPARATE always-on-top window so it can float over other apps.
// This is only safe now that the main window's z-order pin loop no longer
// re-stacks itself 125×/sec (see window.rs) — that churn is what froze the app.
export function useDockWindow(): void {
  const enabled = useSettingsStore((s) => s.notchEnabled)
  const monitor = useSettingsStore((s) => s.notchMonitor)

  useEffect(() => {
    if (!isTauri()) return
    if (enabled) createNotchWindow(monitor).catch(() => {})
    else closeNotchWindow().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  useEffect(() => {
    if (!isTauri() || !enabled) return
    repositionNotch(monitor).catch(() => {})
  }, [monitor, enabled])

  // The Dock's edit button asks the desktop to enter widget edit mode.
  useEffect(() => {
    if (!isTauri()) return
    const un = listen('enter-edit', () => {
      useCanvasStore.getState().setMode('edit')
    })
    return () => {
      un.then((f) => f()).catch(() => {})
    }
  }, [])
}
