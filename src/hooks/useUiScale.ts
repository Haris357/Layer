import { useEffect, useRef } from 'react'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { isTauri } from '../lib/ipc'
import { useCanvasStore } from '../store/canvasStore'
import { useSettingsStore } from '../store/settingsStore'

/**
 * Settings → Appearance → UI scale: zooms all of Layer (the webview), for big
 * screens or small ones (a 1080p monitor where everything felt too big).
 *
 * Zooming changes how many screen pixels one CSS pixel is, and widget
 * positions are CSS pixels — so on a change we first move every widget by the
 * same ratio (canvasStore.rescaleLayout), keeping each one at the same spot on
 * screen, then zoom. At startup the saved scale is applied as-is: the saved
 * positions already belong to it.
 */
export function useUiScale(): void {
  const scale = useSettingsStore((s) => s.uiScale)
  const hydrated = useCanvasStore((s) => s.hydrated)
  const applied = useRef<number | null>(null)

  useEffect(() => {
    if (!isTauri() || !hydrated) return
    const next = Math.min(1.25, Math.max(0.75, scale || 1))
    const prev = applied.current
    // Brief settle so dragging the slider doesn't re-lay-out on every step.
    const id = window.setTimeout(
      () => {
        if (prev !== null && Math.abs(prev - next) > 0.001) {
          useCanvasStore.getState().rescaleLayout(prev / next)
        }
        applied.current = next
        getCurrentWebview()
          .setZoom(next)
          .catch(() => {})
      },
      prev === null ? 0 : 180,
    )
    return () => window.clearTimeout(id)
  }, [scale, hydrated])
}
