import { motion } from 'framer-motion'
import { Activity, CalendarDays, ChartBarBig, Clock, Hand, Layers, ListChecks, NotebookPen, Sparkles, StickyNote, Workflow, Globe, Hourglass } from 'lucide-react'
import { PetArt } from '../widgets/pet/PetArt'

// Little looping mockups for the "what's new" tour, in the same style as the
// welcome tour's visuals (TourVisuals.tsx).
const chip = 'rounded-[10px] border border-[var(--border)] bg-[var(--surface)] shadow-md'
const ease = [0.32, 0.72, 0, 1] as const

// ── Intro: the version, with sparkles ───────────────────────────────────────
export function NewIntroVisual({ version }: { version: string }) {
  return (
    <div className="relative flex h-full items-center justify-center">
      {[-70, 72, -48, 58].map((x, i) => (
        <motion.span
          key={i}
          className="absolute text-[var(--text-secondary)]"
          style={{ x, y: i % 2 ? -40 : 38 }}
          animate={{ scale: [0.6, 1.1, 0.6], opacity: [0.3, 1, 0.3], rotate: [0, 45, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.45, ease: 'easeInOut' }}
        >
          <Sparkles size={i % 2 ? 14 : 18} strokeWidth={1.6} />
        </motion.span>
      ))}
      <motion.div
        className="flex items-center gap-3"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 16 }}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-[var(--accent)] text-[var(--on-accent)] shadow-xl">
          <Layers size={28} strokeWidth={1.8} />
        </div>
        <span className="text-[40px] font-bold tracking-[-0.05em] text-[var(--text-primary)]">{version}</span>
      </motion.div>
    </div>
  )
}

// ── Pull to open: the pill gets pulled and the sheet follows ────────────────
export function PullVisual() {
  const loop = { duration: 2.6, repeat: Infinity, repeatDelay: 0.6, ease, times: [0, 0.15, 0.55, 0.8, 1] }
  return (
    <div className="relative flex h-full flex-col items-center pt-3">
      <motion.div
        className={`relative z-10 flex h-8 items-center gap-1.5 px-3 text-[12px] font-bold text-[var(--text-primary)] ${chip}`}
        animate={{ width: [88, 88, 230, 230, 88] }}
        transition={loop}
      >
        <Layers size={14} />
        <span>Layer</span>
      </motion.div>
      <motion.div
        className={`-mt-px w-[230px] overflow-hidden rounded-b-[14px] ${chip}`}
        animate={{ height: [0, 0, 0, 104, 0] }}
        transition={loop}
      >
        <div className="grid grid-cols-3 gap-1.5 p-2.5">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-9 rounded-[7px] bg-[var(--fill-1)]" />
          ))}
        </div>
      </motion.div>
      <motion.div
        className="absolute left-1/2 top-4 z-20 text-[var(--text-primary)]"
        animate={{ y: [0, 0, 26, 112, 0], opacity: [0, 1, 1, 1, 0] }}
        transition={loop}
      >
        <Hand size={20} strokeWidth={1.8} />
      </motion.div>
    </div>
  )
}

