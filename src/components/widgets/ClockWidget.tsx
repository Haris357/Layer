import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock } from 'lucide-react'
import type {
  ClockWidget as ClockWidgetType,
  ClockFont,
} from '../../types/widget'
import { Segmented, Toggle, FieldRow } from '../ui'
import { cn } from '../../lib/utils'
import { dateLocale } from '../../lib/locale'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

interface FontSpec {
  family: string
  weight: number
  // Tracking that flatters this face at display size.
  tracking: string
  // How wide the face runs, to scale the day name to fit the widget.
  density: number
}

const FONT_MAP: Record<ClockFont, FontSpec> = {
  anurati: {
    family: "'Anurati', sans-serif",
    weight: 400,
    tracking: '0.1em',
    density: 18,
  },
  oxanium: {
    family: "'Oxanium', sans-serif",
    weight: 600,
    tracking: '0.22em',
    density: 11,
  },
  wallpoet: {
    family: "'Wallpoet', sans-serif",
    weight: 400,
    tracking: '0.16em',
    density: 13,
  },
  zendots: {
    family: "'Zen Dots', sans-serif",
    weight: 400,
    tracking: '0.1em',
    density: 15,
  },
  audiowide: {
    family: "'Audiowide', sans-serif",
    weight: 400,
    tracking: '0.12em',
    density: 13,
  },
}

// Numbers always use this clean face, even when the letters use a decorative
// font — so digits stay crisp and readable (matches the reference design).
const NUMBER_FONT = "'Space Grotesk', sans-serif"

function clockFont(f: ClockFont | undefined): FontSpec {
  return FONT_MAP[f ?? 'anurati'] ?? FONT_MAP.anurati
}

// Strong dual shadow so the text reads on bright and dark wallpapers alike.
const DISPLAY_SHADOW =
  '0 2px 26px rgba(0,0,0,0.45), 0 1px 4px rgba(0,0,0,0.6)'

