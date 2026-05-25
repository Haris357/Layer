import { useState } from 'react'
import { ListChecks, Plus, X, Check } from 'lucide-react'
import type { TodoWidget as TodoWidgetType, TodoItem } from '../../types/widget'
import { useCanvasStore } from '../../store/canvasStore'
import { uid } from '../../lib/utils'
import { cn } from '../../lib/utils'
import { fireConfetti } from '../../lib/confetti'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

function TodoRenderer({ widget }: { widget: TodoWidgetType }) {
  const updateWidget = useCanvasStore((s) => s.updateWidget)
  const [draft, setDraft] = useState('')

  const setItems = (items: TodoItem[]) => updateWidget(widget.id, { items })

  const add = () => {
    const text = draft.trim()
    if (!text) return
    setItems([...widget.items, { id: uid(), text, done: false }])
    setDraft('')
  }

  // Toggle a task; celebrate when this checks off the last one.
  const toggle = (id: string) => {
    const next = widget.items.map((i) =>
      i.id === id ? { ...i, done: !i.done } : i,
    )
    setItems(next)
    const wasAllDone = widget.items.length > 0 && widget.items.every((i) => i.done)
    const nowAllDone = next.length > 0 && next.every((i) => i.done)
    if (nowAllDone && !wasAllDone) fireConfetti()
  }

  const done = widget.items.filter((i) => i.done).length

  return (
    <div className="glass flex h-full w-full flex-col overflow-hidden rounded-[12px] border border-[var(--border)] p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[var(--text-tertiary)]">
        <ListChecks size={13} strokeWidth={1.8} />
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.3px' }}>
          TASKS · {done}/{widget.items.length}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {widget.items.map((item) => (
          <div key={item.id} className="group flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggle(item.id)}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors"
              style={{
                borderColor: item.done
                  ? 'var(--accent)'
                  : 'var(--border-strong)',
                background: item.done ? 'var(--accent)' : 'transparent',
              }}
            >
              {item.done && (
                <Check
                  size={11}
                  strokeWidth={3}
                  color="var(--on-accent)"
                />
              )}
            </button>
            <input
              value={item.text}
              onMouseDown={stop}
              onChange={(e) =>
                setItems(
                  widget.items.map((i) =>
                    i.id === item.id ? { ...i, text: e.target.value } : i,
                  ),
                )
              }
              className={cn(
                'min-w-0 flex-1 bg-transparent text-[13px] outline-none',
                item.done && 'line-through',
              )}
              style={{
                color: item.done
                  ? 'var(--text-tertiary)'
                  : 'var(--text-primary)',
              }}
            />
            <button
              type="button"
              onClick={() =>
                setItems(widget.items.filter((i) => i.id !== item.id))
              }
              className="shrink-0 text-[var(--text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100 hover:text-[var(--danger)]"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-1 flex items-center gap-1.5 border-t border-[var(--border)] pt-2">
        <Plus size={14} className="shrink-0 text-[var(--text-tertiary)]" />
        <input
          value={draft}
          onMouseDown={stop}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
          placeholder="Add a task…"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
        />
      </div>
    </div>
  )
}

export const todoDefinition: WidgetDefinition<TodoWidgetType> = {
  type: 'todo',
  label: 'To-do',
  icon: ListChecks,
  enabled: true,
  minSize: { width: 220, height: 170 },
  create: (x, y) => ({
    type: 'todo',
    x,
    y,
    width: 280,
    height: 260,
    locked: false,
    items: [],
  }),
  Renderer: TodoRenderer,
}
