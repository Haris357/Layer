import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { EventColor } from './eventsStore'

// A subscribed external calendar. For now all sources are iCal/.ics URLs
// (covers Google "secret address in iCal format", Proton/Outlook share links).
export interface CalendarSource {
  id: string
  label: string
  url: string
  color: EventColor
  enabled: boolean
  lastFetched?: string // ISO
  lastError?: string | null
}

interface State {
  sources: CalendarSource[]
  addSource: (s: Omit<CalendarSource, 'id'>) => void
  updateSource: (id: string, patch: Partial<CalendarSource>) => void
  removeSource: (id: string) => void
}

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

export const useCalendarSourcesStore = create<State>()(
  persist(
    (set) => ({
      sources: [],
      addSource: (s) =>
        set((st) => ({ sources: [...st.sources, { ...s, id: uid() }] })),
      updateSource: (id, patch) =>
        set((st) => ({
          sources: st.sources.map((s) => (s.id === id ? { ...s, ...patch } : s)),
        })),
      removeSource: (id) =>
        set((st) => ({ sources: st.sources.filter((s) => s.id !== id) })),
    }),
    { name: 'layer-calendar-sources' },
  ),
)
