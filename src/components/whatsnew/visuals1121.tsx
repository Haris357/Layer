import { motion } from 'framer-motion'
import { Bug, CircuitBoard, Clipboard, EyeOff, File, Link2, MousePointer2, PenTool, Scaling, Shapes, StickyNote, Type } from 'lucide-react'
import { WeatherLottie, type Scene } from '../widgets/weather/WeatherLottie'
import { POINTER_THEMES, previewUrl } from '../../lib/pointerTheme'
import { useEffect, useState } from 'react'

// Looping mockups for the 1.12.1 "what's new" tour (same style as visuals.tsx).
const chip = 'rounded-[10px] border border-[var(--border)] bg-[var(--surface)] shadow-md'
const ease = [0.32, 0.72, 0, 1] as const

/** Cycles 0..n-1 every `ms`. */
function useTick(n: number, ms: number) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setI((x) => (x + 1) % n), ms)
    return () => window.clearInterval(id)
  }, [n, ms])
  return i
}

// ── Whiteboard: notes pop in, an arrow connects them ───────────────────────
export function BoardVisual() {
  return (
    <div className="relative flex h-full items-center justify-center">
      <div className={`absolute left-6 top-1/2 flex -translate-y-1/2 flex-col gap-1 p-1 ${chip}`}>
        {[MousePointer2, PenTool, Shapes, StickyNote, Type].map((I, i) => (
          <span key={i} className={`flex h-6 w-6 items-center justify-center rounded-[6px] ${i === 3 ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'text-[var(--text-secondary)]'}`}>
            <I size={12} />
          </span>
        ))}
      </div>
      <svg width="220" height="110" className="absolute" style={{ left: 70 }}>
        <motion.path d="M70 35 C 110 35, 120 70, 150 70" fill="none" stroke="var(--text-primary)" strokeWidth={2} initial={{ pathLength: 0 }} animate={{ pathLength: [0, 1, 1, 0] }} transition={{ duration: 3, times: [0.3, 0.55, 0.9, 1], repeat: Infinity }} />
      </svg>
      {[
        { x: 70, y: 10, c: '#FDE68A', d: 0 },
        { x: 220, y: 50, c: '#F9A8D4', d: 0.3 },
      ].map((s, i) => (
        <motion.div
          key={i}
          className="absolute h-[52px] w-[70px] rounded-[6px] shadow-md"
          style={{ left: s.x, top: `calc(50% - 45px + ${s.y}px)`, background: s.c }}
          animate={{ scale: [0, 1.08, 1, 1, 0], opacity: [0, 1, 1, 1, 0] }}
          transition={{ duration: 3, times: [0, 0.1, 0.16, 0.92, 1], delay: s.d, repeat: Infinity, repeatDelay: 0 }}
        />
      ))}
    </div>
  )
}

