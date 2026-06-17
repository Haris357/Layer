import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Activity,
  Cpu,
  MemoryStick,
  HardDrive,
  BatteryCharging,
  Battery,
} from 'lucide-react'
import { getSystemStats, isTauri, type SystemStats } from '../../lib/ipc'
import type { StatsWidget as StatsWidgetType } from '../../types/widget'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

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

function StatsRenderer() {
  const { t } = useTranslation()
  const [stats, setStats] = useState<SystemStats | null>(null)

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
    const id = window.setInterval(poll, 2500)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  const memPct = stats
    ? (stats.memUsed / Math.max(1, stats.memTotal)) * 100
    : 0
  const gb = (n: number) => (n / 1024 / 1024 / 1024).toFixed(1)

  return (
    <div className="glass flex h-full w-full flex-col justify-center gap-3 overflow-hidden rounded-[12px] border border-[var(--border)] px-4">
      <div className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
        <Activity size={13} strokeWidth={1.8} />
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.3px' }}>
          {t('stats.system')}
        </span>
      </div>
      <Bar
        icon={Cpu}
        label={t('stats.cpu')}
        pct={stats?.cpu ?? 0}
        detail={stats ? `${Math.round(stats.cpu)}%` : '—'}
      />
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
      {stats && stats.battery >= 0 && (
        <Bar
          icon={stats.charging ? BatteryCharging : Battery}
          label={t('stats.battery')}
          pct={stats.battery}
          detail={`${stats.battery}%${stats.charging ? t('stats.chargingSuffix') : ''}`}
        />
      )}
    </div>
  )
}

export const statsDefinition: WidgetDefinition<StatsWidgetType> = {
  type: 'stats',
  label: 'Stats',
  icon: Activity,
  enabled: true,
  minSize: { width: 230, height: 200 },
  maxSize: { width: 460, height: 340 },
  create: (x, y) => ({
    type: 'stats',
    x,
    y,
    width: 250,
    height: 240,
    locked: false,
  }),
  Renderer: StatsRenderer,
}
