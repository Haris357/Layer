import { create } from 'zustand'

// Wall-clock anchored timer (no drift). Shared by the Timer module and the
// collapsed live-activity.
interface TimerState {
  running: boolean
  endAt: number | null // ms epoch when it finishes (while running)
  remainingMs: number // frozen remaining (while paused / idle)
  durationMs: number // last chosen duration, for progress + reset
  start: (ms: number) => void
  pause: () => void
  resume: () => void
  reset: () => void
}

export const useTimerStore = create<TimerState>((set, get) => ({
  running: false,
  endAt: null,
  remainingMs: 0,
  durationMs: 0,
  start: (ms) =>
    set({ running: true, endAt: Date.now() + ms, remainingMs: ms, durationMs: ms }),
  pause: () => {
    const { endAt } = get()
    if (endAt == null) return
    set({ running: false, remainingMs: Math.max(0, endAt - Date.now()), endAt: null })
  },
  resume: () => {
    const { remainingMs } = get()
    if (remainingMs <= 0) return
    set({ running: true, endAt: Date.now() + remainingMs })
  },
  reset: () => set({ running: false, endAt: null, remainingMs: 0, durationMs: 0 }),
}))

// Current remaining ms, computed from wall clock.
export function timerRemaining(s: {
  running: boolean
  endAt: number | null
  remainingMs: number
}): number {
  if (s.running && s.endAt != null) return Math.max(0, s.endAt - Date.now())
  return s.remainingMs
}
