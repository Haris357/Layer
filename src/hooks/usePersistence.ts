import { useEffect } from 'react'
import { useCanvasStore } from '../store/canvasStore'
import { useJournalStore } from '../store/journalStore'
import { useSettingsStore } from '../store/settingsStore'
import { useSyncStore } from '../store/syncStore'
import {
  isTauri,
  loadJournal,
  loadSpaces,
  saveJournal,
  saveSpaces,
} from '../lib/ipc'
import { buildBuiltins } from '../lib/builtins'
import type { JournalFile, Space, SpacesFile } from '../types/widget'

function ensureBuiltins(loaded: Space[]): Space[] {
  const result = [...loaded]
  for (const b of buildBuiltins()) {
    if (!result.some((t) => t.id === b.id)) {
      result.unshift(b)
    }
  }
  return result
}

export function usePersistence(): void {
  const widgets = useCanvasStore((s) => s.widgets)
  const spaces = useCanvasStore((s) => s.spaces)
  const activeId = useCanvasStore((s) => s.activeId)
  const hydrated = useCanvasStore((s) => s.hydrated)
  const hydrateSpaces = useCanvasStore((s) => s.hydrateSpaces)

  const entries = useJournalStore((s) => s.entries)
  const journalHydrated = useJournalStore((s) => s.hydrated)
  const hydrateJournal = useJournalStore((s) => s.hydrate)

  useEffect(() => {
    const seed = () => {
      const builtins = buildBuiltins()
      const first = builtins[0]
      hydrateSpaces(builtins, first ? first.id : '')
    }

    if (!isTauri()) {
      seed()
      hydrateJournal([])
      return
    }

    loadSpaces()
      .then((raw) => {
        if (!raw) {
          seed()
          return
        }
        try {
          const parsed = JSON.parse(raw) as SpacesFile
          if (
            Array.isArray(parsed.templates) &&
            parsed.templates.length > 0
          ) {
            const merged = ensureBuiltins(parsed.templates)
            hydrateSpaces(merged, parsed.activeId)
          } else {
            seed()
          }
        } catch {
          seed()
        }
      })
      .catch(seed)

    loadJournal()
      .then((raw) => {
        if (!raw) {
          hydrateJournal([])
          return
        }
        try {
          const parsed = JSON.parse(raw) as JournalFile
          hydrateJournal(Array.isArray(parsed.entries) ? parsed.entries : [])
        } catch {
          hydrateJournal([])
        }
      })
      .catch(() => hydrateJournal([]))
  }, [hydrateSpaces, hydrateJournal])

  useEffect(() => {
    if (!hydrated || !isTauri()) return
    const timer = setTimeout(() => {
      const synced = spaces.map((t) =>
        t.id === activeId ? { ...t, widgets } : t,
      )
      const file: SpacesFile = {
        version: 1,
        // 'templates' is the legacy on-disk key — kept so existing saves load.
        templates: synced,
        activeId,
        savedAt: new Date().toISOString(),
      }
      saveSpaces(JSON.stringify(file, null, 2)).catch(() => {})
    }, 500)
    return () => clearTimeout(timer)
  }, [widgets, spaces, activeId, hydrated])

  // Auto cloud-sync: when signed in with sync + auto-sync on, push changes on a
  // longer debounce than the local save (Firestore free-tier write quota).
  useEffect(() => {
    if (!hydrated || !isTauri()) return
    const { signedIn } = useSyncStore.getState()
    const { cloudSyncEnabled, autoSync } = useSettingsStore.getState()
    if (!signedIn || !cloudSyncEnabled || !autoSync) return
    const timer = setTimeout(() => {
      void useSyncStore.getState().syncNow()
    }, 4000)
    return () => clearTimeout(timer)
  }, [widgets, spaces, activeId, hydrated])

  useEffect(() => {
    if (!journalHydrated || !isTauri()) return
    const timer = setTimeout(() => {
      const file: JournalFile = {
        version: 1,
        entries,
        savedAt: new Date().toISOString(),
      }
      saveJournal(JSON.stringify(file, null, 2)).catch(() => {})
    }, 500)
    return () => clearTimeout(timer)
  }, [entries, journalHydrated])
}
