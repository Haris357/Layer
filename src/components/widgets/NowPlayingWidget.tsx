import { useEffect, useRef, useState } from 'react'
import { Music, Play, Pause, SkipBack, SkipForward } from 'lucide-react'
import {
  getNowPlaying,
  getVolume,
  isTauri,
  mediaControl,
  setVolume,
  type NowPlaying,
} from '../../lib/ipc'
import type { NowPlayingWidget as NowPlayingWidgetType } from '../../types/widget'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

const KNOB = 90
const KC = KNOB / 2
const START = 135
const SWEEP = 270
const TICKS = 21

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const
}

function Waveform({ playing }: { playing: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const ampRef = useRef(0.04)
  const playingRef = useRef(playing)
  playingRef.current = playing

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf = 0
    let t = 0
    let frame = 0
    let color = 'rgba(255,255,255,0.6)'

    const draw = () => {
      if (frame % 40 === 0) {
        const c = getComputedStyle(document.documentElement)
          .getPropertyValue('--text-secondary')
          .trim()
        if (c) color = c
      }
      frame++
      const dpr = window.devicePixelRatio || 1
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (w === 0 || h === 0) {
        raf = requestAnimationFrame(draw)
        return
      }
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr
        canvas.height = h * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const target = playingRef.current ? 1 : 0.05
      ampRef.current += (target - ampRef.current) * 0.07
      const amp = ampRef.current
      const mid = h / 2
      const barW = 3
      const gap = 2
      const n = Math.floor(w / (barW + gap))
      ctx.fillStyle = color

      for (let i = 0; i < n; i++) {
        const x = i * (barW + gap)
        const p = i / n
        const v =
          Math.sin(p * 7 + t) * 0.5 +
          Math.sin(p * 13 - t * 1.4) * 0.3 +
          Math.sin(p * 23 + t * 0.7) * 0.2
        const hh = Math.max(1.5, Math.abs(v) * h * 0.46 * amp + 1)
        ctx.fillRect(x, mid - hh, barW, hh * 2)
      }
      t += playingRef.current ? 0.07 : 0.012
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  return <canvas ref={ref} className="h-[28px] w-full" />
}

function VolumeKnob({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const angle = START + value * SWEEP

  const apply = (clientX: number, clientY: number) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    let a = (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI
    a = (a + 360) % 360
    if (a < START) a += 360
    if (a > START + SWEEP) {
      // cursor in the bottom gap — snap to the nearer end, no wrap
      a = a < START + SWEEP + (360 - SWEEP) / 2 ? START + SWEEP : START
    }
    onChange(Math.max(0, Math.min(1, (a - START) / SWEEP)))
  }

  const [px, py] = polar(KC, KC, 8, angle)
  const [px2, py2] = polar(KC, KC, 20, angle)

  return (
    <div
      ref={ref}
      className="relative shrink-0"
      style={{ width: KNOB, height: KNOB, touchAction: 'none' }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        apply(e.clientX, e.clientY)
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) apply(e.clientX, e.clientY)
      }}
    >
      <svg width={KNOB} height={KNOB}>
        {Array.from({ length: TICKS }).map((_, i) => {
          const a = START + (i / (TICKS - 1)) * SWEEP
          const [x1, y1] = polar(KC, KC, 32, a)
          const [x2, y2] = polar(KC, KC, 38, a)
          const active = i / (TICKS - 1) <= value + 0.0001
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={active ? 'var(--accent)' : 'var(--border-strong)'}
              strokeWidth={2}
              strokeLinecap="round"
            />
          )
        })}
        <circle
          cx={KC}
          cy={KC}
          r={23}
          fill="var(--surface-active)"
          stroke="var(--border-strong)"
          strokeWidth={1}
        />
        <line
          x1={px}
          y1={py}
          x2={px2}
          y2={py2}
          stroke="var(--accent)"
          strokeWidth={3.5}
          strokeLinecap="round"
        />
        <text
          x={10}
          y={KNOB - 2}
          fill="var(--text-tertiary)"
          style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.5px' }}
        >
          MIN
        </text>
        <text
          x={KC}
          y={KNOB - 2}
          textAnchor="middle"
          fill="var(--text-primary)"
          style={{ fontSize: 12, fontWeight: 700 }}
        >
          {Math.round(value * 100)}
        </text>
        <text
          x={KNOB - 10}
          y={KNOB - 2}
          textAnchor="end"
          fill="var(--text-tertiary)"
          style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.5px' }}
        >
          MAX
        </text>
      </svg>
    </div>
  )
}

