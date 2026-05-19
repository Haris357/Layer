import { useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Layers,
  Settings as SettingsIcon,
  RotateCcw,
  LayoutTemplate,
  Lock,
  LockOpen,
  Square,
  SquareDashed,
} from 'lucide-react'
import { useCanvasStore } from '../store/canvasStore'
import { useSettingsStore } from '../store/settingsStore'
import { widgetList, type WidgetDefinition } from '../lib/widgetRegistry'
import { resetAll as resetAllFiles } from '../lib/ipc'
import { cn } from '../lib/utils'
import { ConfirmDialog } from './ConfirmDialog'
import { SettingsModal } from './SettingsModal'
import { TemplatesModal } from './TemplatesModal'

const spring = { type: 'spring', stiffness: 380, damping: 34 } as const

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
  return (
    <motion.button
      type="button"
      title={label}
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.5, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.5, y: -8 }}
      transition={{ ...spring, delay: index * 0.028 }}
      whileHover={{ scale: 1.15 }}
      whileTap={{ scale: 0.9 }}
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] transition-colors duration-150',
        danger
          ? 'text-[var(--danger)] hover:bg-[var(--fill-1)]'
          : 'text-[var(--text-primary)] hover:bg-[var(--surface-hover)]',
      )}
    >
      {children}
    </motion.button>
  )
}

export function TopIsland() {
  const mode = useCanvasStore((s) => s.mode)
  const toggleMode = useCanvasStore((s) => s.toggleMode)
  const addWidget = useCanvasStore((s) => s.addWidget)
  const resetAll = useCanvasStore((s) => s.resetAll)
  const widgets = useCanvasStore((s) => s.widgets)
  const lockAll = useCanvasStore((s) => s.lockAll)
  const setBackgroundAll = useCanvasStore((s) => s.setBackgroundAll)
  const snapEnabled = useSettingsStore((s) => s.snapEnabled)
  const gridSize = useSettingsStore((s) => s.gridSize)

  const [hovered, setHovered] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const leaveTimer = useRef<number | undefined>(undefined)

  const open = mode === 'edit'
  const down =
    hovered || open || confirmReset || showSettings || showTemplates
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

  const handleReset = () => {
    resetAll()
    resetAllFiles().catch(() => {})
    setConfirmReset(false)
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
              whileTap={{ scale: 0.92 }}
              title={open ? 'Close menu' : 'Open menu'}
              className={cn(
                'flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] px-2 transition-colors duration-150',
                open
                  ? 'bg-[var(--surface-active)]'
                  : 'hover:bg-[var(--surface-hover)]',
              )}
            >
              <Layers
                size={18}
                strokeWidth={1.5}
                className="text-[var(--text-primary)]"
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
                    label="Templates"
                    onClick={() => setShowTemplates(true)}
                  >
                    <LayoutTemplate size={18} strokeWidth={1.5} />
                  </ToolButton>
                  <ToolButton
                    index={widgetList.length + 3}
                    label="Settings"
                    onClick={() => setShowSettings(true)}
                  >
                    <SettingsIcon size={18} strokeWidth={1.5} />
                  </ToolButton>
                  <ToolButton
                    index={widgetList.length + 4}
                    label="Reset canvas"
                    danger
                    onClick={() => setConfirmReset(true)}
                  >
                    <RotateCcw size={18} strokeWidth={1.5} />
                  </ToolButton>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      </div>

      <AnimatePresence>
        {confirmReset && (
          <ConfirmDialog
            title="Reset canvas"
            message="This will delete all widgets. Continue?"
            confirmLabel="Reset"
            onConfirm={handleReset}
            onCancel={() => setConfirmReset(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSettings && (
          <SettingsModal onClose={() => setShowSettings(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTemplates && (
          <TemplatesModal onClose={() => setShowTemplates(false)} />
        )}
      </AnimatePresence>
    </>
  )
}
