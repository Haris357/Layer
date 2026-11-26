import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { Tooltip } from '../../Tooltip'
import { cn } from '../../../lib/utils'

// Building blocks for the Whiteboard's chrome. Everything here is a SOLID
// panel (no backdrop blur) and nothing uses layout animations: blur re-renders
// on every pen move and layout projection re-measures, and together they made
// the whole board shimmer while drawing.

export const ease = [0.32, 0.72, 0, 1] as const

export const PANEL = 'bg-[var(--wb-panel)] border border-[var(--border)] shadow-[0_8px_28px_rgba(0,0,0,0.22)]'

type Side = 'top' | 'bottom' | 'left' | 'right'
const OFF: Record<Side, { x?: number; y?: number }> = { top: { y: 6 }, bottom: { y: -6 }, left: { x: 6 }, right: { x: -6 } }

/** A popover/panel that fades in, nudged from the side it opens towards. */
export function Pop({ children, className, style, from = 'bottom' }: { children: ReactNode; className?: string; style?: React.CSSProperties; from?: Side }) {
  return (
    <motion.div
      className={cn('absolute z-30 rounded-[12px]', PANEL, className)}
      style={style}
      initial={{ opacity: 0, ...OFF[from] }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, ...OFF[from], transition: { duration: 0.1 } }}
      transition={{ duration: 0.16, ease }}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {children}
    </motion.div>
  )
}

/** Icon button with the shared tooltip. */
export function IconBtn({
  icon: Icon,
  label,
  onClick,
  active,
  disabled,
  size = 16,
  danger,
  side = 'bottom',
  corner,
  className,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
  size?: number
  danger?: boolean
  side?: Side
  /** small triangle in the corner: this button opens more options */
  corner?: boolean
  className?: string
}) {
  return (
    <Tooltip label={label} side={side}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] transition-[background-color,color] duration-150 disabled:opacity-30',
          active
            ? 'bg-[var(--accent)] text-[var(--on-accent)]'
            : danger
              ? 'text-[var(--text-secondary)] hover:bg-[var(--fill-2)] hover:text-[var(--danger)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--fill-2)] hover:text-[var(--text-primary)]',
          className,
        )}
      >
        <Icon size={size} strokeWidth={1.8} />
        {corner && <span className="absolute bottom-[5px] right-[5px] h-0 w-0 border-l-[4px] border-t-[4px] border-l-transparent border-t-transparent" style={{ borderBottom: '4px solid currentColor', opacity: 0.55 }} />}
      </button>
    </Tooltip>
  )
}

export const Divider = ({ vertical = true }: { vertical?: boolean }) =>
  vertical ? <span className="mx-1 h-5 w-px shrink-0 bg-[var(--border)]" /> : <span className="my-1 h-px w-full shrink-0 bg-[var(--border)]" />

/** Segmented choice (plain highlight, no sliding). */
export function Choice<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string; content: ReactNode }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-0.5 rounded-[9px] bg-[var(--fill-1)] p-0.5">
      {options.map((o) => (
        <Tooltip key={String(o.value)} label={o.label} side="top">
          <button
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              'flex h-7 min-w-8 flex-1 items-center justify-center rounded-[7px] px-1.5 text-[11.5px] font-semibold transition-colors duration-150',
              value === o.value ? 'bg-[var(--fill-3)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]',
            )}
          >
            {o.content}
          </button>
        </Tooltip>
      ))}
    </div>
  )
}

export const Label = ({ children }: { children: ReactNode }) => (
  <div className="px-0.5 pb-1.5 pt-2.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] first:pt-0.5">{children}</div>
)

/** A full-width row in a menu. */
export function MenuRow({ icon: Icon, children, onClick, disabled, right, danger }: { icon?: LucideIcon; children: ReactNode; onClick: () => void; disabled?: boolean; right?: ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-8 w-full items-center gap-2.5 rounded-[8px] px-2 text-left text-[12.5px] font-medium transition-colors duration-150 hover:bg-[var(--fill-2)] disabled:opacity-35 disabled:hover:bg-transparent',
        danger ? 'text-[var(--danger)]' : 'text-[var(--text-primary)]',
      )}
    >
      {Icon && <Icon size={15} strokeWidth={1.8} className="shrink-0 opacity-80" />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {right}
    </button>
  )
}

/** A colour dot. */
export function Swatch({ color, on, onClick, label, square }: { color: string; on: boolean; onClick: () => void; label: string; square?: boolean }) {
  return (
    <Tooltip label={label} side="top">
      <button
        type="button"
        onClick={onClick}
        className={cn('flex h-7 w-7 items-center justify-center transition-transform duration-150 hover:scale-110', square ? 'rounded-[7px]' : 'rounded-full')}
        style={{ boxShadow: on ? '0 0 0 2px var(--wb-panel), 0 0 0 3.5px var(--text-primary)' : 'inset 0 0 0 1px rgba(127,127,127,0.25)', background: color }}
      />
    </Tooltip>
  )
}
