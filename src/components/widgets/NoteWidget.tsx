import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type KeyboardEvent as ReactKeyboardEvent,
  type SyntheticEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import {
  NotebookPen,
  Type,
  Sun,
  Moon,
  Maximize2,
  Minimize2,
  FilePlus2,
  History as HistoryIcon,
  X,
  Shuffle,
  Pin,
  Pencil,
  Trash2,
  Feather,
} from 'lucide-react'
import type { NoteWidget as NoteWidgetType } from '../../types/widget'
import { useCanvasStore } from '../../store/canvasStore'
import { useJournalStore } from '../../store/journalStore'
import { cn } from '../../lib/utils'
import { notify } from '../../lib/notify'
import { playSfx } from '../../lib/sfx'
import { fireConfetti } from '../../lib/confetti'
import { useToastStore } from '../../store/toastStore'
import { useUncontrolledText } from '../../hooks/useUncontrolledText'
import { Tooltip } from '../Tooltip'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

const FONTS: { label: string; value: string }[] = [
  { label: 'System', value: 'system-ui, sans-serif' },
  { label: 'Inter', value: "'Inter', sans-serif" },
  { label: 'Lato', value: "'Lato', sans-serif" },
  { label: 'Serif', value: 'Georgia, serif' },
  { label: 'Lora', value: "'Lora', serif" },
  { label: 'Merriweather', value: "'Merriweather', serif" },
  { label: 'Playfair', value: "'Playfair Display', serif" },
  { label: 'Source Serif', value: "'Source Serif 4', serif" },
  { label: 'EB Garamond', value: "'EB Garamond', serif" },
  { label: 'IBM Plex Serif', value: "'IBM Plex Serif', serif" },
  { label: 'Newsreader', value: "'Newsreader', serif" },
  { label: 'Crimson Pro', value: "'Crimson Pro', serif" },
  { label: 'Caveat', value: "'Caveat', cursive" },
  { label: 'JetBrains Mono', value: "'JetBrains Mono', monospace" },
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

// The completion chime is still synthesized (no recorded file for it); the
// start/pause and light/dark sounds now use the recorded effects via playSfx.
const SOUND = {
  timerEnd: () =>
    retroSeq([
      { f: 784, t: 0, d: 0.13 },
      { f: 659, t: 0.14, d: 0.13 },
      { f: 523, t: 0.28, d: 0.13 },
      { f: 784, t: 0.42, d: 0.32 },
    ]),
}

function fmt(total: number): string {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function wordCount(text: string): number {
  const t = text.trim()
  return t ? t.split(/\s+/).length : 0
}

// Freewriting session lengths, in minutes.
const FREEWRITE_PRESETS = [5, 10, 15, 20] as const

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

// The editable surface, isolated into its own component so that each keystroke
// only re-renders this textarea — not the whole Journal (toolbar, history, HUD).
// Typing stays in fast local state; the journal store is updated on a debounce.
function NoteEditor({
  entryId,
  content,
  freewrite,
  fontFamily,
  fontSize,
  color,
  editorRef,
  onMouseDown,
  onKeyDown,
  onCaret,
}: {
  entryId: string
  content: string
  freewrite: boolean
  fontFamily: string
  fontSize: number
  color: string
  editorRef: RefObject<HTMLTextAreaElement>
  onMouseDown: (e: { stopPropagation: () => void }) => void
  onKeyDown: (e: ReactKeyboardEvent<HTMLTextAreaElement>) => void
  onCaret: (e: SyntheticEvent<HTMLTextAreaElement>) => void
}) {
  const { t } = useTranslation()
  const updateEntry = useJournalStore((s) => s.updateEntry)
  const { syncKey, onChange } = useUncontrolledText(
    content,
    (v) => updateEntry(entryId, v),
    { ref: editorRef },
  )
  return (
    <textarea
      key={syncKey}
      ref={editorRef}
      defaultValue={content}
      onMouseDown={onMouseDown}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onSelect={onCaret}
      onClick={onCaret}
      onCut={(e) => {
        if (freewrite) e.preventDefault()
      }}
      placeholder={t('note.editor.placeholder')}
      spellCheck
      className={cn(
        'h-full w-full resize-none bg-transparent px-9 py-8 outline-none placeholder:opacity-40',
        freewrite && 'pt-16',
      )}
      style={{
        color,
        caretColor: color,
        fontFamily,
        fontSize,
        lineHeight: 1.75,
        WebkitFontSmoothing: 'antialiased',
      }}
    />
  )
}

function Journal({ widget }: { widget: NoteWidgetType }) {
  const { t } = useTranslation()
  const updateWidget = useCanvasStore((s) => s.updateWidget)
  const entries = useJournalStore((s) => s.entries)
  const hydrated = useJournalStore((s) => s.hydrated)
  const addEntry = useJournalStore((s) => s.addEntry)
  const updateEntry = useJournalStore((s) => s.updateEntry)
  const deleteEntry = useJournalStore((s) => s.deleteEntry)
  const renameEntry = useJournalStore((s) => s.renameEntry)
  const togglePin = useJournalStore((s) => s.togglePin)
  const markFreewrite = useJournalStore((s) => s.markFreewrite)

  // Fullscreen lives here (not in the parent) so the render tree relocating
  // into a portal doesn't unmount Journal — the timer/freewrite state survives
  // toggling fullscreen.
  const [fullscreen, setFullscreen] = useState(false)
  // How far the desktop window extends behind the taskbar, so fullscreen
  // controls don't slip under it.
  const [bottomInset, setBottomInset] = useState(0)
  useEffect(() => {
    if (!fullscreen) {
      setBottomInset(0)
      return
    }
    const calc = () =>
      setBottomInset(
        Math.max(0, Math.round(window.innerHeight - window.screen.availHeight)),
      )
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [fullscreen])

  const [fontMenu, setFontMenu] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [timerLeft, setTimerLeft] = useState(TIMER_TOTAL)
  const [timerOn, setTimerOn] = useState(false)
  // The countdown's full length (varies for freewrite sessions); used for
  // reset and progress. The plain focus timer keeps TIMER_TOTAL.
  const [timerDuration, setTimerDuration] = useState(TIMER_TOTAL)
  // Wall-clock anchor: the timestamp the countdown should reach zero. Driving
  // the display off this (not a decrementing counter) keeps it accurate even
  // when the interval is throttled — e.g. the widget is occluded by a
  // fullscreen app or the machine was briefly busy/asleep.
  const timerEndRef = useRef<number | null>(null)
  // Freewriting: an append-only, no-backspace session for a fixed time.
  const [freewrite, setFreewrite] = useState(false)
  const [fwMenu, setFwMenu] = useState(false)
  const [showIntro, setShowIntro] = useState(false)
  const editorRef = useRef<HTMLTextAreaElement>(null)
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

  // Anchor the end time whenever the timer starts/resumes; clear it on pause.
  useEffect(() => {
    timerEndRef.current = timerOn ? Date.now() + timerLeft * 1000 : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerOn])

  useEffect(() => {
    if (!timerOn) return
    const tick = () => {
      const end = timerEndRef.current
      if (end == null) return
      const rem = Math.round((end - Date.now()) / 1000)
      if (rem <= 0) {
        timerEndRef.current = null
        setTimerOn(false)
        setTimerLeft(timerDuration)
        setFreewrite(false)
        setShowIntro(false)
        SOUND.timerEnd()
        fireConfetti()
        const activeId = widget.activeEntryId
        // Read the live editor value (the buffered draft may not be committed
        // yet) and flush it so the saved entry has every word.
        const content =
          editorRef.current?.value ??
          useJournalStore.getState().entries.find((e) => e.id === activeId)
            ?.content ??
          ''
        if (activeId) updateEntry(activeId, content)
        const words = wordCount(content)
        const mins = Math.round(timerDuration / 60)
        if (activeId) markFreewrite(activeId)
        useToastStore.getState().showToast({
          message: t('note.freewrite.doneToast', { words, mins }),
          icon: 'focus',
          duration: 7000,
        })
        notify({
          kind: 'timer',
          title: t('note.freewrite.completeTitle'),
          body: t('note.freewrite.completeBody', { words, mins }),
        })
        return
      }
      setTimerLeft(rem)
    }
    tick()
    const id = window.setInterval(tick, 250)
    // Snap to the correct value the instant the widget is shown again.
    const onVisible = () => {
      if (!document.hidden) tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [timerOn, timerDuration, widget.activeEntryId, markFreewrite, updateEntry, t])

  // Close any open popovers (font menu, history) when the click lands
  // outside this note widget.
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!fontMenu && !showHistory && !fwMenu) return
    const onDown = (e: MouseEvent) => {
      const el = containerRef.current
      if (el && !el.contains(e.target as Node)) {
        setFontMenu(false)
        setShowHistory(false)
        setFwMenu(false)
      }
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [fontMenu, showHistory, fwMenu])

  // Begin a freewriting session: go fullscreen, show a brief intro, then
  // start the countdown only once the intro has faded out.
  const startFreewrite = (minutes: number) => {
    const dur = minutes * 60
    setFwMenu(false)
    // Always begin on a fresh entry so the session starts from a blank page.
    const id = addEntry()
    updateWidget(widget.id, { activeEntryId: id })
    setTimerDuration(dur)
    setTimerLeft(dur)
    setFreewrite(true)
    setShowIntro(true)
    setFullscreen(true)
    playSfx('timer')
    // Fade the intro, then begin the timer once it's fully gone.
    window.setTimeout(() => setShowIntro(false), 2400)
    window.setTimeout(() => setTimerOn(true), 3100)
  }

  const endFreewrite = () => {
    timerEndRef.current = null
    setFreewrite(false)
    setShowIntro(false)
    setTimerOn(false)
    setTimerLeft(timerDuration)
  }

  // Focus the editor the moment the intro clears, so the user can write.
  useEffect(() => {
    if (freewrite && !showIntro) editorRef.current?.focus()
  }, [freewrite, showIntro])

  // While freewriting, Esc ends the session early.
  useEffect(() => {
    if (!freewrite) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        endFreewrite()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freewrite])

  // Append-only editing guards (active only during a freewrite session).
  const blockEdit = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (!freewrite) return
    const k = e.key
    if (k === 'Backspace' || k === 'Delete') {
      e.preventDefault()
      return
    }
    if ((e.ctrlKey || e.metaKey) && ['z', 'y', 'x'].includes(k.toLowerCase())) {
      e.preventDefault()
    }
  }

  const caretToEnd = (e: SyntheticEvent<HTMLTextAreaElement>) => {
    if (!freewrite) return
    const el = e.currentTarget
    const end = el.value.length
    if (el.selectionStart !== end || el.selectionEnd !== end) {
      el.setSelectionRange(end, end)
    }
  }

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

  const body = (
    <div
      ref={containerRef}
      className={cn(
        'flex h-full w-full overflow-hidden',
        fullscreen ? 'rounded-none' : 'rounded-[14px]',
      )}
      style={{ background: c.bg, fontFamily: "'Inter', sans-serif" }}
    >
      {/* Hit-region overlay: while a popover is open, this covers the
          whole viewport so clicks anywhere outside the popover close it
          (even on empty canvas, which would otherwise be click-through). */}
      {(fontMenu || showHistory) && (
        <div
          data-hit
          className="fixed inset-0 z-[55]"
          onMouseDown={() => {
            setFontMenu(false)
            setShowHistory(false)
          }}
        />
      )}

      <div
        className="flex shrink-0 flex-col items-center gap-1 border-r py-2.5"
        style={{ borderColor: c.line, width: 50 }}
      >
        <Tooltip label={t('note.toolbar.dragToMove')} side="right" className="mb-1">
          <div className="layer-drag-handle layer-grab flex flex-col items-center gap-[3px] py-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-[3px] w-[3px] rounded-full"
              style={{ background: c.sub }}
            />
          ))}
          </div>
        </Tooltip>

        <div className="relative">
          <IconBtn
            tip={t('note.toolbar.typefaceSize')}
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
                <div className="mb-1 flex items-center justify-between px-1">
                  <span
                    className="text-[10px] font-bold uppercase tracking-wide"
                    style={{ color: c.sub }}
                  >
                    {t('note.font.size')}
                  </span>
                  <span
                    className="text-[11px] tabular-nums"
                    style={{ color: c.sub }}
                  >
                    {widget.fontSize}px
                  </span>
                </div>
                <input
                  type="range"
                  min={14}
                  max={28}
                  step={1}
                  value={widget.fontSize}
                  onChange={(e) =>
                    updateWidget(widget.id, {
                      fontSize: Number(e.target.value),
                    })
                  }
                  className="mb-3 w-full"
                  style={{ accentColor: c.active }}
                />
                <div
                  className="mb-1.5 flex items-center justify-between px-1"
                >
                  <span
                    className="text-[10px] font-bold uppercase tracking-wide"
                    style={{ color: c.sub }}
                  >
                    {t('note.font.typeface')}
                  </span>
                  <Tooltip label={t('note.font.random')} side="top">
                    <button
                      type="button"
                      onClick={() => {
                        const pick =
                          FONTS[
                            3 + Math.floor(Math.random() * (FONTS.length - 3))
                          ]
                        if (pick) updateWidget(widget.id, { font: pick.value })
                      }}
                      style={{ color: c.sub }}
                    >
                      <Shuffle size={13} />
                    </button>
                  </Tooltip>
                </div>
                <div className="flex max-h-[230px] flex-col overflow-y-auto">
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

        <div className="relative">
          <IconBtn
            tip={freewrite ? t('note.toolbar.endFreewrite') : t('note.toolbar.freewrite')}
            active={freewrite || fwMenu}
            theme={c}
            onClick={() => {
              if (freewrite) endFreewrite()
              else setFwMenu((v) => !v)
            }}
          >
            {freewrite ? (
              <span className="tabular-nums text-[10.5px] font-bold">
                {fmt(timerLeft)}
              </span>
            ) : (
              <Feather size={16} strokeWidth={1.8} />
            )}
          </IconBtn>
          <AnimatePresence>
            {fwMenu && !freewrite && (
              <motion.div
                initial={{ opacity: 0, scale: 0.92, x: -6 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.92, x: -6 }}
                transition={spring}
                onMouseDown={stop}
                className="absolute left-full top-0 z-[60] ml-2 w-[212px] rounded-[12px] border p-3 shadow-xl"
                style={{ background: c.panel, borderColor: c.line }}
              >
                <div
                  className="text-[13px] font-bold"
                  style={{ color: c.fg }}
                >
                  {t('note.freewrite.title')}
                </div>
                <p
                  className="mt-1 text-[11.5px] leading-relaxed"
                  style={{ color: c.sub }}
                >
                  {t('note.freewrite.description')}
                </p>
                <div className="mt-2.5 grid grid-cols-4 gap-1.5">
                  {FREEWRITE_PRESETS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => startFreewrite(m)}
                      className="rounded-[8px] py-1.5 text-[12px] font-semibold transition-colors"
                      style={{ background: c.hover, color: c.fg }}
                    >
                      {m}
                      <span
                        className="ml-0.5 text-[9px] font-medium"
                        style={{ color: c.sub }}
                      >
                        m
                      </span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <IconBtn
          tip={widget.theme === 'light' ? t('note.toolbar.darkMode') : t('note.toolbar.lightMode')}
          theme={c}
          onClick={() => {
            const next = widget.theme === 'light' ? 'dark' : 'light'
            playSfx(next === 'light' ? 'switch-on' : 'switch-off')
            updateWidget(widget.id, { theme: next })
          }}
        >
          {widget.theme === 'light' ? (
            <Moon size={16} strokeWidth={1.8} />
          ) : (
            <Sun size={16} strokeWidth={1.8} />
          )}
        </IconBtn>

        <div className="flex-1" />

        <IconBtn
          tip={fullscreen ? t('note.toolbar.exitFullscreen') : t('note.toolbar.fullscreen')}
          theme={c}
          onClick={() => setFullscreen(!fullscreen)}
        >
          {fullscreen ? (
            <Minimize2 size={16} strokeWidth={1.8} />
          ) : (
            <Maximize2 size={16} strokeWidth={1.8} />
          )}
        </IconBtn>

        <IconBtn tip={t('note.toolbar.newEntry')} theme={c} onClick={newEntry}>
          <FilePlus2 size={16} strokeWidth={1.8} />
        </IconBtn>

        <IconBtn
          tip={t('note.toolbar.pastEntries')}
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
            <NoteEditor
              key={active?.id ?? 'none'}
              entryId={active?.id ?? ''}
              content={active?.content ?? ''}
              freewrite={freewrite}
              fontFamily={widget.font}
              fontSize={widget.fontSize}
              color={c.fg}
              editorRef={editorRef}
              onMouseDown={stop}
              onKeyDown={blockEdit}
              onCaret={caretToEnd}
            />
          )}
        </AnimatePresence>

        {/* Freewrite HUD: progress rail, time + word count, and a calm hint. */}
        <AnimatePresence>
          {freewrite && (
            <motion.div
              key="fw-hud"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="pointer-events-none absolute inset-0 z-[40]"
            >
              {/* progress rail along the top */}
              <div
                className="absolute left-0 top-0 h-[3px] w-full"
                style={{ background: c.line }}
              >
                <div
                  className="h-full transition-[width] duration-500 ease-linear"
                  style={{
                    width: `${
                      timerDuration > 0
                        ? (1 - timerLeft / timerDuration) * 100
                        : 0
                    }%`,
                    background: c.active,
                  }}
                />
              </div>
              {/* time + words, top-right */}
              <div className="absolute right-5 top-4 flex items-center gap-2.5">
                <span
                  className="tabular-nums"
                  style={{ color: c.fg, fontSize: 17, fontWeight: 700 }}
                >
                  {fmt(timerLeft)}
                </span>
                <span style={{ color: c.sub, fontSize: 12 }}>
                  {(() => {
                    const wc = wordCount(
                      editorRef.current?.value ?? active?.content ?? '',
                    )
                    return t(wc === 1 ? 'note.entry.word' : 'note.entry.words', {
                      count: wc,
                    })
                  })()}
                </span>
              </div>
              {/* bottom hint */}
              <div
                className="absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px]"
                style={{ color: c.sub }}
              >
                {t('note.freewrite.hudHint')}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* One-time intro that fades on its own a few seconds after start. */}
        <AnimatePresence>
          {showIntro && (
            <motion.div
              key="fw-intro"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.6 } }}
              transition={{ duration: 0.35 }}
              className="pointer-events-none absolute inset-0 z-[50] flex items-center justify-center px-8"
              style={{ background: `${c.bg}cc`, backdropFilter: 'blur(2px)' }}
            >
              <div className="max-w-[420px] text-center">
                <Feather
                  size={26}
                  strokeWidth={1.6}
                  style={{ color: c.active }}
                  className="mx-auto mb-3"
                />
                <div
                  style={{ color: c.fg, fontSize: 19, fontWeight: 700 }}
                >
                  {t('note.freewrite.introTitle')}
                </div>
                <p
                  className="mt-2 text-[13.5px] leading-relaxed"
                  style={{ color: c.sub }}
                >
                  {t('note.freewrite.introBody')}
                </p>
              </div>
            </motion.div>
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
              className="absolute right-0 top-0 z-[60] flex h-full w-[268px] flex-col border-l"
              style={{ background: c.panel, borderColor: c.line }}
            >
              <div
                className="flex items-center justify-between border-b px-4 py-3"
                style={{ borderColor: c.line }}
              >
                <span style={{ color: c.fg, fontSize: 14, fontWeight: 700 }}>
                  {t('note.history.title')}
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
                  const words = wordCount(e.content)
                  const fw = e.freewrites ?? 0
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
                          placeholder={t('note.history.entryTitle')}
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
                            {preview ? preview.slice(0, 42) : t('note.history.emptyEntry')}
                          </span>
                          <span
                            className="mt-0.5 flex items-center gap-1.5"
                            style={{ color: c.sub, fontSize: 10.5 }}
                          >
                            <span>
                              {t(words === 1 ? 'note.entry.word' : 'note.entry.words', {
                                count: words,
                              })}
                            </span>
                            {fw > 0 && (
                              <span className="flex items-center gap-0.5">
                                <Feather size={9} strokeWidth={2} />
                                {fw}
                              </span>
                            )}
                          </span>
                        </button>
                      )}
                      {!renaming && (
                        <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover/e:opacity-100">
                          <Tooltip label={e.pinned ? t('note.history.unpin') : t('note.history.pin')} side="top">
                            <button
                              type="button"
                              onClick={() => togglePin(e.id)}
                              className="rounded-[6px] p-1.5"
                              style={{ color: e.pinned ? c.fg : c.sub }}
                            >
                              <Pin size={12} />
                            </button>
                          </Tooltip>
                          <Tooltip label={t('note.history.rename')} side="top">
                            <button
                              type="button"
                              onClick={() => {
                                setRenamingId(e.id)
                                setRenameDraft(e.title ?? '')
                              }}
                              className="rounded-[6px] p-1.5"
                              style={{ color: c.sub }}
                            >
                              <Pencil size={12} />
                            </button>
                          </Tooltip>
                          <Tooltip label={t('note.history.delete')} side="top">
                            <button
                              type="button"
                              onClick={() => deleteEntry(e.id)}
                              className="rounded-[6px] p-1.5"
                              style={{ color: c.sub }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </Tooltip>
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

  // Fullscreen relocates the same Journal subtree into a portal (so `position:
  // fixed` escapes the canvas's transformed ancestor). Journal itself stays
  // mounted, so timer/freewrite state is preserved across the toggle. The
  // bottom inset keeps controls clear of the taskbar.
  if (fullscreen) {
    return createPortal(
      <motion.div
        data-hit
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-[9500]"
        style={{ paddingBottom: bottomInset, boxSizing: 'border-box' }}
      >
        {body}
      </motion.div>,
      document.body,
    )
  }
  return body
}

function NoteRenderer({ widget }: { widget: NoteWidgetType }) {
  return <Journal widget={widget} />
}

export const noteDefinition: WidgetDefinition<NoteWidgetType> = {
  type: 'note',
  label: 'Note',
  icon: NotebookPen,
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
