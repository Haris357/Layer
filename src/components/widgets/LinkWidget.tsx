import { useState } from 'react'
import {
  Link as LinkIcon,
  Globe,
  Github,
  Twitter,
  Youtube,
  Instagram,
  Linkedin,
  Facebook,
  Twitch,
  Figma,
  Slack,
  Mail,
  Music,
  Image as ImageIcon,
  FileText,
  Folder,
  Calendar,
  ShoppingCart,
  BookOpen,
  Code,
  type LucideIcon,
} from 'lucide-react'
import type { LinkWidget as LinkWidgetType } from '../../types/widget'
import { openUrl } from '../../lib/ipc'
import { TextField } from '../ui'
import { cn } from '../../lib/utils'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

const ICONS: Record<string, LucideIcon> = {
  Link: LinkIcon,
  Globe,
  Github,
  Twitter,
  Youtube,
  Instagram,
  Linkedin,
  Facebook,
  Twitch,
  Figma,
  Slack,
  Mail,
  Music,
  Image: ImageIcon,
  FileText,
  Folder,
  Calendar,
  ShoppingCart,
  BookOpen,
  Code,
}

function resolveIcon(key: string): LucideIcon {
  return ICONS[key] ?? LinkIcon
}

export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`
  if (/\s/.test(withProtocol)) return null
  try {
    const url = new URL(withProtocol)
    if (!url.hostname.includes('.')) return null
    return url.toString()
  } catch {
    return null
  }
}

function LinkRenderer({ widget }: { widget: LinkWidgetType }) {
  const Icon = resolveIcon(widget.iconKey)
  const card = widget.background !== false

  const handleDoubleClick = () => {
    if (widget.url) {
      openUrl(widget.url).catch(() => {})
    }
  }

  return (
    <div
      onDoubleClick={handleDoubleClick}
      title={widget.url ? `Double-click to open ${widget.url}` : undefined}
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
        {widget.label || 'Untitled'}
      </span>
    </div>
  )
}

function LinkSettings({
  widget,
  onUpdate,
}: {
  widget: LinkWidgetType
  onUpdate: (patch: Partial<LinkWidgetType>) => void
}) {
  const [draft, setDraft] = useState(widget.url)
  const [error, setError] = useState('')

  const commitUrl = () => {
    if (draft.trim() === '') {
      setError('')
      onUpdate({ url: '' })
      return
    }
    const normalized = normalizeUrl(draft)
    if (!normalized) {
      setError('Enter a valid URL')
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
          placeholder="https://..."
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
        placeholder="Label"
        maxLength={30}
        onChange={(v) => onUpdate({ label: v })}
      />
      <div className="grid grid-cols-7 gap-1">
        {Object.entries(ICONS).map(([key, Icon]) => (
          <button
            key={key}
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
        ))}
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
