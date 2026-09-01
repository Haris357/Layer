import { useEffect, useRef } from 'react'
import { useMonitorStore, type MonitorRect } from '../store/monitorStore'
import { useCanvasStore } from '../store/canvasStore'
import { useSettingsStore } from '../store/settingsStore'
import { isTauri } from '../lib/ipc'

// A signature identifying "this exact monitor setup" — sorted resolutions, so
// it's stable regardless of which monitor Windows currently calls primary.
// Position isn't part of it: swapping two identical-resolution monitors'
// physical order shouldn't count as a different setup.
function signatureOf(monitors: MonitorRect[]): string {
  if (monitors.length === 0) return ''
  return monitors
    .map((m) => `${Math.round(m.w)}x${Math.round(m.h)}`)
    .sort()
    .join('|')
}

// "Detect and keep my setting according to my setup": remembers which Space
// was last active for a given monitor signature (office multi-monitor vs.
// laptop-only, say), and switches back to it automatically. Fully passive —
// there's no separate "save profile" step, it just learns from normal use.
export function useMonitorProfiles(): void {
  const monitors = useMonitorStore((s) => s.monitors)
  const monitorSpaceMap = useSettingsStore((s) => s.monitorSpaceMap)
  const setMonitorSpace = useSettingsStore((s) => s.setMonitorSpace)
  const activeId = useCanvasStore((s) => s.activeId)
  const hydrated = useCanvasStore((s) => s.hydrated)
  // Only reacts to signature CHANGES, not every render — otherwise switching
  // spaces manually while on a known setup would fight the user right back.
  const lastSig = useRef<string | null>(null)

  useEffect(() => {
    if (!isTauri() || !hydrated) return
    const sig = signatureOf(monitors)
    if (!sig || sig === lastSig.current) return
    lastSig.current = sig

    const target = monitorSpaceMap[sig]
    const { spaces, activeId: current, switchSpace } = useCanvasStore.getState()
    if (target && target !== current && spaces.some((s) => s.id === target)) {
      switchSpace(target)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitors, monitorSpaceMap, hydrated])

  // Remember the space in use for the current setup. Writing the same value
  // back (e.g. right after the auto-switch above) is a harmless no-op — the
  // equality check below skips it.
  useEffect(() => {
    if (!isTauri() || !hydrated || !activeId) return
    const sig = signatureOf(monitors)
    if (sig && monitorSpaceMap[sig] !== activeId) {
      setMonitorSpace(sig, activeId)
    }
  }, [activeId, hydrated, monitors, monitorSpaceMap, setMonitorSpace])
}
