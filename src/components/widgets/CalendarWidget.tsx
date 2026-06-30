import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Plus,
  X,
  Trash2,
} from 'lucide-react'
import type { CalendarWidget as CalendarWidgetType } from '../../types/widget'
import {
  useEventsStore,
  type CalendarEvent,
  type EventColor,
  type Recurrence,
} from '../../store/eventsStore'
import {
  COLORS,
  COLOR_OPTIONS,
  addDays,
  eventsOnDay,
  fmtTime,
  sameDay,
  startOfDay,
} from '../../lib/calendar'
import { months, weekdays, dateLocale } from '../../lib/locale'
import { cn } from '../../lib/utils'
import { Menu } from '../Menu'
import { Tooltip } from '../Tooltip'
import type { WidgetDefinition } from '../../lib/widgetRegistry'
import { useCalendarSourcesStore } from '../../store/calendarSourcesStore'

// Local events + read-only subscription events, merged for display.
function useAllEvents(): CalendarEvent[] {
  const events = useEventsStore((s) => s.events)
  const external = useEventsStore((s) => s.externalEvents)
  return useMemo(
    () => (external.length ? [...events, ...external] : events),
    [events, external],
  )
}

type ViewKind = 'month' | 'week' | 'day'

// ─── Month view ─────────────────────────────────────────────────────────────

