import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
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

// Themed dropdown that respects light/dark, closes on outside click.
export function Menu<T extends string | number>({
  value,
  options,
  onChange,
  className,
  placeholder,
}: MenuProps<T>) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [open])

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-[8px] border bg-[var(--fill-1)] px-3 py-1.5 text-left text-[12.5px] text-[var(--text-primary)] transition-colors',
          open
            ? 'border-[var(--border-strong)]'
            : 'border-[var(--border)] hover:border-[var(--border-strong)]',
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

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-[220px] overflow-y-auto rounded-[9px] border border-[var(--border)] bg-[var(--surface)] p-1"
            style={{ boxShadow: '0 8px 24px -8px rgba(0,0,0,0.45)' }}
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
