import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '../lib/utils'

export interface MenuOption<T extends string | number> {
  value: T
  label: string
}

interface MenuProps<T extends string | number> {
  value: T
  options: MenuOption<T>[]
  onChange: (value: T) => void
  className?: string
  placeholder?: string
}

interface Rect {
  top: number
  left: number
  width: number
  bottom: number
}

// Themed dropdown. Renders its popover via a portal so it escapes any
// overflow:hidden ancestor (widgets), and closes on outside click.
export function Menu<T extends string | number>({
  value,
  options,
  onChange,
  className,
  placeholder,
}: MenuProps<T>) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<Rect | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value)

  useLayoutEffect(() => {
    if (!open) return
    const update = () => {
      const b = btnRef.current
      if (!b) return
      const r = b.getBoundingClientRect()
      setRect({
        top: r.top,
        left: r.left,
        width: r.width,
        bottom: r.bottom,
      })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t)) return
      if (popRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [open])

  // Decide whether to flip the popover above the button when there isn't
  // enough room below (e.g., bottom of a tall widget).
  const POP_MAX = 260
  const flipUp = rect
    ? rect.bottom + POP_MAX > window.innerHeight - 12 &&
      rect.top > POP_MAX + 12
    : false

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center justify-between gap-2 rounded-[8px] border bg-[var(--fill-1)] px-3 py-1.5 text-left text-[12.5px] text-[var(--text-primary)] transition-colors',
          open
            ? 'border-[var(--border-strong)]'
            : 'border-[var(--border)] hover:border-[var(--border-strong)]',
          className,
        )}
      >
        <span className="truncate">
          {current?.label ?? placeholder ?? String(value)}
        </span>
        <ChevronDown
          size={13}
          className={cn(
            'shrink-0 text-[var(--text-tertiary)] transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && rect &&
        createPortal(
          <motion.div
            ref={popRef}
            data-hit
            initial={{ opacity: 0, y: flipUp ? 4 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            style={{
              position: 'fixed',
              left: rect.left,
              width: Math.max(rect.width, 140),
              ...(flipUp
                ? { bottom: window.innerHeight - rect.top + 4 }
                : { top: rect.bottom + 4 }),
              maxHeight: POP_MAX,
              zIndex: 10050,
              boxShadow: '0 12px 32px -10px rgba(0, 0, 0, 0.5)',
            }}
            className="overflow-y-auto rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-1"
          >
            {options.map((o) => {
              const selected = o.value === value
              return (
                <button
                  key={String(o.value)}
                  type="button"
                  onClick={() => {
                    onChange(o.value)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[12.5px] transition-colors',
                    selected
                      ? 'bg-[var(--fill-2)] font-semibold text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--fill-2)] hover:text-[var(--text-primary)]',
                  )}
                >
                  <span className="truncate">{o.label}</span>
                  {selected && (
                    <Check
                      size={13}
                      className="shrink-0"
                      style={{ color: 'var(--accent)' }}
                    />
                  )}
                </button>
              )
            })}
          </motion.div>,
          document.body,
        )}
    </>
  )
}
