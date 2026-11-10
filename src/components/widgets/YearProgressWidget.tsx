import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarRange } from 'lucide-react'
import type { YearProgressWidget as YearProgressWidgetType } from '../../types/widget'
import type { WidgetDefinition } from '../../lib/widgetRegistry'
import { useSettingsStore } from '../../store/settingsStore'
import { FieldRow, Segmented, Slider, TextField } from '../ui'

type Mode = YearProgressWidgetType['mode']
const DAY = 86_400_000
const WEEK = 7 * DAY

interface Progress {
  total: number
  done: number
  // Fraction of the current unit (today / this week) already elapsed.
  partial: number
  cols: number
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function compute(mode: Mode, now: Date, weekStart: 0 | 1, birthYear: number, lifespan: number): Progress {
  const today = startOfDay(now)
  const dayFrac = (now.getTime() - today.getTime()) / DAY
  if (mode === 'month') {
    const total = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    return { total, done: now.getDate() - 1, partial: dayFrac, cols: 7 }
  }
  if (mode === 'week') {
    const done = (now.getDay() - weekStart + 7) % 7
    return { total: 7, done, partial: dayFrac, cols: 7 }
  }
  if (mode === 'life') {
    const born = new Date(birthYear, 0, 1)
    const total = lifespan * 52
    const lived = Math.max(0, (now.getTime() - born.getTime()) / WEEK)
    const done = Math.min(total, Math.floor(lived))
    return { total, done, partial: lived - done, cols: 52 }
  }
  const jan1 = new Date(now.getFullYear(), 0, 1)
  const total = Math.round((new Date(now.getFullYear() + 1, 0, 1).getTime() - jan1.getTime()) / DAY)
  const done = Math.round((today.getTime() - jan1.getTime()) / DAY)
  return { total, done, partial: dayFrac, cols: 21 }
}

// Pick the dot size (and, unless the column count is fixed, the columns) so
// all `n` dots fit inside w×h, as large as possible.
function fitGrid(n: number, w: number, h: number, fixedCols?: number) {
  const tryCols = (cols: number) => {
    const rows = Math.ceil(n / cols)
    const cell = Math.min(w / cols, h / rows)
    return { cols, cell }
  }
  if (fixedCols) return tryCols(fixedCols)
  let best = tryCols(1)
  for (let c = 2; c <= n; c++) {
    const t = tryCols(c)
    if (t.cell > best.cell) best = t
  }
  return best
}

function YearProgressRenderer({ widget }: { widget: YearProgressWidgetType }) {
  const gridRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const ro = new ResizeObserver(() =>
      setBox({ w: el.clientWidth, h: el.clientHeight }),
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const { t, i18n } = useTranslation()
  const weekStart = useSettingsStore((s) => s.weekStart)
  const [now, setNow] = useState(() => new Date())

  // A minute is plenty: the grid only changes at midnight, the % slowly.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const birthYear = widget.birthYear ?? now.getFullYear() - 25
  const lifespan = widget.lifespan ?? 90
  const p = useMemo(
    () => compute(widget.mode, now, weekStart, birthYear, lifespan),
    [widget.mode, now, weekStart, birthYear, lifespan],
  )
  const pct = Math.min(100, ((p.done + p.partial) / p.total) * 100)
  const left = Math.max(0, p.total - p.done - 1)

  const title =
    widget.mode === 'year'
      ? String(now.getFullYear())
      : widget.mode === 'month'
        ? now.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' })
        : widget.mode === 'week'
          ? t('yearprogress.thisWeek')
          : t('yearprogress.life')
  const leftText =
    widget.mode === 'life'
      ? t('yearprogress.weeksLeft', { count: left })
      : t('yearprogress.daysLeft', { count: left })

  // Month/week keep a calendar-like 7 columns; year and life pick whatever
  // column count gives the biggest dots for the widget's shape.
  const gapRatio = widget.mode === 'life' ? 0.25 : 0.3
  const fixedCols = widget.mode === 'month' || widget.mode === 'week' ? p.cols : undefined
  const { cols, cell } = fitGrid(p.total, box.w, box.h, fixedCols)
  const dot = Math.max(1, cell * (1 - gapRatio))
  return (
    <div className="glass flex h-full w-full flex-col gap-2.5 overflow-hidden rounded-[14px] border border-[var(--border)] p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{title}</span>
        <span className="shrink-0 tabular-nums text-[12px] font-semibold text-[var(--accent)]">
          {pct.toFixed(widget.mode === 'life' ? 1 : 0)}%
        </span>
      </div>
      <div ref={gridRef} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {box.w > 0 && (
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gridAutoRows: `${cell}px` }}
          aria-label={`${pct.toFixed(0)}%`}
        >
        {Array.from({ length: p.total }, (_, i) => {
          const state = i < p.done ? 'done' : i === p.done ? 'now' : 'todo'
          return (
            <span
              key={i}
              className="place-self-center rounded-full"
              style={{
                width: dot,
                height: dot,
                background:
                  state === 'done'
                    ? 'var(--text-primary)'
                    : state === 'now'
                      ? 'var(--accent)'
                      : 'color-mix(in srgb, var(--text-primary) 16%, transparent)',
                opacity: state === 'done' ? 0.85 : 1,
                boxShadow: state === 'now' ? '0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent)' : undefined,
              }}
            />
          )
        })}
        </div>
        )}
      </div>
      <span className="text-[11px] text-[var(--text-tertiary)]">{leftText}</span>
    </div>
  )
}

