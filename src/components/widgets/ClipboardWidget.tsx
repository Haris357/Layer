import { useState } from 'react'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { Clipboard, Pin, X, Search, Trash2 } from 'lucide-react'
import type { ClipboardWidget as ClipboardWidgetType } from '../../types/widget'
import { useClipboardStore } from '../../store/clipboardStore'
import { useToastStore } from '../../store/toastStore'
import { Tooltip } from '../Tooltip'
import { cn } from '../../lib/utils'
import { detectKind } from '../../lib/clipboardKind'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

function ClipboardRenderer() {
  const items = useClipboardStore((s) => s.items)
  const togglePin = useClipboardStore((s) => s.togglePin)
  const remove = useClipboardStore((s) => s.remove)
  const clearUnpinned = useClipboardStore((s) => s.clearUnpinned)
  const toast = useToastStore((s) => s.show)
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const filtered = q
    ? items.filter((i) => i.text.toLowerCase().includes(q))
    : items

  const copy = async (text: string) => {
    try {
      await writeText(text)
      toast('Copied to clipboard')
    } catch {
      toast('Could not copy')
    }
  }

  return (
    <div className="glass flex h-full w-full flex-col overflow-hidden rounded-[12px] border border-[var(--border)] p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
        <span className="flex items-baseline gap-1.5">
          <span
            className="text-[var(--text-primary)]"
            style={{ fontSize: 12, fontWeight: 700, letterSpacing: '-0.3px' }}
          >
            Clipboard
          </span>
          {items.length > 0 && (
            <span
              className="rounded-full bg-[var(--fill-2)] px-1.5 text-[9.5px] font-semibold text-[var(--text-tertiary)]"
              style={{ lineHeight: '15px' }}
            >
              {items.length}
            </span>
          )}
        </span>
        {items.length > 0 && (
          <Tooltip label="Clear unpinned" side="bottom">
            <button
              type="button"
              onClick={clearUnpinned}
              className="text-[var(--text-tertiary)] transition-colors hover:text-[var(--danger)]"
            >
              <Trash2 size={11} strokeWidth={2} />
            </button>
          </Tooltip>
        )}
      </div>

      {items.length > 4 && (
        <div className="mb-1.5 flex items-center gap-1.5 rounded-[7px] border border-[var(--border)] bg-[var(--fill-1)] px-2 py-1">
          <Search size={11} className="text-[var(--text-tertiary)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="min-w-0 flex-1 bg-transparent text-[11.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="my-auto flex flex-col items-center gap-2 px-3 text-center text-[var(--text-tertiary)]">
          <Clipboard size={22} strokeWidth={1.5} />
          <span style={{ fontSize: 11, lineHeight: 1.4 }}>
            {items.length === 0
              ? 'Copy anything — it’ll show up here.'
              : 'No matches'}
          </span>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {filtered.map((i) => {
            const meta = detectKind(i.text)
            const Icon = meta.icon
            return (
            <div
              key={i.id}
              className={cn(
                'group/c flex h-[34px] shrink-0 items-center gap-2 rounded-[8px] pl-2 pr-1 transition-colors',
                i.pinned ? 'bg-[var(--fill-2)]' : 'hover:bg-[var(--fill-1)]',
              )}
            >
              {/* type chip */}
              {meta.kind === 'color' ? (
                <span
                  className="h-[20px] w-[20px] shrink-0 rounded-[6px] border border-[var(--border)]"
                  style={{ background: meta.preview }}
                />
              ) : (
                <span
                  className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[6px]"
                  style={{
                    background: `color-mix(in srgb, ${meta.tint} 16%, transparent)`,
                    color: meta.tint,
                  }}
                >
                  <Icon size={12} strokeWidth={2.2} />
                </span>
              )}
              <Tooltip
                label={`Copy ${meta.label.toLowerCase()}`}
                side="top"
                className="min-w-0 flex-1"
              >
                <button
                  type="button"
                  onClick={() => copy(i.text)}
                  className="block min-w-0 flex-1 text-left"
                >
                  <div
                    className={cn(
                      'truncate',
                      meta.mono
                        ? 'font-mono text-[11px]'
                        : 'text-[12px]',
                      meta.kind === 'link'
                        ? 'text-[#5b9aff] group-hover/c:underline'
                        : 'text-[var(--text-primary)]',
                    )}
                  >
                    {meta.preview}
                  </div>
                </button>
              </Tooltip>
              <div className="flex shrink-0 items-center gap-0.5">
                <Tooltip label={i.pinned ? 'Unpin' : 'Pin'} side="top">
                  <button
                    type="button"
                    onClick={() => togglePin(i.id)}
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-[6px] transition-colors hover:bg-[var(--fill-3)]',
                      i.pinned
                        ? 'text-[var(--accent)]'
                        : 'text-[var(--text-tertiary)] opacity-0 group-hover/c:opacity-100 hover:text-[var(--text-primary)]',
                    )}
                  >
                    <Pin
                      size={11}
                      strokeWidth={2}
                      fill={i.pinned ? 'currentColor' : 'none'}
                    />
                  </button>
                </Tooltip>
                <Tooltip label="Remove" side="top">
                  <button
                    type="button"
                    onClick={() => remove(i.id)}
                    className="flex h-6 w-6 items-center justify-center rounded-[6px] text-[var(--text-tertiary)] opacity-0 transition-opacity hover:bg-[var(--fill-3)] hover:text-[var(--danger)] group-hover/c:opacity-100"
                  >
                    <X size={11} strokeWidth={2.5} />
                  </button>
                </Tooltip>
              </div>
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export const clipboardDefinition: WidgetDefinition<ClipboardWidgetType> = {
  type: 'clipboard',
  label: 'Clipboard',
  icon: Clipboard,
  enabled: true,
  minSize: { width: 220, height: 200 },
  maxSize: { width: 400, height: 540 },
  create: (x, y) => ({
    type: 'clipboard',
    x,
    y,
    width: 260,
    height: 320,
    locked: false,
  }),
  Renderer: ClipboardRenderer,
}