function NowPlayingRenderer() {
  const [np, setNp] = useState<NowPlaying | null>(null)
  const [volume, setVol] = useState(-1)

  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false
    const poll = () => {
      getNowPlaying()
        .then((d) => !cancelled && setNp(d))
        .catch(() => {})
      getVolume()
        .then((v) => !cancelled && setVol(v))
        .catch(() => {})
    }
    poll()
    const id = window.setInterval(poll, 2500)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  const control = (action: 'playpause' | 'next' | 'prev') => {
    mediaControl(action).catch(() => {})
    window.setTimeout(() => {
      getNowPlaying()
        .then(setNp)
        .catch(() => {})
    }, 350)
  }

  const changeVolume = (v: number) => {
    setVol(v)
    setVolume(v).catch(() => {})
  }

  if (!np || !np.hasSession) {
    return (
      <div className="glass flex h-full w-full flex-col items-center justify-center gap-2 rounded-[12px] border border-[var(--border)] text-[var(--text-tertiary)]">
        <Music size={26} strokeWidth={1.5} />
        <span style={{ fontSize: 12, fontWeight: 500 }}>Nothing playing</span>
      </div>
    )
  }

  return (
    <div className="glass flex h-full w-full flex-col gap-2 overflow-hidden rounded-[12px] border border-[var(--border)] p-4">
      <div className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
        <Music size={12} strokeWidth={1.8} />
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.3px' }}>
          NOW PLAYING
        </span>
      </div>

      <div className="flex min-h-0 flex-1 items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex min-w-0 flex-col">
            <span
              className="truncate text-[var(--text-primary)]"
              style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.4px' }}
            >
              {np.title || 'Unknown track'}
            </span>
            <span
              className="truncate text-[var(--text-secondary)]"
              style={{ fontSize: 12.5, fontWeight: 500 }}
            >
              {np.artist || '—'}
            </span>
          </div>
          <Waveform playing={np.playing} />
        </div>
        {volume >= 0 && (
          <VolumeKnob value={volume} onChange={changeVolume} />
        )}
      </div>

      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => control('prev')}
          className="text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          <SkipBack size={17} strokeWidth={1.8} fill="currentColor" />
        </button>
        <button
          type="button"
          onClick={() => control('playpause')}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--on-accent)] transition-transform hover:scale-105"
        >
          {np.playing ? (
            <Pause size={16} strokeWidth={2} fill="currentColor" />
          ) : (
            <Play size={16} strokeWidth={2} fill="currentColor" />
          )}
        </button>
        <button
          type="button"
          onClick={() => control('next')}
          className="text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          <SkipForward size={17} strokeWidth={1.8} fill="currentColor" />
        </button>
      </div>
    </div>
  )
}

export const nowPlayingDefinition: WidgetDefinition<NowPlayingWidgetType> = {
  type: 'nowplaying',
  label: 'Now Playing',
  icon: Music,
  enabled: true,
  minSize: { width: 310, height: 188 },
  maxSize: { width: 540, height: 290 },
  create: (x, y) => ({
    type: 'nowplaying',
    x,
    y,
    width: 370,
    height: 210,
    locked: false,
  }),
  Renderer: NowPlayingRenderer,
}
