import { useEffect } from 'react'
import { useCalendarSourcesStore } from '../store/calendarSourcesStore'
import { useEventsStore } from '../store/eventsStore'
import { fetchIcs, parseIcs } from '../lib/ical'

const REFRESH_MS = 30 * 60 * 1000

// Periodically refresh all enabled calendar subscriptions into the events
// store's in-memory external slice. Runs once on mount and every 30 min, and
// re-runs whenever the meaningful source config changes (id/url/enabled/color)
// — NOT on lastFetched updates, which would otherwise loop forever.
export function useCalendarSources(): void {
  const sources = useCalendarSourcesStore((s) => s.sources)
  const key = sources
    .map((s) => `${s.id}:${s.url}:${s.enabled}:${s.color}`)
    .join('|')

  useEffect(() => {
    let cancelled = false

    const refreshAll = async () => {
      const current = useCalendarSourcesStore.getState().sources
      const setExt = useEventsStore.getState().setExternalEventsForSource
      const updateSource = useCalendarSourcesStore.getState().updateSource
      for (const src of current) {
        if (!src.enabled) {
          setExt(src.id, [])
          continue
        }
        try {
          const text = await fetchIcs(src.url)
          if (cancelled) return
          setExt(src.id, parseIcs(text, src.id, src.color))
          updateSource(src.id, {
            lastFetched: new Date().toISOString(),
            lastError: null,
          })
        } catch (e) {
          if (!cancelled) {
            updateSource(src.id, { lastError: String(e) })
          }
        }
      }
    }

    refreshAll()
    const id = window.setInterval(refreshAll, REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}
