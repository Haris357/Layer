import { useState } from 'react'
import { Search } from 'lucide-react'
import type { SearchWidget as SearchWidgetType } from '../../types/widget'
import { openUrl } from '../../lib/ipc'
import { Segmented } from '../ui'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

const ENGINES: Record<SearchWidgetType['engine'], string> = {
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
}

function SearchRenderer({ widget }: { widget: SearchWidgetType }) {
  const [query, setQuery] = useState('')

  const go = () => {
    const q = query.trim()
    if (!q) return
    openUrl(ENGINES[widget.engine] + encodeURIComponent(q)).catch(() => {})
    setQuery('')
  }

  return (
    <div
      className="glass flex h-full w-full items-center gap-2.5 border border-[var(--border)] px-4"
      style={{ borderRadius: 999 }}
    >
      <Search
        size={17}
        strokeWidth={1.8}
        className="shrink-0 text-[var(--text-tertiary)]"
      />
      <input
        value={query}
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') go()
        }}
        placeholder="Search the web…"
        className="min-w-0 flex-1 bg-transparent text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
      />
    </div>
  )
}

function SearchSettings({
  widget,
  onUpdate,
}: {
  widget: SearchWidgetType
  onUpdate: (patch: Partial<SearchWidgetType>) => void
}) {
  return (
    <div className="w-[210px]">
      <Segmented
        value={widget.engine}
        options={[
          { value: 'google', label: 'Google' },
          { value: 'bing', label: 'Bing' },
          { value: 'duckduckgo', label: 'DuckDuckGo' },
        ]}
        onChange={(v) =>
          onUpdate({ engine: v as SearchWidgetType['engine'] })
        }
      />
    </div>
  )
}

export const searchDefinition: WidgetDefinition<SearchWidgetType> = {
  type: 'search',
  label: 'Search',
  icon: Search,
  enabled: true,
  minSize: { width: 220, height: 46 },
  maxSize: { width: 540, height: 72 },
  create: (x, y) => ({
    type: 'search',
    x,
    y,
    width: 340,
    height: 54,
    locked: false,
    engine: 'google',
  }),
  Renderer: SearchRenderer,
  Settings: SearchSettings,
}
