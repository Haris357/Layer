import type { MouseEvent } from 'react'
import { useCanvasStore } from '../store/canvasStore'
import { GridBackground } from './GridBackground'
import { GuideLines } from './GuideLines'
import { WidgetWrapper } from './widgets/WidgetWrapper'

export function Canvas() {
  const widgets = useCanvasStore((s) => s.widgets)
  const mode = useCanvasStore((s) => s.mode)
  const selectedId = useCanvasStore((s) => s.selectedId)
  const setSelected = useCanvasStore((s) => s.setSelected)

  const handleMouseDown = (e: MouseEvent) => {
    if (e.target === e.currentTarget) setSelected(null)
  }

  return (
    <div
      className="absolute inset-0"
      data-hit={selectedId ? '' : undefined}
      onMouseDown={handleMouseDown}
    >
      <GridBackground />
      {widgets.map((w) => (
        <WidgetWrapper key={w.id} widget={w} />
      ))}
      <GuideLines />
      {mode === 'edit' && widgets.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span
            className="text-[var(--text-tertiary)]"
            style={{ fontSize: 16, fontWeight: 500 }}
          >
            ↑ Add your first widget from the menu at the top
          </span>
        </div>
      )}
    </div>
  )
}
