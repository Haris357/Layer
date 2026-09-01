import { create } from 'zustand'

// Whether the desktop UI (canvas, widgets, top bar) is currently shown.
// Deliberately NOT persisted — always starts visible on launch, so nobody
// can end up with an invisible app after a restart with no way to see the
// toggle shortcut's hint again.
interface VisibilityState {
  visible: boolean
  toggle: () => void
  setVisible: (v: boolean) => void
}

export const useVisibilityStore = create<VisibilityState>((set) => ({
  visible: true,
  toggle: () => set((s) => ({ visible: !s.visible })),
  setVisible: (v) => set({ visible: v }),
}))
