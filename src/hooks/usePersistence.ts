import { useEffect } from 'react'
import { useCanvasStore } from '../store/canvasStore'
import { useJournalStore } from '../store/journalStore'
import {
  isTauri,
  loadJournal,
  loadSpaces,
  saveJournal,
  saveSpaces,
} from '../lib/ipc'
import { buildBuiltins } from '../lib/builtins'
import type { JournalFile, Space, SpacesFile } from '../types/widget'

// Built-in layouts are designed for the main monitor at canvas (0,0); one
// that's missing from an older save is shifted to where the main monitor was.
function ensureBuiltins(loaded: Space[], anchor?: { x: number; y: number }): Space[] {
  const result = [...loaded]
  for (const b of buildBuiltins()) {
    if (!result.some((t) => t.id === b.id)) {
      const ox = anchor?.x ?? 0
      const oy = anchor?.y ?? 0
      result.unshift({ ...b, widgets: b.widgets.map((w) => ({ ...w, x: w.x + ox, y: w.y + oy })) })
    }
  }
  return result
}

export function usePersistence(): void {
  const widgets = useCanvasStore((s) => s.widgets)
  const spaces = useCanvasStore((s) => s.spaces)
  const activeId = useCanvasStore((s) => s.activeId)
  const hydrated = useCanvasStore((s) => s.hydrated)
  const anchor = useCanvasStore((s) => s.anchor)
  const screens = useCanvasStore((s) => s.screens)
  const hydrateSpaces = useCanvasStore((s) => s.hydrateSpaces)

  const entries = useJournalStore((s) => s.entries)
  const journalHydrated = useJournalStore((s) => s.hydrated)
  const hydrateJournal = useJournalStore((s) => s.hydrate)

  useEffect(() => {
    const seed = () => {
      const builtins = buildBuiltins()
      const first = builtins[0]
      // Built-ins are laid out for the main monitor at (0,0); once the real
      // monitors are known they're shifted onto it (useMonitorAnchor).
      hydrateSpaces(builtins, first ? first.id : '', { x: 0, y: 0 })
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
            const merged = ensureBuiltins(parsed.templates, parsed.anchor)
            hydrateSpaces(merged, parsed.activeId, parsed.anchor ?? null, parsed.screens)
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
        ...(anchor ? { anchor } : {}),
        ...(screens.length ? { screens } : {}),
      }
      saveSpaces(JSON.stringify(file, null, 2)).catch(() => {})
    }, 500)
    return () => clearTimeout(timer)
  }, [widgets, spaces, activeId, hydrated, anchor, screens])

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
