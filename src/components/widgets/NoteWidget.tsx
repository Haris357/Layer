import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  StickyNote,
  Type,
  Play,
  Pause,
  Sun,
  Moon,
  Maximize2,
  Minimize2,
  FilePlus2,
  History as HistoryIcon,
  X,
  Shuffle,
  Hexagon,
  Pin,
  Pencil,
  Trash2,
} from 'lucide-react'
import type { NoteWidget as NoteWidgetType } from '../../types/widget'
import { useCanvasStore } from '../../store/canvasStore'
import { useJournalStore } from '../../store/journalStore'
import { cn } from '../../lib/utils'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

const SIZES = [16, 18, 20, 22, 24, 26]

const FONTS: { label: string; value: string }[] = [
  { label: 'System', value: 'system-ui, sans-serif' },
  { label: 'Lato', value: "'Lato', sans-serif" },
  { label: 'Serif', value: 'Georgia, serif' },
  { label: 'Lora', value: "'Lora', serif" },
  { label: 'Merriweather', value: "'Merriweather', serif" },
  { label: 'Playfair', value: "'Playfair Display', serif" },
  { label: 'Source Serif', value: "'Source Serif 4', serif" },
]

const TIMER_TOTAL = 15 * 60
const spring = { type: 'spring', stiffness: 420, damping: 36 } as const

function retroSeq(notes: { f: number; t: number; d: number }[]): void {
  try {
    const ctx = new AudioContext()
    const now = ctx.currentTime
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 2400
    filter.Q.value = 0.7
    filter.connect(ctx.destination)
    notes.forEach((n) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(filter)
      osc.type = 'triangle'
      osc.frequency.value = n.f
      const t = now + n.t
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.linearRampToValueAtTime(0.34, t + 0.016)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + n.d)
      osc.start(t)
      osc.stop(t + n.d + 0.05)
    })
    const total = notes.reduce((m, n) => Math.max(m, n.t + n.d), 0)
    window.setTimeout(() => ctx.close(), (total + 0.4) * 1000)
  } catch {
    /* audio unavailable */
  }
}

const SOUND = {
  timerStart: () =>
    retroSeq([
      { f: 523, t: 0, d: 0.14 },
      { f: 659, t: 0.1, d: 0.14 },
      { f: 784, t: 0.2, d: 0.26 },
    ]),
  timerEnd: () =>
    retroSeq([
      { f: 784, t: 0, d: 0.13 },
      { f: 659, t: 0.14, d: 0.13 },
      { f: 523, t: 0.28, d: 0.13 },
      { f: 784, t: 0.42, d: 0.32 },
    ]),
  lightOn: () =>
    retroSeq([
      { f: 587, t: 0, d: 0.1 },
      { f: 880, t: 0.08, d: 0.22 },
    ]),
  lightOff: () =>
    retroSeq([
      { f: 587, t: 0, d: 0.1 },
      { f: 392, t: 0.08, d: 0.22 },
    ]),
}

