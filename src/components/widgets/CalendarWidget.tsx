import { useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import type { CalendarWidget as CalendarWidgetType } from '../../types/widget'
import { cn } from '../../lib/utils'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function CalendarRenderer() {
  const today = new Date()
  const [view, setView] = useState({
    y: today.getFullYear(),
    m: today.getMonth(),
  })

  const firstDay = new Date(view.y, view.m, 1).getDay()
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const shift = (delta: number) => {
    setView((v) => {
      const m = v.m + delta
      if (m < 0) return { y: v.y - 1, m: 11 }
      if (m > 11) return { y: v.y + 1, m: 0 }
      return { y: v.y, m }
    })
  }

  const isToday = (d: number) =>
    d === today.getDate() &&
    view.m === today.getMonth() &&
    view.y === today.getFullYear()

  return (
    <div className="glass flex h-full w-full flex-col overflow-hidden rounded-[12px] border border-[var(--border)] p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          className="text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
        >
          <ChevronLeft size={16} />
        </button>
        <span
          className="text-[var(--text-primary)]"
          style={{ fontSize: 13, fontWeight: 700 }}
        >
          {MONTHS[view.m]} {view.y}
        </span>
        <button
          type="button"
          onClick={() => shift(1)}
          className="text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((w, i) => (
          <span
            key={i}
            className="text-center text-[var(--text-tertiary)]"
            style={{ fontSize: 10, fontWeight: 600 }}
          >
            {w}
          </span>
        ))}
      </div>

      <div className="mt-0.5 grid flex-1 grid-cols-7 gap-0.5">
        {cells.map((d, i) => (
          <div
            key={i}
            className="flex items-center justify-center"
          >
            {d !== null && (
              <span
                className={cn(
                  'flex h-[22px] w-[22px] items-center justify-center rounded-full',
                )}
                style={{
                  fontSize: 12,
                  fontWeight: isToday(d) ? 700 : 500,
                  background: isToday(d) ? 'var(--accent)' : 'transparent',
                  color: isToday(d)
                    ? 'var(--on-accent)'
                    : 'var(--text-secondary)',
                }}
              >
                {d}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export const calendarDefinition: WidgetDefinition<CalendarWidgetType> = {
  type: 'calendar',
  label: 'Calendar',
  icon: CalendarDays,
  enabled: true,
  minSize: { width: 240, height: 230 },
  maxSize: { width: 460, height: 440 },
  create: (x, y) => ({
    type: 'calendar',
    x,
    y,
    width: 280,
    height: 280,
    locked: false,
  }),
  Renderer: CalendarRenderer,
}