function YearProgressSettings({
  widget,
  onUpdate,
}: {
  widget: YearProgressWidgetType
  onUpdate: (patch: Partial<YearProgressWidgetType>) => void
}) {
  const { t } = useTranslation()
  const thisYear = new Date().getFullYear()
  const birthYear = widget.birthYear ?? thisYear - 25
  const lifespan = widget.lifespan ?? 90
  // Draft text so partial input ("19") can be typed; saved once it's a year.
  const [draft, setDraft] = useState(String(birthYear))
  return (
    <div className="flex w-[240px] flex-col gap-3">
      <Segmented
        value={widget.mode}
        options={[
          { value: 'year', label: t('yearprogress.modes.year') },
          { value: 'month', label: t('yearprogress.modes.month') },
          { value: 'week', label: t('yearprogress.modes.week') },
          { value: 'life', label: t('yearprogress.modes.life') },
        ]}
        onChange={(v) => onUpdate({ mode: v as Mode })}
      />
      {widget.mode === 'life' && (
        <>
          <FieldRow label={t('yearprogress.birthYear')}>
            <div className="w-[76px]">
              <TextField
                value={draft}
                maxLength={4}
                onChange={(v) => {
                  const clean = v.replace(/\D/g, '')
                  setDraft(clean)
                  const n = Number(clean)
                  if (clean.length === 4 && n >= 1900 && n <= thisYear) onUpdate({ birthYear: n })
                }}
                onBlur={() => setDraft(String(birthYear))}
              />
            </div>
          </FieldRow>
          <div className="flex flex-col gap-1">
            <span className="text-[12px] text-[var(--text-secondary)]">
              {t('yearprogress.lifespan', { years: lifespan })}
            </span>
            <Slider value={lifespan} min={60} max={110} onChange={(v) => onUpdate({ lifespan: v })} />
          </div>
        </>
      )}
    </div>
  )
}

export const yearProgressDefinition: WidgetDefinition<YearProgressWidgetType> = {
  type: 'yearprogress',
  label: 'Year Progress',
  icon: CalendarRange,
  enabled: true,
  minSize: { width: 180, height: 140 },
  create: (x, y) => ({
    type: 'yearprogress',
    x,
    y,
    width: 300,
    height: 230,
    locked: false,
    mode: 'year',
  }),
  Renderer: YearProgressRenderer,
  Settings: YearProgressSettings,
}
