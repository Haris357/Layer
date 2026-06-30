import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
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
import { Toggle, FieldRow } from '../ui'
import { Tooltip } from '../Tooltip'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

// Pull a representative colour from the album art (saturation-weighted average)
// for a Spotify-style colour wash. Data URLs are same-origin, so reading the
// canvas isn't tainted. Returns "r, g, b" for use in rgba().
function useArtColor(thumb: string): string | null {
  const [rgb, setRgb] = useState<string | null>(null)
  useEffect(() => {
    if (!thumb) {
      setRgb(null)
      return
    }
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      const s = 24
      const c = document.createElement('canvas')
      c.width = s
      c.height = s
      const ctx = c.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      try {
        ctx.drawImage(img, 0, 0, s, s)
        const { data } = ctx.getImageData(0, 0, s, s)
        let r = 0
        let g = 0
        let b = 0
        let wsum = 0
        for (let i = 0; i < data.length; i += 4) {
          const R = data[i] ?? 0
          const G = data[i + 1] ?? 0
          const B = data[i + 2] ?? 0
          const mx = Math.max(R, G, B)
          const mn = Math.min(R, G, B)
          const sat = mx === 0 ? 0 : (mx - mn) / mx
          const w = 0.15 + sat // favour vivid pixels over greys
          r += R * w
          g += G * w
          b += B * w
          wsum += w
        }
        if (wsum > 0 && !cancelled) {
          setRgb(
            `${Math.round(r / wsum)}, ${Math.round(g / wsum)}, ${Math.round(b / wsum)}`,
          )
        }
      } catch {
        /* tainted/again — ignore */
      }
    }
    img.src = thumb
    return () => {
      cancelled = true
    }
  }, [thumb])
  return rgb
}

const SOURCE_NAMES: [RegExp, string][] = [
  [/spotify/i, 'Spotify'],
  [/chrome/i, 'Chrome'],
  [/msedge|edge/i, 'Edge'],
  [/firefox/i, 'Firefox'],
  [/vlc/i, 'VLC'],
  [/itunes|apple/i, 'Apple Music'],
  [/groove|zune/i, 'Groove'],
  [/foobar/i, 'foobar2000'],
]
function sourceName(id: string): string {
  if (!id) return ''
  for (const [re, name] of SOURCE_NAMES) if (re.test(id)) return name
  const tail = id.split('!').pop() || id
  return tail.replace(/\.exe$/i, '')
}

const KNOB = 90
const KC = KNOB / 2
const START = 135
const SWEEP = 270
const TICKS = 21

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const
}

