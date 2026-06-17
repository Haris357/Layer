import { memo, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MouseEvent } from 'react'
import { Rnd } from 'react-rnd'
import { AnimatePresence, motion } from 'framer-motion'
import { GripVertical } from 'lucide-react'
import type { Widget } from '../../types/widget'
import { hexToRgba } from '../../lib/utils'
import { useCanvasStore } from '../../store/canvasStore'
import { useSnapToGrid } from '../../hooks/useSnapToGrid'
import { setForceInteractive } from '../../lib/ipc'
import { computeSnap } from '../../lib/align'
import { widgetRegistry } from '../../lib/widgetRegistry'
import { ContextMenu } from '../ContextMenu'
import { Tooltip } from '../Tooltip'
import { SettingsPopover } from './SettingsPopover'

const RESIZE = 'var(--cur-resize)'
const resizeHandleStyles: Record<string, React.CSSProperties> = {
  top: { cursor: `${RESIZE}, ns-resize` },
  bottom: { cursor: `${RESIZE}, ns-resize` },
  left: { cursor: `${RESIZE}, ew-resize` },
  right: { cursor: `${RESIZE}, ew-resize` },
  topLeft: { cursor: `${RESIZE}, nwse-resize` },
  bottomRight: { cursor: `${RESIZE}, nwse-resize` },
  topRight: { cursor: `${RESIZE}, nesw-resize` },
  bottomLeft: { cursor: `${RESIZE}, nesw-resize` },
}

function WidgetWrapperBase({ widget }: { widget: Widget }) {
  const { t } = useTranslation()
  // Subscribe to a boolean, not the whole selectedId/widgets — so a wrapper
  // only re-renders when ITS own selected state flips, not on every selection
  // or edit elsewhere. The full array is read non-reactively during drag.
  const isSelected = useCanvasStore((s) => s.selectedId === widget.id)
  const setSelected = useCanvasStore((s) => s.setSelected)
  const updateWidget = useCanvasStore((s) => s.updateWidget)
  const setGuides = useCanvasStore((s) => s.setGuides)
  const { grid } = useSnapToGrid()
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  const def = widgetRegistry[widget.type]
  // Gracefully skip widgets whose type is no longer registered (e.g. saved
  // data referencing a widget we've since removed) — never crash the canvas.
  if (!def) return null
  const Renderer = def.Renderer
  const canDrag = !widget.locked
  const canResize = !widget.locked
  const lockAspect =
    widget.type === 'clock' && widget.variant === 'analog'
  const minSize = def.minSize ?? { width: 120, height: 80 }

  useEffect(() => {
    if (widget.width < minSize.width || widget.height < minSize.height) {
      updateWidget(widget.id, {
        width: Math.max(widget.width, minSize.width),
        height: Math.max(widget.height, minSize.height),
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleMouseDown = () => {
    if (!widget.locked) setSelected(widget.id)
  }

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault()
    if (!widget.locked) setSelected(widget.id)
    setMenu({ x: e.clientX, y: e.clientY })
  }

  return (
    <>
      <Rnd
        size={{ width: widget.width, height: widget.height }}
        position={{ x: widget.x, y: widget.y }}
        dragGrid={grid}
        resizeGrid={grid}
        disableDragging={!canDrag}
        enableResizing={canResize}
        lockAspectRatio={lockAspect}
        dragHandleClassName="layer-drag-handle"
        resizeHandleStyles={resizeHandleStyles}
        minWidth={minSize.width}
        minHeight={minSize.height}
        maxWidth={def.maxSize?.width}
        maxHeight={def.maxSize?.height}
        bounds="parent"
        style={{ zIndex: isSelected ? 9000 : widget.zIndex }}
        onDragStart={() => {
          setForceInteractive(true).catch(() => {})
        }}
        onDrag={(_, d) => {
          const others = useCanvasStore
            .getState()
            .widgets.filter((w) => w.id !== widget.id)
          const s = computeSnap(
            widget.width,
            widget.height,
            d.x,
            d.y,
            others,
          )
          setGuides({ v: s.v, h: s.h })
        }}
        onResizeStart={() => {
          setForceInteractive(true).catch(() => {})
        }}
        onDragStop={(_, d) => {
          setForceInteractive(false).catch(() => {})
          setGuides({ v: [], h: [] })
          const others = useCanvasStore
            .getState()
            .widgets.filter((w) => w.id !== widget.id)
          const s = computeSnap(
            widget.width,
            widget.height,
            d.x,
            d.y,
            others,
          )
          updateWidget(widget.id, { x: s.x, y: s.y })
        }}
        onResizeStop={(_e, _dir, ref, _delta, pos) => {
          setForceInteractive(false).catch(() => {})
          updateWidget(widget.id, {
            width: ref.offsetWidth,
            height: ref.offsetHeight,
            x: pos.x,
            y: pos.y,
          })
        }}
      >
        <motion.div
          data-hit
          data-widget-id={widget.id}
          data-nobg={widget.background === false ? '' : undefined}
          data-accent={widget.accent ? '' : undefined}
          data-widget-theme={
            widget.appearance && widget.appearance !== 'auto'
              ? widget.appearance
              : undefined
          }
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: widget.opacity ?? 1, scale: 1 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="group relative h-full w-full"
          style={{
            outline:
              isSelected && !widget.locked
                ? '2px solid var(--border-strong)'
                : 'none',
            outlineOffset: 4,
            ['--widget-accent' as string]: widget.accent || 'var(--accent)',
            ['--widget-accent-tint' as string]: widget.accent
              ? hexToRgba(widget.accent, 0.18)
              : 'transparent',
            ['--widget-accent-ring' as string]: widget.accent
              ? hexToRgba(widget.accent, 0.7)
              : 'transparent',
          }}
          onMouseDown={handleMouseDown}
          onContextMenu={handleContextMenu}
        >
          {!widget.locked && (
            <Tooltip
              label={t('common.dragToMove')}
              side="right"
              className="layer-drag-handle layer-grab absolute left-1.5 top-1.5 z-20 h-5 w-5 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
            >
              <div className="flex h-5 w-5 items-center justify-center rounded-[7px] border border-[var(--border)] bg-[var(--surface)] shadow-md">
                <GripVertical
                  size={12}
                  strokeWidth={2}
                  className="text-[var(--text-secondary)]"
                />
              </div>
            </Tooltip>
          )}
          <Renderer widget={widget} />
          <AnimatePresence>
            {isSelected && !widget.locked && def.Settings && (
              <SettingsPopover widget={widget} />
            )}
          </AnimatePresence>
        </motion.div>
      </Rnd>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          widgetId={widget.id}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  )
}

export const WidgetWrapper = memo(WidgetWrapperBase)
