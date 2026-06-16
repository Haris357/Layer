import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'

export type EventColor =
  | 'blue'
  | 'green'
  | 'amber'
  | 'rose'
  | 'violet'
  | 'gray'

export interface CalendarEvent {
  id: string
  title: string
  start: string // ISO datetime
  end?: string // ISO datetime, optional
  allDay: boolean
  color: EventColor
  note?: string
  recurrence: Recurrence
  until?: string // ISO date (YYYY-MM-DD), optional
  // Set when the event came from an external calendar subscription. Such events
  // are read-only and live only in memory (never persisted/synced).
  sourceId?: string
  readOnly?: boolean
}

interface State {
  events: CalendarEvent[]
  // External (subscription) events, grouped logically by sourceId. NOT persisted.
  externalEvents: CalendarEvent[]
  add: (e: Omit<CalendarEvent, 'id'>) => string
  update: (id: string, patch: Partial<CalendarEvent>) => void
  remove: (id: string) => void
  // Replace all external events for one source (called after each refresh).
  setExternalEventsForSource: (sourceId: string, events: CalendarEvent[]) => void
}

const uid = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36))

export const useEventsStore = create<State>()(
  persist(
    (set) => ({
      events: [],
      externalEvents: [],
      add: (e) => {
        const id = uid()
        set((s) => ({ events: [...s.events, { ...e, id }] }))
        return id
      },
      update: (id, patch) =>
        set((s) => ({
          events: s.events.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })),
      remove: (id) =>
        set((s) => ({ events: s.events.filter((e) => e.id !== id) })),
      setExternalEventsForSource: (sourceId, evs) =>
        set((s) => ({
          externalEvents: [
            ...s.externalEvents.filter((e) => e.sourceId !== sourceId),
            ...evs,
          ],
        })),
    }),
    {
      name: 'layer-events',
      // Only the user's own events are persisted; subscription events are
      // in-memory and refetched, so they never bloat storage or sync.
      partialize: (s) => ({ events: s.events }),
    },
  ),
)
