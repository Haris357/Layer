import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Bell, Pin, Pencil, X } from 'lucide-react'
import { Tooltip } from '../components/Tooltip'
import { getSystemStats, type SystemStats } from '../lib/ipc'
import { useNotificationStore } from '../store/notificationStore'
import { useNotchStore, type NotchModuleId } from '../notch/notchStore'
import { useCanvasStore } from '../store/canvasStore'
import { useDesktopForeground } from '../notch/useDesktopForeground'
import { NOTCH_MODULES } from '../notch/modules'

const spring = { type: 'spring', stiffness: 400, damping: 36 } as const

// ---- small helpers ----------------------------------------------------------
function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

function Battery({ pct, charging }: { pct: number; charging: boolean }) {
  const low = pct <= 20 && !charging
  const tint = charging ? 'var(--green,#30d158)' : low ? 'var(--danger,#ff453a)' : 'var(--text-primary)'
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative flex w-[13px] items-end rounded-[3px] p-[1.5px]"
        style={{ height: 22, border: `1.5px solid ${charging ? tint : 'var(--text-tertiary)'}` }}
      >
        <span
          className="absolute left-1/2 h-[2.5px] w-[6px] -translate-x-1/2 rounded-t-[2px]"
          style={{ top: -3.5, background: charging ? tint : 'var(--text-tertiary)' }}
        />
        <div className="w-full rounded-[1.5px] transition-all" style={{ height: `${Math.max(6, pct)}%`, background: tint }} />
      </div>
      <span className="text-[9px] font-medium tabular-nums text-[var(--text-tertiary)]">{pct < 0 ? '—' : pct}</span>
    </div>
  )
}

