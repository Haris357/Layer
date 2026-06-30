import { useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Pencil } from 'lucide-react'
import { Tooltip } from '../components/Tooltip'
import { useNotchStore } from './notchStore'
import { NOTCH_MODULES } from './modules'
import { useLiveActivities } from './useLiveActivities'
import { useDesktopForeground } from './useDesktopForeground'
import { useCanvasStore } from '../store/canvasStore'

const spring = { type: 'spring', stiffness: 380, damping: 34 } as const

// The Layer Notch — rendered as an overlay INSIDE the main window (not a
// separate OS window). The container is click-through; only the pill/panel is
// interactive, marked `data-hit` so the main window's existing hit-region poll
// makes exactly that rect clickable. This avoids spawning a second always-on-top
// window, which contended with the main window's z-order pinning and froze the
// whole app.
export function NotchOverlay() {
  const { t } = useTranslation()
  const expanded = useNotchStore((s) => s.expanded)
  const setExpanded = useNotchStore((s) => s.setExpanded)
  const activeModule = useNotchStore((s) => s.activeModule)
  const setActiveModule = useNotchStore((s) => s.setActiveModule)
  const modules = useNotchStore((s) => s.modules)
  const colorful = useNotchStore((s) => s.colorful)

  const enabled = modules.filter((m) => m.enabled).map((m) => m.id)
  const active =
    (activeModule && enabled.includes(activeModule) ? activeModule : enabled[0]) ??
    null
  const activeDef = active ? NOTCH_MODULES[active] : null
  const ActiveView = activeDef?.Expanded

  const live = useLiveActivities()
  const desktopForeground = useDesktopForeground()

  const leaveTimer = useRef<number | undefined>(undefined)

  const onEnter = () => {
    window.clearTimeout(leaveTimer.current)
    setExpanded(true)
  }
  const onLeave = () => {
    window.clearTimeout(leaveTimer.current)
    leaveTimer.current = window.setTimeout(() => setExpanded(false), 260)
  }

  const openModule = (id: typeof enabled[number]) => {
    setActiveModule(id)
    setExpanded(true)
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-start justify-end p-2">
      <motion.div
        data-hit
        layout
        transition={spring}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        className="pointer-events-auto overflow-hidden text-[var(--text-primary)]"
        style={{
          background: expanded ? 'var(--surface)' : '#0a0a0c',
          backdropFilter: expanded ? 'blur(24px) saturate(180%)' : undefined,
          WebkitBackdropFilter: expanded
            ? 'blur(24px) saturate(180%)'
            : undefined,
          border: expanded ? '1px solid var(--border)' : '1px solid #0a0a0c',
          borderRadius: expanded ? '20px' : '16px',
          boxShadow: expanded
            ? '0 22px 60px -18px rgba(0,0,0,0.55)'
            : '0 6px 18px -8px rgba(0,0,0,0.5)',
        }}
      >
        <AnimatePresence initial={false} mode="wait">
          {expanded ? (
            <motion.div
              key="expanded"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex w-[420px] flex-col gap-3 p-3.5"
            >
              {/* Header: module rail + (contextual) edit button */}
              <div className="flex items-center gap-1.5">
                {enabled.map((id) => {
                  const def = NOTCH_MODULES[id]
                  const Icon = def.icon
                  const on = id === active
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setActiveModule(id)}
                      title={def.label}
                      className="flex h-8 w-8 items-center justify-center rounded-[9px] transition-colors"
                      style={
                        on
                          ? {
                              background: colorful ? def.accent : 'var(--accent)',
                              color: '#fff',
                            }
                          : { color: 'var(--text-secondary)' }
                      }
                    >
                      <Icon size={16} strokeWidth={1.8} />
                    </button>
                  )
                })}
                <div className="flex-1" />
                {desktopForeground && (
                  <Tooltip label={t('dock.editWidgets')} side="bottom">
                    <button
                      type="button"
                      onClick={() => useCanvasStore.getState().setMode('edit')}
                      className="flex h-8 w-8 items-center justify-center rounded-[9px] text-[var(--text-secondary)] hover:bg-[var(--fill-2)]"
                    >
                      <Pencil size={15} strokeWidth={1.8} />
                    </button>
                  </Tooltip>
                )}
              </div>

              {/* Active module */}
              <div className="rounded-[12px] bg-[var(--fill-1)] p-3">
                {ActiveView ? (
                  <ActiveView />
                ) : (
                  <div className="text-[12px] text-[var(--text-tertiary)]">
                    {t('notch.enableHint')}
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.button
              type="button"
              key="collapsed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => live && openModule(live.module)}
              className="flex h-[30px] min-w-[150px] items-center justify-center gap-2 px-3"
            >
              {live ? (
                <>
                  {live.leading}
                  {live.trailing}
                </>
              ) : (
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
                  <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
                  <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
                </span>
              )}
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
