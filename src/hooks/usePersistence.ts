import { useEffect } from 'react'
import { useCanvasStore } from '../store/canvasStore'
import { useJournalStore } from '../store/journalStore'
import {
  isTauri,
  loadJournal,
  loadTemplates,
  saveJournal,
  saveTemplates,
} from '../lib/ipc'
import { buildBuiltins } from '../lib/builtins'
import type { JournalFile, Template, TemplatesFile } from '../types/widget'

function ensureBuiltins(loaded: Template[]): Template[] {
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
  const templates = useCanvasStore((s) => s.templates)
  const activeId = useCanvasStore((s) => s.activeId)
  const hydrated = useCanvasStore((s) => s.hydrated)
  const hydrateTemplates = useCanvasStore((s) => s.hydrateTemplates)

  const entries = useJournalStore((s) => s.entries)
  const journalHydrated = useJournalStore((s) => s.hydrated)
  const hydrateJournal = useJournalStore((s) => s.hydrate)

  useEffect(() => {
    const seed = () => {
      const builtins = buildBuiltins()
      const first = builtins[0]
      hydrateTemplates(builtins, first ? first.id : '')
    }

    if (!isTauri()) {
      seed()
      hydrateJournal([])
      return
    }

    loadTemplates()
      .then((raw) => {
        if (!raw) {
          seed()
          return
        }
        try {
          const parsed = JSON.parse(raw) as TemplatesFile
          if (
            Array.isArray(parsed.templates) &&
            parsed.templates.length > 0
          ) {
            const merged = ensureBuiltins(parsed.templates)
            hydrateTemplates(merged, parsed.activeId)
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
  }, [hydrateTemplates, hydrateJournal])

  useEffect(() => {
    if (!hydrated || !isTauri()) return
    const timer = setTimeout(() => {
      const synced = templates.map((t) =>
        t.id === activeId ? { ...t, widgets } : t,
      )
      const file: TemplatesFile = {
        version: 1,
        templates: synced,
        activeId,
        savedAt: new Date().toISOString(),
      }
      saveTemplates(JSON.stringify(file, null, 2)).catch(() => {})
    }, 500)
    return () => clearTimeout(timer)
  }, [widgets, templates, activeId, hydrated])

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
