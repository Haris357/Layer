import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type NotificationKind =
  | 'update'
  | 'publish'
  | 'upvote'
  | 'milestone'
  | 'battery'
  | 'timer'
  | 'calendar'
  | 'import'
  | 'info'

export interface AppNotification {
  id: string
  kind: NotificationKind
  title: string
  body?: string
  createdAt: string // ISO
  read: boolean
  href?: string
  templateId?: string
  // De-dupe key so the same one-time event doesn't fire repeatedly.
  dedupe?: string
}

interface NotificationState {
  items: AppNotification[]
  add: (
    n: Omit<AppNotification, 'id' | 'createdAt' | 'read'>,
  ) => void
  markRead: (id: string) => void
  markAllRead: () => void
  remove: (id: string) => void
  clearAll: () => void
}

const uid = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36))

const MAX_ITEMS = 200

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (n) => {
        if (n.dedupe) {
          const exists = get().items.some((i) => i.dedupe === n.dedupe)
          if (exists) return
        }
        set((s) => ({
          items: [
            {
              ...n,
              id: uid(),
              createdAt: new Date().toISOString(),
              read: false,
            },
            ...s.items,
          ].slice(0, MAX_ITEMS),
        }))
      },
      markRead: (id) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.id === id ? { ...i, read: true } : i,
          ),
        })),
      markAllRead: () =>
        set((s) => ({
          items: s.items.map((i) => ({ ...i, read: true })),
        })),
      remove: (id) =>
        set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      clearAll: () => set({ items: [] }),
    }),
    { name: 'layer-notifications' },
  ),
)

export const unreadCountOf = (items: AppNotification[]) =>
  items.reduce((n, i) => n + (i.read ? 0 : 1), 0)
