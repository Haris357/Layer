import { useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '../lib/utils'

type Side = 'top' | 'bottom' | 'left' | 'right'

const GAP = 8

// A small, instant, good-looking tooltip. It wraps a trigger and renders the
// label in a portal positioned off the trigger's screen rect — so it never
// gets clipped by an `overflow-hidden` parent (common in widget headers) and
// always floats above modals.
export function Tooltip({
  label,
  side = 'top',
  className,
  children,
}: {
  label: ReactNode
  side?: Side
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)

  const show = () => {
    if (ref.current) setRect(ref.current.getBoundingClientRect())
  }
  const hide = () => setRect(null)

  let style: React.CSSProperties = {}
  let initial = { opacity: 0, scale: 0.96, x: 0, y: 0 }
  if (rect) {
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    if (side === 'top') {
      style = { left: cx, top: rect.top - GAP, transform: 'translate(-50%,-100%)' }
      initial = { ...initial, y: 3 }
    } else if (side === 'bottom') {
      style = { left: cx, top: rect.bottom + GAP, transform: 'translate(-50%,0)' }
      initial = { ...initial, y: -3 }
    } else if (side === 'left') {
      style = { left: rect.left - GAP, top: cy, transform: 'translate(-100%,-50%)' }
      initial = { ...initial, x: 3 }
    } else {
      style = { left: rect.right + GAP, top: cy, transform: 'translate(0,-50%)' }
      initial = { ...initial, x: -3 }
    }
  }

  return (
    <span
      ref={ref}
      className={cn('inline-flex', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onMouseDown={hide}
    >
      {children}
      {createPortal(
        <AnimatePresence>
          {rect && label && (
            <motion.span
              initial={initial}
              animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              className="glass pointer-events-none fixed z-[12000] whitespace-nowrap rounded-[7px] border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--text-primary)] shadow-md"
              style={style}
            >
              {label}
            </motion.span>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </span>
  )
}
