import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { isTauri } from './ipc'
import type { CalendarEvent, EventColor, Recurrence } from '../store/eventsStore'

// Minimal RFC-5545 (.ics) reader. We don't expand recurrences here — we map
// each VEVENT's RRULE onto the app's own recurrence model and let the existing
// occursOnDay() engine handle display. Good enough for typical personal feeds
// (Google/Proton/Outlook share links). Complex RRULEs (BYDAY lists, etc.) are
// approximated to the closest simple recurrence.

// RFC-5545 line unfolding: a line beginning with space/tab continues the prior.
function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const out: string[] = []
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) {
      out[out.length - 1] += line.slice(1)
    } else {
      out.push(line)
    }
  }
  return out
}

function unescape(v: string): string {
  return v
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

// Parse an ICS date/datetime value (with its params) into { iso, allDay }.
function parseIcsDate(
  value: string,
  params: Record<string, string>,
): { iso: string; allDay: boolean } | null {
  if (params.VALUE === 'DATE' || /^\d{8}$/.test(value)) {
    const y = +value.slice(0, 4)
    const mo = +value.slice(4, 6)
    const d = +value.slice(6, 8)
    if (!y) return null
    return { iso: new Date(y, mo - 1, d).toISOString(), allDay: true }
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/)
  if (!m) return null
  const y = +m[1]!
  const mo = +m[2]! - 1
  const d = +m[3]!
  const h = +m[4]!
  const mi = +m[5]!
  const s = +m[6]!
  // Z = UTC; otherwise (incl. TZID-tagged) treat as local wall-clock time.
  const date = m[7]
    ? new Date(Date.UTC(y, mo, d, h, mi, s))
    : new Date(y, mo, d, h, mi, s)
  return { iso: date.toISOString(), allDay: false }
}

function mapRrule(rrule: string): { recurrence: Recurrence; until?: string } {
  const parts: Record<string, string> = {}
  for (const seg of rrule.split(';')) {
    const [k, v] = seg.split('=')
    if (k) parts[k.toUpperCase()] = v ?? ''
  }
  const freq = (parts.FREQ || '').toUpperCase()
  const map: Record<string, Recurrence> = {
    DAILY: 'daily',
    WEEKLY: 'weekly',
    MONTHLY: 'monthly',
    YEARLY: 'yearly',
  }
  const recurrence = map[freq] ?? 'none'
  let until: string | undefined
  if (parts.UNTIL && parts.UNTIL.length >= 8) {
    until = `${parts.UNTIL.slice(0, 4)}-${parts.UNTIL.slice(4, 6)}-${parts.UNTIL.slice(6, 8)}`
  }
  return { recurrence, until }
}

interface Draft {
  uid?: string
  summary?: string
  desc?: string
  start?: string
  end?: string
  allDay?: boolean
  recurrence?: Recurrence
  until?: string
}

export function parseIcs(
  text: string,
  sourceId: string,
  color: EventColor,
): CalendarEvent[] {
  const lines = unfold(text)
  const events: CalendarEvent[] = []
  let cur: Draft | null = null

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      cur = {}
      continue
    }
    if (line === 'END:VEVENT') {
      if (cur?.start) {
        events.push({
          id: `${sourceId}:${cur.uid || cur.start}`,
          title: cur.summary || '(untitled)',
          start: cur.start,
          end: cur.end,
          allDay: !!cur.allDay,
          color,
          note: cur.desc,
          recurrence: cur.recurrence || 'none',
          until: cur.until,
          sourceId,
          readOnly: true,
        })
      }
      cur = null
      continue
    }
    if (!cur) continue

    const colon = line.indexOf(':')
    if (colon < 0) continue
    const left = line.slice(0, colon)
    const value = line.slice(colon + 1)
    const [rawName = '', ...paramSegs] = left.split(';')
    const name = rawName.toUpperCase()
    const params: Record<string, string> = {}
    for (const seg of paramSegs) {
      const [k, v] = seg.split('=')
      if (k) params[k.toUpperCase()] = v ?? ''
    }

    if (name === 'SUMMARY') cur.summary = unescape(value)
    else if (name === 'DESCRIPTION') cur.desc = unescape(value)
    else if (name === 'UID') cur.uid = value
    else if (name === 'DTSTART') {
      const d = parseIcsDate(value, params)
      if (d) {
        cur.start = d.iso
        cur.allDay = d.allDay
      }
    } else if (name === 'DTEND') {
      const d = parseIcsDate(value, params)
      if (d) cur.end = d.iso
    } else if (name === 'RRULE') {
      const r = mapRrule(value)
      cur.recurrence = r.recurrence
      cur.until = r.until
    }
  }
  return events
}

// Fetch an .ics feed. Uses the Tauri HTTP plugin (no CORS) in the app, plain
// fetch in the browser. webcal:// links are normalized to https://.
export async function fetchIcs(url: string): Promise<string> {
  const normalized = url.replace(/^webcal:\/\//i, 'https://')
  const res = isTauri()
    ? await tauriFetch(normalized)
    : await window.fetch(normalized)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.text()
}