// ---- the dock ---------------------------------------------------------------
export function Dock() {
  const { t } = useTranslation()
  const modules = useNotchStore((s) => s.modules)
  const enabledIds = modules.filter((m) => m.enabled).map((m) => m.id)

  const [hovering, setHovering] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [feature, setFeature] = useState<NotchModuleId | null>(null)
  const open = hovering || pinned || feature !== null
  const leaveTimer = useRef<number | undefined>(undefined)

  const now = useClock()
  const [stats, setStats] = useState<SystemStats | null>(null)
  useEffect(() => {
    let alive = true
    const run = () => getSystemStats().then((v) => alive && setStats(v)).catch(() => {})
    run()
    const id = window.setInterval(run, 4000)
    return () => { alive = false; window.clearInterval(id) }
  }, [])

  const unread = useNotificationStore((s) => s.items.filter((n) => !n.read).length)
  const desktopForeground = useDesktopForeground()

  const onEnter = () => { window.clearTimeout(leaveTimer.current); setHovering(true) }
  const onLeave = () => {
    window.clearTimeout(leaveTimer.current)
    leaveTimer.current = window.setTimeout(() => setHovering(false), 240)
  }

  const openFeature = (id: NotchModuleId) => setFeature((f) => (f === id ? null : id))

  const hh = String(((now.getHours() + 11) % 12) + 1).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const day = now.toLocaleDateString(undefined, { weekday: 'short' })
  const date = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  const activeDef = feature ? NOTCH_MODULES[feature] : null
  const ActiveView = activeDef?.Expanded

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-end">
      <div className="flex items-stretch gap-2 pr-0" onMouseEnter={onEnter} onMouseLeave={onLeave}>
        {/* slide-out feature panel (left of the rail) */}
        <AnimatePresence>
          {activeDef && ActiveView && (
            <motion.div
              key={feature}
              data-hit
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 18 }}
              transition={spring}
              className="pointer-events-auto my-auto flex max-h-[88vh] w-[260px] flex-col overflow-hidden rounded-[22px] border border-[var(--border)] p-4 text-[var(--text-primary)]"
              style={{
                background: 'var(--surface)',
              }}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[15px] font-semibold">{activeDef.label}</span>
                <button
                  type="button"
                  onClick={() => setFeature(null)}
                  className="flex h-7 w-7 items-center justify-center rounded-[9px] text-[var(--text-tertiary)] hover:bg-[var(--fill-2)]"
                >
                  <X size={15} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
                <ActiveView />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* the rail, pinned to the right edge */}
        <motion.div
          data-hit
          animate={{ width: open ? 70 : 9 }}
          transition={spring}
          className="pointer-events-auto my-auto flex flex-col items-center overflow-hidden text-[var(--text-primary)]"
          style={{
            height: open ? 'auto' : 150,
            minHeight: open ? 360 : undefined,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRight: 'none',
            borderRadius: '20px 0 0 20px',
          }}
        >
          <AnimatePresence initial={false} mode="wait">
            {open ? (
              <motion.div
                key="open"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14 }}
                className="flex w-[70px] flex-col items-center gap-2.5 px-2 py-3"
              >
                {/* notifications */}
                <Tooltip label={t('dock.notifications')} side="left">
                  <button
                    type="button"
                    onClick={() => openFeature('notifications')}
                    className="flex w-full flex-col items-center gap-0.5 rounded-[10px] py-1 hover:bg-[var(--fill-2)]"
                  >
                    <div className="relative">
                      <Bell size={16} className="text-[var(--text-secondary)]" strokeWidth={1.8} />
                      {unread > 0 && (
                        <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--green,#30d158)] px-1 text-[8px] font-bold text-black">
                          {unread > 9 ? '9+' : unread}
                        </span>
                      )}
                    </div>
                  </button>
                </Tooltip>

                <div className="h-px w-7 bg-[var(--border)]" />

                {/* clock */}
                <div className="flex flex-col items-center leading-none">
                  <span className="text-[20px] font-semibold tabular-nums tracking-tight">{hh}</span>
                  <span className="my-0.5 text-[20px] font-semibold tabular-nums leading-none text-[var(--text-secondary)]">{mm}</span>
                  <span className="mt-1 text-[10px] font-medium lowercase text-[var(--text-secondary)]">{day}</span>
                  <span className="text-[9px] lowercase text-[var(--text-tertiary)]">{date}</span>
                </div>

                {/* battery */}
                <Battery pct={stats ? stats.battery : -1} charging={!!stats?.charging} />

                <div className="h-px w-7 bg-[var(--border)]" />

                {/* feature modules */}
                <div className="flex flex-col items-center gap-1.5">
                  {enabledIds.map((id) => {
                    const def = NOTCH_MODULES[id]
                    const Icon = def.icon
                    const on = feature === id
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => openFeature(id)}
                        title={def.label}
                        className="flex h-9 w-9 items-center justify-center rounded-[11px] transition-colors"
                        style={
                          on
                            ? { background: def.accent, color: '#fff' }
                            : { background: 'var(--fill-1)', color: 'var(--text-secondary)' }
                        }
                      >
                        <Icon size={17} strokeWidth={1.8} />
                      </button>
                    )
                  })}
                </div>

                <div className="h-px w-7 bg-[var(--border)]" />

                {/* edit (only on desktop) + pin */}
                {desktopForeground && (
                  <Tooltip label={t('dock.editWidgets')} side="left">
                    <button
                      type="button"
                      onClick={() => useCanvasStore.getState().setMode('edit')}
                      className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[var(--fill-1)] text-[var(--text-secondary)] hover:bg-[var(--fill-2)]"
                    >
                      <Pencil size={16} strokeWidth={1.8} />
                    </button>
                  </Tooltip>
                )}
                <Tooltip label={pinned ? t('dock.unpinHint') : t('dock.pinHint')} side="left">
                  <button
                    type="button"
                    onClick={() => setPinned((p) => !p)}
                    className="flex h-9 w-9 items-center justify-center rounded-[11px] transition-colors"
                    style={pinned ? { background: 'var(--accent)', color: '#fff' } : { background: 'var(--fill-1)', color: 'var(--text-secondary)' }}
                  >
                    <Pin size={15} strokeWidth={1.8} />
                  </button>
                </Tooltip>
              </motion.div>
            ) : (
              <motion.div
                key="closed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14 }}
                className="flex h-full w-[9px] items-center justify-center"
              >
                <span className="h-14 w-[3.5px] rounded-full bg-[var(--text-tertiary)]" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  )
}
