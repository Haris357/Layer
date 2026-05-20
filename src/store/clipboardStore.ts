import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ClipItem {
  id: string
  text: string
  createdAt: string
  pinned?: boolean
}

interface State {
  items: ClipItem[]
  push: (text: string) => void
  togglePin: (id: string) => void
  remove: (id: string) => void
  clearUnpinned: () => void
}

const uid = () =>
  Math.random().toString(36).slice(2) + Date.now().toString(36)

const MAX_UNPINNED = 30
const MAX_TEXT = 8000

export const useClipboardStore = create<State>()(
  persist(
    (set) => ({
      items: [],
      push: (raw) => {
        const text = raw.slice(0, MAX_TEXT)
        if (!text.trim()) return
        set((s) => {
          // Skip if it's the same as the most recent (clipboard often re-reads).
          if (s.items[0]?.text === text) return s
          // De-dupe — bring an existing copy to the front instead of duplicating.
          const idx = s.items.findIndex((i) => i.text === text)
          if (idx >= 0) {
            const hit = s.items[idx]
            if (!hit) return s
            const rest = s.items.filter((_, i) => i !== idx)
            return {
              items: [
                { ...hit, createdAt: new Date().toISOString() },
                ...rest,
              ],
            }
          }
          // Fresh insert.
          const item: ClipItem = {
            id: uid(),
            text,
            createdAt: new Date().toISOString(),
          }
          let unpinned = 0
          const next = [item, ...s.items].filter((it) => {
            if (it.pinned) return true
            unpinned += 1
            return unpinned <= MAX_UNPINNED
          })
          return { items: next }
        })
      },
      togglePin: (id) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.id === id ? { ...i, pinned: !i.pinned } : i,
          ),
        })),
      remove: (id) =>
        set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      clearUnpinned: () =>
        set((s) => ({ items: s.items.filter((i) => i.pinned) })),
    }),
    { name: 'layer-clipboard' },
  ),
)