function MonthView({
  cursor,
  today,
  events,
  onSelectDay,
}: {
  cursor: Date
  today: Date
  events: CalendarEvent[]
  onSelectDay: (d: Date) => void
}) {
  const y = cursor.getFullYear()
  const m = cursor.getMonth()
  const firstDay = new Date(y, m, 1).getDay()
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const cells: (Date | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, m, d))
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="flex flex-1 flex-col">
      <div className="grid grid-cols-7 gap-0.5">
        {weekdays('narrow').map((w, i) => (
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
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const isToday = sameDay(d, today)
          const ev = eventsOnDay(events, d).slice(0, 3)
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelectDay(d)}
              className="group/d flex flex-col items-center gap-0.5 rounded-[7px] py-0.5 transition-colors hover:bg-[var(--surface-hover)]"
            >
              <span
                className="flex h-[20px] w-[20px] items-center justify-center rounded-full transition-transform group-hover/d:scale-110"
                style={{
                  fontSize: 11,
                  fontWeight: isToday ? 700 : 500,
                  background: isToday ? 'var(--accent)' : 'transparent',
                  color: isToday
                    ? 'var(--on-accent)'
                    : 'var(--text-secondary)',
                  boxShadow: isToday
                    ? '0 2px 8px color-mix(in srgb, var(--accent) 45%, transparent)'
                    : 'none',
                }}
              >
                {d.getDate()}
              </span>
              <div className="flex h-1 items-center gap-[2px]">
                {ev.map((e) => (
                  <span
                    key={e.id}
                    className="h-[3px] w-[3px] rounded-full"
                    style={{ background: COLORS[e.color] }}
                  />
                ))}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Week view ──────────────────────────────────────────────────────────────

function WeekView({
  cursor,
  today,
  events,
  onSelectDay,
}: {
  cursor: Date
  today: Date
  events: CalendarEvent[]
  onSelectDay: (d: Date) => void
}) {
  const { t } = useTranslation()
  // 7 days starting from the Sunday of the cursor week, as horizontal rows.
  const sunday = addDays(cursor, -cursor.getDay())
  const days = Array.from({ length: 7 }, (_, i) => addDays(sunday, i))
  return (
    <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
      {days.map((d) => {
        const isToday = sameDay(d, today)
        const isWeekend = d.getDay() === 0 || d.getDay() === 6
        const dayEvents = eventsOnDay(events, d)
        const ev = dayEvents.slice(0, 4)
        const extra = dayEvents.length - ev.length
        return (
          <button
            key={d.toISOString()}
            type="button"
            onClick={() => onSelectDay(d)}
            className={cn(
              'group/row relative flex min-h-[46px] items-center gap-2.5 overflow-hidden rounded-[10px] border px-2 py-1.5 text-left transition-all',
              isToday
                ? 'border-[var(--accent)] bg-[var(--accent-soft,var(--fill-2))]'
                : 'border-[var(--border)] bg-[var(--fill-1)] hover:border-[var(--border-strong)] hover:bg-[var(--fill-2)]',
            )}
          >
            {/* accent rail on today's row */}
            {isToday && (
              <span
                className="absolute left-0 top-0 h-full w-[3px]"
                style={{ background: 'var(--accent)' }}
              />
            )}
            {/* date column */}
            <div className="flex w-[36px] shrink-0 flex-col items-center gap-0.5">
              <span
                style={{
                  fontSize: 8.5,
                  fontWeight: 700,
                  letterSpacing: '0.5px',
                  color: isWeekend
                    ? 'var(--text-tertiary)'
                    : 'var(--text-secondary)',
                }}
              >
                {(weekdays('short')[d.getDay()] ?? '').toUpperCase()}
              </span>
              <span
                className="flex h-[22px] w-[22px] items-center justify-center rounded-full transition-transform group-hover/row:scale-105"
                style={{
                  fontSize: 12,
                  fontWeight: isToday ? 700 : 600,
                  background: isToday ? 'var(--accent)' : 'transparent',
                  color: isToday ? 'var(--on-accent)' : 'var(--text-primary)',
                  boxShadow: isToday
                    ? '0 2px 8px color-mix(in srgb, var(--accent) 45%, transparent)'
                    : 'none',
                }}
              >
                {d.getDate()}
              </span>
            </div>
            {/* divider */}
            <span className="h-7 w-px shrink-0 bg-[var(--border)]" />
            {/* events flow to the right */}
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              {ev.length === 0 ? (
                <span
                  className="italic text-[var(--text-tertiary)]"
                  style={{ fontSize: 10.5 }}
                >
                  {t('calendar.day.free')}
                </span>
              ) : (
                ev.map((e) => (
                  <span
                    key={e.id}
                    className="inline-flex max-w-full items-center gap-1 truncate rounded-[5px] px-1.5 py-[2px] text-[10px] font-medium text-white shadow-sm"
                    style={{ background: COLORS[e.color] }}
                  >
                    {e.title}
                  </span>
                ))
              )}
              {extra > 0 && (
                <span
                  className="rounded-[5px] bg-[var(--fill-3)] px-1.5 py-[2px] text-[var(--text-secondary)]"
                  style={{ fontSize: 9.5, fontWeight: 700 }}
                >
                  +{extra}
                </span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ─── Day view ───────────────────────────────────────────────────────────────

function DayView({
  cursor,
  today,
  events,
  onAdd,
  onEdit,
}: {
  cursor: Date
  today: Date
  events: CalendarEvent[]
  onAdd: () => void
  onEdit: (e: CalendarEvent) => void
}) {
  const { t } = useTranslation()
  const dayEvents = eventsOnDay(events, cursor)
  const isToday = sameDay(cursor, today)
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="mb-1.5 flex items-center justify-between">
        <span
          className="text-[var(--text-primary)]"
          style={{ fontSize: 12.5, fontWeight: 700 }}
        >
          {weekdays('short')[cursor.getDay()]}, {months('long')[cursor.getMonth()]}{' '}
          {cursor.getDate()}
          {isToday && (
            <span
              className="ml-1.5 rounded-[4px] px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide"
              style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
            >
              {t('calendar.day.today')}
            </span>
          )}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {dayEvents.length === 0 && (
          <div
            className="my-auto flex flex-col items-center gap-2 text-[var(--text-tertiary)]"
          >
            <CalendarDays size={22} strokeWidth={1.5} />
            <span style={{ fontSize: 11 }}>{t('calendar.day.noEvents')}</span>
            <button
              type="button"
              onClick={onAdd}
              className="mt-1 rounded-[8px] bg-[var(--accent)] px-3 py-1 text-[11px] font-semibold text-[var(--on-accent)]"
            >
              {t('calendar.day.addOne')}
            </button>
          </div>
        )}
        {dayEvents.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => onEdit(e)}
            className="flex items-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-2 py-1.5 text-left transition-colors hover:border-[var(--border-strong)]"
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: COLORS[e.color] }}
            />
            <div className="min-w-0 flex-1">
              <div
                className="truncate text-[var(--text-primary)]"
                style={{ fontSize: 12, fontWeight: 600 }}
              >
                {e.title}
              </div>
              <div
                className="text-[var(--text-tertiary)]"
                style={{ fontSize: 10.5 }}
              >
                {e.allDay ? t('calendar.allDay') : fmtTime(new Date(e.start))}
                {e.recurrence !== 'none' &&
                  ` · ${t(`calendar.repeat.${e.recurrence}`)}`}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Day popover (from month / week view) ──────────────────────────────────

function DayPopover({
  date,
  onClose,
  onNew,
  onEdit,
}: {
  date: Date
  onClose: () => void
  onNew: () => void
  onEdit: (e: CalendarEvent) => void
}) {
  const { t } = useTranslation()
  const events = useAllEvents()
  const list = eventsOnDay(events, date)
  return createPortal(
    <div
      data-hit
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)' }}
      onMouseDown={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        onMouseDown={(e) => e.stopPropagation()}
        className="glass flex max-h-[70vh] w-[340px] flex-col rounded-[14px] border border-[var(--border)] p-4"
      >
        <div className="mb-2 flex items-center justify-between">
          <span
            className="text-[var(--text-primary)]"
            style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.4px' }}
          >
            {weekdays('short')[date.getDay()]}, {months('long')[date.getMonth()]}{' '}
            {date.getDate()}
          </span>
          <Tooltip label={t('common.close')} side="bottom">
            <button
              type="button"
              onClick={onClose}
              className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              <X size={16} />
            </button>
          </Tooltip>
        </div>
        <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
          {list.length === 0 && (
            <div className="py-6 text-center text-[12px] text-[var(--text-tertiary)]">
              {t('calendar.popover.nothingScheduled')}
            </div>
          )}
          {list.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onEdit(e)}
              className="flex items-start gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-2.5 py-2 text-left transition-colors hover:border-[var(--border-strong)]"
            >
              <span
                className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: COLORS[e.color] }}
              />
              <div className="min-w-0 flex-1">
                <div
                  className="truncate text-[var(--text-primary)]"
                  style={{ fontSize: 13, fontWeight: 600 }}
                >
                  {e.title}
                </div>
                <div
                  className="text-[var(--text-tertiary)]"
                  style={{ fontSize: 11 }}
                >
                  {e.allDay ? t('calendar.allDay') : fmtTime(new Date(e.start))}
                  {e.recurrence !== 'none' &&
                    ` · ${t('calendar.popover.repeatsLabel', { repeat: t(`calendar.repeat.${e.recurrence}`) })}`}
                </div>
                {e.note && (
                  <div
                    className="mt-1 text-[var(--text-secondary)]"
                    style={{ fontSize: 11.5, lineHeight: 1.4 }}
                  >
                    {e.note}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onNew}
          className="mt-3 flex items-center justify-center gap-1.5 rounded-[8px] bg-[var(--accent)] py-2 text-[13px] font-semibold text-[var(--on-accent)] transition-transform hover:scale-[1.01]"
        >
          <Plus size={14} strokeWidth={2.4} />
          {t('calendar.popover.newEvent')}
        </button>
      </motion.div>
    </div>,
    document.body,
  )
}

// ─── Event editor modal ─────────────────────────────────────────────────────

function EventEditor({
  initial,
  onClose,
}: {
  initial: CalendarEvent | { dateHint: Date }
  onClose: () => void
}) {
  const { t } = useTranslation()
  const add = useEventsStore((s) => s.add)
  const update = useEventsStore((s) => s.update)
  const remove = useEventsStore((s) => s.remove)

  const isEditing = 'id' in initial
  const hint = !isEditing ? initial.dateHint : new Date(initial.start)

  const [title, setTitle] = useState(isEditing ? initial.title : '')
  const [date, setDate] = useState(hint.toISOString().slice(0, 10))
  const [time, setTime] = useState(
    isEditing
      ? new Date(initial.start).toTimeString().slice(0, 5)
      : '09:00',
  )
  const [allDay, setAllDay] = useState(isEditing ? initial.allDay : false)
  const [color, setColor] = useState<EventColor>(
    isEditing ? initial.color : 'blue',
  )
  const [note, setNote] = useState(isEditing ? initial.note || '' : '')
  const [recurrence, setRecurrence] = useState<Recurrence>(
    isEditing ? initial.recurrence : 'none',
  )
  const [until, setUntil] = useState(isEditing ? initial.until || '' : '')

  // Subscription events are read-only — show details, no editing.
  const isReadOnly = isEditing && !!(initial as CalendarEvent).readOnly
  if (isReadOnly) {
    const ev = initial as CalendarEvent
    const when = ev.allDay
      ? t('calendar.allDay')
      : new Date(ev.start).toLocaleString(dateLocale(), {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
    return createPortal(
      <div
        data-hit
        className="fixed inset-0 z-[10001] flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.45)' }}
        onMouseDown={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          onMouseDown={(e) => e.stopPropagation()}
          className="glass flex w-[360px] flex-col gap-2 rounded-[16px] border border-[var(--border)] p-5"
        >
          <div className="flex items-start justify-between gap-2">
            <h2
              className="text-[var(--text-primary)]"
              style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.5px' }}
            >
              {ev.title}
            </h2>
            <Tooltip label={t('common.close')} side="bottom">
              <button
                type="button"
                onClick={onClose}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              >
                <X size={18} />
              </button>
            </Tooltip>
          </div>
          <div className="text-[12.5px] text-[var(--text-secondary)]">{when}</div>
          {ev.note && (
            <p className="whitespace-pre-wrap text-[12.5px] text-[var(--text-secondary)]">
              {ev.note}
            </p>
          )}
          <div className="mt-1 text-[11px] text-[var(--text-tertiary)]">
            {t('calendar.editor.readOnly')}
          </div>
        </motion.div>
      </div>,
      document.body,
    )
  }

  const save = () => {
    const cleanTitle = title.trim() || t('calendar.editor.untitled')
    const start = allDay
      ? new Date(`${date}T00:00:00`).toISOString()
      : new Date(`${date}T${time}:00`).toISOString()
    const payload = {
      title: cleanTitle,
      start,
      allDay,
      color,
      note: note.trim() || undefined,
      recurrence,
      until: recurrence === 'none' ? undefined : until || undefined,
    }
    if (isEditing) update(initial.id, payload)
    else add(payload)
    onClose()
  }

  const del = () => {
    if (isEditing) remove(initial.id)
    onClose()
  }

  return createPortal(
    <div
      data-hit
      className="fixed inset-0 z-[10001] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)' }}
      onMouseDown={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        onMouseDown={(e) => e.stopPropagation()}
        className="glass flex w-[400px] flex-col gap-3 rounded-[16px] border border-[var(--border)] p-5"
      >
        <div className="flex items-center justify-between">
          <h2
            className="text-[var(--text-primary)]"
            style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.6px' }}
          >
            {isEditing ? t('calendar.editor.editTitle') : t('calendar.editor.newTitle')}
          </h2>
          <Tooltip label={t('common.close')} side="bottom">
            <button
              type="button"
              onClick={onClose}
              className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              <X size={18} />
            </button>
          </Tooltip>
        </div>

        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('calendar.editor.eventTitle')}
          className="rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-3 py-2 text-[13.5px] text-[var(--text-primary)] outline-none focus:border-[var(--border-strong)]"
        />

        <div className="flex gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1 rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none"
          />
          {!allDay && (
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-[110px] rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none"
            />
          )}
        </div>

        <label className="flex items-center gap-2 text-[12.5px] text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
          />
          {t('calendar.editor.allDayLabel')}
        </label>

        <div className="flex items-center gap-1.5">
          <span className="mr-1 text-[11.5px] font-medium text-[var(--text-tertiary)]">
            {t('calendar.editor.color')}
          </span>
          {COLOR_OPTIONS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={cn(
                'h-5 w-5 rounded-full border-2 transition-transform',
                color === c
                  ? 'scale-110 border-[var(--text-primary)]'
                  : 'border-transparent hover:scale-110',
              )}
              style={{ background: COLORS[c] }}
            />
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11.5px] font-medium text-[var(--text-tertiary)]">
            {t('calendar.editor.repeats')}
          </span>
          <div className="flex gap-2">
            <Menu<Recurrence>
              value={recurrence}
              options={[
                { value: 'none', label: t('calendar.repeat.none') },
                { value: 'daily', label: t('calendar.repeat.daily') },
                { value: 'weekly', label: t('calendar.repeat.weekly') },
                { value: 'monthly', label: t('calendar.repeat.monthly') },
                { value: 'yearly', label: t('calendar.repeat.yearly') },
              ]}
              onChange={setRecurrence}
              className="flex-1"
            />
            {recurrence !== 'none' && (
              <Tooltip label={t('calendar.editor.repeatUntil')}>
                <input
                  type="date"
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                  placeholder={t('calendar.editor.until')}
                  className="w-[150px] rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-2.5 py-1.5 text-[12.5px] text-[var(--text-primary)] outline-none"
                />
              </Tooltip>
            )}
          </div>
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('calendar.editor.notes')}
          rows={2}
          className="resize-none rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-[var(--border-strong)]"
        />

        <div className="mt-1 flex gap-2">
          <button
            type="button"
            onClick={save}
            className="flex-1 rounded-[8px] bg-[var(--accent)] py-2 text-[13px] font-semibold text-[var(--on-accent)] transition-transform hover:scale-[1.01]"
          >
            {isEditing ? t('calendar.editor.save') : t('calendar.editor.add')}
          </button>
          {isEditing && (
            <Tooltip label={t('calendar.editor.delete')}>
              <button
                type="button"
                onClick={del}
                className="rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-3 py-2 text-[var(--danger)] transition-colors hover:bg-[var(--fill-2)]"
              >
                <Trash2 size={15} />
              </button>
            </Tooltip>
          )}
        </div>
      </motion.div>
    </div>,
    document.body,
  )
}

// ─── Main renderer ──────────────────────────────────────────────────────────

function CalendarRenderer() {
  const { t } = useTranslation()
  const events = useAllEvents()
  const today = useMemo(() => startOfDay(new Date()), [])
  const [view, setView] = useState<ViewKind>('month')
  const [cursor, setCursor] = useState<Date>(today)
  const [openDay, setOpenDay] = useState<Date | null>(null)
  const [editing, setEditing] = useState<
    CalendarEvent | { dateHint: Date } | null
  >(null)

  const headerTitle = useMemo(() => {
    if (view === 'month') return `${months('long')[cursor.getMonth()]} ${cursor.getFullYear()}`
    if (view === 'week') {
      const sunday = addDays(cursor, -cursor.getDay())
      const sat = addDays(sunday, 6)
      const sameMonth = sunday.getMonth() === sat.getMonth()
      const a = months('long')[sunday.getMonth()] ?? ''
      const b = months('long')[sat.getMonth()] ?? ''
      return sameMonth
        ? `${a.slice(0, 3)} ${sunday.getDate()}–${sat.getDate()}`
        : `${a.slice(0, 3)} ${sunday.getDate()} – ${b.slice(0, 3)} ${sat.getDate()}`
    }
    return `${months('long')[cursor.getMonth()]} ${cursor.getDate()}`
  }, [view, cursor])

  const shift = (dir: -1 | 1) => {
    if (view === 'month') {
      const c = new Date(cursor)
      c.setMonth(c.getMonth() + dir)
      c.setDate(1)
      setCursor(c)
    } else if (view === 'week') {
      setCursor(addDays(cursor, dir * 7))
    } else {
      setCursor(addDays(cursor, dir))
    }
  }

  const goToday = () => setCursor(today)

  const onNewForDate = (d: Date) => {
    setOpenDay(null)
    setEditing({ dateHint: d })
  }

  return (
    <div className="glass flex h-full w-full flex-col overflow-hidden rounded-[12px] border border-[var(--border)] p-3">
      <div className="mb-2 flex items-center justify-between gap-1">
        <Tooltip label={t('calendar.nav.previous')} side="bottom">
          <button
            type="button"
            onClick={() => shift(-1)}
            className="rounded-[6px] p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          >
            <ChevronLeft size={15} />
          </button>
        </Tooltip>
        <Tooltip label={t('calendar.nav.jumpToToday')} side="bottom" className="flex-1">
          <button
            type="button"
            onClick={goToday}
            className="flex-1 truncate text-center text-[var(--text-primary)] transition-opacity hover:opacity-70"
            style={{ fontSize: 12.5, fontWeight: 700 }}
          >
            {headerTitle}
          </button>
        </Tooltip>
        <Tooltip label={t('calendar.nav.next')} side="bottom">
          <button
            type="button"
            onClick={() => shift(1)}
            className="rounded-[6px] p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          >
            <ChevronRight size={15} />
          </button>
        </Tooltip>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-0.5 rounded-[7px] bg-[var(--fill-1)] p-0.5">
          {(['month', 'week', 'day'] as ViewKind[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                'rounded-[5px] px-2 py-0.5 text-[10.5px] font-semibold capitalize transition-all',
                view === v
                  ? 'bg-[var(--surface)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
              )}
            >
              {t(`calendar.view.${v}`)}
            </button>
          ))}
        </div>
        <Tooltip label={t('calendar.popover.newEvent')}>
          <button
            type="button"
            onClick={() => setEditing({ dateHint: cursor })}
            className="flex h-6 w-6 items-center justify-center rounded-[6px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          >
            <Plus size={14} strokeWidth={2.2} />
          </button>
        </Tooltip>
      </div>

      {view === 'month' && (
        <MonthView
          cursor={cursor}
          today={today}
          events={events}
          onSelectDay={(d) => setOpenDay(d)}
        />
      )}
      {view === 'week' && (
        <WeekView
          cursor={cursor}
          today={today}
          events={events}
          onSelectDay={(d) => setOpenDay(d)}
        />
      )}
      {view === 'day' && (
        <DayView
          cursor={cursor}
          today={today}
          events={events}
          onAdd={() => setEditing({ dateHint: cursor })}
          onEdit={(e) => setEditing(e)}
        />
      )}

      <AnimatePresence>
        {openDay && (
          <DayPopover
            date={openDay}
            onClose={() => setOpenDay(null)}
            onNew={() => onNewForDate(openDay)}
            onEdit={(e) => {
              setOpenDay(null)
              setEditing(e)
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editing && (
          <EventEditor initial={editing} onClose={() => setEditing(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}

// Manage external calendar subscriptions (.ics URLs). Shown in the widget's
// settings popover. Sources are global (shared across calendar widgets).
function CalendarSettings() {
  const { t } = useTranslation()
  const sources = useCalendarSourcesStore((s) => s.sources)
  const addSource = useCalendarSourcesStore((s) => s.addSource)
  const updateSource = useCalendarSourcesStore((s) => s.updateSource)
  const removeSource = useCalendarSourcesStore((s) => s.removeSource)
  const setExt = useEventsStore((s) => s.setExternalEventsForSource)
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [color, setColor] = useState<EventColor>('violet')
  const [err, setErr] = useState('')

  const input =
    'rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-2.5 py-1.5 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-[var(--border-strong)]'

  const add = () => {
    const u = url.trim()
    if (!/^(https?|webcal):\/\//i.test(u)) {
      setErr(t('calendar.settings.invalidLink'))
      return
    }
    addSource({ label: label.trim() || t('calendar.settings.defaultName'), url: u, color, enabled: true })
    setUrl('')
    setLabel('')
    setErr('')
  }

  return (
    <div className="flex w-[284px] flex-col gap-3">
      <div className="text-[12px] font-semibold text-[var(--text-secondary)]">
        {t('calendar.settings.title')}
      </div>
      {sources.length === 0 && (
        <div className="text-[11.5px] leading-relaxed text-[var(--text-tertiary)]">
          {t('calendar.settings.instructions')}
        </div>
      )}
      {sources.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {sources.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded-[8px] bg-[var(--fill-1)] px-2 py-1.5"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: COLORS[s.color] }}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] text-[var(--text-primary)]">
                  {s.label}
                </div>
                {s.lastError ? (
                  <div className="truncate text-[10px] text-[var(--danger)]">
                    {t('calendar.settings.loadFailed')}
                  </div>
                ) : s.lastFetched ? (
                  <div className="truncate text-[10px] text-[var(--text-tertiary)]">
                    {t('calendar.settings.synced')}
                  </div>
                ) : null}
              </div>
              <Tooltip label={s.enabled ? t('calendar.settings.disable') : t('calendar.settings.enable')} side="top">
                <button
                  type="button"
                  onClick={() => updateSource(s.id, { enabled: !s.enabled })}
                  className={cn(
                    'rounded-[6px] px-1.5 py-0.5 text-[10px] font-medium',
                    s.enabled
                      ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                      : 'bg-[var(--fill-2)] text-[var(--text-tertiary)]',
                  )}
                >
                  {s.enabled ? t('calendar.settings.on') : t('calendar.settings.off')}
                </button>
              </Tooltip>
              <Tooltip label={t('calendar.settings.removeCalendar')} side="top">
                <button
                  type="button"
                  onClick={() => {
                    removeSource(s.id)
                    setExt(s.id, [])
                  }}
                  className="text-[var(--text-tertiary)] hover:text-[var(--danger)]"
                >
                  <Trash2 size={13} />
                </button>
              </Tooltip>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-1.5 border-t border-[var(--border)] pt-2.5">
        <input
          className={input}
          placeholder={t('calendar.settings.namePlaceholder')}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <input
          className={input}
          placeholder={t('calendar.settings.urlPlaceholder')}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <div className="flex items-center gap-1.5">
          {COLOR_OPTIONS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={cn(
                'h-5 w-5 rounded-full transition-transform',
                color === c
                  ? 'ring-2 ring-[var(--text-primary)] ring-offset-1 ring-offset-[var(--surface)]'
                  : 'hover:scale-110',
              )}
              style={{ background: COLORS[c] }}
            />
          ))}
          <button
            type="button"
            onClick={add}
            className="ml-auto rounded-[8px] bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-[var(--on-accent)]"
          >
            {t('calendar.settings.add')}
          </button>
        </div>
        {err && <span className="text-[11px] text-[var(--danger)]">{err}</span>}
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
  maxSize: { width: 560, height: 520 },
  create: (x, y) => ({
    type: 'calendar',
    x,
    y,
    width: 320,
    height: 320,
    locked: false,
  }),
  Renderer: CalendarRenderer,
  Settings: CalendarSettings,
}