function Waveform({ playing, color: colorProp }: { playing: boolean; color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const ampRef = useRef(0.04)
  const playingRef = useRef(playing)
  playingRef.current = playing
  const colorPropRef = useRef(colorProp)
  colorPropRef.current = colorProp

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
      if (colorPropRef.current) {
        color = colorPropRef.current
      } else if (frame % 40 === 0) {
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
  const { t } = useTranslation()
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
          {t('nowplaying.volume.min')}
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
          {t('nowplaying.volume.max')}
        </text>
      </svg>
    </div>
  )
}

function NowPlayingRenderer({ widget }: { widget: NowPlayingWidgetType }) {
  const { t } = useTranslation()
  const [np, setNp] = useState<NowPlaying | null>(null)
  const [volume, setVol] = useState(-1)
  const color = useArtColor(np?.thumb ?? '')

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
    // Re-sync from the OS media session (the single source of truth). A couple
    // of staggered reads catch it whether the OS updates fast or takes a beat.
    const refetch = () =>
      getNowPlaying()
        .then((d) => setNp(d))
        .catch(() => {})
    window.setTimeout(refetch, 300)
    window.setTimeout(refetch, 900)
  }

  const changeVolume = (v: number) => {
    setVol(v)
    setVolume(v).catch(() => {})
  }

  if (!np || !np.hasSession) {
    return (
      <div className="glass flex h-full w-full flex-col items-center justify-center gap-2 rounded-[12px] border border-[var(--border)] text-[var(--text-tertiary)]">
        <Music size={26} strokeWidth={1.5} />
        <span style={{ fontSize: 12, fontWeight: 500 }}>{t('nowplaying.empty')}</span>
      </div>
    )
  }

  const src = sourceName(np.source)
  // The album-art background theme is opt-out via settings (default on).
  const hasArt = !!np.thumb && widget.artBackground !== false
  // Spotify-style: over artwork go dark with white text + the album's colour as
  // a wash; otherwise keep the themed glass card.
  const textVars: CSSProperties | undefined = hasArt
    ? ({
        ['--text-primary']: '#fff',
        ['--text-secondary']: 'rgba(255,255,255,0.82)',
        ['--text-tertiary']: 'rgba(255,255,255,0.6)',
      } as CSSProperties)
    : undefined

  return (
    <div className="glass relative flex h-full w-full overflow-hidden rounded-[12px] border border-[var(--border)]">
      {/* Cross-fade the artwork + colour wash when the track changes, so the
          background eases between songs instead of snapping. */}
      <AnimatePresence>
        {hasArt && (
          <motion.div
            key={np.thumb}
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: 'easeInOut' }}
            className="pointer-events-none absolute inset-0"
          >
            <img
              src={np.thumb}
              alt=""
              className="h-full w-full scale-110 object-cover"
              style={{ filter: 'blur(28px) saturate(160%)' }}
            />
            {color && (
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(150deg, rgba(${color},0.5), rgba(${color},0.12))`,
                }}
              />
            )}
            {/* readability scrim, darker toward the controls */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(180deg, rgba(8,8,12,0.34) 0%, rgba(8,8,12,0.62) 100%)',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <div
        className="relative z-10 flex h-full w-full flex-col gap-3 p-4"
        style={textVars}
      >
        <div className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
          <Music size={12} strokeWidth={1.8} />
          <span
            className="truncate"
            style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.3px' }}
          >
            {src ? src.toUpperCase() : t('nowplaying.defaultSource')}
          </span>
        </div>

        <div className="flex min-h-0 flex-1 items-center gap-3 overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex min-w-0 flex-col">
              <span
                className="truncate text-[var(--text-primary)]"
                style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.4px' }}
              >
                {np.title || t('nowplaying.unknownTrack')}
              </span>
              <span
                className="truncate text-[var(--text-secondary)]"
                style={{ fontSize: 12.5, fontWeight: 500 }}
              >
                {np.artist || '—'}
              </span>
            </div>
            <Waveform
              playing={np.playing}
              color={hasArt ? 'rgba(255,255,255,0.55)' : undefined}
            />
          </div>
          {volume >= 0 && <VolumeKnob value={volume} onChange={changeVolume} />}
        </div>

        <div className="flex shrink-0 items-center justify-center gap-3">
          <Tooltip label={t('nowplaying.controls.previous')} side="top">
            <button
              type="button"
              onClick={() => control('prev')}
              className="text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              <SkipBack size={17} strokeWidth={1.8} fill="currentColor" />
            </button>
          </Tooltip>
          <Tooltip
            label={np.playing ? t('nowplaying.controls.pause') : t('nowplaying.controls.play')}
            side="top"
          >
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
          </Tooltip>
          <Tooltip label={t('nowplaying.controls.next')} side="top">
            <button
              type="button"
              onClick={() => control('next')}
              className="text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              <SkipForward size={17} strokeWidth={1.8} fill="currentColor" />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}

function NowPlayingSettings({
  widget,
  onUpdate,
}: {
  widget: NowPlayingWidgetType
  onUpdate: (patch: Partial<NowPlayingWidgetType>) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex w-[230px] flex-col gap-2">
      <FieldRow label={t('nowplaying.settings.artBackground')}>
        <Toggle
          checked={widget.artBackground !== false}
          onChange={(v) => onUpdate({ artBackground: v })}
        />
      </FieldRow>
      <p className="text-[11px] leading-relaxed text-[var(--text-tertiary)]">
        {t('nowplaying.settings.artBackgroundDesc')}
      </p>
    </div>
  )
}

export const nowPlayingDefinition: WidgetDefinition<NowPlayingWidgetType> = {
  type: 'nowplaying',
  label: 'Now Playing',
  icon: Music,
  enabled: true,
  // Min height keeps the volume knob (90px tall) from clipping; min width keeps
  // it from clipping sideways. The knob always shows within these bounds.
  minSize: { width: 300, height: 208 },
  maxSize: { width: 540, height: 300 },
  create: (x, y) => ({
    type: 'nowplaying',
    x,
    y,
    width: 380,
    height: 214,
    locked: false,
    artBackground: true,
  }),
  Renderer: NowPlayingRenderer,
  Settings: NowPlayingSettings,
}
