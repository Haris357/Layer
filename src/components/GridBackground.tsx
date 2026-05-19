import { motion } from 'framer-motion'
import { useCanvasStore } from '../store/canvasStore'
import { useSettingsStore } from '../store/settingsStore'

export function GridBackground() {
  const mode = useCanvasStore((s) => s.mode)
  const gridSize = useSettingsStore((s) => s.gridSize)

  return (
    <motion.div
      className="pointer-events-none absolute inset-0"
      animate={{ opacity: mode === 'edit' ? 1 : 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      style={{
        backgroundImage:
          'radial-gradient(var(--grid-dot) 1px, transparent 1px)',
        backgroundSize: `${gridSize}px ${gridSize}px`,
      }}
    />
  )
}
