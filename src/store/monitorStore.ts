import { create } from 'zustand'
import {
  availableMonitors,
  primaryMonitor,
  getCurrentWindow,
} from '@tauri-apps/api/window'
import { isTauri } from '../lib/ipc'

// A monitor's rectangle in the canvas's CSS pixel space (i.e. relative to the
// Layer window's top-left, which spans the whole virtual desktop).
export interface MonitorRect {
  x: number
  y: number
  w: number
  h: number
}

interface MonitorState {
  monitors: MonitorRect[]
  // Work areas (monitor minus taskbar) — used to keep popovers/menus from
  // opening behind the taskbar or off the edge of a screen.
  work: MonitorRect[]
  // The primary monitor — where the pill and modals live so they always land
  // on a real screen, never in the empty gap between mismatched monitors.
  primary: MonitorRect | null
  refresh: () => Promise<void>
}

export const useMonitorStore = create<MonitorState>((set) => ({
  monitors: [],
  work: [],
  primary: null,
  refresh: async () => {
    if (!isTauri()) return
    try {
      const [mons, prim, origin] = await Promise.all([
        availableMonitors(),
        primaryMonitor(),
        getCurrentWindow().outerPosition(),
      ])
      // The window covers the virtual desktop; its origin is that desktop's
      // top-left in physical pixels. Monitor positions/sizes are physical too,
      // so subtract the origin and divide by the window's scale to get CSS px.
      const dpr = window.devicePixelRatio || 1
      const toRect = (m: {
        position: { x: number; y: number }
        size: { width: number; height: number }
      }): MonitorRect => ({
        x: (m.position.x - origin.x) / dpr,
        y: (m.position.y - origin.y) / dpr,
        w: m.size.width / dpr,
        h: m.size.height / dpr,
      })
      const monitors = mons.map(toRect)
      const work = mons.map((m) =>
        toRect({ position: m.workArea.position, size: m.workArea.size }),
      )
      const primary = prim ? toRect(prim) : (monitors[0] ?? null)
      set({ monitors, work, primary })
    } catch {
      /* monitors unavailable — leave defaults, callers fall back to viewport */
    }
  },
}))
