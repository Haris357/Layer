import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Link as LinkIcon,
  icons as LUCIDE,
  type LucideIcon,
} from 'lucide-react'
import type { LinkWidget as LinkWidgetType } from '../../types/widget'
import { openUrl } from '../../lib/ipc'
import { TextField } from '../ui'
import { Tooltip } from '../Tooltip'
import { cn } from '../../lib/utils'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

const ICON_MAP = LUCIDE as unknown as Record<string, LucideIcon>

function resolveIcon(key: string): LucideIcon {
  return ICON_MAP[key] ?? LinkIcon
}

export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (/\s/.test(trimmed)) return null
  const hasScheme =
    /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ||
    /^mailto:/i.test(trimmed) ||
    /^tel:/i.test(trimmed)
  const candidate = hasScheme ? trimmed : `https://${trimmed}`
  try {
    return new URL(candidate).toString()
  } catch {
    return null
  }
}

function LinkRenderer({ widget }: { widget: LinkWidgetType }) {
  const { t } = useTranslation()
  const Icon = resolveIcon(widget.iconKey)
  const card = widget.background !== false

  const handleDoubleClick = () => {
    if (widget.url) {
      openUrl(widget.url).catch(() => {})
    }
  }

  return (
    <Tooltip
      label={widget.url ? t('link.renderer.openTooltip', { url: widget.url }) : ''}
      side="top"
      className="h-full w-full"
    >
      <div
        onDoubleClick={handleDoubleClick}
        className={cn(
          'group flex h-full w-full items-center gap-2.5 px-4 transition-all duration-200',
          card &&
            'glass border border-[var(--border)] hover:bg-[var(--surface-hover)]',
          widget.url ? 'cursor-pointer' : 'cursor-default',
        )}
        style={{ borderRadius: 999 }}
      >
        <Icon
          size={20}
          strokeWidth={1.7}
          className="shrink-0 text-[var(--text-primary)] transition-transform duration-200 group-hover:scale-110"
        />
        <span
          className="truncate text-[var(--text-primary)]"
          style={{ fontSize: 13, fontWeight: 600 }}
        >
          {widget.label || t('link.renderer.untitled')}
        </span>
      </div>
    </Tooltip>
  )
}

function LinkSettings({
  widget,
  onUpdate,
}: {
  widget: LinkWidgetType
  onUpdate: (patch: Partial<LinkWidgetType>) => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(widget.url)
  const [error, setError] = useState('')
  const [iconQuery, setIconQuery] = useState('')

  const iconNames = useMemo(() => {
    const q = iconQuery.trim().toLowerCase()
    const all = Object.keys(ICON_MAP)
    const matched = (
      q ? all.filter((n) => n.toLowerCase().includes(q)) : all
    ).slice(0, 90)
    if (widget.iconKey && !matched.includes(widget.iconKey)) {
      matched.unshift(widget.iconKey)
    }
    return matched
  }, [iconQuery, widget.iconKey])

  const commitUrl = () => {
    if (draft.trim() === '') {
      setError('')
      onUpdate({ url: '' })
      return
    }
    const normalized = normalizeUrl(draft)
    if (!normalized) {
      setError(t('link.settings.invalidUrl'))
      return
    }
    setError('')
    setDraft(normalized)
    onUpdate({ url: normalized })
  }

  return (
    <div className="flex w-[240px] flex-col gap-3">
      <div className="flex flex-col gap-1">
        <TextField
          value={draft}
          placeholder={t('link.settings.urlPlaceholder')}
          onChange={setDraft}
          onBlur={commitUrl}
        />
        {error && (
          <span
            className="text-[var(--danger)]"
            style={{ fontSize: 12, fontWeight: 500 }}
          >
            {error}
          </span>
        )}
      </div>
      <TextField
        value={widget.label}
        placeholder={t('link.settings.labelPlaceholder')}
        maxLength={30}
        onChange={(v) => onUpdate({ label: v })}
      />
      <TextField
        value={iconQuery}
        placeholder={t('link.settings.iconSearchPlaceholder')}
        onChange={setIconQuery}
      />
      <div className="grid max-h-[168px] grid-cols-7 gap-1 overflow-y-auto">
        {iconNames.map((key) => {
          const Icon = resolveIcon(key)
          return (
            <Tooltip key={key} label={key} side="top">
              <button
                type="button"
                onClick={() => onUpdate({ iconKey: key })}
                className={cn(
                  'flex items-center justify-center rounded-[6px] p-1.5 transition-colors',
                  widget.iconKey === key
                    ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--fill-2)]',
                )}
              >
                <Icon size={16} strokeWidth={1.5} />
              </button>
            </Tooltip>
          )
        })}
      </div>
    </div>
  )
}

export const linkDefinition: WidgetDefinition<LinkWidgetType> = {
  type: 'link',
  label: 'Link',
  icon: LinkIcon,
  enabled: true,
  minSize: { width: 130, height: 40 },
  maxSize: { width: 460, height: 88 },
  create: (x, y) => ({
    type: 'link',
    x,
    y,
    width: 190,
    height: 52,
    locked: false,
    url: '',
    label: 'New Link',
    iconKey: 'Link',
    background: true,
  }),
  Renderer: LinkRenderer,
  Settings: LinkSettings,
}
