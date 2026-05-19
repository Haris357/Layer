import { useEffect, useState } from 'react'
import { LayoutGrid, Folder, X } from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'
import type {
  AppsWidget as AppsWidgetType,
  PinnedApp,
} from '../../types/widget'
import {
  getAppIcon,
  isTauri,
  launchApp,
  listApps,
  type AppEntry,
} from '../../lib/ipc'
import { useCanvasStore } from '../../store/canvasStore'
import { Segmented, TextField } from '../ui'
import { cn } from '../../lib/utils'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

function hue(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) % 360
  }
  return h
}

function AppIcon({ app, size }: { app: PinnedApp; size: number }) {
  if (app.icon) {
    return (
      <img
        src={app.icon}
        alt=""
        draggable={false}
        style={{ width: size, height: size, objectFit: 'contain' }}
      />
    )
  }
  if (app.isFolder) {
    return (
      <div
        className="flex items-center justify-center rounded-[10px] bg-[var(--fill-2)]"
        style={{ width: size, height: size }}
      >
        <Folder
          size={size * 0.5}
          strokeWidth={1.8}
          className="text-[var(--text-primary)]"
        />
      </div>
    )
  }
  return (
    <div
      className="flex items-center justify-center rounded-[10px]"
      style={{
        width: size,
        height: size,
        background: `hsl(${hue(app.name)}, 44%, 40%)`,
      }}
    >
      <span
        style={{ fontSize: size * 0.42, fontWeight: 700, color: '#fff' }}
      >
        {app.name.charAt(0).toUpperCase()}
      </span>
    </div>
  )
}

