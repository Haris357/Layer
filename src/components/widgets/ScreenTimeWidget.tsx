import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChartBarBig } from 'lucide-react'
import type { ScreenTimeWidget as ScreenTimeWidgetType } from '../../types/widget'
import type { WidgetDefinition } from '../../lib/widgetRegistry'
import { getScreenTime, isTauri, type ScreenTimeDay } from '../../lib/ipc'
import { Segmented } from '../ui'

const REFRESH_MS = 30_000

function fmt(seconds: number, t: (k: string, o?: Record<string, unknown>) => string): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return t('screentime.hm', { h, m })
  if (m > 0) return t('screentime.m', { m })
  return t('screentime.lessThanMin')
}

function ScreenTimeRenderer({ widget }: { widget: ScreenTimeWidgetType }) {
  const { t } = useTranslation()
  const [day, setDay] = useState<ScreenTimeDay | null>(null)

  useEffect(() => {
    if (!isTauri()) return
    let alive = true
    const load = () => getScreenTime().then((d) => alive && setDay(d)).catch(() => {})
    load()
    const id = window.setInterval(load, REFRESH_MS)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [])

  const apps = (day?.apps ?? []).filter((a) => a.seconds >= 60).slice(0, widget.topN)
  const max = Math.max(1, ...apps.map((a) => a.seconds))

  return (
    <div className="glass flex h-full w-full flex-col gap-3 overflow-hidden rounded-[14px] border border-[var(--border)] p-3.5">
      <div className="flex flex-col">
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
          {t('screentime.today')}
        </span>
        <span className="text-[26px] font-bold leading-tight tracking-tight text-[var(--text-primary)] tabular-nums">
          {day ? fmt(day.totalSeconds, t) : '—'}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {apps.map((a) => (
          <div key={a.name} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[12px] font-medium text-[var(--text-primary)]">{a.name}</span>
              <span className="shrink-0 tabular-nums text-[11px] text-[var(--text-tertiary)]">{fmt(a.seconds, t)}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--fill-2)]">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-700"
                style={{ width: `${(a.seconds / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
        {day && apps.length === 0 && (
          <div className="m-auto text-center text-[12px] text-[var(--text-tertiary)]">{t('screentime.empty')}</div>
        )}
      </div>
      <span className="text-[10.5px] text-[var(--text-tertiary)]">{t('screentime.private')}</span>
    </div>
  )
}

function ScreenTimeSettings({
  widget,
  onUpdate,
}: {
  widget: ScreenTimeWidgetType
  onUpdate: (patch: Partial<ScreenTimeWidgetType>) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex w-[220px] flex-col gap-2">
      <span className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
        {t('screentime.appsShown')}
      </span>
      <Segmented
        value={String(widget.topN)}
        options={[
          { value: '3', label: '3' },
          { value: '5', label: '5' },
          { value: '8', label: '8' },
        ]}
        onChange={(v) => onUpdate({ topN: Number(v) })}
      />
    </div>
  )
}

export const screenTimeDefinition: WidgetDefinition<ScreenTimeWidgetType> = {
  type: 'screentime',
  label: 'Screen Time',
  icon: ChartBarBig,
  enabled: true,
  minSize: { width: 200, height: 180 },
  create: (x, y) => ({
    type: 'screentime',
    x,
    y,
    width: 260,
    height: 300,
    locked: false,
    topN: 5,
  }),
  Renderer: ScreenTimeRenderer,
  Settings: ScreenTimeSettings,
}
