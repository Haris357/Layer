import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import type {
  GreetingWidget as GreetingWidgetType,
  GreetingStyle,
} from '../../types/widget'
import {
  timeGreeting,
  pickLine,
  GREETING_MAIN,
  fillName,
} from '../../lib/greetings'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

function GreetingRenderer({ widget }: { widget: GreetingWidgetType }) {
  const [now, setNow] = useState(() => new Date())
  // Pick a random main greeting on mount (so it's fresh every launch) and
  // rotate it every few minutes.
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100000))
  useEffect(() => {
    const tick = window.setInterval(() => setNow(new Date()), 30_000)
    const rotate = window.setInterval(() => setSeed((s) => s + 1), 5 * 60_000)
    return () => {
      window.clearInterval(tick)
      window.clearInterval(rotate)
    }
  }, [])

  const name = widget.name.trim()
  const style = widget.style ?? 'classic'
  const line = pickLine(Math.floor(now.getTime() / 60000))

  // The main line rotates through 100+ greetings, with the live time-of-day
  // greeting mixed in as one of the options.
  const pool = [`${timeGreeting(now)}, {name}`, ...GREETING_MAIN]
  const template = pool[seed % pool.length] ?? GREETING_MAIN[0] ?? 'Welcome back'

  const renderMain = () => {
    if (style === 'gradient' || !name) return fillName(template, name)
    const parts = template.split('{name}')
    return parts.map((part, i) => (
      <span key={i}>
        {part}
        {i < parts.length - 1 && (
          <span style={{ color: 'var(--accent)' }}>{name}</span>
        )}
      </span>
    ))
  }

  const serif = style === 'serif'
  const greetingStyle: React.CSSProperties = {
    fontSize: 'clamp(20px, 9cqw, 52px)',
    fontWeight: serif ? 600 : 700,
    letterSpacing: serif ? '0' : '-1px',
    lineHeight: 1.05,
    fontFamily: serif ? "'Lora', Georgia, serif" : undefined,
    ...(style === 'gradient'
      ? {
          background:
            'linear-gradient(110deg, var(--accent), color-mix(in srgb, var(--accent) 45%, var(--text-primary)))',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          color: 'transparent',
        }
      : { color: 'var(--text-primary)' }),
  }

  return (
    <div
      className="glass flex h-full w-full flex-col justify-center gap-2 overflow-hidden rounded-[12px] border border-[var(--border)] px-5 py-4"
      style={{ containerType: 'inline-size' }}
    >
      <div style={greetingStyle}>{renderMain()}</div>
      <div
        className="text-[var(--text-secondary)]"
        style={{
          fontSize: 'clamp(11px, 3.4cqw, 16px)',
          fontWeight: 450,
          letterSpacing: '0.2px',
          fontStyle: serif ? 'italic' : 'normal',
          fontFamily: serif ? "'Lora', Georgia, serif" : undefined,
        }}
      >
        {line}
      </div>
    </div>
  )
}

function GreetingSettings({
  widget,
  onUpdate,
}: {
  widget: GreetingWidgetType
  onUpdate: (patch: Partial<GreetingWidgetType>) => void
}) {
  const styles: { id: GreetingStyle; label: string }[] = [
    { id: 'classic', label: 'Classic' },
    { id: 'serif', label: 'Serif' },
    { id: 'gradient', label: 'Gradient' },
  ]
  return (
    <div className="flex w-[220px] flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-[var(--text-tertiary)]">
          Your name
        </span>
        <input
          value={widget.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="e.g. Haris"
          className="rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--border-strong)]"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-[var(--text-tertiary)]">
          Style
        </span>
        <div className="flex flex-wrap gap-1.5">
          {styles.map((s) => {
            const active = (widget.style ?? 'classic') === s.id
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onUpdate({ style: s.id })}
                className={`rounded-[7px] px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                  active
                    ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                    : 'border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--fill-2)]'
                }`}
              >
                {s.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export const greetingDefinition: WidgetDefinition<GreetingWidgetType> = {
  type: 'greeting',
  label: 'Greeting',
  icon: Sparkles,
  enabled: true,
  minSize: { width: 220, height: 110 },
  maxSize: { width: 560, height: 320 },
  create: (x, y) => ({
    type: 'greeting',
    x,
    y,
    width: 340,
    height: 150,
    locked: false,
    name: '',
    style: 'classic',
  }),
  Renderer: GreetingRenderer,
  Settings: GreetingSettings,
}
