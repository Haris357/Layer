import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { listen } from '@tauri-apps/api/event'
import {
  Layers,
  Settings as SettingsIcon,
  LayoutTemplate,
  Lock,
  LockOpen,
  Square,
  SquareDashed,
  BellRing,
  RotateCcw,
  AlertTriangle,
  X,
} from 'lucide-react'
import { useCanvasStore } from '../store/canvasStore'
import { useSettingsStore } from '../store/settingsStore'
import { useToastStore } from '../store/toastStore'
import { useAnchorMonitor } from '../store/monitorStore'
import { useNotificationStore } from '../store/notificationStore'
import { notify } from '../lib/notify'
import { getUpdate } from '../lib/updater'
import { widgetList, type WidgetDefinition } from '../lib/widgetRegistry'
import { cn } from '../lib/utils'
import { SettingsModal } from './SettingsModal'
import { SpacesModal } from './SpacesModal'
import { NotificationsPanel } from './NotificationsPanel'

const spring = { type: 'spring', stiffness: 380, damping: 34 } as const

// Dividers fade with the rest of the row (no instant pop).
const dividerVariants = {
  hidden: { opacity: 0, transition: { duration: 0.12 } },
  shown: { opacity: 1, transition: { duration: 0.22 } },
}

// Small, instant, good-looking tooltip shown below a dock button (the dock
// hugs the top edge, so tooltips drop downward).
function Tip({ label, show }: { label: string; show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.span
          initial={{ opacity: 0, y: -3, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -3, scale: 0.96 }}
          transition={{ duration: 0.12, ease: 'easeOut' }}
          className="glass pointer-events-none absolute left-1/2 top-full z-[60] mt-2 -translate-x-1/2 whitespace-nowrap rounded-[7px] border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--text-primary)]"
        >
          {label}
        </motion.span>
      )}
    </AnimatePresence>
  )
}

function ToolButton({
  label,
  danger,
  onClick,
  children,
}: {
  index?: number
  label: string
  danger?: boolean
  onClick: () => void
  children: ReactNode
}) {
  const [hov, setHov] = useState(false)
  return (
    <motion.button
      type="button"
      onClick={onClick}
      onHoverStart={() => setHov(true)}
      onHoverEnd={() => setHov(false)}
      // Clean reveal: the icons just fade in place (no fly-in / slide) while
      // the bar expands around them. variants are driven by the parent so the
      // whole row appears and disappears together, smoothly.
      variants={{
        hidden: {
          opacity: 0,
          scale: 0.8,
          transition: { duration: 0.13, ease: 'easeOut' },
        },
        shown: {
          opacity: 1,
          scale: 1,
          transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
        },
      }}
      whileHover={{ scale: 1.12 }}
      whileTap={{ scale: 0.9 }}
      className={cn(
        'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] transition-colors duration-150',
        danger
          ? 'text-[var(--danger)] hover:bg-[var(--fill-1)]'
          : 'text-[var(--text-primary)] hover:bg-[var(--surface-hover)]',
      )}
    >
      {children}
      <Tip label={label} show={hov} />
    </motion.button>
  )
}

