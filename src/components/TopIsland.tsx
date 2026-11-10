import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, animate, motion, useMotionValue } from 'framer-motion'
import { listen } from '@tauri-apps/api/event'
import {
  Layers,
  Settings as SettingsIcon,
  LayoutTemplate,
  PanelTopClose,
  PanelTopOpen,
  Lock,
  LockOpen,
  Square,
  SquareDashed,
  BellRing,
  RotateCcw,
  AlertTriangle,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useCanvasStore } from '../store/canvasStore'
import { useSettingsStore } from '../store/settingsStore'
import { useToastStore } from '../store/toastStore'
import { useAnchorMonitor } from '../store/monitorStore'
import { useNotificationStore } from '../store/notificationStore'
import { notify } from '../lib/notify'
import { setForceInteractive } from '../lib/ipc'
import { getUpdate } from '../lib/updater'
import { widgetList, widgetRegistry, type WidgetDefinition } from '../lib/widgetRegistry'
import type { WidgetType } from '../types/widget'
import { cn } from '../lib/utils'
import { SettingsModal } from './SettingsModal'
import { SpacesModal } from './SpacesModal'
import { NotificationsPanel } from './NotificationsPanel'
import { LayerHub, type HubView } from './LayerHub'
import { useTourStore } from '../store/tourStore'
import { Tooltip } from './Tooltip'

const spring = { type: 'spring', stiffness: 380, damping: 34 } as const

// Dividers fade with the rest of the row (no instant pop).
const dividerVariants = {
  hidden: { opacity: 0, transition: { duration: 0.12 } },
  shown: { opacity: 1, transition: { duration: 0.22 } },
}

function ToolButton({
  label,
  danger,
  onClick,
  children,
  tour,
}: {
  index?: number
  label: string
  danger?: boolean
  onClick: () => void
  children: ReactNode
  // Anchor for the guided tour's spotlight.
  tour?: string
}) {
  return (
    <Tooltip label={label} side="bottom">
      <motion.button
        type="button"
        data-tour={tour}
        onClick={onClick}
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
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] transition-colors duration-150',
          danger
            ? 'text-[var(--danger)] hover:bg-[var(--fill-1)]'
            : 'text-[var(--text-primary)] hover:bg-[var(--surface-hover)]',
        )}
      >
        {children}
      </motion.button>
    </Tooltip>
  )
}

const FADE_PX = 28