function fmt(total: number): string {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

interface Theme {
  bg: string
  panel: string
  fg: string
  sub: string
  line: string
  hover: string
  active: string
  tipBg: string
  tipFg: string
}

const THEMES: Record<'dark' | 'light', Theme> = {
  dark: {
    bg: '#161617',
    panel: '#202022',
    fg: 'rgba(255,255,255,0.92)',
    sub: 'rgba(255,255,255,0.42)',
    line: 'rgba(255,255,255,0.09)',
    hover: 'rgba(255,255,255,0.08)',
    active: 'rgba(255,255,255,0.96)',
    tipBg: '#000000',
    tipFg: 'rgba(255,255,255,0.95)',
  },
  light: {
    bg: '#f4f2ea',
    panel: '#ffffff',
    fg: '#262420',
    sub: 'rgba(0,0,0,0.45)',
    line: 'rgba(0,0,0,0.1)',
    hover: 'rgba(0,0,0,0.055)',
    active: '#161514',
    tipBg: '#262420',
    tipFg: '#f4f2ea',
  },
}

function IconBtn({
  tip,
  active,
  danger,
  theme,
  onClick,
  children,
}: {
  tip: string
  active?: boolean
  danger?: boolean
  theme: Theme
  onClick: () => void
  children: ReactNode
}) {
  const [hover, setHover] = useState(false)
  return (
    <div className="relative flex justify-center">
      <motion.button
        type="button"
        whileTap={{ scale: 0.88 }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="flex h-9 min-w-9 items-center justify-center rounded-[10px] px-1.5 text-[11px] font-semibold transition-colors duration-150"
        style={{
          color: danger
            ? 'var(--danger)'
            : active
              ? theme.active
              : theme.sub,
          background: active || hover ? theme.hover : 'transparent',
        }}
      >
        {children}
      </motion.button>
      <AnimatePresence>
        {hover && (
          <motion.span
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none absolute left-full top-1/2 z-[60] ml-2 -translate-y-1/2 whitespace-nowrap rounded-[6px] px-2 py-1 text-[11px] font-medium"
            style={{ background: theme.tipBg, color: theme.tipFg }}
          >
            {tip}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )
}

function Journal({
  widget,
  fullscreen,
  onSetFullscreen,
}: {
  widget: NoteWidgetType
  fullscreen: boolean
  onSetFullscreen: (v: boolean) => void
}) {
  const updateWidget = useCanvasStore((s) => s.updateWidget)
  const entries = useJournalStore((s) => s.entries)
  const hydrated = useJournalStore((s) => s.hydrated)
  const addEntry = useJournalStore((s) => s.addEntry)
  const updateEntry = useJournalStore((s) => s.updateEntry)
  const deleteEntry = useJournalStore((s) => s.deleteEntry)
  const renameEntry = useJournalStore((s) => s.renameEntry)
  const togglePin = useJournalStore((s) => s.togglePin)

  const [fontMenu, setFontMenu] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [timerLeft, setTimerLeft] = useState(TIMER_TOTAL)
  const [timerOn, setTimerOn] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  const c = THEMES[widget.theme === 'light' ? 'light' : 'dark']

  useEffect(() => {
    if (!hydrated) return
    const exists = entries.some((e) => e.id === widget.activeEntryId)
    if (exists) return
    if (entries.length > 0) {
      const latest = [...entries].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      )[0]
      if (latest) updateWidget(widget.id, { activeEntryId: latest.id })
    } else {
      const id = addEntry()
      updateWidget(widget.id, { activeEntryId: id })
    }
  }, [hydrated, entries, widget.activeEntryId, widget.id, addEntry, updateWidget])

  useEffect(() => {
    if (!timerOn) return
    const id = window.setInterval(() => {
      setTimerLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(id)
          setTimerOn(false)
          SOUND.timerEnd()
          return TIMER_TOTAL
        }
        return prev - 1
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [timerOn])

  const active = entries.find((e) => e.id === widget.activeEntryId) ?? null

  const selectEntry = (id: string) => {
    setSwitching(true)
    updateWidget(widget.id, { activeEntryId: id })
    setShowHistory(false)
    window.setTimeout(() => setSwitching(false), 300)
  }

  const newEntry = () => {
    const id = addEntry()
    selectEntry(id)
  }

  const sorted = [...entries].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
    return b.updatedAt.localeCompare(a.updatedAt)
  })

  const commitRename = () => {
    if (renamingId) renameEntry(renamingId, renameDraft)
    setRenamingId(null)
  }

  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

  return (
    <div
      className={cn(
        'flex h-full w-full overflow-hidden',
        fullscreen ? 'rounded-none' : 'rounded-[14px]',
      )}
      style={{ background: c.bg, fontFamily: "'Inter', sans-serif" }}
    >
      <div
        className="flex shrink-0 flex-col items-center gap-1 border-r py-2.5"
        style={{ borderColor: c.line, width: 50 }}
      >
        <div
          className="layer-drag-handle layer-grab mb-1 flex flex-col items-center gap-[3px] py-1"
          title="Drag to move"
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-[3px] w-[3px] rounded-full"
              style={{ background: c.sub }}
            />
          ))}
        </div>

        <div className="relative">
          <IconBtn
            tip="Typeface & size"
            active={fontMenu}
            theme={c}
            onClick={() => setFontMenu((v) => !v)}
          >
            <Type size={17} strokeWidth={1.7} />
          </IconBtn>
          <AnimatePresence>
            {fontMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.92, x: -6 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.92, x: -6 }}
                transition={spring}
                onMouseDown={stop}
                className="absolute left-full top-0 z-[60] ml-2 w-[208px] rounded-[12px] border p-2.5 shadow-xl"
                style={{ background: c.panel, borderColor: c.line }}
              >
                <div
                  className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-wide"
                  style={{ color: c.sub }}
                >
                  Size
                </div>
                <div className="mb-3 flex flex-wrap gap-1">
                  {SIZES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => updateWidget(widget.id, { fontSize: s })}
                      className="rounded-[7px] px-2 py-1 text-[12px] font-semibold transition-colors"
                      style={{
                        color:
                          s === widget.fontSize ? c.active : c.sub,
                        background:
                          s === widget.fontSize ? c.hover : 'transparent',
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <div
                  className="mb-1.5 flex items-center justify-between px-1"
                >
                  <span
                    className="text-[10px] font-bold uppercase tracking-wide"
                    style={{ color: c.sub }}
                  >
                    Typeface
                  </span>
                  <button
                    type="button"
                    title="Random font"
                    onClick={() => {
                      const pick =
                        FONTS[3 + Math.floor(Math.random() * (FONTS.length - 3))]
                      if (pick) updateWidget(widget.id, { font: pick.value })
                    }}
                    style={{ color: c.sub }}
                  >
                    <Shuffle size={13} />
                  </button>
                </div>
                <div className="flex flex-col">
                  {FONTS.map((f) => (
                    <button
                      key={f.label}
                      type="button"
                      onClick={() => updateWidget(widget.id, { font: f.value })}
                      className="rounded-[7px] px-2 py-1.5 text-left text-[13px] transition-colors"
                      style={{
                        fontFamily: f.value,
                        color: f.value === widget.font ? c.active : c.fg,
                        fontWeight: f.value === widget.font ? 700 : 400,
                        background:
                          f.value === widget.font ? c.hover : 'transparent',
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <IconBtn
          tip={timerOn ? 'Pause timer' : '15-minute timer'}
          active={timerOn}
          theme={c}
          onClick={() => {
            if (!timerOn) SOUND.timerStart()
            setTimerOn((v) => !v)
          }}
        >
          {timerOn || timerLeft !== TIMER_TOTAL ? (
            <span className="tabular-nums">{fmt(timerLeft)}</span>
          ) : (
            <Play size={16} strokeWidth={1.8} />
          )}
        </IconBtn>
        {timerOn && (
          <IconBtn
            tip="Reset timer"
            theme={c}
            onClick={() => {
              setTimerOn(false)
              setTimerLeft(TIMER_TOTAL)
            }}
          >
            <Pause size={15} strokeWidth={1.8} />
          </IconBtn>
        )}

        <IconBtn
          tip={widget.theme === 'light' ? 'Dark mode' : 'Light mode'}
          theme={c}
          onClick={() => {
            const next = widget.theme === 'light' ? 'dark' : 'light'
            if (next === 'light') SOUND.lightOn()
            else SOUND.lightOff()
            updateWidget(widget.id, { theme: next })
          }}
        >
          {widget.theme === 'light' ? (
            <Moon size={16} strokeWidth={1.8} />
          ) : (
            <Sun size={16} strokeWidth={1.8} />
          )}
        </IconBtn>

        <IconBtn tip="Buddy" theme={c} onClick={() => {}}>
          <Hexagon size={16} strokeWidth={1.8} />
        </IconBtn>

        <div className="flex-1" />

        <IconBtn
          tip={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          theme={c}
          onClick={() => onSetFullscreen(!fullscreen)}
        >
          {fullscreen ? (
            <Minimize2 size={16} strokeWidth={1.8} />
          ) : (
            <Maximize2 size={16} strokeWidth={1.8} />
          )}
        </IconBtn>

        <IconBtn tip="New entry" theme={c} onClick={newEntry}>
          <FilePlus2 size={16} strokeWidth={1.8} />
        </IconBtn>

        <IconBtn
          tip="Past entries"
          active={showHistory}
          theme={c}
          onClick={() => setShowHistory((v) => !v)}
        >
          <HistoryIcon size={16} strokeWidth={1.8} />
        </IconBtn>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {switching ? (
            <motion.div
              key="skeleton"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="flex h-full w-full flex-col gap-3 px-9 py-8"
            >
              {[92, 78, 86, 64, 70].map((w, i) => (
                <div
                  key={i}
                  className="layer-shimmer h-3.5 rounded-full"
                  style={{ width: `${w}%` }}
                />
              ))}
            </motion.div>
          ) : (
            <motion.textarea
              key={active?.id ?? 'none'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              value={active?.content ?? ''}
              onMouseDown={stop}
              onChange={(e) => {
                if (active) updateEntry(active.id, e.target.value)
              }}
              placeholder="Begin writing"
              spellCheck
              className="h-full w-full resize-none bg-transparent px-9 py-8 outline-none placeholder:opacity-40"
              style={{
                color: c.fg,
                fontFamily: widget.font,
                fontSize: widget.fontSize,
                lineHeight: 1.75,
              }}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showHistory && (
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={spring}
              onMouseDown={stop}
              className="absolute right-0 top-0 flex h-full w-[268px] flex-col border-l"
              style={{ background: c.panel, borderColor: c.line }}
            >
              <div
                className="flex items-center justify-between border-b px-4 py-3"
                style={{ borderColor: c.line }}
              >
                <span style={{ color: c.fg, fontSize: 14, fontWeight: 700 }}>
                  Entries
                </span>
                <button
                  type="button"
                  onClick={() => setShowHistory(false)}
                  style={{ color: c.sub }}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto py-1">
                {sorted.map((e, i) => {
                  const preview = e.content.trim().replace(/\s+/g, ' ')
                  const label =
                    e.title ||
                    new Date(e.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })
                  const renaming = renamingId === e.id
                  return (
                    <motion.div
                      key={e.id}
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.025, ...spring }}
                      className="group/e relative flex items-center gap-1 pl-3 pr-1.5"
                      style={{
                        background:
                          e.id === widget.activeEntryId
                            ? c.hover
                            : 'transparent',
                      }}
                    >
                      {renaming ? (
                        <input
                          autoFocus
                          value={renameDraft}
                          onChange={(ev) => setRenameDraft(ev.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(ev) => {
                            if (ev.key === 'Enter') commitRename()
                            if (ev.key === 'Escape') setRenamingId(null)
                          }}
                          placeholder="Entry title"
                          className="my-2 min-w-0 flex-1 rounded-[6px] px-2 py-1 text-[13px] outline-none"
                          style={{
                            background: c.hover,
                            color: c.fg,
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => selectEntry(e.id)}
                          className="flex min-w-0 flex-1 flex-col gap-0.5 py-2.5 text-left"
                        >
                          <span className="flex items-center gap-1">
                            {e.pinned && (
                              <Pin
                                size={9}
                                fill="currentColor"
                                style={{ color: c.sub }}
                              />
                            )}
                            <span
                              className="truncate"
                              style={{
                                color: c.fg,
                                fontSize: 13,
                                fontWeight: 600,
                              }}
                            >
                              {label}
                            </span>
                          </span>
                          <span
                            className="truncate"
                            style={{ color: c.sub, fontSize: 12 }}
                          >
                            {preview ? preview.slice(0, 42) : 'Empty entry'}
                          </span>
                        </button>
                      )}
                      {!renaming && (
                        <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover/e:opacity-100">
                          <button
                            type="button"
                            title={e.pinned ? 'Unpin' : 'Pin'}
                            onClick={() => togglePin(e.id)}
                            className="rounded-[6px] p-1.5"
                            style={{ color: e.pinned ? c.fg : c.sub }}
                          >
                            <Pin size={12} />
                          </button>
                          <button
                            type="button"
                            title="Rename"
                            onClick={() => {
                              setRenamingId(e.id)
                              setRenameDraft(e.title ?? '')
                            }}
                            className="rounded-[6px] p-1.5"
                            style={{ color: c.sub }}
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            title="Delete"
                            onClick={() => deleteEntry(e.id)}
                            className="rounded-[6px] p-1.5"
                            style={{ color: c.sub }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </motion.div>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function NoteRenderer({ widget }: { widget: NoteWidgetType }) {
  const [fullscreen, setFullscreen] = useState(false)

  if (fullscreen) {
    return createPortal(
      <motion.div
        data-hit
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-[9500]"
      >
        <Journal widget={widget} fullscreen onSetFullscreen={setFullscreen} />
      </motion.div>,
      document.body,
    )
  }

  return (
    <Journal
      widget={widget}
      fullscreen={false}
      onSetFullscreen={setFullscreen}
    />
  )
}

export const noteDefinition: WidgetDefinition<NoteWidgetType> = {
  type: 'note',
  label: 'Note',
  icon: StickyNote,
  enabled: true,
  minSize: { width: 380, height: 300 },
  create: (x, y) => ({
    type: 'note',
    x,
    y,
    width: 640,
    height: 460,
    locked: false,
    activeEntryId: null,
    fontSize: 18,
    font: 'system-ui, sans-serif',
    theme: 'dark',
  }),
  Renderer: NoteRenderer,
}