export function TopIsland() {
  const { t } = useTranslation()
  // Widget display names live in i18n under widgets.<type>, falling back to the
  // registry's English label for any type not yet translated.
  const widgetName = (def: WidgetDefinition) =>
    t(`widgets.${def.type}`, { defaultValue: def.label })
  const mode = useCanvasStore((s) => s.mode)
  const toggleMode = useCanvasStore((s) => s.toggleMode)
  const addWidget = useCanvasStore((s) => s.addWidget)
  const widgets = useCanvasStore((s) => s.widgets)
  const lockAll = useCanvasStore((s) => s.lockAll)
  const setBackgroundAll = useCanvasStore((s) => s.setBackgroundAll)
  const resetSpace = useCanvasStore((s) => s.resetSpace)
  const activeId = useCanvasStore((s) => s.activeId)
  const toast = useToastStore((s) => s.show)
  const snapEnabled = useSettingsStore((s) => s.snapEnabled)
  const gridSize = useSettingsStore((s) => s.gridSize)
  const primary = useAnchorMonitor()

  const [hovered, setHovered] = useState(false)
  const [notchHov, setNotchHov] = useState(false)
  // Which widget type's style dropdown is open (e.g. the clock).
  const [styleMenu, setStyleMenu] = useState<string | null>(null)
  // Reset-this-space needs a confirming second click.
  const [confirmReset, setConfirmReset] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showSpaces, setShowSpaces] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const leaveTimer = useRef<number | undefined>(undefined)
  const unreadCount = useNotificationStore((s) =>
    s.items.reduce((n, i) => n + (i.read ? 0 : 1), 0),
  )

  // Safety for the destructive "Reset this space" action. The first click only
  // *arms* it (confirmReset = true); the second click actually wipes the space.
  // Auto-disarm when the bar closes or after a few seconds — otherwise a stale
  // armed state (e.g. an accidental first click, then walking away) could fire
  // the reset on a later, unrelated click and clear all widgets.
  useEffect(() => {
    if (!confirmReset) return
    const id = window.setTimeout(() => setConfirmReset(false), 3000)
    return () => window.clearTimeout(id)
  }, [confirmReset])
  useEffect(() => {
    if (!hovered) setConfirmReset(false)
  }, [hovered])

  // The tray menu fires these events; we open the matching modal here.
  useEffect(() => {
    const unTpl = listen('open-spaces', () => setShowSpaces(true))
    const unNot = listen('open-notifications', () =>
      setShowNotifications(true),
    )
    const unSet = listen('open-settings', () => setShowSettings(true))
    const unLock = listen('toggle-lock-all', () => {
      // Read the latest canvas state directly so this listener doesn't
      // need to be torn down + rebuilt every time widgets change.
      const s = useCanvasStore.getState()
      const allLockedNow =
        s.widgets.length > 0 && s.widgets.every((w) => w.locked)
      s.lockAll(!allLockedNow)
    })
    const unUpd = listen('check-updates', async () => {
      try {
        const u = await getUpdate()
        if (u) {
          notify({
            kind: 'update',
            title: t('updates.available', { version: u.version }),
            body: t('updates.availableBody'),
            dedupe: `available-${u.version}`,
          })
        } else {
          notify({
            kind: 'info',
            title: t('updates.upToDate'),
            dedupe: `uptodate-${new Date().toDateString()}`,
          })
        }
      } catch {
        notify({ kind: 'info', title: t('updates.checkFailed') })
      }
    })
    return () => {
      unTpl.then((f) => f()).catch(() => {})
      unNot.then((f) => f()).catch(() => {})
      unSet.then((f) => f()).catch(() => {})
      unLock.then((f) => f()).catch(() => {})
      unUpd.then((f) => f()).catch(() => {})
    }
  }, [])

  const open = mode === 'edit'
  const down =
    hovered ||
    open ||
    showSettings ||
    showSpaces ||
    showNotifications ||
    styleMenu !== null

  // Close the style dropdown on any click outside it, and when leaving edit
  // mode. It is NOT tied to dock hover, so hovering its items never closes it.
  useEffect(() => {
    if (!styleMenu) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element | null
      if (t && t.closest('[data-style-dd]')) return
      setStyleMenu(null)
    }
    window.addEventListener('mousedown', onDown, true)
    return () => window.removeEventListener('mousedown', onDown, true)
  }, [styleMenu])

  useEffect(() => {
    if (!open) setStyleMenu(null)
  }, [open])
  const allLocked = widgets.length > 0 && widgets.every((w) => w.locked)
  const anyBg = widgets.some(
    (w) => w.type !== 'note' && w.background !== false,
  )

  const handleEnter = () => {
    if (leaveTimer.current !== undefined) {
      window.clearTimeout(leaveTimer.current)
      leaveTimer.current = undefined
    }
    setHovered(true)
  }

  const handleLeave = () => {
    if (leaveTimer.current !== undefined) {
      window.clearTimeout(leaveTimer.current)
    }
    leaveTimer.current = window.setTimeout(() => {
      setHovered(false)
      setConfirmReset(false)
    }, 260)
  }

  const handleAdd = async (
    def: WidgetDefinition,
    patch?: Record<string, unknown>,
  ) => {
    setStyleMenu(null)
    const created = await def.create(0, 0)
    if (!created) return
    const merged = (patch ? { ...created, ...patch } : created) as typeof created
    const snap = (v: number) =>
      snapEnabled ? Math.round(v / gridSize) * gridSize : v
    const x = snap((window.innerWidth - merged.width) / 2)
    const y = snap((window.innerHeight - merged.height) / 2)
    addWidget({ ...merged, x, y })
  }

  return (
    <>
      <div
        data-hit
        className="fixed z-[5000] -translate-x-1/2"
        style={{
          height: 60,
          // Anchor to the primary monitor's top-centre so the dock always sits
          // on a real screen — not the centre of the combined virtual desktop,
          // which can fall in the empty gap between mismatched monitors.
          left: primary ? primary.x + primary.w / 2 : '50%',
          top: primary ? primary.y : 0,
        }}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        <motion.div
          animate={{ y: down ? 0 : -40 }}
          transition={spring}
        >
          <motion.div
            layout
            transition={spring}
            className="glass flex items-center gap-1 border border-t-0 border-[var(--border)] px-1.5 py-1.5"
            style={{ borderRadius: '0 0 16px 16px' }}
          >
            <motion.button
              layout
              type="button"
              onClick={toggleMode}
              onHoverStart={() => setNotchHov(true)}
              onHoverEnd={() => setNotchHov(false)}
              whileTap={{ scale: 0.92 }}
              className={cn(
                'relative flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] px-2 transition-colors duration-150',
                open
                  ? 'bg-[var(--surface-active)]'
                  : 'hover:bg-[var(--surface-hover)]',
              )}
            >
              {open ? (
                <X
                  size={18}
                  strokeWidth={2}
                  className="text-[var(--text-primary)]"
                />
              ) : (
                <Layers
                  size={18}
                  strokeWidth={1.5}
                  className="text-[var(--text-primary)]"
                />
              )}
              <Tip
                label={open ? t('toolbar.exitEdit') : t('toolbar.openMenu')}
                show={notchHov}
              />
              <AnimatePresence initial={false}>
                {!open && (
                  <motion.span
                    key="name"
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={spring}
                    className="overflow-hidden whitespace-nowrap text-[var(--text-primary)]"
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      letterSpacing: '-0.3px',
                    }}
                  >
                    Layer
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>

            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  key="tools"
                  layout
                  initial="hidden"
                  animate="shown"
                  exit="hidden"
                  variants={{
                    // Gentle, quick cascade — opens left→right, closes right→left.
                    shown: {
                      transition: { staggerChildren: 0.012, delayChildren: 0.03 },
                    },
                    hidden: {
                      transition: { staggerChildren: 0.01, staggerDirection: -1 },
                    },
                  }}
                  className="flex items-center gap-1"
                >
                  <motion.div variants={dividerVariants} className="mx-0.5 h-6 w-px shrink-0 bg-[var(--border)]" />
                  {widgetList.map((def, i) => {
                    const Icon = def.icon
                    if (def.styles && def.styles.length > 0) {
                      const isOpen = styleMenu === def.type
                      return (
                        <div
                          key={def.type}
                          className="relative"
                          data-style-dd
                        >
                          <ToolButton
                            index={i}
                            label={t('toolbar.styles', { name: widgetName(def) })}
                            onClick={() =>
                              setStyleMenu(isOpen ? null : def.type)
                            }
                          >
                            <Icon size={18} strokeWidth={1.5} />
                          </ToolButton>
                          <AnimatePresence>
                            {isOpen && (
                              <motion.div
                                data-hit
                                initial={{ opacity: 0, y: -6, x: '-50%' }}
                                animate={{ opacity: 1, y: 0, x: '-50%' }}
                                exit={{ opacity: 0, y: -6, x: '-50%' }}
                                transition={{ duration: 0.14, ease: 'easeOut' }}
                                // data-hit makes the transparent window capture
                                // clicks here (it renders below the dock's hit
                                // region). pt-2 is padding, not margin, so the
                                // gap to the dock stays interactive.
                                className="absolute left-1/2 top-full z-[60] pt-2"
                              >
                                <div className="glass flex w-[150px] flex-col gap-0.5 rounded-[10px] border border-[var(--border)] p-1">
                                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                                    {t('toolbar.styleHeader', {
                                      name: widgetName(def),
                                    })}
                                  </div>
                                  {def.styles.map((s) => (
                                    <button
                                      key={s.key}
                                      type="button"
                                      onClick={() => handleAdd(def, s.patch)}
                                      className="cursor-pointer rounded-[7px] px-2.5 py-2 text-left text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-2)] hover:text-[var(--text-primary)] focus:bg-[var(--fill-2)] focus:text-[var(--text-primary)] focus:outline-none active:scale-[0.98]"
                                    >
                                      {s.label}
                                    </button>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )
                    }
                    return (
                      <ToolButton
                        key={def.type}
                        index={i}
                        label={widgetName(def)}
                        onClick={() => handleAdd(def)}
                      >
                        <Icon size={18} strokeWidth={1.5} />
                      </ToolButton>
                    )
                  })}
                  <motion.div variants={dividerVariants} className="mx-0.5 h-6 w-px shrink-0 bg-[var(--border)]" />
                  <ToolButton
                    index={widgetList.length}
                    label={allLocked ? t('toolbar.unlockAll') : t('toolbar.lockAll')}
                    onClick={() => lockAll(!allLocked)}
                  >
                    {allLocked ? (
                      <Lock size={18} strokeWidth={1.5} />
                    ) : (
                      <LockOpen size={18} strokeWidth={1.5} />
                    )}
                  </ToolButton>
                  <ToolButton
                    index={widgetList.length + 1}
                    label={
                      anyBg
                        ? t('toolbar.hideBackgrounds')
                        : t('toolbar.showBackgrounds')
                    }
                    onClick={() => setBackgroundAll(!anyBg)}
                  >
                    {anyBg ? (
                      <Square size={18} strokeWidth={1.5} />
                    ) : (
                      <SquareDashed size={18} strokeWidth={1.5} />
                    )}
                  </ToolButton>
                  <motion.div variants={dividerVariants} className="mx-0.5 h-6 w-px shrink-0 bg-[var(--border)]" />
                  <ToolButton
                    index={widgetList.length + 2}
                    danger={confirmReset}
                    label={
                      confirmReset
                        ? t('toolbar.resetSpaceConfirm')
                        : t('toolbar.resetSpace')
                    }
                    onClick={() => {
                      if (confirmReset) {
                        resetSpace(activeId)
                        setConfirmReset(false)
                        toast(t('toolbar.spaceReset'))
                      } else {
                        setConfirmReset(true)
                      }
                    }}
                  >
                    {confirmReset ? (
                      <AlertTriangle size={18} strokeWidth={2} />
                    ) : (
                      <RotateCcw size={18} strokeWidth={1.5} />
                    )}
                  </ToolButton>
                  <ToolButton
                    index={widgetList.length + 3}
                    label={t('toolbar.spaces')}
                    onClick={() => setShowSpaces(true)}
                  >
                    <LayoutTemplate size={18} strokeWidth={1.5} />
                  </ToolButton>
                  <ToolButton
                    index={widgetList.length + 4}
                    label={
                      unreadCount > 0
                        ? t('toolbar.notificationsNew', { count: unreadCount })
                        : t('toolbar.notifications')
                    }
                    onClick={() => setShowNotifications(true)}
                  >
                    <span className="relative inline-flex">
                      <BellRing size={18} strokeWidth={1.5} />
                      {unreadCount > 0 && (
                        <span
                          className="absolute -right-[3px] -top-[2px] h-[7px] w-[7px] rounded-full ring-2 ring-[var(--surface)]"
                          style={{ background: 'var(--accent)' }}
                        />
                      )}
                    </span>
                  </ToolButton>
                  <ToolButton
                    index={widgetList.length + 5}
                    label={t('toolbar.settings')}
                    onClick={() => setShowSettings(true)}
                  >
                    <SettingsIcon size={18} strokeWidth={1.5} />
                  </ToolButton>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      </div>

      <AnimatePresence>
        {showSettings && (
          <SettingsModal onClose={() => setShowSettings(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showNotifications && (
          <NotificationsPanel onClose={() => setShowNotifications(false)} />
        )}

        {showSpaces && (
          <SpacesModal onClose={() => setShowSpaces(false)} />
        )}
      </AnimatePresence>
    </>
  )
}
