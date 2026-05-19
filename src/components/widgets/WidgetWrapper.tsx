import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { Rnd } from 'react-rnd'
import { AnimatePresence, motion } from 'framer-motion'
import { GripVertical } from 'lucide-react'
import type { Widget } from '../../types/widget'
import { useCanvasStore } from '../../store/canvasStore'
import { useSnapToGrid } from '../../hooks/useSnapToGrid'
import { setForceInteractive } from '../../lib/ipc'
import { computeSnap } from '../../lib/align'
import { widgetRegistry } from '../../lib/widgetRegistry'
import { ContextMenu } from '../ContextMenu'
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

export function WidgetWrapper({ widget }: { widget: Widget }) {
  const selectedId = useCanvasStore((s) => s.selectedId)
  const setSelected = useCanvasStore((s) => s.setSelected)
  const updateWidget = useCanvasStore((s) => s.updateWidget)
  const widgets = useCanvasStore((s) => s.widgets)
  const setGuides = useCanvasStore((s) => s.setGuides)
  const { grid } = useSnapToGrid()
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  const def = widgetRegistry[widget.type]
  const Renderer = def.Renderer
  const isSelected = selectedId === widget.id
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
          const others = widgets.filter((w) => w.id !== widget.id)
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
          const others = widgets.filter((w) => w.id !== widget.id)
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
          data-nobg={widget.background === false ? '' : undefined}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="group relative h-full w-full"
          style={{
            outline:
              isSelected && !widget.locked
                ? '2px solid var(--border-strong)'
                : 'none',
            outlineOffset: 4,
            opacity: widget.opacity ?? 1,
          }}
          onMouseDown={handleMouseDown}
          onContextMenu={handleContextMenu}
        >
          {!widget.locked && (
            <div
              className="layer-drag-handle layer-grab absolute left-1.5 top-1.5 z-20 flex h-5 w-5 items-center justify-center rounded-[7px] border border-[var(--border)] bg-[var(--surface)] opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100"
              title="Drag to move"
            >
              <GripVertical
                size={12}
                strokeWidth={2}
                className="text-[var(--text-secondary)]"
              />
            </div>
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