// ── Clipboard: rich cards stack in ─────────────────────────────────────────
export function ClipVisual() {
  const rows = [
    { icon: <span className="h-5 w-5 rounded-[5px]" style={{ background: '#7C3AED' }} />, t: '#7C3AED' },
    { icon: <Link2 size={12} />, t: 'layer-desktop.vercel.app' },
    { icon: <File size={12} />, t: 'release-notes.pdf' },
  ]
  return (
    <div className="flex h-full items-center justify-center">
      <div className={`flex w-[210px] flex-col gap-1.5 p-2 ${chip}`}>
        <div className="flex items-center gap-1 text-[10px] font-semibold text-[var(--text-tertiary)]">
          <Clipboard size={11} /> Clipboard
        </div>
        {rows.map((r, i) => (
          <motion.div
            key={i}
            className="flex items-center gap-2 rounded-[7px] bg-[var(--fill-1)] px-2 py-1.5 text-[11px] text-[var(--text-primary)]"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: [0, 1, 1, 0], y: [-8, 0, 0, 0] }}
            transition={{ duration: 3.2, times: [0, 0.12, 0.9, 1], delay: i * 0.35, repeat: Infinity, repeatDelay: 0.4 }}
          >
            <span className="flex h-5 w-5 items-center justify-center text-[var(--text-secondary)]">{r.icon}</span>
            <span className="truncate">{r.t}</span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

// ── Quick Paste: Win + Shift + V, a row is picked ──────────────────────────
export function QuickPasteVisual() {
  const sel = useTick(3, 700)
  return (
    <div className="flex h-full items-center justify-center gap-4">
      <div className="flex items-center gap-1">
        {['Win', 'Shift', 'V'].map((k, i) => (
          <motion.span
            key={k}
            className="rounded-[6px] border border-[var(--border-strong)] border-b-[3px] bg-[var(--surface)] px-2 py-1 text-[11px] font-bold text-[var(--text-primary)]"
            animate={{ y: [0, 2, 0] }}
            transition={{ duration: 0.3, delay: i * 0.08, repeat: Infinity, repeatDelay: 1.8 }}
          >
            {k}
          </motion.span>
        ))}
      </div>
      <div className={`flex w-[150px] flex-col gap-0.5 p-1.5 ${chip}`}>
        {['Hello there!', '#7C3AED', 'npm run build'].map((t, i) => (
          <div key={t} className={`flex items-center justify-between rounded-[6px] px-2 py-1 text-[10.5px] transition-colors duration-200 ${i === sel ? 'bg-[var(--fill-2)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
            <span className="truncate">{t}</span>
            <span className={`rounded-[4px] px-1 text-[9px] font-bold ${i === sel ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'bg-[var(--fill-1)]'}`}>{i + 1}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Weather: the real animations, cycling ──────────────────────────────────
const WX: Scene[] = ['clear-day', 'rain', 'snow', 'storm', 'clear-night']
export function WeatherVisual() {
  const i = useTick(WX.length, 1400)
  return (
    <div className="flex h-full items-center justify-center">
      <div className={`flex items-center gap-4 px-5 py-3 ${chip}`}>
        <motion.span key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease }} className="text-[34px] font-bold tracking-[-0.04em] text-[var(--text-primary)] tabular-nums">
          {[31, 19, -2, 17, 22][i]}°
        </motion.span>
        <WeatherLottie key={WX[i]} scene={WX[i]!} size={72} />
      </div>
    </div>
  )
}

// ── Pointer themes cycling ─────────────────────────────────────────────────
const PT = ['mono', 'afterglow', 'contour', 'facet', 'obsidian', 'ink']
export function PointerVisual() {
  const i = useTick(PT.length, 900)
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <motion.div key={i} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, ease }} className="flex items-center gap-4">
        <img src={previewUrl(PT[i]!, 'Hand')} alt="" className="h-9 w-9" />
        <img src={previewUrl(PT[i]!, 'Arrow')} alt="" className="h-14 w-14" />
      </motion.div>
      <div className="flex gap-1.5">
        {PT.map((id, n) => (
          <span key={id} className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-[var(--fill-1)] transition-shadow duration-200" style={{ boxShadow: n === i ? '0 0 0 2px var(--accent)' : undefined }}>
            <img src={previewUrl(id, 'Arrow')} alt="" className="h-4 w-4" />
          </span>
        ))}
      </div>
      <span className="text-[11px] font-semibold text-[var(--text-secondary)]">{POINTER_THEMES.find((x) => x.id === PT[i])?.name}</span>
    </div>
  )
}

// ── UI scale, hide the nub, GPU stats, fixes ───────────────────────────────
export function MoreVisual() {
  const items = [Scaling, EyeOff, CircuitBoard, Bug]
  return (
    <div className="flex h-full items-center justify-center gap-2.5">
      {items.map((I, i) => (
        <motion.span
          key={i}
          className={`flex h-12 w-12 items-center justify-center text-[var(--text-primary)] ${chip}`}
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 0.6, delay: i * 0.15, repeat: Infinity, repeatDelay: 1.2, ease: 'easeInOut' }}
        >
          <I size={20} strokeWidth={1.7} />
        </motion.span>
      ))}
    </div>
  )
}