// ── Fewer icons: three fold into their host's style menu ────────────────────
export function MergedVisual() {
  const icons = [
    { I: NotebookPen }, { I: StickyNote, gone: true }, { I: Workflow, gone: true }, { I: ListChecks },
    { I: Clock }, { I: Globe, gone: true }, { I: CalendarDays }, { I: Hourglass, gone: true }, { I: Activity },
  ]
  const loop = { duration: 3.2, repeat: Infinity, repeatDelay: 0.4, ease, times: [0, 0.25, 0.45, 0.85, 1] }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <div className={`flex h-10 items-center px-2 ${chip}`}>
        {icons.map(({ I, gone }, i) => (
          <motion.div
            key={i}
            className="flex justify-center text-[var(--text-secondary)]"
            animate={gone ? { width: [30, 30, 0, 0, 30], opacity: [1, 1, 0, 0, 1], y: [0, 0, -14, -14, 0] } : { width: 30 }}
            transition={loop}
          >
            <I size={16} strokeWidth={1.6} />
          </motion.div>
        ))}
      </div>
      <motion.div className="flex gap-1.5" animate={{ opacity: [0, 0, 1, 1, 0] }} transition={loop}>
        {['Analog', 'Digital', 'World clock'].map((s, i) => (
          <span key={s} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${i === 2 ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'bg-[var(--fill-2)] text-[var(--text-secondary)]'}`}>{s}</span>
        ))}
      </motion.div>
    </div>
  )
}

// ── Desktop Pebbles: hop, squash, hop ───────────────────────────────────────
export function PebblesVisual() {
  return (
    <div className="flex h-full items-end justify-center gap-10 pb-7">
      {[0, 1].map((n) => (
        <motion.div
          key={n}
          className="h-14 w-14"
          style={{ originY: 0.93 }}
          animate={{ y: [0, -44, 0, 0], scaleY: [0.82, 1.08, 0.78, 1], scaleX: [1.14, 0.94, 1.2, 1] }}
          transition={{ duration: 1.3, repeat: Infinity, times: [0, 0.45, 0.82, 1], ease: 'easeInOut', delay: n * 0.65 }}
        >
          <PetArt color={n ? '#EBB0C6' : '#ADB2EC'} eyes="happy" />
        </motion.div>
      ))}
    </div>
  )
}

// ── Screen Time + Year progress ─────────────────────────────────────────────
export function InsightsVisual() {
  const bars = [1, 0.8, 0.4, 0.24]
  return (
    <div className="flex h-full items-center justify-center gap-4 px-4">
      <div className={`flex w-[150px] flex-col gap-2 p-3 ${chip}`}>
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-primary)]">
          <ChartBarBig size={13} /> 5h 25m
        </div>
        {bars.map((w, i) => (
          <div key={i} className="h-1.5 rounded-full bg-[var(--fill-1)]">
            <motion.div
              className="h-full rounded-full bg-[var(--accent)]"
              initial={{ width: 0 }}
              animate={{ width: `${w * 100}%` }}
              transition={{ duration: 0.9, delay: 0.2 + i * 0.12, ease }}
            />
          </div>
        ))}
      </div>
      <div className={`grid grid-cols-10 gap-[3px] p-3 ${chip}`}>
        {Array.from({ length: 60 }, (_, i) => (
          <motion.span
            key={i}
            className="h-[7px] w-[7px] rounded-full"
            initial={{ backgroundColor: 'var(--fill-2)' }}
            animate={{ backgroundColor: i < 51 ? 'var(--accent)' : 'var(--fill-2)' }}
            transition={{ delay: 0.3 + i * 0.015 }}
          />
        ))}
      </div>
    </div>
  )
}

// ── Stays put: a monitor goes away and comes back, widgets follow ───────────
export function StaysVisual() {
  const loop = { duration: 3.4, repeat: Infinity, repeatDelay: 0.3, ease, times: [0, 0.2, 0.4, 0.65, 0.85, 1] }
  const mon = 'relative h-[84px] w-[128px] rounded-[10px] border-2 border-[var(--border-strong)] bg-[var(--fill-1)]'
  return (
    <div className="relative flex h-full items-center justify-center gap-5">
      <div className={mon} />
      <motion.div className={mon} animate={{ opacity: [1, 1, 0.25, 0.25, 1, 1] }} transition={loop} />
      {/* The second monitor's widgets (positioned inside it: its left edge is
          50% + 10px) move over to the main one together, then go back. */}
      {[{ x: 12, y: 12, w: 46, h: 24 }, { x: 66, y: 12, w: 48, h: 58 }, { x: 12, y: 44, w: 46, h: 26 }].map((b, i) => (
        <motion.div
          key={i}
          className="absolute rounded-[5px] bg-[var(--accent)]"
          style={{ left: `calc(50% + 10px + ${b.x}px)`, top: `calc(50% - 42px + ${b.y}px)`, width: b.w, height: b.h, originX: 0, originY: 0 }}
          animate={{ x: [0, 0, -148, -148, 0, 0], scale: [1, 1, 0.85, 0.85, 1, 1] }}
          transition={loop}
        />
      ))}
    </div>
  )
}
