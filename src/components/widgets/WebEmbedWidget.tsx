import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe, Loader2, ExternalLink, AppWindow } from 'lucide-react'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import type { WebEmbedWidget as WebEmbedWidgetType } from '../../types/widget'
import { useCanvasStore } from '../../store/canvasStore'
import { openUrl, isTauri } from '../../lib/ipc'
import { TextField, Slider, Segmented, FieldRow } from '../ui'
import { Tooltip } from '../Tooltip'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36'

function normalizeUrl(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}

// Rewrite links that refuse normal embedding into an embeddable form.
function toEmbeddable(url: string): string {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`
  return url
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// Checks the site's headers for X-Frame-Options / CSP frame-ancestors so we can
// show a clean fallback instead of a broken error page. Optimistic on failure.
async function canEmbed(url: string): Promise<boolean> {
  if (!isTauri()) return true
  try {
    const res = await tauriFetch(url, {
      method: 'GET',
      headers: { 'User-Agent': UA },
    })
    const xfo = (res.headers.get('x-frame-options') || '').toLowerCase()
    if (xfo.includes('deny') || xfo.includes('sameorigin')) return false
    const csp = (res.headers.get('content-security-policy') || '').toLowerCase()
    const m = csp.match(/frame-ancestors([^;]*)/)
    if (m) {
      const val = (m[1] ?? '').trim()
      if (/'none'/.test(val)) return false
      if (!/(^|\s)\*(\s|$)/.test(val)) return false // only specific origins → not us
    }
    return true
  } catch {
    return true
  }
}

function WebEmbedRenderer({ widget }: { widget: WebEmbedWidgetType }) {
  const { t } = useTranslation()
  const mode = useCanvasStore((s) => s.mode)
  const [reload, setReload] = useState(0)
  const [status, setStatus] = useState<'checking' | 'ok' | 'blocked'>('checking')
  const url = widget.url ? toEmbeddable(normalizeUrl(widget.url)) : ''

  // Verify embeddability whenever the URL (or a refresh) changes.
  useEffect(() => {
    if (!url) return
    let cancelled = false
    setStatus('checking')
    canEmbed(url).then((ok) => {
      if (!cancelled) setStatus(ok ? 'ok' : 'blocked')
    })
    return () => {
      cancelled = true
    }
  }, [url, reload])

  // Auto-refresh by remounting the iframe (great for dashboards / tickers).
  useEffect(() => {
    if (!url || !widget.refreshSec) return
    const id = window.setInterval(
      () => setReload((r) => r + 1),
      widget.refreshSec * 1000,
    )
    return () => window.clearInterval(id)
  }, [url, widget.refreshSec])

  if (!url) {
    return (
      <Shell>
        <Globe size={26} strokeWidth={1.5} />
        <span style={{ fontSize: 12, fontWeight: 500 }}>{t('webembed.addUrl')}</span>
      </Shell>
    )
  }

  if (status === 'checking') {
    return (
      <Shell>
        <Loader2 size={22} strokeWidth={1.8} className="animate-spin" />
        <span style={{ fontSize: 12, fontWeight: 500 }}>{t('webembed.loading', { host: hostOf(url) })}</span>
      </Shell>
    )
  }

  if (status === 'blocked') {
    return (
      <Shell>
        <Globe size={26} strokeWidth={1.5} />
        <span
          className="text-[var(--text-secondary)]"
          style={{ fontSize: 13, fontWeight: 600 }}
        >
          {hostOf(url)}
        </span>
        <span style={{ fontSize: 11.5 }}>{t('webembed.noEmbed')}</span>
        <button
          type="button"
          onClick={() => openUrl(url).catch(() => {})}
          className="mt-1 flex items-center gap-1.5 rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--fill-2)]"
          style={{ pointerEvents: mode === 'edit' ? 'none' : 'auto' }}
        >
          <ExternalLink size={13} strokeWidth={2} />
          {t('webembed.openInBrowser')}
        </button>
      </Shell>
    )
  }

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--surface)]"
      style={{ outline: mode === 'edit' ? '1px solid var(--border)' : 'none' }}
    >
      <iframe
        key={reload}
        src={url}
        title={t('webembed.iframeTitle')}
        className="h-full w-full border-0"
        // In edit mode the iframe ignores the cursor so you can select/drag the
        // tile; in view mode it's fully interactive.
        style={{
          zoom: widget.zoom || 1,
          pointerEvents: mode === 'edit' ? 'none' : 'auto',
        }}
        // No allow-top-navigation: an embedded page can never hijack Layer.
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation allow-popups-to-escape-sandbox"
        allow="autoplay; encrypted-media; clipboard-read; clipboard-write; fullscreen; picture-in-picture"
        referrerPolicy="no-referrer"
      />
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="glass flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-[12px] border border-[var(--border)] p-3 text-center text-[var(--text-tertiary)]">
      {children}
    </div>
  )
}

function WebEmbedSettings({
  widget,
  onUpdate,
}: {
  widget: WebEmbedWidgetType
  onUpdate: (patch: Partial<WebEmbedWidgetType>) => void
}) {
  const { t } = useTranslation()
  const zoomPct = Math.round((widget.zoom || 1) * 100)
  return (
    <div className="flex w-[252px] flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-[var(--text-secondary)]">
          {t('webembed.urlLabel')}
        </span>
        <TextField
          value={widget.url}
          placeholder={t('webembed.urlPlaceholder')}
          onChange={(v) => onUpdate({ url: v })}
        />
        <span className="text-[10.5px] text-[var(--text-tertiary)]">
          {t('webembed.urlHint')}
        </span>
      </div>

      <FieldRow label={t('webembed.zoom', { pct: zoomPct })}>
        <div className="w-[120px]">
          <Slider
            value={zoomPct}
            min={50}
            max={150}
            onChange={(v) => onUpdate({ zoom: v / 100 })}
          />
        </div>
      </FieldRow>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-[var(--text-secondary)]">
          {t('webembed.autoRefresh')}
        </span>
        <Segmented
          value={String(widget.refreshSec)}
          options={[
            { value: '0', label: t('webembed.refresh.off') },
            { value: '30', label: t('webembed.refresh.30s') },
            { value: '60', label: t('webembed.refresh.1m') },
            { value: '300', label: t('webembed.refresh.5m') },
          ]}
          onChange={(v) => onUpdate({ refreshSec: Number(v) })}
        />
      </div>

      <Tooltip label={t('webembed.openInBrowser')}>
        <button
          type="button"
          onClick={() => {
            if (widget.url)
              openUrl(toEmbeddable(normalizeUrl(widget.url))).catch(() => {})
          }}
          className="rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-2.5 py-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-2)]"
        >
          <ExternalLink size={13} strokeWidth={2} />
        </button>
      </Tooltip>
    </div>
  )
}

export const webEmbedDefinition: WidgetDefinition<WebEmbedWidgetType> = {
  type: 'webembed',
  label: 'Web embed',
  icon: AppWindow,
  enabled: true,
  minSize: { width: 200, height: 150 },
  create: (x, y) => ({
    type: 'webembed',
    x,
    y,
    width: 380,
    height: 280,
    locked: false,
    url: '',
    zoom: 1,
    refreshSec: 0,
  }),
  Renderer: WebEmbedRenderer,
  Settings: WebEmbedSettings,
}
