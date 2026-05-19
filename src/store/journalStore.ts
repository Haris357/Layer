import { create } from 'zustand'
import type { JournalEntry } from '../types/widget'
import { uid } from '../lib/utils'

interface JournalState {
  entries: JournalEntry[]
  hydrated: boolean
  addEntry: () => string
  updateEntry: (id: string, content: string) => void
  deleteEntry: (id: string) => void
  renameEntry: (id: string, title: string) => void
  togglePin: (id: string) => void
  hydrate: (entries: JournalEntry[]) => void
}

export const useJournalStore = create<JournalState>((set) => ({
  entries: [],
  hydrated: false,

  addEntry: () => {
    const id = uid()
    const now = new Date().toISOString()
    set((state) => ({
      entries: [
        { id, content: '', createdAt: now, updatedAt: now },
        ...state.entries,
      ],
    }))
    return id
  },

  updateEntry: (id, content) => {
    set((state) => ({
      entries: state.entries.map((e) =>
        e.id === id
          ? { ...e, content, updatedAt: new Date().toISOString() }
          : e,
      ),
    }))
  },

  deleteEntry: (id) => {
    set((state) => ({
      entries: state.entries.filter((e) => e.id !== id),
    }))
  },

  renameEntry: (id, title) => {
    set((state) => ({
      entries: state.entries.map((e) =>
        e.id === id ? { ...e, title: title.trim() || undefined } : e,
      ),
    }))
  },

  togglePin: (id) => {
    set((state) => ({
      entries: state.entries.map((e) =>
        e.id === id ? { ...e, pinned: !e.pinned } : e,
      ),
    }))
  },

  hydrate: (entries) => set({ entries, hydrated: true }),
}))
