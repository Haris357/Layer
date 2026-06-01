import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Copy,
  Lock,
  Unlock,
  ArrowUpToLine,
  ArrowDownToLine,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { useCanvasStore } from '../store/canvasStore'
import { useMonitorStore } from '../store/monitorStore'
import { Slider, Toggle } from './ui'

interface ContextMenuProps {
  x: number
  y: number
  widgetId: string
  onClose: () => void
}

interface MenuItem {
  label: string
  icon: LucideIcon
  action: () => void
  danger?: boolean
}

export function ContextMenu({ x, y, widgetId, onClose }: ContextMenuProps) {
  const widget = useCanvasStore((s) =>
    s.widgets.find((w) => w.id === widgetId),
  )
  const duplicateWidget = useCanvasStore((s) => s.duplicateWidget)
  const updateWidget = useCanvasStore((s) => s.updateWidget)
  const toggleLock = useCanvasStore((s) => s.toggleLock)
  const bringToFront = useCanvasStore((s) => s.bringToFront)
  const sendToBack = useCanvasStore((s) => s.sendToBack)
  const deleteWidget = useCanvasStore((s) => s.deleteWidget)

  useEffect(() => {
    const close = () => onClose()
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('blur', close)
    }
  }, [onClose])

  // Position the menu so the whole thing stays inside the work area (the
  // monitor under the cursor, minus the taskbar). Measured after render so it
  // accounts for the real height — which varies by widget type — and flips/
  // shifts up or left near an edge instead of spilling off-screen or behind
  // the taskbar.
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const { work } = useMonitorStore.getState()
    const area =
      work.find(
        (a) => x >= a.x && x < a.x + a.w && y >= a.y && y < a.y + a.h,
      ) ??
      work[0] ?? { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight }
    const clamp = (v: number, lo: number, hi: number) =>
      Math.max(lo, Math.min(v, Math.max(lo, hi)))
    setPos({
      left: clamp(x, area.x, area.x + area.w - w),
      top: clamp(y, area.y, area.y + area.h - h),
    })
  }, [x, y])

  if (!widget) return null

  const run = (fn: () => void) => () => {
    fn()
    onClose()
  }

  const items: MenuItem[] = [
    { label: 'Duplicate', icon: Copy, action: run(() => duplicateWidget(widgetId)) },
    {
      label: widget.locked ? 'Unlock' : 'Lock',
      icon: widget.locked ? Unlock : Lock,
      action: run(() => toggleLock(widgetId)),
    },
    {
      label: 'Bring to Front',
      icon: ArrowUpToLine,
      action: run(() => bringToFront(widgetId)),
    },
    {
      label: 'Send to Back',
      icon: ArrowDownToLine,
      action: run(() => sendToBack(widgetId)),
    },
    {
      label: 'Delete',
      icon: Trash2,
      action: run(() => deleteWidget(widgetId)),
      danger: true,
    },
  ]

  const opacity = widget.opacity ?? 1
  const hasBg = widget.background !== false

  return (
    <motion.div
      ref={menuRef}
      data-hit
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      className="glass fixed z-[9999] min-w-[170px] rounded-[10px] border border-[var(--border)] p-1"
      style={{ left: pos.left, top: pos.top }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={item.action}
          className="flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-1.5 text-[13px] font-medium transition-colors hover:bg-[var(--fill-2)]"
          style={{
            color: item.danger ? 'var(--danger)' : 'var(--text-primary)',
          }}
        >
          <item.icon size={14} strokeWidth={1.5} />
          {item.label}
        </button>
      ))}
      <div className="my-1 h-px bg-[var(--border)]" />
      {widget.type !== 'note' && (
        <div className="flex items-center justify-between px-2.5 py-1.5">
          <span
            className="text-[var(--text-secondary)]"
            style={{ fontSize: 11, fontWeight: 600 }}
          >
            Background
          </span>
          <Toggle
            checked={hasBg}
            onChange={(v) => updateWidget(widgetId, { background: v })}
          />
        </div>
      )}
      <div className="flex flex-col gap-1.5 px-2.5 py-1.5">
        <span
          className="text-[var(--text-secondary)]"
          style={{ fontSize: 11, fontWeight: 600 }}
        >
          Opacity · {Math.round(opacity * 100)}%
        </span>
        <Slider
          value={opacity}
          min={0.2}
          max={1}
          step={0.05}
          onChange={(v) => updateWidget(widgetId, { opacity: v })}
        />
      </div>
    </motion.div>
  )
}
