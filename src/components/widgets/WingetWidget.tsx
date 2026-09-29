import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  PackageCheck,
  RotateCw,
  Download,
  EyeOff,
  Loader2,
  AlertTriangle,
  Clock,
} from 'lucide-react'
import type { WingetWidget as WingetWidgetType } from '../../types/widget'
import type { WidgetDefinition } from '../../lib/widgetRegistry'
import { isTauri, listWingetUpgrades, wingetUpgrade, type WingetUpgrade } from '../../lib/ipc'
import { useCanvasStore } from '../../store/canvasStore'
import { Tooltip } from '../Tooltip'
import { cn } from '../../lib/utils'

const STALE_MS = 60 * 60 * 1000
const TICK_MS = 5 * 60 * 1000

// One check takes several seconds of winget work, so results are shared by
// every Updates widget and only refreshed once they go stale (or on demand).
interface Snapshot {
  at: number
  list: WingetUpgrade[]
  error: string | null
}
let cache: Snapshot | null = null
let inflight: Promise<Snapshot> | null = null
const listeners = new Set<(s: Snapshot) => void>()

function publish(s: Snapshot) {
  cache = s
  listeners.forEach((l) => l(s))
}

function check(force: boolean): Promise<Snapshot> {
  if (!force && cache && Date.now() - cache.at < STALE_MS) return Promise.resolve(cache)
  if (inflight) return inflight
  inflight = listWingetUpgrades()
    .then((list) => ({ at: Date.now(), list, error: null }))
    .catch((e) => ({ at: Date.now(), list: cache?.list ?? [], error: String(e) }))
    .then((s) => {
      inflight = null
      publish(s)
      return s
    })
  return inflight
}

function dropFromCache(id: string) {
  if (cache) publish({ ...cache, list: cache.list.filter((p) => p.id !== id) })
}

type RowStatus = 'queued' | 'updating' | 'failed'

