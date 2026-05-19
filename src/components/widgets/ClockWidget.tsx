import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import type { ClockWidget as ClockWidgetType } from '../../types/widget'
import { Segmented, Toggle, FieldRow } from '../ui'
import { cn } from '../../lib/utils'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function DigitalClock({
  widget,
  card,
}: {
  widget: ClockWidgetType
  card: boolean
}) {
  const now = useNow()
  const h24 = now.getHours()
  const is12 = widget.format === '12h'
  const hours = is12 ? ((h24 % 12) || 12) : h24
  const minutes = pad(now.getMinutes())
  const seconds = pad(now.getSeconds())
  const ampm = h24 >= 12 ? 'PM' : 'AM'
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col items-center justify-center rounded-[12px] px-4',
        card && 'glass border border-[var(--border)]',
      )}
    >
      <div className="flex items-baseline gap-1">
        <span
          className="text-[var(--text-primary)]"
          style={{ fontSize: 56, fontWeight: 700, letterSpacing: '-2.1px' }}
        >
          {is12 ? hours : pad(hours)}:{minutes}
        </span>
        {widget.showSeconds && (
          <span
            className="text-[var(--text-secondary)]"
            style={{ fontSize: 32, fontWeight: 500 }}
          >
            :{seconds}
          </span>
        )}
        {is12 && (
          <span
            className="ml-1 text-[var(--text-secondary)]"
            style={{ fontSize: 14, fontWeight: 500 }}
          >
            {ampm}
          </span>
        )}
      </div>
      {widget.showDate && (
        <span
          className="mt-1 text-[var(--text-tertiary)]"
          style={{ fontSize: 14, fontWeight: 500 }}
        >
          {dateStr}
        </span>
      )}
    </div>
  )
}

function AnalogClock({ card }: { card: boolean }) {
  const now = useNow()
  const s = now.getSeconds()
  const m = now.getMinutes()
  const h = now.getHours()
  const secDeg = s * 6
  const minDeg = m * 6 + s * 0.1
  const hourDeg = (h % 12) * 30 + m * 0.5

  const ticks = [0, 90, 180, 270]

  return (
    <div
      className={cn(
        'flex h-full w-full items-center justify-center rounded-full',
        card && 'glass border border-[var(--border-strong)]',
      )}
    >
      <svg viewBox="0 0 100 100" className="h-[88%] w-[88%]">
        {ticks.map((deg) => (
          <line
            key={deg}
            x1="50"
            y1="6"
            x2="50"
            y2="12"
            stroke="var(--text-tertiary)"
            strokeWidth="2"
            transform={`rotate(${deg} 50 50)`}
          />
        ))}
        <line
          x1="50"
          y1="50"
          x2="50"
          y2="20"
          stroke="var(--text-primary)"
          strokeWidth="3.5"
          strokeLinecap="round"
          transform={`rotate(${hourDeg} 50 50)`}
        />
        <line
          x1="50"
          y1="50"
          x2="50"
          y2="12"
          stroke="var(--text-primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
          transform={`rotate(${minDeg} 50 50)`}
        />
        <line
          x1="50"
          y1="54"
          x2="50"
          y2="8"
          stroke="var(--accent)"
          strokeWidth="1"
          strokeLinecap="round"
          transform={`rotate(${secDeg} 50 50)`}
        />
        <circle cx="50" cy="50" r="3" fill="var(--text-primary)" />
      </svg>
    </div>
  )
}

function ClockRenderer({ widget }: { widget: ClockWidgetType }) {
  const card = widget.background !== false
  return widget.variant === 'digital' ? (
    <DigitalClock widget={widget} card={card} />
  ) : (
    <AnalogClock card={card} />
  )
}

function ClockSettings({
  widget,
  onUpdate,
}: {
  widget: ClockWidgetType
  onUpdate: (patch: Partial<ClockWidgetType>) => void
}) {
  return (
    <div className="flex w-[220px] flex-col gap-3">
      <Segmented
        value={widget.variant}
        options={[
          { value: 'digital', label: 'Digital' },
          { value: 'analog', label: 'Analog' },
        ]}
        onChange={(v) =>
          onUpdate({ variant: v as ClockWidgetType['variant'] })
        }
      />
      <Segmented
        value={widget.format}
        options={[
          { value: '12h', label: '12h' },
          { value: '24h', label: '24h' },
        ]}
        onChange={(v) => onUpdate({ format: v as ClockWidgetType['format'] })}
      />
      <FieldRow label="Show seconds">
        <Toggle
          checked={widget.showSeconds}
          onChange={(v) => onUpdate({ showSeconds: v })}
        />
      </FieldRow>
      {widget.variant === 'digital' && (
        <FieldRow label="Show date">
          <Toggle
            checked={widget.showDate}
            onChange={(v) => onUpdate({ showDate: v })}
          />
        </FieldRow>
      )}
    </div>
  )
}

export const clockDefinition: WidgetDefinition<ClockWidgetType> = {
  type: 'clock',
  label: 'Clock',
  icon: Clock,
  enabled: true,
  minSize: { width: 120, height: 120 },
  create: (x, y) => ({
    type: 'clock',
    x,
    y,
    width: 200,
    height: 200,
    locked: false,
    variant: 'analog',
    format: '12h',
    showSeconds: true,
    showDate: false,
    background: true,
  }),
  Renderer: ClockRenderer,
  Settings: ClockSettings,
}
