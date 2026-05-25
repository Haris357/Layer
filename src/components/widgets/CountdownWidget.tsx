import { useEffect, useState } from 'react'
import { Timer, Hourglass } from 'lucide-react'
import type { CountdownWidget as CountdownWidgetType } from '../../types/widget'
import { TextField } from '../ui'
import { cn } from '../../lib/utils'
import { notify } from '../../lib/notify'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

const DAY = 86400000

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * DAY).toISOString()
}

interface Breakdown {
  passed: boolean
  days: number
  hours: number
  minutes: number
  seconds: number
}

function breakdown(targetMs: number): Breakdown {
  const diff = targetMs - Date.now()
  const total = Math.floor(Math.abs(diff) / 1000)
  return {
    passed: diff <= 0,
    days: Math.floor(total / 86400),
    hours: Math.floor(total / 3600) % 24,
    minutes: Math.floor(total / 60) % 60,
    seconds: total % 60,
  }
}

function CountdownRenderer({ widget }: { widget: CountdownWidgetType }) {
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  // Fire exactly one notification when this countdown hits zero. The
  // dedupe key is keyed to the widget + target so it never repeats.
  useEffect(() => {
    const targetMs = new Date(widget.target).getTime()
    const remaining = targetMs - Date.now()
    const fire = () =>
      notify({
        kind: 'timer',
        title: `${widget.label || 'Countdown'} reached zero ✦`,
        dedupe: `countdown-${widget.id}-${widget.target}`,
      })
    if (remaining <= 0) {
      fire()
      return
    }
    const id = window.setTimeout(fire, remaining)
    return () => window.clearTimeout(id)
  }, [widget.id, widget.target, widget.label])

  const card = widget.background !== false
  const b = breakdown(new Date(widget.target).getTime())

  const segs: { value: number; label: string }[] = [
    { value: b.days, label: 'days' },
    { value: b.hours, label: 'hrs' },
    { value: b.minutes, label: 'min' },
    { value: b.seconds, label: 'sec' },
  ]

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col items-center justify-center gap-2 rounded-[14px] px-3',
        card && 'glass border border-[var(--border)]',
      )}
    >
      <div className={cn('flex items-start', !card && 'layer-pop')}>
        {segs.map((s, i) => (
          <div key={s.label} className="flex items-start">
            <div className="flex flex-col items-center px-2">
              <span
                className="tabular-nums text-[var(--text-primary)]"
                style={{
                  fontSize: 30,
                  fontWeight: 700,
                  letterSpacing: '-1px',
                  lineHeight: '32px',
                }}
              >
                {s.value.toString().padStart(2, '0')}
              </span>
              <span
                className="mt-1.5 text-[var(--text-tertiary)]"
                style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.4px' }}
              >
                {s.label.toUpperCase()}
              </span>
            </div>
            {i < segs.length - 1 && (
              <span
                className="text-[var(--text-tertiary)]"
                style={{ fontSize: 22, fontWeight: 600, lineHeight: '32px' }}
              >
                :
              </span>
            )}
          </div>
        ))}
      </div>
      <div
        className={cn(
          'flex items-center gap-1.5 text-[var(--text-secondary)]',
          !card && 'layer-pop',
        )}
      >
        <Timer size={12} strokeWidth={1.8} />
        <span
          className="truncate text-center"
          style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.2px' }}
        >
          {b.passed ? 'since' : 'until'} {widget.label}
        </span>
      </div>
    </div>
  )
}

function CountdownSettings({
  widget,
  onUpdate,
}: {
  widget: CountdownWidgetType
  onUpdate: (patch: Partial<CountdownWidgetType>) => void
}) {
  return (
    <div className="flex w-[230px] flex-col gap-2.5">
      <TextField
        value={widget.label}
        placeholder="Event name"
        maxLength={28}
        onChange={(v) => onUpdate({ label: v })}
      />
      <input
        type="date"
        value={widget.target.slice(0, 10)}
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          if (e.target.value) {
            onUpdate({ target: new Date(e.target.value).toISOString() })
          }
        }}
        className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none"
      />
    </div>
  )
}

export const countdownDefinition: WidgetDefinition<CountdownWidgetType> = {
  type: 'countdown',
  label: 'Countdown',
  icon: Hourglass,
  enabled: true,
  minSize: { width: 250, height: 120 },
  maxSize: { width: 460, height: 220 },
  create: (x, y) => ({
    type: 'countdown',
    x,
    y,
    width: 300,
    height: 150,
    locked: false,
    label: 'My event',
    target: daysFromNow(30),
    background: true,
  }),
  Renderer: CountdownRenderer,
  Settings: CountdownSettings,
}
