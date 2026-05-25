import { useEffect, useRef, useState, type ReactNode } from 'react'
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
  X,
} from 'lucide-react'
import { useCanvasStore } from '../store/canvasStore'
import { useSettingsStore } from '../store/settingsStore'
import { useNotificationStore } from '../store/notificationStore'
import { notify } from '../lib/notify'
import { getUpdate } from '../lib/updater'
import { widgetList, type WidgetDefinition } from '../lib/widgetRegistry'
import { cn } from '../lib/utils'
import { SettingsModal } from './SettingsModal'
import { SpacesModal } from './SpacesModal'
import { NotificationsPanel } from './NotificationsPanel'

const spring = { type: 'spring', stiffness: 380, damping: 34 } as const

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
          className="glass pointer-events-none absolute left-1/2 top-full z-[60] mt-2 -translate-x-1/2 whitespace-nowrap rounded-[7px] border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--text-primary)] shadow-md"
        >
          {label}
        </motion.span>
      )}
    </AnimatePresence>
  )
}

function ToolButton({
  index,
  label,
  danger,
  onClick,
  children,
}: {
  index: number
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
      initial={{ opacity: 0, scale: 0.5, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.5, y: -8 }}
      transition={{ ...spring, delay: index * 0.028 }}
      whileHover={{ scale: 1.15 }}
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
  const mode = useCanvasStore((s) => s.mode)
  const toggleMode = useCanvasStore((s) => s.toggleMode)
  const addWidget = useCanvasStore((s) => s.addWidget)
  const widgets = useCanvasStore((s) => s.widgets)
  const lockAll = useCanvasStore((s) => s.lockAll)
  const setBackgroundAll = useCanvasStore((s) => s.setBackgroundAll)
  const snapEnabled = useSettingsStore((s) => s.snapEnabled)
  const gridSize = useSettingsStore((s) => s.gridSize)

  const [hovered, setHovered] = useState(false)
  const [notchHov, setNotchHov] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showSpaces, setShowSpaces] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const leaveTimer = useRef<number | undefined>(undefined)
  const unreadCount = useNotificationStore((s) =>
    s.items.reduce((n, i) => n + (i.read ? 0 : 1), 0),
  )

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
            title: `Layer v${u.version} is available`,
            body: 'Open Settings → Check for updates to install.',
            dedupe: `available-${u.version}`,
          })
        } else {
          notify({
            kind: 'info',
            title: 'You’re on the latest version ✦',
            dedupe: `uptodate-${new Date().toDateString()}`,
          })
        }
      } catch {
        notify({ kind: 'info', title: 'Could not check for updates' })
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
    hovered || open || showSettings || showSpaces || showNotifications
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
    leaveTimer.current = window.setTimeout(() => setHovered(false), 260)
  }

  const handleAdd = async (def: WidgetDefinition) => {
    const created = await def.create(0, 0)
    if (!created) return
    const snap = (v: number) =>
      snapEnabled ? Math.round(v / gridSize) * gridSize : v
    const x = snap((window.innerWidth - created.width) / 2)
    const y = snap((window.innerHeight - created.height) / 2)
    addWidget({ ...created, x, y })
  }

  return (
    <>
      <div
        data-hit
        className="fixed left-1/2 top-0 z-[5000] -translate-x-1/2"
        style={{ height: 60 }}
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
                label={open ? 'Exit edit mode' : 'Open menu'}
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
                  className="flex items-center gap-1"
                >
                  <div className="mx-0.5 h-6 w-px shrink-0 bg-[var(--border)]" />
                  {widgetList.map((def, i) => {
                    const Icon = def.icon
                    return (
                      <ToolButton
                        key={def.type}
                        index={i}
                        label={def.label}
                        onClick={() => handleAdd(def)}
                      >
                        <Icon size={18} strokeWidth={1.5} />
                      </ToolButton>
                    )
                  })}
                  <div className="mx-0.5 h-6 w-px shrink-0 bg-[var(--border)]" />
                  <ToolButton
                    index={widgetList.length}
                    label={allLocked ? 'Unlock all' : 'Lock all'}
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
                    label={anyBg ? 'Hide backgrounds' : 'Show backgrounds'}
                    onClick={() => setBackgroundAll(!anyBg)}
                  >
                    {anyBg ? (
                      <Square size={18} strokeWidth={1.5} />
                    ) : (
                      <SquareDashed size={18} strokeWidth={1.5} />
                    )}
                  </ToolButton>
                  <div className="mx-0.5 h-6 w-px shrink-0 bg-[var(--border)]" />
                  <ToolButton
                    index={widgetList.length + 2}
                    label="Spaces"
                    onClick={() => setShowSpaces(true)}
                  >
                    <LayoutTemplate size={18} strokeWidth={1.5} />
                  </ToolButton>
                  <ToolButton
                    index={widgetList.length + 3}
                    label={
                      unreadCount > 0
                        ? `Notifications · ${unreadCount} new`
                        : 'Notifications'
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
                    index={widgetList.length + 4}
                    label="Settings"
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
