import { useEffect } from 'react'
import { useEventsStore } from '../store/eventsStore'
import { nextOccurrenceAfter, dayKey } from '../lib/calendar'
import { notify } from '../lib/notify'

// Schedules reminder notifications for events occurring in the next 24h.
// Reschedules whenever the events list changes.
export function useCalendarReminders(): void {
  const events = useEventsStore((s) => s.events)
  useEffect(() => {
    const now = Date.now()
    const horizon = now + 24 * 60 * 60 * 1000
    const timers: number[] = []

    for (const e of events) {
      const next = nextOccurrenceAfter(e, new Date(now))
      if (!next) continue
      const ts = next.getTime()
      if (ts > horizon) continue
      const k = dayKey(next)

      if (e.allDay) {
        const fireAt = Math.max(ts, now + 500)
        timers.push(
          window.setTimeout(() => {
            notify({
              kind: 'calendar',
              title: `Today: ${e.title}`,
              dedupe: `cal-allday-${e.id}-${k}`,
            })
          }, fireAt - now),
        )
        continue
      }

      const tenBefore = ts - 10 * 60 * 1000
      if (tenBefore > now) {
        timers.push(
          window.setTimeout(() => {
            notify({
              kind: 'calendar',
              title: `In 10 min: ${e.title}`,
              body: next.toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit',
              }),
              dedupe: `cal-10-${e.id}-${k}`,
            })
          }, tenBefore - now),
        )
      }
      if (ts > now) {
        timers.push(
          window.setTimeout(() => {
            notify({
              kind: 'calendar',
              title: `Starting now: ${e.title}`,
              dedupe: `cal-start-${e.id}-${k}`,
            })
          }, ts - now),
        )
      }
    }

    return () => timers.forEach((id) => window.clearTimeout(id))
  }, [events])
}
