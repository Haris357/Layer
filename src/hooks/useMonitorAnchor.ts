import { useEffect } from 'react'
import { useCanvasStore } from '../store/canvasStore'
import { useMonitorStore } from '../store/monitorStore'

// Widget positions are measured from the canvas's top-left, which is the
// top-left of ALL monitors together. Adding or removing a monitor to the left
// of / above the main one moves that corner, which used to slide the whole
// layout sideways (and default layouts landed across two screens).
//
// So we remember where the main monitor sits on the canvas, and whenever the
// monitor setup changes we shift every space by how far it moved. Widgets on a
// monitor that's been unplugged are laid out on the main one (keeping their
// arrangement) and return to their exact spot when it's plugged back in.

// How long a monitor setup must stay unchanged before widgets follow it.
// Longer than the slow monitor poll (5 s), so a change has to be seen twice.
const STABLE_MS = 6000

export function useMonitorAnchor(): void {
  const monitors = useMonitorStore((s) => s.monitors)
  const primary = useMonitorStore((s) => s.primary)
  const hydrated = useCanvasStore((s) => s.hydrated)

  // A stable key so we only act when the setup really changes.
  const key = primary
    ? `${Math.round(primary.x)},${Math.round(primary.y)}|${monitors.map((m) => `${Math.round(m.x)},${Math.round(m.y)},${Math.round(m.w)},${Math.round(m.h)}`).join(';')}`
    : ''

  useEffect(() => {
    // Mid-unplug, Windows can briefly report no monitors: wait for a real one.
    if (!hydrated || !primary || monitors.length === 0) return
    // Explorer refreshing, a game going fullscreen, a monitor waking up: all
    // can make Windows report a wrong setup for a moment. Only act once the
    // setup has held still for a few seconds, so a glitch never moves a
    // single widget.
    const id = window.setTimeout(() => {
      const s = useMonitorStore.getState()
      const p = s.primary
      if (!p || s.monitors.length === 0) return
      const cx = p.x + p.w / 2
      const cy = p.y + p.h / 2
      const home = s.work.find((m) => cx >= m.x && cx < m.x + m.w && cy >= m.y && cy < m.y + m.h) ?? p
      useCanvasStore.getState().reanchor({ x: p.x, y: p.y }, s.monitors, home)
    }, STABLE_MS)
    return () => window.clearTimeout(id)
    // `key` captures primary + monitors; the timer re-reads the latest
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, key])
}