function AppsRenderer({ widget }: { widget: AppsWidgetType }) {
  const updateWidget = useCanvasStore((s) => s.updateWidget)

  useEffect(() => {
    if (!isTauri()) return
    const missing = widget.pinned.filter((p) => !p.icon && !p.isFolder)
    if (missing.length === 0) return
    let cancelled = false
    Promise.all(
      missing.map((p) =>
        getAppIcon(p.path)
          .then((icon) => ({ path: p.path, icon }))
          .catch(() => ({ path: p.path, icon: null })),
      ),
    ).then((results) => {
      if (cancelled) return
      const map = new Map(
        results
          .filter((r) => r.icon)
          .map((r) => [r.path, r.icon as string]),
      )
      if (map.size === 0) return
      updateWidget(widget.id, {
        pinned: widget.pinned.map((p) =>
          map.has(p.path) ? { ...p, icon: map.get(p.path) } : p,
        ),
      })
    })
    return () => {
      cancelled = true
    }
  }, [widget.pinned, widget.id, updateWidget])

  if (widget.pinned.length === 0) {
    return (
      <div className="glass flex h-full w-full flex-col items-center justify-center gap-2 rounded-[12px] border border-[var(--border)] text-[var(--text-tertiary)]">
        <LayoutGrid size={26} strokeWidth={1.5} />
        <span style={{ fontSize: 12, fontWeight: 500 }}>
          Pin apps in settings
        </span>
      </div>
    )
  }

  const remove = (path: string) => {
    updateWidget(widget.id, {
      pinned: widget.pinned.filter((p) => p.path !== path),
    })
  }

  if (widget.layout === 'grid') {
    return (
      <div
        className="glass grid h-full w-full content-start gap-3 overflow-y-auto rounded-[12px] border border-[var(--border)] p-3.5"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))' }}
      >
        {widget.pinned.map((app) => (
          <div
            key={app.path}
            className="group/item relative flex flex-col items-center gap-1.5"
          >
            <button
              type="button"
              title={app.name}
              onClick={() => launchApp(app.path).catch(() => {})}
              className="flex flex-col items-center gap-1.5"
            >
              <div className="transition-transform duration-150 hover:scale-110">
                <AppIcon app={app} size={48} />
              </div>
              <span
                className="w-full truncate text-center text-[var(--text-secondary)]"
                style={{ fontSize: 10.5, fontWeight: 500 }}
              >
                {app.name}
              </span>
            </button>
            <button
              type="button"
              title="Remove"
              onClick={() => remove(app.path)}
              className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] opacity-0 transition-opacity group-hover/item:opacity-100 hover:text-[var(--danger)]"
            >
              <X size={10} strokeWidth={2.5} />
            </button>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="glass flex h-full w-full flex-col gap-0.5 overflow-y-auto rounded-[12px] border border-[var(--border)] p-2">
      {widget.pinned.map((app) => (
        <div
          key={app.path}
          className="group/item relative flex items-center rounded-[9px] transition-colors hover:bg-[var(--surface-hover)]"
        >
          <button
            type="button"
            title={app.name}
            onClick={() => launchApp(app.path).catch(() => {})}
            className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1.5 text-left"
          >
            <AppIcon app={app} size={34} />
            <span
              className="min-w-0 flex-1 truncate text-[var(--text-primary)]"
              style={{ fontSize: 13, fontWeight: 500 }}
            >
              {app.name}
            </span>
          </button>
          <button
            type="button"
            title="Remove"
            onClick={() => remove(app.path)}
            className="mr-1.5 shrink-0 text-[var(--text-tertiary)] opacity-0 transition-opacity group-hover/item:opacity-100 hover:text-[var(--danger)]"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

function AppsSettings({
  widget,
  onUpdate,
}: {
  widget: AppsWidgetType
  onUpdate: (patch: Partial<AppsWidgetType>) => void
}) {
  const [all, setAll] = useState<AppEntry[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!isTauri()) return
    listApps()
      .then(setAll)
      .catch(() => {})
  }, [])

  const pinnedPaths = new Set(widget.pinned.map((p) => p.path))
  const q = query.trim().toLowerCase()
  const results = q
    ? all.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 50)
    : []

  const toggle = async (app: AppEntry) => {
    if (pinnedPaths.has(app.path)) {
      onUpdate({ pinned: widget.pinned.filter((p) => p.path !== app.path) })
    } else {
      const icon = await getAppIcon(app.path).catch(() => null)
      onUpdate({
        pinned: [
          ...widget.pinned,
          { name: app.name, path: app.path, icon: icon ?? undefined },
        ],
      })
    }
  }

  const addFolder = async () => {
    const sel = await open({ directory: true, multiple: false })
    if (sel && typeof sel === 'string' && !pinnedPaths.has(sel)) {
      const name =
        sel.split(/[\\/]/).filter(Boolean).pop() ?? sel
      onUpdate({
        pinned: [
          ...widget.pinned,
          { name, path: sel, isFolder: true },
        ],
      })
    }
  }

  return (
    <div className="flex w-[252px] flex-col gap-2">
      <Segmented
        value={widget.layout}
        options={[
          { value: 'list', label: 'List' },
          { value: 'grid', label: 'Grid' },
        ]}
        onChange={(v) =>
          onUpdate({ layout: v as AppsWidgetType['layout'] })
        }
      />
      <TextField
        value={query}
        placeholder="Search installed apps…"
        onChange={setQuery}
      />
      {results.length > 0 && (
        <div className="flex max-h-[210px] flex-col overflow-y-auto rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)]">
          {results.map((a) => {
            const pinned = pinnedPaths.has(a.path)
            return (
              <button
                key={a.path}
                type="button"
                onClick={() => toggle(a)}
                className={cn(
                  'flex items-center justify-between px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--fill-2)]',
                )}
                style={{
                  color: pinned ? 'var(--accent)' : 'rgba(255,255,255,0.8)',
                }}
              >
                <span className="truncate">{a.name}</span>
                <span className="ml-2 shrink-0">
                  {pinned ? 'Pinned' : '+ Pin'}
                </span>
              </button>
            )
          })}
        </div>
      )}
      <button
        type="button"
        onClick={addFolder}
        className="flex items-center justify-center gap-1.5 rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-2)]"
      >
        <Folder size={13} strokeWidth={1.8} />
        Add a folder
      </button>
    </div>
  )
}

export const appsDefinition: WidgetDefinition<AppsWidgetType> = {
  type: 'apps',
  label: 'Apps',
  icon: LayoutGrid,
  enabled: true,
  minSize: { width: 200, height: 140 },
  create: (x, y) => ({
    type: 'apps',
    x,
    y,
    width: 280,
    height: 240,
    locked: false,
    pinned: [],
    layout: 'list',
  }),
  Renderer: AppsRenderer,
  Settings: AppsSettings,
}
