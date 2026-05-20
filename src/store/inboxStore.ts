import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface InboxItem {
  id: string
  text: string
  done: boolean
  createdAt: string
}

interface State {
  items: InboxItem[]
  add: (text: string) => void
  toggle: (id: string) => void
  remove: (id: string) => void
  clearDone: () => void
}

const uid = () =>
  Math.random().toString(36).slice(2) + Date.now().toString(36)

export const useInboxStore = create<State>()(
  persist(
    (set) => ({
      items: [],
      add: (text) => {
        const t = text.trim()
        if (!t) return
        set((s) => ({
          items: [
            {
              id: uid(),
              text: t.slice(0, 2000),
              done: false,
              createdAt: new Date().toISOString(),
            },
            ...s.items,
          ].slice(0, 500),
        }))
      },
      toggle: (id) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.id === id ? { ...i, done: !i.done } : i,
          ),
        })),
      remove: (id) =>
        set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      clearDone: () =>
        set((s) => ({ items: s.items.filter((i) => !i.done) })),
    }),
    { name: 'layer-inbox' },
  ),
)
