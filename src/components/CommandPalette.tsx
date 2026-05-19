import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Search } from 'lucide-react'
import { useCanvasStore } from '../store/canvasStore'
import { useSettingsStore } from '../store/settingsStore'
import { widgetList, type WidgetDefinition } from '../lib/widgetRegistry'
import { cn } from '../lib/utils'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const addWidget = useCanvasStore((s) => s.addWidget)
  const snapEnabled = useSettingsStore((s) => s.snapEnabled)
  const gridSize = useSettingsStore((s) => s.gridSize)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setQuery('')
        setIndex(0)
        setOpen((o) => !o)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const results = widgetList.filter((d) =>
    d.label.toLowerCase().includes(query.trim().toLowerCase()),
  )

  const add = async (def: WidgetDefinition | undefined) => {
    if (!def) return
    setOpen(false)
    const created = await def.create(0, 0)
    if (!created) return
    const snap = (v: number) =>
      snapEnabled ? Math.round(v / gridSize) * gridSize : v
    addWidget({
      ...created,
      x: snap((window.innerWidth - created.width) / 2),
      y: snap((window.innerHeight - created.height) / 2),
    })
  }

  return (
    <AnimatePresence>
      {open && (
        <div
          data-hit
          className="fixed inset-0 z-[10000] flex items-start justify-center pt-[16vh]"
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}
          onMouseDown={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="glass flex w-[440px] flex-col overflow-hidden rounded-[14px] border border-[var(--border)]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-4 py-3">
              <Search
                size={16}
                strokeWidth={1.8}
                className="text-[var(--text-tertiary)]"
              />
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setIndex(0)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setIndex((i) => Math.min(i + 1, results.length - 1))
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setIndex((i) => Math.max(i - 1, 0))
                  } else if (e.key === 'Enter') {
                    e.preventDefault()
                    add(results[index])
                  }
                }}
                placeholder="Add a widget…"
                className="flex-1 bg-transparent text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
              />
              <kbd
                className="rounded-[5px] bg-[var(--fill-2)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-tertiary)]"
              >
                Ctrl K
              </kbd>
            </div>
            <div className="max-h-[300px] overflow-y-auto p-1.5">
              {results.length === 0 && (
                <div
                  className="px-3 py-3 text-[13px] text-[var(--text-tertiary)]"
                >
                  No widgets match
                </div>
              )}
              {results.map((d, i) => (
                <button
                  key={d.type}
                  type="button"
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => add(d)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2 text-left text-[13px] font-medium text-[var(--text-primary)] transition-colors',
                    i === index && 'bg-[var(--fill-2)]',
                  )}
                >
                  <d.icon size={16} strokeWidth={1.6} />
                  {d.label}
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