// Horizontally scrolling strip for the widget icons, so the bar keeps a sane
// width however many widgets exist. The mouse wheel (vertical or horizontal)
// and the edge arrows drive an eased scroll; edges fade out while there's
// more content in that direction.
function WidgetScroller({
  maxWidth,
  leftLabel,
  rightLabel,
  children,
}: {
  maxWidth: number
  leftLabel: string
  rightLabel: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const target = useRef(0)
  const raf = useRef<number | null>(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    const left = el.scrollLeft > 1
    const right = el.scrollLeft < max - 1
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }))
  }, [])

  const animateTo = useCallback((x: number) => {
    const el = ref.current
    if (!el) return
    target.current = Math.min(Math.max(0, el.scrollWidth - el.clientWidth), Math.max(0, x))
    if (raf.current !== null) return
    const step = () => {
      const d = target.current - el.scrollLeft
      if (Math.abs(d) <= 1) {
        el.scrollLeft = target.current
        raf.current = null
        return
      }
      const before = el.scrollLeft
      // Ease out, but always move at least 1px so sub-pixel rounding can't
      // stall the loop short of the target.
      el.scrollLeft += Math.sign(d) * Math.max(1, Math.abs(d) * 0.18)
      if (el.scrollLeft === before) {
        raf.current = null
        return
      }
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Native listener: React's onWheel is passive, so it can't preventDefault.
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return
      e.preventDefault()
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientWidth : 1
      const delta = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * unit
      animateTo((raf.current !== null ? target.current : el.scrollLeft) + delta)
    }
    // Grab-and-drag scrolling. A press only becomes a drag after 5px of
    // movement, so a plain click still adds the widget; after a real drag the
    // resulting click is swallowed. Releasing mid-swipe glides on (fling).
    let drag: {
      id: number
      x: number
      start: number
      moved: boolean
      lastX: number
      lastT: number
      v: number
    } | null = null
    let swallowClick = false
    const onDown = (e: PointerEvent) => {
      swallowClick = false
      if (e.button !== 0 || el.scrollWidth <= el.clientWidth) return
      const now = performance.now()
      drag = { id: e.pointerId, x: e.clientX, start: el.scrollLeft, moved: false, lastX: e.clientX, lastT: now, v: 0 }
    }
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      const dx = e.clientX - drag.x
      if (!drag.moved) {
        if (Math.abs(dx) < 5) return
        drag.moved = true
        el.setPointerCapture(e.pointerId)
        el.style.cursor = 'grabbing'
        if (raf.current !== null) cancelAnimationFrame(raf.current)
        raf.current = null
      }
      el.scrollLeft = drag.start - dx
      const now = performance.now()
      const dt = now - drag.lastT
      if (dt > 0) drag.v = 0.8 * ((e.clientX - drag.lastX) / dt) + 0.2 * drag.v
      drag.lastX = e.clientX
      drag.lastT = now
    }
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      const d = drag
      drag = null
      if (!d.moved) return
      el.style.cursor = ''
      swallowClick = true
      // Only fling if the pointer was still moving when released.
      if (performance.now() - d.lastT < 80) animateTo(el.scrollLeft - d.v * 220)
    }
    const onClickCapture = (e: MouseEvent) => {
      if (!swallowClick) return
      swallowClick = false
      e.preventDefault()
      e.stopPropagation()
    }
    const onDragStart = (e: DragEvent) => e.preventDefault()

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('scroll', measure, { passive: true })
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('click', onClickCapture, true)
    el.addEventListener('dragstart', onDragStart)
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('scroll', measure)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('click', onClickCapture, true)
      el.removeEventListener('dragstart', onDragStart)
      ro.disconnect()
      if (raf.current !== null) cancelAnimationFrame(raf.current)
      raf.current = null
    }
  }, [animateTo, measure])

  const page = (dir: 1 | -1) => {
    const el = ref.current
    if (!el) return
    const base = raf.current !== null ? target.current : el.scrollLeft
    animateTo(base + dir * el.clientWidth * 0.8)
  }

  const mask = `linear-gradient(to right, ${edges.left ? 'transparent' : '#000'} 0, #000 ${FADE_PX}px, #000 calc(100% - ${FADE_PX}px), ${edges.right ? 'transparent' : '#000'} 100%)`

  const arrow = (dir: 1 | -1) => (
    <motion.div
      key={dir}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      className={cn('absolute top-1/2 z-10 -translate-y-1/2', dir < 0 ? 'left-0' : 'right-0')}
    >
      <Tooltip label={dir < 0 ? leftLabel : rightLabel} side="bottom">
        <button
          type="button"
          onClick={() => page(dir)}
          className="glass flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-primary)] shadow-sm transition-transform hover:scale-110 active:scale-95"
        >
          {dir < 0 ? (
            <ChevronLeft size={14} strokeWidth={2.2} />
          ) : (
            <ChevronRight size={14} strokeWidth={2.2} />
          )}
        </button>
      </Tooltip>
    </motion.div>
  )

  return (
    <div data-tour="widgets" className="relative flex min-w-0 items-center">
      <div
        ref={ref}
        className="flex select-none items-center gap-1 overflow-x-auto"
        style={{ maxWidth, maskImage: mask, WebkitMaskImage: mask }}
      >
        {children}
      </div>
      <AnimatePresence>
        {edges.left && arrow(-1)}
        {edges.right && arrow(1)}
      </AnimatePresence>
    </div>
  )
}

