import { useEffect } from 'react'
import { useCanvasStore } from '../store/canvasStore'
import { getVirtualScreenSize, isTauri } from '../lib/ipc'

// A GPU driver hiccup, a game toggling exclusive fullscreen, a monitor
// briefly sleeping/waking, or (confirmed by user reports) refreshing the
// desktop/File Explorer can make Windows momentarily resize or reposition
// this window, or make WebView2 misreport its own viewport for a beat while
// Explorer recalculates the desktop's work area/icon layout — even though
// nothing in Layer asked for any of that. A transient `resize` DOM event
// used to reach clampViewport with window.innerWidth/innerHeight and
// permanently squash every widget onto whatever tiny rect was reported
// mid-glitch (reported by users as widgets suddenly all piling up on
// monitor 1) — a debounce alone wasn't enough for the Explorer-refresh case,
// because the misreport itself could outlast it. So this now clamps against
// get_virtual_screen_size(), a direct GetSystemMetrics query in Rust that
// isn't subject to whatever WebView2 does internally during that
// recalculation, instead of trusting the webview's own measurement. The
// debounce is kept too, mainly to avoid re-querying on every event in a
// resize burst and to let a genuine monitor topology change settle before
// asking. The initial call on mount is NOT debounced so startup still
// clamps immediately.
const DEBOUNCE_MS = 1500

export function useResponsive(): void {
  const hydrated = useCanvasStore((s) => s.hydrated)
  const clampViewport = useCanvasStore((s) => s.clampViewport)

  useEffect(() => {
    if (!hydrated) return
    let timeout: number | undefined
    let cancelled = false

    async function measureAndClamp() {
      if (isTauri()) {
        try {
          const [w, h] = await getVirtualScreenSize()
          if (!cancelled && w > 0 && h > 0) {
            clampViewport(w, h)
            return
          }
        } catch {
          /* fall through to the DOM measurement below */
        }
      }
      if (!cancelled) clampViewport(window.innerWidth, window.innerHeight)
    }

    void measureAndClamp()
    const apply = () => {
      window.clearTimeout(timeout)
      timeout = window.setTimeout(() => void measureAndClamp(), DEBOUNCE_MS)
    }
    window.addEventListener('resize', apply)
    return () => {
      cancelled = true
      window.removeEventListener('resize', apply)
      window.clearTimeout(timeout)
    }
  }, [hydrated, clampViewport])
}
