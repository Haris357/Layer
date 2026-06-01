import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ShelfKind = 'image' | 'video' | 'audio' | 'file'

export interface ShelfItem {
  id: string
  name: string
  path: string // stored copy in the hidden shelf folder
  size: number
  kind: ShelfKind
  addedAt: string
}

interface ShelfState {
  items: ShelfItem[]
  add: (item: Omit<ShelfItem, 'id' | 'addedAt'>) => void
  remove: (id: string) => string | undefined // returns the stored path to delete
  clear: () => ShelfItem[] // returns removed items so caller can delete files
}

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

export const useShelfStore = create<ShelfState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) =>
        set((s) => ({
          items: [
            { ...item, id: uid(), addedAt: new Date().toISOString() },
            ...s.items,
          ],
        })),
      remove: (id) => {
        const found = get().items.find((i) => i.id === id)
        set((s) => ({ items: s.items.filter((i) => i.id !== id) }))
        return found?.path
      },
      clear: () => {
        const removed = get().items
        set({ items: [] })
        return removed
      },
    }),
    { name: 'layer-shelf' },
  ),
)