// Render a string with the decorative font on letters and the clean number
// font on digit runs (e.g. "JULY 24, 2025" → JULY decorative, 24/2025 clean).
function MixedText({
  text,
  letterFont,
  numberWeight,
}: {
  text: string
  letterFont: string
  numberWeight: number
}) {
  const parts = text.split(/([0-9:]+)/).filter(Boolean)
  return (
    <>
      {parts.map((p, i) => {
        const isNum = /[0-9]/.test(p)
        return (
          <span
            key={i}
            style={{
              fontFamily: isNum ? NUMBER_FONT : letterFont,
              fontWeight: isNum ? numberWeight : undefined,
            }}
          >
            {p}
          </span>
        )
      })}
    </>
  )
}

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
  const dateStr = now.toLocaleDateString(dateLocale(), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  // Scale the time to the widget so resizing actually resizes the clock.
  // Constrain by both the available width (so it never overflows the longest
  // time string) and the height (so it stays vertically balanced).
  const timeStr = `${is12 ? hours : pad(hours)}:${minutes}`
  // Approx. advance width of the main + seconds + am/pm run, in em.
  const runEm =
    timeStr.length * 0.58 +
    (widget.showSeconds ? 3 * 0.58 * 0.57 : 0) +
    (is12 ? 0.6 : 0)
  const mainFs = Math.max(
    16,
    Math.min(
      Math.round((widget.width - 32) / runEm),
      Math.round(widget.height * (widget.showDate ? 0.5 : 0.64)),
    ),
  )
  const secFs = Math.round(mainFs * 0.57)
  const ampmFs = Math.max(10, Math.round(mainFs * 0.25))
  const dateFs = Math.max(10, Math.round(mainFs * 0.25))

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-[12px] px-4',
        card && 'glass border border-[var(--border)]',
      )}
    >
      <div className="flex items-baseline gap-1">
        <span
          className="whitespace-nowrap text-[var(--text-primary)]"
          style={{
            fontSize: mainFs,
            fontWeight: 700,
            letterSpacing: `${(mainFs * -0.0375).toFixed(2)}px`,
            lineHeight: 1,
          }}
        >
          {timeStr}
        </span>
        {widget.showSeconds && (
          <span
            className="text-[var(--text-secondary)]"
            style={{ fontSize: secFs, fontWeight: 500 }}
          >
            :{seconds}
          </span>
        )}
        {is12 && (
          <span
            className="ml-1 text-[var(--text-secondary)]"
            style={{ fontSize: ampmFs, fontWeight: 500 }}
          >
            {ampm}
          </span>
        )}
      </div>
      {widget.showDate && (
        <span
          className="mt-1 text-[var(--text-tertiary)]"
          style={{ fontSize: dateFs, fontWeight: 500 }}
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

function DisplayClock({
  widget,
  card,
}: {
  widget: ClockWidgetType
  card: boolean
}) {
  const now = useNow()
  const font = clockFont(widget.font)
  const day = now
    .toLocaleDateString(dateLocale(), { weekday: 'long' })
    .toUpperCase()
  const dateStr = now
    .toLocaleDateString(dateLocale(), {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
    .toUpperCase()
  const h24 = now.getHours()
  const is12 = widget.format === '12h'
  const hours = is12 ? (h24 % 12 || 12) : h24
  const minutes = pad(now.getMinutes())
  const ampm = h24 >= 12 ? 'PM' : 'AM'
  const time =
    `${is12 ? hours : pad(hours)}:${minutes}` +
    `${widget.showSeconds ? ':' + pad(now.getSeconds()) : ''}` +
    `${is12 ? ' ' + ampm : ''}`

  // Scale the day name to fit the widget; each face runs a different width.
  const dayFs = Math.max(
    16,
    Math.min(
      Math.round((widget.width - 32) / (font.density / 1.6)),
      Math.round(widget.height * 0.46),
    ),
  )
  const subFs = Math.max(12, Math.round(dayFs * 0.36))
  const shadow = card ? undefined : DISPLAY_SHADOW

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-[16px] px-4 text-center',
        card && 'glass border border-[var(--border)]',
      )}
    >
      <div
        className="whitespace-nowrap text-[var(--text-primary)]"
        style={{
          fontFamily: font.family,
          fontSize: dayFs,
          fontWeight: font.weight,
          letterSpacing: font.tracking,
          lineHeight: 1,
          textShadow: shadow,
        }}
      >
        {day}
      </div>
      {widget.showDate && (
        <div
          className="mt-1 text-[var(--text-secondary)]"
          style={{
            fontSize: subFs,
            fontWeight: 600,
            letterSpacing: '0.16em',
            textShadow: shadow,
          }}
        >
          <MixedText
            text={dateStr}
            letterFont={font.family}
            numberWeight={600}
          />
        </div>
      )}
      <div
        className="mt-0.5 flex items-center gap-2 text-[var(--text-secondary)]"
        style={{
          fontSize: Math.max(11, Math.round(subFs * 0.94)),
          fontWeight: 600,
          letterSpacing: '0.18em',
          textShadow: shadow,
        }}
      >
        <span style={{ opacity: 0.45 }}>—</span>
        <span>
          <MixedText
            text={time}
            letterFont={font.family}
            numberWeight={600}
          />
        </span>
        <span style={{ opacity: 0.45 }}>—</span>
      </div>
    </div>
  )
}

function ClockRenderer({ widget }: { widget: ClockWidgetType }) {
  const card = widget.background !== false
  if (widget.variant === 'display')
    return <DisplayClock widget={widget} card={card} />
  if (widget.variant === 'digital')
    return <DigitalClock widget={widget} card={card} />
  return <AnalogClock card={card} />
}

// Style (analog/digital/display) is chosen when adding from the top bar — not
// here. The options shown depend on the style: analog has none (so the popover
// is hidden via hasSettings); format/seconds are meaningless for it.
function ClockSettings({
  widget,
  onUpdate,
}: {
  widget: ClockWidgetType
  onUpdate: (patch: Partial<ClockWidgetType>) => void
}) {
  const { t } = useTranslation()
  if (widget.variant === 'analog') return null

  return (
    <div className="flex w-[248px] flex-col gap-3">
      {widget.variant === 'display' && (
        <Segmented
          value={widget.font ?? 'anurati'}
          options={[
            { value: 'anurati', label: t('clock.fonts.anurati') },
            { value: 'wallpoet', label: t('clock.fonts.stencil') },
            { value: 'oxanium', label: t('clock.fonts.scifi') },
            { value: 'audiowide', label: t('clock.fonts.retro') },
          ]}
          onChange={(v) => onUpdate({ font: v as ClockFont })}
        />
      )}
      <Segmented
        value={widget.format}
        options={[
          { value: '12h', label: t('clock.format.12h') },
          { value: '24h', label: t('clock.format.24h') },
        ]}
        onChange={(v) => onUpdate({ format: v as ClockWidgetType['format'] })}
      />
      <FieldRow label={t('clock.showSeconds')}>
        <Toggle
          checked={widget.showSeconds}
          onChange={(v) => onUpdate({ showSeconds: v })}
        />
      </FieldRow>
      <FieldRow label={t('clock.showDate')}>
        <Toggle
          checked={widget.showDate}
          onChange={(v) => onUpdate({ showDate: v })}
        />
      </FieldRow>
    </div>
  )
}

export const clockDefinition: WidgetDefinition<ClockWidgetType> = {
  type: 'clock',
  label: 'Clock',
  icon: Clock,
  enabled: true,
  minSize: { width: 120, height: 120 },
  styles: [
    { key: 'analog', label: 'Analog', patch: { variant: 'analog' } },
    {
      key: 'digital',
      label: 'Digital',
      patch: { variant: 'digital', width: 240, height: 150 },
    },
    {
      key: 'display',
      label: 'Display',
      patch: {
        variant: 'display',
        width: 440,
        height: 170,
        background: false,
        showDate: true,
        font: 'anurati',
      },
    },
  ],
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
  hasSettings: (w) => w.variant !== 'analog',
}
