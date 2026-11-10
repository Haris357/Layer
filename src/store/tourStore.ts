import { create } from 'zustand'

// The guided tours and the "What's new" popup.
//  - welcome: opens once for new users (see App), replay from Settings → About.
//  - whatsnew: a short tour of only the latest update's new things, started
//    from the What's new popup or Settings → About.
export type TourKind = 'welcome' | 'whatsnew'

interface TourState {
  open: boolean
  kind: TourKind
  start: (kind?: TourKind) => void
  close: () => void
  // The "What's new" popup (release notes + video). Shown once after each
  // update, and on demand from Settings → About.
  whatsNewOpen: boolean
  openWhatsNew: () => void
  closeWhatsNew: () => void
}

export const useTourStore = create<TourState>((set) => ({
  open: false,
  kind: 'welcome',
  start: (kind = 'welcome') => set({ open: true, kind, whatsNewOpen: false }),
  close: () => set({ open: false }),
  whatsNewOpen: false,
  openWhatsNew: () => set({ whatsNewOpen: true }),
  closeWhatsNew: () => set({ whatsNewOpen: false }),
}))
