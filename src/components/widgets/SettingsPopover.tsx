import { motion } from 'framer-motion'
import type { Widget } from '../../types/widget'
import { useCanvasStore } from '../../store/canvasStore'
import { widgetRegistry } from '../../lib/widgetRegistry'
import { cn } from '../../lib/utils'

export function SettingsPopover({ widget }: { widget: Widget }) {
  const updateWidget = useCanvasStore((s) => s.updateWidget)
  const def = widgetRegistry[widget.type]
  if (!def || !def.Settings) return null
  const Settings = def.Settings

  const viewportW =
    typeof window !== 'undefined' ? window.innerWidth : 1920
  const openBelow = widget.y < 320
  const alignRight = widget.x + 300 > viewportW

  return (
    <motion.div
      data-hit
      data-popover
      initial={{ opacity: 0, y: openBelow ? -6 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: openBelow ? -6 : 6 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className={cn(
        'glass absolute z-[50] rounded-[10px] border border-[var(--border)] p-2',
        openBelow ? 'top-full mt-3' : 'bottom-full mb-3',
        alignRight ? 'right-0' : 'left-0',
      )}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <Settings
        widget={widget}
        onUpdate={(patch) => updateWidget(widget.id, patch)}
      />
    </motion.div>
  )
}
