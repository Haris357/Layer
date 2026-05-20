import type { CalendarEvent, EventColor } from '../store/eventsStore'

export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const WEEKDAYS_MIN = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export const COLORS: Record<EventColor, string> = {
  blue: '#5b8def',
  green: '#39c277',
  amber: '#e0a13a',
  rose: '#d54a4a',
  violet: '#a965d6',
  gray: '#888a90',
}

export const COLOR_OPTIONS: EventColor[] = [
  'blue', 'green', 'amber', 'rose', 'violet', 'gray',
]

export function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

// Does this event occur on the given target day?
export function occursOnDay(e: CalendarEvent, target: Date): boolean {
  const start = new Date(e.start)
  const startDay = startOfDay(start)
  const targetDay = startOfDay(target)
  if (targetDay.getTime() < startDay.getTime()) return false
  if (e.until) {
    const until = startOfDay(new Date(e.until))
    if (targetDay.getTime() > until.getTime()) return false
  }
  switch (e.recurrence) {
    case 'none':
      return sameDay(start, target)
    case 'daily':
      return true
    case 'weekly':
      return target.getDay() === start.getDay()
    case 'monthly':
      // Skip months that don't have this day (e.g., Feb 30 → skipped).
      return target.getDate() === start.getDate()
    case 'yearly':
      return (
        target.getMonth() === start.getMonth() &&
        target.getDate() === start.getDate()
      )
  }
}

// Events occurring on a given day, ordered by start time (all-day first).
export function eventsOnDay(
  all: CalendarEvent[],
  target: Date,
): CalendarEvent[] {
  return all
    .filter((e) => occursOnDay(e, target))
    .sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
      return new Date(a.start).getTime() - new Date(b.start).getTime()
    })
}

// Computes the next occurrence of an event AT OR AFTER `from`. Returns null
// if past the `until`. Time-of-day comes from the original event.
export function nextOccurrenceAfter(
  e: CalendarEvent,
  from: Date,
): Date | null {
  const start = new Date(e.start)
  const limit = e.until ? startOfDay(new Date(e.until)) : null

  // Walk forward day by day until we find an occurrence (cap at ~370 days).
  for (let i = 0; i < 370; i++) {
    const candidate = addDays(startOfDay(from), i)
    if (limit && candidate.getTime() > limit.getTime()) return null
    if (occursOnDay(e, candidate)) {
      // For "none" recurrence, just return its actual start.
      if (e.recurrence === 'none') {
        if (start.getTime() >= from.getTime()) return start
        return null
      }
      // Build the datetime for this candidate day.
      const result = new Date(candidate)
      result.setHours(
        start.getHours(),
        start.getMinutes(),
        start.getSeconds(),
        0,
      )
      if (result.getTime() >= from.getTime()) return result
    }
  }
  return null
}

export function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function fmtMonthYear(y: number, m: number): string {
  return `${MONTHS[m]} ${y}`
}
