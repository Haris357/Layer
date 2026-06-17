import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import type { SearchWidget as SearchWidgetType } from '../../types/widget'
import { openUrl } from '../../lib/ipc'
import { Segmented, TextField } from '../ui'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

const ENGINES: Record<'google' | 'bing' | 'duckduckgo', string> = {
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
}

function SearchRenderer({ widget }: { widget: SearchWidgetType }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')

  const go = () => {
    const q = query.trim()
    if (!q) return
    const encoded = encodeURIComponent(q)
    let url: string
    if (widget.engine === 'custom') {
      const tmpl = widget.customUrl?.trim()
      if (!tmpl) return
      url = tmpl.includes('%s')
        ? tmpl.replaceAll('%s', encoded)
        : tmpl + encoded
    } else {
      url = ENGINES[widget.engine] + encoded
    }
    openUrl(url).catch(() => {})
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
        placeholder={t('search.placeholder')}
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
  const { t } = useTranslation()
  return (
    <div className="flex w-[256px] flex-col gap-2.5">
      <Segmented
        value={widget.engine}
        options={[
          { value: 'google', label: t('search.engines.google') },
          { value: 'bing', label: t('search.engines.bing') },
          { value: 'duckduckgo', label: t('search.engines.ddg') },
          { value: 'custom', label: t('search.engines.custom') },
        ]}
        onChange={(v) =>
          onUpdate({ engine: v as SearchWidgetType['engine'] })
        }
      />
      {widget.engine === 'custom' && (
        <TextField
          value={widget.customUrl ?? ''}
          placeholder={t('search.customPlaceholder')}
          onChange={(v) => onUpdate({ customUrl: v })}
        />
      )}
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
