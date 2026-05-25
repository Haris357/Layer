import { create } from 'zustand'

export type ToastIcon =
  | 'update'
  | 'success'
  | 'info'
  | 'undo'
  | 'reminder'
  | 'error'
  | 'focus'
  | 'lock'

export interface ToastAction {
  label: string
  onClick: () => void
  primary?: boolean
  // When false, the toast stays open after the action runs (e.g. "Snooze"
  // which re-arms itself). Defaults to true — most actions dismiss.
  dismiss?: boolean
}

export interface ToastSpec {
  message: string
  icon?: ToastIcon
  actions?: ToastAction[]
  // Auto-dismiss after this many ms. 0 = sticky (stays until dismissed or
  // replaced). Defaults to 3400.
  duration?: number
  // 0-100 → shows a determinate progress bar instead of the countdown bar
  // (used for live download progress).
  progress?: number
  // Small right-aligned live status (e.g. "45% · 2.3/8.1 MB") shown while a
  // progress toast is running. Kept separate from `message` so the main label
  // stays stable and doesn't jitter as numbers tick.
  detail?: string
}

export interface ActiveToast extends ToastSpec {
  id: number
}

interface ToastState {
  toasts: ActiveToast[]
  show: (message: string) => number
  showToast: (spec: ToastSpec) => number
  update: (id: number, patch: Partial<ToastSpec>) => void
  dismiss: (id: number) => void
  clear: () => void
}

const MAX_VISIBLE = 3
let nextId = 1

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  // Simple text toast (back-compat with every existing caller).
  show: (message) => get().showToast({ message }),

  showToast: (spec) => {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts, { ...spec, id }].slice(-MAX_VISIBLE) }))
    return id
  },

  // Patch a live toast in place (e.g. download progress) without resetting it.
  update: (id, patch) =>
    set((s) => ({
      toasts: s.toasts.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),

  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  clear: () => set({ toasts: [] }),
}))
