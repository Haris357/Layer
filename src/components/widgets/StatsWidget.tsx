import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Activity,
  Cpu,
  MemoryStick,
  HardDrive,
  BatteryCharging,
  Battery,
  ArrowDownUp,
} from 'lucide-react'
import { getSystemStats, isTauri, type SystemStats } from '../../lib/ipc'
import type { StatsMetric, StatsWidget as StatsWidgetType } from '../../types/widget'
import type { WidgetDefinition } from '../../lib/widgetRegistry'
import { FieldRow, Toggle } from '../ui'

const DEFAULT_METRICS: Record<StatsMetric, boolean> = {
  cpu: true,
  memory: true,
  disk: true,
  battery: true,
  network: false,
}

const HISTORY = 40

function resolveMetrics(widget: StatsWidgetType): Record<StatsMetric, boolean> {
  return { ...DEFAULT_METRICS, ...widget.metrics }
}

function fmtBytes(n: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`
}

function Bar({
  icon: Icon,
  label,
  pct,
  detail,
}: {
  icon: typeof Cpu
  label: string
  pct: number
  detail: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
          <Icon size={13} strokeWidth={1.8} />
          <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
        </span>
        <span
          className="text-[var(--text-primary)]"
          style={{ fontSize: 12, fontWeight: 600 }}
        >
          {detail}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--fill-2)]">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  )
}

interface NetSample {
  down: number
  up: number
}

// Diffs cumulative adapter counters between polls into a live rate, plus
// totals since this widget started watching. Counters can drop (adapter
// reset / reconnect), in which case we re-baseline instead of going negative.
function useNetwork(stats: SystemStats | null) {
  const prev = useRef<{ rx: number; tx: number; t: number } | null>(null)
  const base = useRef<{ rx: number; tx: number } | null>(null)
  const carried = useRef({ rx: 0, tx: 0 })
  const [rate, setRate] = useState<NetSample | null>(null)
  const [history, setHistory] = useState<NetSample[]>([])
  const [session, setSession] = useState({ rx: 0, tx: 0 })

  useEffect(() => {
    if (!stats) return
    const now = Date.now()
    const { netRx: rx, netTx: tx } = stats

    if (!base.current || rx < base.current.rx || tx < base.current.tx) {
      if (base.current && prev.current) {
        carried.current = {
          rx: carried.current.rx + (prev.current.rx - base.current.rx),
          tx: carried.current.tx + (prev.current.tx - base.current.tx),
        }
      }
      base.current = { rx, tx }
      prev.current = null
    }
    setSession({
      rx: carried.current.rx + rx - base.current.rx,
      tx: carried.current.tx + tx - base.current.tx,
    })

    const p = prev.current
    prev.current = { rx, tx, t: now }
    if (!p) return
    const dt = Math.max(0.2, (now - p.t) / 1000)
    const sample = {
      down: Math.max(0, (rx - p.rx) / dt),
      up: Math.max(0, (tx - p.tx) / dt),
    }
    setRate(sample)
    setHistory((h) => [...h.slice(-(HISTORY - 1)), sample])
  }, [stats])

  return { rate, history, session }
}

function Sparkline({ history }: { history: NetSample[] }) {
  const W = 100
  const H = 24
  const max = Math.max(1, ...history.map((s) => Math.max(s.down, s.up)))
  // Newest sample pinned to the right edge; the line grows in leftwards.
  const step = W / (HISTORY - 1)
  const line = (key: keyof NetSample) =>
    history
      .map((s, i) => {
        const x = W - (history.length - 1 - i) * step
        const y = H - (s[key] / max) * (H - 2) - 1
        return `${x.toFixed(2)},${y.toFixed(2)}`
      })
      .join(' ')
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-6 w-full overflow-visible"
    >
      <line x1="0" y1={H - 0.5} x2={W} y2={H - 0.5} stroke="var(--fill-2)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      {history.length > 0 && (
        <>
          <polyline
            points={line('up')}
            fill="none"
            stroke="var(--text-tertiary)"
            strokeWidth="1.25"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={line('down')}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.5"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
    </svg>
  )
}

function NetworkRow({ stats }: { stats: SystemStats | null }) {
  const { t } = useTranslation()
  const { rate, history, session } = useNetwork(stats)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
          <ArrowDownUp size={13} strokeWidth={1.8} />
          <span style={{ fontSize: 12, fontWeight: 600 }}>{t('stats.network')}</span>
        </span>
        <span className="flex items-center gap-2 tabular-nums" style={{ fontSize: 12, fontWeight: 600 }}>
          <span className="text-[var(--accent)]">↓ {rate ? `${fmtBytes(rate.down)}/s` : '—'}</span>
          <span className="text-[var(--text-tertiary)]">↑ {rate ? `${fmtBytes(rate.up)}/s` : '—'}</span>
        </span>
      </div>
      <Sparkline history={history} />
      <div className="flex justify-between tabular-nums text-[var(--text-tertiary)]" style={{ fontSize: 11 }}>
        <span>{t('stats.session')}</span>
        <span>
          ↓ {fmtBytes(session.rx)} · ↑ {fmtBytes(session.tx)}
        </span>
      </div>
    </div>
  )
}

function StatsRenderer({ widget }: { widget: StatsWidgetType }) {
  const { t } = useTranslation()
  const [stats, setStats] = useState<SystemStats | null>(null)
  const show = resolveMetrics(widget)
  // Faster polling only while the network row is visible, so the rate feels
  // live; CPU/memory/disk alone don't need it.
  const pollMs = show.network ? 1500 : 2500

  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false
    const poll = async () => {
      try {
        const s = await getSystemStats()
        if (!cancelled) setStats(s)
      } catch {
        /* ignore */
      }
    }
    poll()
    const id = window.setInterval(poll, pollMs)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [pollMs])

  const memPct = stats
    ? (stats.memUsed / Math.max(1, stats.memTotal)) * 100
    : 0
  const gb = (n: number) => (n / 1024 / 1024 / 1024).toFixed(1)
  const hasBattery = !!stats && stats.battery >= 0
  const nothing =
    !show.cpu && !show.memory && !show.disk && !show.network && !(show.battery && hasBattery)

  return (
    <div className="glass flex h-full w-full flex-col justify-center gap-3 overflow-hidden rounded-[12px] border border-[var(--border)] px-4">
      <div className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
        <Activity size={13} strokeWidth={1.8} />
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.3px' }}>
          {t('stats.system')}
        </span>
      </div>
      {show.cpu && (
        <Bar
          icon={Cpu}
          label={t('stats.cpu')}
          pct={stats?.cpu ?? 0}
          detail={stats ? `${Math.round(stats.cpu)}%` : '—'}
        />
      )}
      {show.memory && (
        <Bar
          icon={MemoryStick}
          label={t('stats.memory')}
          pct={memPct}
          detail={
            stats
              ? `${gb(stats.memUsed)} / ${gb(stats.memTotal)} GB`
              : '—'
          }
        />
      )}
      {show.disk && (
        <Bar
          icon={HardDrive}
          label={t('stats.storage')}
          pct={
            stats ? (stats.diskUsed / Math.max(1, stats.diskTotal)) * 100 : 0
          }
          detail={
            stats && stats.diskTotal > 0
              ? `${gb(stats.diskUsed)} / ${gb(stats.diskTotal)} GB`
              : '—'
          }
        />
      )}
      {show.battery && stats && stats.battery >= 0 && (
        <Bar
          icon={stats.charging ? BatteryCharging : Battery}
          label={t('stats.battery')}
          pct={stats.battery}
          detail={`${stats.battery}%${stats.charging ? t('stats.chargingSuffix') : ''}`}
        />
      )}
      {show.network && <NetworkRow stats={stats} />}
      {nothing && (
        <div className="text-center text-[12px] text-[var(--text-tertiary)]">
          {t('stats.empty')}
        </div>
      )}
    </div>
  )
}

function StatsSettings({
  widget,
  onUpdate,
}: {
  widget: StatsWidgetType
  onUpdate: (patch: Partial<StatsWidgetType>) => void
}) {
  const { t } = useTranslation()
  const show = resolveMetrics(widget)
  const rows: { key: StatsMetric; label: string }[] = [
    { key: 'cpu', label: t('stats.cpu') },
    { key: 'memory', label: t('stats.memory') },
    { key: 'disk', label: t('stats.storage') },
    { key: 'battery', label: t('stats.battery') },
    { key: 'network', label: t('stats.network') },
  ]
  return (
    <div className="flex w-[200px] flex-col gap-3">
      <span className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
        {t('stats.show')}
      </span>
      {rows.map((r) => (
        <FieldRow key={r.key} label={r.label}>
          <Toggle
            checked={show[r.key]}
            onChange={(v) => onUpdate({ metrics: { ...show, [r.key]: v } })}
          />
        </FieldRow>
      ))}
    </div>
  )
}

export const statsDefinition: WidgetDefinition<StatsWidgetType> = {
  type: 'stats',
  label: 'Stats',
  icon: Activity,
  enabled: true,
  minSize: { width: 230, height: 120 },
  maxSize: { width: 460, height: 440 },
  create: (x, y) => ({
    type: 'stats',
    x,
    y,
    width: 260,
    height: 320,
    locked: false,
    metrics: { ...DEFAULT_METRICS, network: true },
  }),
  Renderer: StatsRenderer,
  Settings: StatsSettings,
}