// The style-variant dropdown for widgets with more than one look (currently
// just Clock). Portaled + rect-anchored, same pattern as Menu.tsx and
// Tooltip.tsx, so it escapes the widget row's overflow-x-auto clipping
// instead of being cut off by it (per spec, overflow-x: auto on one axis
// makes the other axis clip too, even though only X is meant to scroll).
function StyleMenu({
  def,
  isOpen,
  onToggle,
  onPick,
  label,
  headerLabel,
}: {
  def: WidgetDefinition
  isOpen: boolean
  onToggle: () => void
  onPick: (patch?: Record<string, unknown>) => void
  label: string
  headerLabel: string
}) {
  const { t } = useTranslation()
  const btnRef = useRef<HTMLButtonElement>(null)
  const [rect, setRect] = useState<{ left: number; bottom: number } | null>(null)
  const Icon = def.icon

  useLayoutEffect(() => {
    if (!isOpen) return
    const update = () => {
      const b = btnRef.current
      if (!b) return
      const r = b.getBoundingClientRect()
      setRect({ left: r.left + r.width / 2, bottom: r.bottom })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [isOpen])

  return (
    <div className="relative" data-style-dd>
      <Tooltip label={label} side="bottom">
        <motion.button
          ref={btnRef}
          type="button"
          onClick={onToggle}
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
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--surface-hover)]"
        >
          <Icon size={18} strokeWidth={1.5} />
        </motion.button>
      </Tooltip>

      {createPortal(
        <AnimatePresence>
          {isOpen && rect && (
            <motion.div
              data-hit
              data-style-dd
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.14, ease: 'easeOut' }}
              style={{
                position: 'fixed',
                left: rect.left,
                top: rect.bottom + 8,
                transform: 'translateX(-50%)',
                zIndex: 10050,
              }}
            >
              <div className="glass flex w-[150px] flex-col gap-0.5 rounded-[10px] border border-[var(--border)] p-1">
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                  {headerLabel}
                </div>
                {def.styles!.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => onPick(s.patch)}
                    className="cursor-pointer rounded-[7px] px-2.5 py-2 text-left text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-2)] hover:text-[var(--text-primary)] focus:bg-[var(--fill-2)] focus:text-[var(--text-primary)] focus:outline-none active:scale-[0.98]"
                  >
                    {t(`widgetStyles.${def.type}.${s.key}`, { defaultValue: s.label })}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
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
  // Whole bar ≈ 85% of the screen it sits on; ~330px of that is the fixed
  // buttons (close, lock, backgrounds, reset, spaces, notifications,
  // settings), the rest is the scrolling widget strip. Uses the monitor, not
  // 100vw — the window spans every monitor.
  const screenW = primary ? primary.w : window.innerWidth
  const stripMax = Math.max(240, Math.round(screenW * 0.85) - 330)

  const [hovered, setHovered] = useState(false)
  // Which widget type's style dropdown is open (e.g. the clock).
  const [styleMenu, setStyleMenu] = useState<string | null>(null)
  // Reset-this-space needs a confirming second click.
  const [confirmReset, setConfirmReset] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showSpaces, setShowSpaces] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  // The Layer Hub: the bar pulled down into a sheet with every widget.
  const [showHub, setShowHub] = useState(false)
  // True from closing until the sheet has fully retracted: the bar stays out
  // (and square-cornered) so the sheet slides back into it, not into air.
  const [hubLeaving, setHubLeaving] = useState(false)
  const [hubView, setHubView] = useState<HubView>('widgets')
  // How far the hub sheet is out (0 = tucked in, 1 = open). Clicks animate it;
  // pulling the bar or the sheet's handle sets it directly, frame by frame.
  const hubReveal = useMotionValue(0)
  const hubAnim = useRef<ReturnType<typeof animate> | null>(null)
  const leavingRef = useRef(false)
  const sheetEase = [0.32, 0.72, 0, 1] as const
  const openHub = () => {
    hubAnim.current?.stop()
    leavingRef.current = false
    setHubLeaving(false)
    useCanvasStore.getState().setMode('edit')
    setShowHub(true)
    hubAnim.current = animate(hubReveal, 1, { duration: 0.55 * (1 - hubReveal.get()) + 0.15, ease: sheetEase })
  }
  const closeHub = () => {
    if (leavingRef.current) return
    leavingRef.current = true
    hubAnim.current?.stop()
    setHubLeaving(true)
    hubAnim.current = animate(hubReveal, 0, { duration: 0.42 * hubReveal.get() + 0.1, ease: sheetEase })
    hubAnim.current.then(() => {
      if (!leavingRef.current) return // re-opened meanwhile
      leavingRef.current = false
      setShowHub(false)
      setHubLeaving(false)
      setHubView('widgets')
    })
  }

  // ── Pull-down drawer on the pill: a short pull opens the toolbar, a long
  // one keeps going into the hub, which follows the cursor live. ─────────
  const PULL_BAR = 36 // px down that opens the toolbar
  const PULL_HUB = 70 // px down where the hub starts coming out
  const PULL_RANGE = 260 // px over which the hub goes from 0 to fully out
  const pillY = useMotionValue(0) // rubber-band offset of the bar
  const pull = useRef<{ y: number; lastY: number; lastT: number; v: number; dragging: boolean; hub: boolean } | null>(null)
  const swallowClick = useRef(false)
  const onPillDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    // A fresh press: forget any click-swallow left over from an earlier pull
    // whose release never turned into a click (that ate the next real click).
    swallowClick.current = false
    e.currentTarget.setPointerCapture(e.pointerId)
    pull.current = { y: e.clientY, lastY: e.clientY, lastT: performance.now(), v: 0, dragging: false, hub: showHub }
  }
  const onPillMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const p = pull.current
    if (!p) return
    const dy = e.clientY - p.y
    if (!p.dragging) {
      if (dy < 6) return
      p.dragging = true
      swallowClick.current = true
      // The drag may leave the pill's own hit box: take the whole window.
      setForceInteractive(true).catch(() => {})
      document.body.style.cursor = 'grabbing'
      hubAnim.current?.stop()
      leavingRef.current = false
    }
    const now = performance.now()
    p.v = (e.clientY - p.lastY) / Math.max(1, now - p.lastT)
    p.lastY = e.clientY
    p.lastT = now
    if (dy >= PULL_BAR && useCanvasStore.getState().mode !== 'edit') useCanvasStore.getState().setMode('edit')
    if (dy < PULL_HUB && !p.hub) {
      // Rubber band: follows at first, resists more the further you go.
      pillY.set(Math.max(0, 22 * (1 - Math.exp(-dy / 40))))
      return
    }
    if (!p.hub) {
      p.hub = true
      animate(pillY, 0, { type: 'spring', stiffness: 500, damping: 36 })
      setHubLeaving(false)
      setShowHub(true)
    }
    hubReveal.set(Math.min(1, Math.max(0, (dy - PULL_HUB) / PULL_RANGE)))
  }
  const onPillUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const p = pull.current
    pull.current = null
    if (!p) return
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    if (!p.dragging) return
    setForceInteractive(false).catch(() => {})
    document.body.style.cursor = ''
    animate(pillY, 0, { type: 'spring', stiffness: 500, damping: 30 })
    if (!p.hub) return
    // A quick downward flick or most of the way out opens; otherwise it
    // tucks back in and the toolbar stays open.
    if (p.v > 0.5 || (p.v > -0.4 && hubReveal.get() > 0.35)) openHub()
    else closeHub()
  }
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
  // The hub hangs from the full toolbar; leaving edit mode collapses the bar
  // to its pill, so the hub retracts first instead of squeezing down with it.
  useEffect(() => {
    if (!open && showHub) closeHub()
    // closeHub only sets state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, showHub])
  const down =
    hovered ||
    open ||
    showSettings ||
    showSpaces ||
    showNotifications ||
    showHub ||
    hubLeaving ||
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
    // A style can stand for another widget type (Clock → World clock,
    // Calendar → Countdown, …): build it from that type's own defaults.
    const target =
      typeof patch?.type === 'string' && patch.type !== def.type
        ? (widgetRegistry[patch.type as WidgetType] ?? def)
        : def
    const created = await target.create(0, 0)
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
          // A fixed box with only `left` set shrink-to-fits within the space
          // from `left` to the screen edge — half the screen here — which would
          // squeeze the bar. Size to content; the widget strip caps the width.
          width: 'max-content',
        }}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        <motion.div
          animate={{ y: down ? 0 : -40 }}
          transition={spring}
        >
          {/* rubber-band offset while the pill is being pulled */}
          <motion.div style={{ y: pillY }}>
          <motion.div
            layout
            transition={spring}
            data-tour="island"
            className="glass flex items-center gap-1 border border-t-0 border-[var(--border)] px-1.5 py-1.5"
            // Square bottom while the hub hangs from it, so they read as one.
            animate={{ borderRadius: showHub || hubLeaving ? '0px 0px 0px 0px' : '0px 0px 16px 16px' }}
            style={{ borderRadius: '0 0 16px 16px' }}
          >
            <Tooltip label={open ? t('toolbar.exitEdit') : t('toolbar.openMenu')} side="bottom">
              <motion.button
                type="button"
                onClick={() => {
                  // The click that ends a pull isn't a click.
                  if (swallowClick.current) {
                    swallowClick.current = false
                    return
                  }
                  toggleMode()
                }}
                onPointerDown={onPillDown}
                onPointerMove={onPillMove}
                onPointerUp={onPillUp}
                onPointerCancel={onPillUp}
                whileTap={{ scale: 0.92 }}
                className={cn(
                  'flex h-9 shrink-0 cursor-grab touch-none items-center gap-1.5 rounded-[10px] px-2 transition-colors duration-150 active:cursor-grabbing',
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
            </Tooltip>

            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  key="tools"
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
                  <WidgetScroller
                    maxWidth={stripMax}
                    leftLabel={t('toolbar.scrollLeft')}
                    rightLabel={t('toolbar.scrollRight')}
                  >
                  {widgetList.map((def, i) => {
                    const Icon = def.icon
                    if (def.styles && def.styles.length > 0) {
                      return (
                        <StyleMenu
                          key={def.type}
                          def={def}
                          isOpen={styleMenu === def.type}
                          onToggle={() =>
                            setStyleMenu(styleMenu === def.type ? null : def.type)
                          }
                          onPick={(patch) => handleAdd(def, patch)}
                          label={t('toolbar.styles', { name: widgetName(def) })}
                          headerLabel={t('toolbar.styleHeader', {
                            name: widgetName(def),
                          })}
                        />
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
                  </WidgetScroller>
                  <motion.div variants={dividerVariants} className="mx-0.5 h-6 w-px shrink-0 bg-[var(--border)]" />
                  <ToolButton
                    index={widgetList.length}
                    label={allLocked ? t('toolbar.unlockAll') : t('toolbar.lockAll')}
                    tour="lock"
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
                    tour="backgrounds"
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
                    tour="reset"
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
                  <div className="relative flex items-center">
                    {/* Spaces, Notifications and Settings live inside the hub while it's
                        open, so their bar buttons fade away (in place: the bar's width
                        must not change, the hub is sized to it). */}
                    <div
                      className="flex items-center gap-1 transition-[opacity,transform,filter] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
                      // A plain element on purpose: an animated wrapper would cut the
                      // bar's reveal variants off from the buttons inside.
                      style={{
                        opacity: showHub ? 0 : 1,
                        transform: showHub ? 'scale(0.6)' : 'scale(1)',
                        filter: showHub ? 'blur(2px)' : 'blur(0px)',
                        pointerEvents: showHub ? 'none' : 'auto',
                      }}
                      aria-hidden={showHub || undefined}
                    >
                      <ToolButton
                        index={widgetList.length + 3}
                        label={t('toolbar.spaces')}
                        tour="spaces"
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
                        tour="notifications"
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
                        tour="settings"
                        onClick={() => setShowSettings(true)}
                      >
                        <SettingsIcon size={18} strokeWidth={1.5} />
                      </ToolButton>
                      </div>
                    {/* While the hub is open the slot those buttons leave becomes its
                        header: "Layer Hub › <view>", crossfading as you switch. */}
                    <div
                      className="pointer-events-none absolute inset-0 flex items-center justify-center gap-1.5 whitespace-nowrap text-[12px] transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
                      style={{
                        opacity: showHub ? 1 : 0,
                        transform: showHub ? 'translateY(0)' : 'translateY(-4px)',
                      }}
                      aria-hidden={!showHub || undefined}
                    >
                      <span className="font-semibold text-[var(--text-primary)]">{t('hub.title')}</span>
                      <ChevronRight size={12} className="text-[var(--text-tertiary)]" />
                      <AnimatePresence mode="popLayout" initial={false}>
                        <motion.span
                          key={hubView}
                          className="text-[var(--text-secondary)]"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
                        >
                          {hubView === 'widgets'
                            ? t('hub.widgets')
                            : hubView === 'spaces'
                              ? t('toolbar.spaces')
                              : hubView === 'notifications'
                                ? t('toolbar.notifications')
                                : t('toolbar.settings')}
                        </motion.span>
                      </AnimatePresence>
                    </div>
                    </div>
                  <ToolButton
                    index={widgetList.length + 6}
                    label={showHub ? t('hub.close') : t('hub.open')}
                    tour="hub"
                    onClick={() => (showHub && !hubLeaving ? closeHub() : openHub())}
                  >
                    {showHub ? (
                      <PanelTopClose size={18} strokeWidth={1.5} />
                    ) : (
                      <PanelTopOpen size={18} strokeWidth={1.5} />
                    )}
                  </ToolButton>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
          </motion.div>
        </motion.div>
      </div>

      {/* Mounted while out or retracting; all its motion comes from hubReveal. */}
      {showHub && (
          <LayerHub
            key="hub"
            view={hubView}
            onView={setHubView}
            reveal={hubReveal}
            frozen={hubLeaving}
            onSettle={(o) => (o ? openHub() : closeHub())}
            onClose={closeHub}
            onAdd={(def, patch) => {
              closeHub()
              handleAdd(def, patch)
            }}
            onTour={() => {
              closeHub()
              useTourStore.getState().start()
            }}
          />
        )}

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
