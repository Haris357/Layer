import type { ReactNode } from 'react'
import { useMonitorStore } from '../store/monitorStore'

// Positions its children within the primary monitor's rectangle, so overlays
// (modals, palettes) open on a real screen instead of the empty gap that can
// sit between mismatched/stacked monitors. Falls back to the full viewport
// when monitor info isn't available (e.g. running in a browser).
export function MonitorLayer({
  children,
  align = 'center',
  className = '',
}: {
  children: ReactNode
  align?: 'center' | 'start'
  className?: string
}) {
  const primary = useMonitorStore((s) => s.primary)
  return (
    <div
      className={`absolute flex justify-center ${
        align === 'start' ? 'items-start' : 'items-center'
      } ${className}`}
      style={{
        left: primary ? primary.x : 0,
        top: primary ? primary.y : 0,
        width: primary ? primary.w : '100%',
        height: primary ? primary.h : '100%',
      }}
    >
      {children}
    </div>
  )
}
