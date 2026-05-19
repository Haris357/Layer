import { useEffect, useState } from 'react'
import { Globe, X } from 'lucide-react'
import type {
  WorldClockWidget as WorldClockWidgetType,
  WorldZone,
} from '../../types/widget'
import { uid } from '../../lib/utils'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

const COMMON_ZONES: { label: string; tz: string }[] = [
  { label: 'Los Angeles', tz: 'America/Los_Angeles' },
  { label: 'New York', tz: 'America/New_York' },
  { label: 'London', tz: 'Europe/London' },
  { label: 'Paris', tz: 'Europe/Paris' },
  { label: 'Berlin', tz: 'Europe/Berlin' },
  { label: 'Dubai', tz: 'Asia/Dubai' },
  { label: 'Karachi', tz: 'Asia/Karachi' },
  { label: 'Mumbai', tz: 'Asia/Kolkata' },
  { label: 'Singapore', tz: 'Asia/Singapore' },
  { label: 'Tokyo', tz: 'Asia/Tokyo' },
  { label: 'Sydney', tz: 'Australia/Sydney' },
]

function zoneTime(tz: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(now)
  } catch {
    return '—'
  }
}

function zoneDay(tz: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
    }).format(now)
  } catch {
    return ''
  }
}

function WorldClockRenderer({ widget }: { widget: WorldClockWidgetType }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 10 * 1000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="glass flex h-full w-full flex-col gap-1 overflow-y-auto rounded-[12px] border border-[var(--border)] p-3.5">
      {widget.zones.map((z) => (
        <div key={z.id} className="flex items-baseline justify-between">
          <span
            className="truncate text-[var(--text-primary)]"
            style={{ fontSize: 13, fontWeight: 600 }}
          >
            {z.label}
          </span>
          <span className="flex items-baseline gap-1.5">
            <span
              className="text-[var(--text-tertiary)]"
              style={{ fontSize: 11, fontWeight: 500 }}
            >
              {zoneDay(z.tz, now)}
            </span>
            <span
              className="tabular-nums text-[var(--text-primary)]"
              style={{ fontSize: 15, fontWeight: 700 }}
            >
              {zoneTime(z.tz, now)}
            </span>
          </span>
        </div>
      ))}
      {widget.zones.length === 0 && (
        <span
          className="text-[var(--text-tertiary)]"
          style={{ fontSize: 12 }}
        >
          Add a city in settings
        </span>
      )}
    </div>
  )
}

function WorldClockSettings({
  widget,
  onUpdate,
}: {
  widget: WorldClockWidgetType
  onUpdate: (patch: Partial<WorldClockWidgetType>) => void
}) {
  const usedTz = new Set(widget.zones.map((z) => z.tz))
  const available = COMMON_ZONES.filter((z) => !usedTz.has(z.tz))

  return (
    <div className="flex w-[220px] flex-col gap-2">
      {widget.zones.length > 0 && (
        <div className="flex flex-col">
          {widget.zones.map((z) => (
            <div
              key={z.id}
              className="flex items-center justify-between rounded-[6px] px-1.5 py-1"
            >
              <span className="text-[12px] text-[var(--text-secondary)]">
                {z.label}
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdate({
                    zones: widget.zones.filter((x) => x.id !== z.id),
                  })
                }
                className="text-[var(--text-tertiary)] hover:text-[var(--danger)]"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      {available.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t border-[var(--border)] pt-2">
          {available.map((z) => (
            <button
              key={z.tz}
              type="button"
              onClick={() =>
                onUpdate({
                  zones: [
                    ...widget.zones,
                    { id: uid(), label: z.label, tz: z.tz },
                  ],
                })
              }
              className="rounded-[6px] bg-[var(--fill-1)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-2)]"
            >
              + {z.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function defaultZones(): WorldZone[] {
  return [
    { id: uid(), label: 'New York', tz: 'America/New_York' },
    { id: uid(), label: 'London', tz: 'Europe/London' },
    { id: uid(), label: 'Tokyo', tz: 'Asia/Tokyo' },
  ]
}

export const worldClockDefinition: WidgetDefinition<WorldClockWidgetType> = {
  type: 'worldclock',
  label: 'World Clock',
  icon: Globe,
  enabled: true,
  minSize: { width: 200, height: 130 },
  maxSize: { width: 420, height: 420 },
  create: (x, y) => ({
    type: 'worldclock',
    x,
    y,
    width: 260,
    height: 170,
    locked: false,
    zones: defaultZones(),
  }),
  Renderer: WorldClockRenderer,
  Settings: WorldClockSettings,
}
