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
import { hexToRgba } from '../lib/utils'
import { Segmented, Slider, Toggle } from './ui'

// Quick-pick accent swatches; users can still pick any colour via the picker.
const PRESET_ACCENTS = [
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
]

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

  // Smooth colour picking: while dragging the picker, write the accent CSS
  // variables straight to the widget's DOM node (no store update = no React
  // re-render = no lag). We persist once to the store on release (or if the
  // menu closes mid-drag), which is the only step that snapshots undo history.
  const rafRef = useRef(0)
  const pendingRef = useRef<string | null>(null)
  const applyLive = (hex: string) => {
    const el = document.querySelector<HTMLElement>(
      `[data-widget-id="${widgetId}"]`,
    )
    if (!el) return
    el.setAttribute('data-accent', '')
    el.style.setProperty('--widget-accent', hex)
    el.style.setProperty('--widget-accent-tint', hexToRgba(hex, 0.18))
    el.style.setProperty('--widget-accent-ring', hexToRgba(hex, 0.7))
  }
  const onAccentInput = (hex: string) => {
    pendingRef.current = hex
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      if (pendingRef.current) applyLive(pendingRef.current)
    })
  }
  const onAccentCommit = (hex: string) => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    pendingRef.current = null
    applyLive(hex)
    updateWidget(widgetId, { accent: hex })
  }
  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current)
      if (pendingRef.current) {
        updateWidget(widgetId, { accent: pendingRef.current })
      }
    },
    [widgetId, updateWidget],
  )

  useEffect(() => {
    // Close on any pointer-down or right-click that lands outside the menu.
    // Use the CAPTURE phase: widgets and react-rnd call stopPropagation on
    // mousedown, which would otherwise stop a bubble-phase listener from ever
    // firing — so clicking another widget left the menu stuck open. Capture
    // runs before those handlers, so it always fires; we just ignore clicks
    // inside the menu (which keeps the colour picker working).
    // We intentionally do NOT close on window blur — opening the native colour
    // picker blurs the window and would unmount the menu mid-pick.
    const onDown = (e: Event) => {
      const target = e.target as Node | null
      if (target && menuRef.current?.contains(target)) return
      onClose()
    }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('contextmenu', onDown, true)
    window.addEventListener('wheel', onDown, true)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('contextmenu', onDown, true)
      window.removeEventListener('wheel', onDown, true)
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
  const canTheme = widget.type !== 'note' && widget.type !== 'sticky'

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

      {/* Notes and sticky notes carry their own theming, so skip them. */}
      {canTheme && (
        <>
          <div className="my-1 h-px bg-[var(--border)]" />
          <div className="flex flex-col gap-1.5 px-2.5 py-1.5">
            <span
              className="text-[var(--text-secondary)]"
              style={{ fontSize: 11, fontWeight: 600 }}
            >
              Color
            </span>
            <div className="flex items-center gap-1.5">
              {PRESET_ACCENTS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  aria-label={`Accent ${hex}`}
                  onClick={() => updateWidget(widgetId, { accent: hex })}
                  className="h-[18px] w-[18px] rounded-full transition-transform hover:scale-110"
                  style={{
                    background: hex,
                    outline:
                      widget.accent?.toLowerCase() === hex
                        ? '2px solid var(--text-primary)'
                        : '1px solid var(--border)',
                    outlineOffset: 1,
                  }}
                />
              ))}
              <label
                className="relative h-[18px] w-[18px] cursor-pointer overflow-hidden rounded-full"
                style={{
                  background:
                    'conic-gradient(#ef4444,#f59e0b,#10b981,#3b82f6,#8b5cf6,#ec4899,#ef4444)',
                  outline: '1px solid var(--border)',
                  outlineOffset: 1,
                }}
                title="Custom color"
              >
                <input
                  type="color"
                  value={widget.accent || '#3b82f6'}
                  onInput={(e) =>
                    onAccentInput((e.target as HTMLInputElement).value)
                  }
                  onChange={(e) => onAccentCommit(e.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>
              {widget.accent && (
                <button
                  type="button"
                  onClick={() => updateWidget(widgetId, { accent: undefined })}
                  className="ml-auto text-[11px] font-medium text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
                >
                  reset
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1.5 px-2.5 py-1.5">
            <span
              className="text-[var(--text-secondary)]"
              style={{ fontSize: 11, fontWeight: 600 }}
            >
              Theme
            </span>
            <Segmented
              value={widget.appearance ?? 'auto'}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
              onChange={(v) => updateWidget(widgetId, { appearance: v })}
            />
          </div>
        </>
      )}
    </motion.div>
  )
}