function WingetRenderer({ widget }: { widget: WingetWidgetType }) {
  const { t, i18n } = useTranslation()
  const updateWidget = useCanvasStore((s) => s.updateWidget)
  const [snap, setSnap] = useState<Snapshot | null>(cache)
  const [checking, setChecking] = useState(false)
  const [status, setStatus] = useState<Record<string, RowStatus>>({})
  const [, setNow] = useState(Date.now())
  const queue = useRef<string[]>([])
  const running = useRef(false)

  const refresh = useCallback((force: boolean) => {
    if (!isTauri()) return
    setChecking(true)
    check(force).finally(() => setChecking(false))
  }, [])

  useEffect(() => {
    listeners.add(setSnap)
    refresh(false)
    // Re-render the "checked N min ago" label, and re-check once stale.
    const id = window.setInterval(() => {
      setNow(Date.now())
      refresh(false)
    }, TICK_MS)
    return () => {
      listeners.delete(setSnap)
      window.clearInterval(id)
    }
  }, [refresh])

  // Installers don't like running side by side, so updates go one at a time.
  const pump = useCallback(async () => {
    if (running.current) return
    running.current = true
    while (queue.current.length > 0) {
      const id = queue.current.shift()!
      setStatus((s) => ({ ...s, [id]: 'updating' }))
      try {
        await wingetUpgrade(id)
        setStatus((s) => {
          const next = { ...s }
          delete next[id]
          return next
        })
        dropFromCache(id)
      } catch {
        setStatus((s) => ({ ...s, [id]: 'failed' }))
      }
    }
    running.current = false
  }, [])

  const enqueue = (ids: string[]) => {
    const fresh = ids.filter((id) => status[id] !== 'queued' && status[id] !== 'updating')
    if (fresh.length === 0) return
    queue.current.push(...fresh)
    setStatus((s) => {
      const next = { ...s }
      fresh.forEach((id) => (next[id] = 'queued'))
      return next
    })
    void pump()
  }

  const hide = (id: string) =>
    updateWidget(widget.id, { ignored: [...(widget.ignored ?? []), id] })

  const ignored = new Set(widget.ignored ?? [])
  const visible = (snap?.list ?? []).filter((p) => !ignored.has(p.id))
  const busy = Object.values(status).some((s) => s === 'queued' || s === 'updating')

  const checkedLabel = (() => {
    if (!snap) return null
    const mins = Math.round((Date.now() - snap.at) / 60000)
    const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' })
    const when = mins < 60 ? rtf.format(-mins, 'minute') : rtf.format(-Math.round(mins / 60), 'hour')
    return t('winget.checked', { when })
  })()

  const errorText =
    snap?.error === 'winget-missing'
      ? t('winget.missing')
      : snap?.error
        ? t('winget.checkFailed')
        : null

  return (
    <div className="glass flex h-full w-full flex-col gap-2 overflow-hidden rounded-[14px] border border-[var(--border)] p-3">
      <div className="flex items-center gap-2">
        <PackageCheck size={14} strokeWidth={2} className="shrink-0 text-[var(--text-secondary)]" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-[var(--text-primary)]">
          {snap && !snap.error
            ? t('winget.count', { count: visible.length })
            : t('winget.title')}
        </span>
        {visible.length > 1 && (
          <Tooltip label={t('winget.updateAllTip')} side="top">
            <button
              type="button"
              disabled={busy}
              onClick={() => enqueue(visible.map((p) => p.id))}
              className="shrink-0 rounded-[8px] bg-[var(--accent)] px-2 py-1 text-[11px] font-semibold text-[var(--on-accent)] transition-opacity disabled:opacity-50"
            >
              {t('winget.updateAll')}
            </button>
          </Tooltip>
        )}
        <Tooltip label={t('winget.refresh')} side="top">
          <button
            type="button"
            disabled={checking}
            onClick={() => refresh(true)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-2)]"
          >
            <RotateCw size={13} strokeWidth={2} className={cn(checking && 'animate-spin')} />
          </button>
        </Tooltip>
      </div>

      {checkedLabel && (
        <div className="-mt-1 text-[10.5px] text-[var(--text-tertiary)]">
          {checking ? t('winget.checking') : checkedLabel}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {!snap && (
          <div className="m-auto flex items-center gap-2 text-[12px] text-[var(--text-tertiary)]">
            <Loader2 size={13} className="animate-spin" />
            {t('winget.checking')}
          </div>
        )}
        {errorText && (
          <div className="m-auto px-2 text-center text-[12px] text-[var(--text-tertiary)]">{errorText}</div>
        )}
        {snap && !snap.error && visible.length === 0 && (
          <div className="m-auto text-center text-[12px] text-[var(--text-tertiary)]">
            {t('winget.upToDate')}
          </div>
        )}
        {visible.map((p) => {
          const s = status[p.id]
          return (
            <div
              key={p.id}
              className="group flex items-center gap-2 rounded-[9px] bg-[var(--fill-1)] px-2.5 py-1.5"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[12px] font-medium text-[var(--text-primary)]">{p.name}</span>
                <span className="truncate text-[10.5px] tabular-nums text-[var(--text-tertiary)]">
                  {p.version} → {p.available}
                </span>
              </div>
              {!s && (
                <Tooltip label={t('winget.hide')} side="top">
                  <button
                    type="button"
                    onClick={() => hide(p.id)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] text-[var(--text-tertiary)] opacity-0 transition-opacity hover:bg-[var(--fill-2)] group-hover:opacity-100"
                  >
                    <EyeOff size={13} strokeWidth={2} />
                  </button>
                </Tooltip>
              )}
              {s === 'queued' ? (
                <Tooltip label={t('winget.queued')} side="top">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center text-[var(--text-tertiary)]">
                    <Clock size={13} strokeWidth={2} />
                  </span>
                </Tooltip>
              ) : s === 'updating' ? (
                <Tooltip label={t('winget.updating')} side="top">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center text-[var(--accent)]">
                    <Loader2 size={14} className="animate-spin" />
                  </span>
                </Tooltip>
              ) : (
                <Tooltip label={s === 'failed' ? t('winget.failedTip') : t('winget.update')} side="top">
                  <button
                    type="button"
                    onClick={() => enqueue([p.id])}
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] transition-colors hover:bg-[var(--fill-2)]',
                      s === 'failed' ? 'text-[var(--danger)]' : 'text-[var(--text-secondary)]',
                    )}
                  >
                    {s === 'failed' ? <AlertTriangle size={13} strokeWidth={2} /> : <Download size={13} strokeWidth={2} />}
                  </button>
                </Tooltip>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WingetSettings({
  widget,
  onUpdate,
}: {
  widget: WingetWidgetType
  onUpdate: (patch: Partial<WingetWidgetType>) => void
}) {
  const { t } = useTranslation()
  const n = widget.ignored?.length ?? 0
  return (
    <div className="flex w-[220px] flex-col gap-2">
      <span className="text-[12px] text-[var(--text-secondary)]">
        {t('winget.hiddenCount', { count: n })}
      </span>
      <button
        type="button"
        disabled={n === 0}
        onClick={() => onUpdate({ ignored: [] })}
        className="rounded-[8px] bg-[var(--fill-1)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--fill-2)] disabled:opacity-40"
      >
        {t('winget.unhideAll')}
      </button>
    </div>
  )
}

export const wingetDefinition: WidgetDefinition<WingetWidgetType> = {
  type: 'winget',
  label: 'App Updates',
  icon: PackageCheck,
  enabled: true,
  minSize: { width: 220, height: 160 },
  create: (x, y) => ({
    type: 'winget',
    x,
    y,
    width: 300,
    height: 340,
    locked: false,
  }),
  Renderer: WingetRenderer,
  Settings: WingetSettings,
}
