import { Inbox, Check, X, Trash2 } from 'lucide-react'
import type { InboxWidget as InboxWidgetType } from '../../types/widget'
import { useInboxStore } from '../../store/inboxStore'
import { cn } from '../../lib/utils'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

function relTime(iso: string): string {
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d`
  return new Date(iso).toLocaleDateString()
}

function InboxRenderer() {
  const items = useInboxStore((s) => s.items)
  const toggle = useInboxStore((s) => s.toggle)
  const remove = useInboxStore((s) => s.remove)
  const clearDone = useInboxStore((s) => s.clearDone)

  return (
    <div className="glass flex h-full w-full flex-col overflow-hidden rounded-[12px] border border-[var(--border)] p-2.5">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span
          className="text-[var(--text-primary)]"
          style={{ fontSize: 12, fontWeight: 700, letterSpacing: '-0.3px' }}
        >
          Inbox
        </span>
        <span className="text-[10px] text-[var(--text-tertiary)]">
          Ctrl + Shift + N
        </span>
      </div>

      {items.length === 0 ? (
        <div className="my-auto flex flex-col items-center gap-2 px-3 text-center text-[var(--text-tertiary)]">
          <Inbox size={22} strokeWidth={1.5} />
          <span style={{ fontSize: 11, lineHeight: 1.4 }}>
            Press <b>Ctrl + Shift + N</b> anywhere to capture a thought.
          </span>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {items.map((i) => (
            <div
              key={i.id}
              className="group/i flex items-start gap-1.5 rounded-[7px] px-1.5 py-1 transition-colors hover:bg-[var(--fill-1)]"
            >
              <button
                type="button"
                onClick={() => toggle(i.id)}
                className={cn(
                  'mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors',
                  i.done
                    ? 'border-transparent'
                    : 'border-[var(--border-strong)] hover:border-[var(--accent)]',
                )}
                style={{ background: i.done ? 'var(--accent)' : 'transparent' }}
              >
                {i.done && (
                  <Check size={9} strokeWidth={3} color="var(--on-accent)" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    'break-words text-[12px] leading-snug',
                    i.done
                      ? 'text-[var(--text-tertiary)] line-through'
                      : 'text-[var(--text-primary)]',
                  )}
                >
                  {i.text}
                </div>
                <div className="text-[9.5px] text-[var(--text-tertiary)]">
                  {relTime(i.createdAt)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => remove(i.id)}
                className="shrink-0 self-start text-[var(--text-tertiary)] opacity-0 transition-opacity group-hover/i:opacity-100 hover:text-[var(--danger)]"
                title="Remove"
              >
                <X size={11} strokeWidth={2.5} />
              </button>
            </div>
          ))}
        </div>
      )}

      {items.some((i) => i.done) && (
        <button
          type="button"
          onClick={clearDone}
          className="mt-1 flex items-center justify-center gap-1 rounded-[6px] px-2 py-1 text-[10.5px] font-medium text-[var(--text-tertiary)] transition-colors hover:bg-[var(--fill-2)] hover:text-[var(--text-primary)]"
        >
          <Trash2 size={10} strokeWidth={2} />
          Clear done
        </button>
      )}
    </div>
  )
}

export const inboxDefinition: WidgetDefinition<InboxWidgetType> = {
  type: 'inbox',
  label: 'Inbox',
  icon: Inbox,
  enabled: true,
  minSize: { width: 200, height: 180 },
  maxSize: { width: 400, height: 500 },
  create: (x, y) => ({
    type: 'inbox',
    x,
    y,
    width: 240,
    height: 280,
    locked: false,
  }),
  Renderer: InboxRenderer,
}
