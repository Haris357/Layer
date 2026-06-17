import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { convertFileSrc } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open } from '@tauri-apps/plugin-dialog'
import {
  Layers3,
  Plus,
  X,
  FolderOpen,
  Folder,
  Film,
  Music,
  FileText,
} from 'lucide-react'
import {
  isTauri,
  openUrl,
  shelfImport,
  shelfRemove,
  showInFolder,
} from '../../lib/ipc'
import { useShelfStore, type ShelfItem } from '../../store/shelfStore'
import type { ShelfWidget as ShelfWidgetType } from '../../types/widget'
import { Tooltip } from '../Tooltip'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

function fmtSize(n: number): string {
  const gb = 1024 ** 3
  const mb = 1024 ** 2
  if (n >= gb) return `${(n / gb).toFixed(1)} GB`
  if (n >= mb) return `${(n / mb).toFixed(1)} MB`
  if (n >= 1024) return `${Math.round(n / 1024)} KB`
  return `${n} B`
}

// Import a list of absolute file paths into the shelf (copies into the hidden
// folder, then records metadata). Uses getState so it never goes stale.
async function importPaths(paths: string[]) {
  const add = useShelfStore.getState().add
  for (const p of paths) {
    try {
      const f = await shelfImport(p)
      add({ name: f.name, path: f.path, size: f.size, kind: f.kind })
    } catch {
      /* skip files that fail to copy */
    }
  }
}

function Tile({ item }: { item: ShelfItem }) {
  const { t } = useTranslation()
  const removeFromStore = useShelfStore((s) => s.remove)
  const remove = () => {
    const path = removeFromStore(item.id)
    if (path) shelfRemove(path).catch(() => {})
  }
  const src = item.kind === 'image' ? convertFileSrc(item.path) : null
  const isFolder = item.kind === 'folder'
  const open = () =>
    (isFolder ? showInFolder(item.path) : openUrl(item.path)).catch(() => {})

  return (
    <div className="group/t relative flex flex-col gap-1">
      <Tooltip label={t('shelf.openTooltip', { name: item.name })} side="top" className="w-full">
      <button
        type="button"
        onClick={open}
        className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-[9px] border border-[var(--border)] bg-[var(--fill-2)] transition-colors hover:border-[var(--border-strong)]"
      >
        {src ? (
          <img
            src={src}
            alt={item.name}
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : item.kind === 'folder' ? (
          <Folder size={22} strokeWidth={1.5} className="text-[var(--text-secondary)]" />
        ) : item.kind === 'video' ? (
          <Film size={22} strokeWidth={1.5} className="text-[var(--text-secondary)]" />
        ) : item.kind === 'audio' ? (
          <Music size={22} strokeWidth={1.5} className="text-[var(--text-secondary)]" />
        ) : (
          <FileText size={22} strokeWidth={1.5} className="text-[var(--text-secondary)]" />
        )}

        {/* hover actions */}
        <span className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-gradient-to-t from-black/55 to-transparent px-1 pb-1 pt-3 opacity-0 transition-opacity group-hover/t:opacity-100">
          <Tooltip label={t('shelf.showInFolderTooltip')} side="top">
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation()
                showInFolder(item.path).catch(() => {})
              }}
              className="flex h-5 w-5 items-center justify-center rounded-[5px] bg-white/15 text-white hover:bg-white/30"
            >
              <FolderOpen size={11} strokeWidth={2} />
            </span>
          </Tooltip>
        </span>
      </button>
      </Tooltip>

      {/* remove */}
      <Tooltip label={t('shelf.removeTooltip')} side="top" className="absolute right-1 top-1">
        <button
          type="button"
          onClick={remove}
          className="flex h-5 w-5 items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity hover:bg-[var(--danger)] group-hover/t:opacity-100"
        >
          <X size={11} strokeWidth={2.5} />
        </button>
      </Tooltip>

      <span
        className="truncate px-0.5 text-[10px] text-[var(--text-secondary)]"
        title={isFolder ? item.name : `${item.name} · ${fmtSize(item.size)}`}
      >
        {item.name}
      </span>
    </div>
  )
}

function ShelfRenderer() {
  const { t } = useTranslation()
  const items = useShelfStore((s) => s.items)
  const rootRef = useRef<HTMLDivElement>(null)
  const [dragOver, setDragOver] = useState(false)

  // OS file drop → import, but only when the drop lands over THIS shelf.
  useEffect(() => {
    if (!isTauri()) return
    let un: (() => void) | undefined
    let disposed = false
    const overRect = (pos: { x: number; y: number }) => {
      const el = rootRef.current
      if (!el) return false
      const r = el.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const x = pos.x / dpr
      const y = pos.y / dpr
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
    }
    getCurrentWindow()
      .onDragDropEvent((e) => {
        const p = e.payload
        if (p.type === 'enter' || p.type === 'over') {
          setDragOver(overRect(p.position))
        } else if (p.type === 'drop') {
          if (overRect(p.position)) void importPaths(p.paths)
          setDragOver(false)
        } else {
          setDragOver(false)
        }
      })
      .then((f) => {
        if (disposed) f()
        else un = f
      })
      .catch(() => {})
    return () => {
      disposed = true
      un?.()
    }
  }, [])

  const pickFiles = async () => {
    try {
      const sel = await open({ multiple: true })
      if (!sel) return
      await importPaths(Array.isArray(sel) ? sel : [sel])
    } catch {
      /* cancelled */
    }
  }

  const pickFolders = async () => {
    try {
      const sel = await open({ directory: true, multiple: true })
      if (!sel) return
      await importPaths(Array.isArray(sel) ? sel : [sel])
    } catch {
      /* cancelled */
    }
  }

  return (
    <div
      ref={rootRef}
      data-hit
      className="glass relative flex h-full w-full flex-col overflow-hidden rounded-[12px] border p-2.5 transition-colors"
      style={{
        borderColor: dragOver ? 'var(--accent)' : 'var(--border)',
      }}
    >
      <div className="mb-1.5 flex items-center gap-1.5 px-1">
        <Layers3 size={12} strokeWidth={2} className="text-[var(--text-tertiary)]" />
        <span
          className="text-[var(--text-primary)]"
          style={{ fontSize: 12, fontWeight: 700, letterSpacing: '-0.3px' }}
        >
          {t('shelf.title')}
        </span>
        {items.length > 0 && (
          <span className="rounded-full bg-[var(--fill-2)] px-1.5 text-[9.5px] font-semibold text-[var(--text-tertiary)]">
            {items.length}
          </span>
        )}
        <Tooltip label={t('shelf.addFolderTooltip')} side="top" className="ml-auto">
          <button
            type="button"
            onClick={pickFolders}
            className="flex h-6 w-6 items-center justify-center rounded-[6px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          >
            <Folder size={13} strokeWidth={2.2} />
          </button>
        </Tooltip>
        <Tooltip label={t('shelf.addFilesTooltip')} side="top">
          <button
            type="button"
            onClick={pickFiles}
            className="flex h-6 w-6 items-center justify-center rounded-[6px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          >
            <Plus size={14} strokeWidth={2.2} />
          </button>
        </Tooltip>
      </div>

      {items.length === 0 ? (
        <button
          type="button"
          onClick={pickFiles}
          className="m-1 flex flex-1 flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border)] px-3 text-center text-[var(--text-tertiary)] transition-colors hover:border-[var(--border-strong)]"
        >
          <Layers3 size={22} strokeWidth={1.5} />
          <span style={{ fontSize: 11.5, lineHeight: 1.4 }}>
            {t('shelf.emptyDrop')}
            <br />
            <span className="text-[var(--text-secondary)]">{t('shelf.emptyBrowse')}</span>
          </span>
        </button>
      ) : (
        <div
          className="grid flex-1 content-start gap-2 overflow-y-auto px-0.5"
          style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))',
          }}
        >
          {items.map((it) => (
            <Tile key={it.id} item={it} />
          ))}
        </div>
      )}

      {/* drop overlay */}
      {dragOver && (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[12px]"
          style={{
            background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
          }}
        >
          <span
            className="rounded-[8px] px-3 py-1.5 text-[12px] font-semibold"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            {t('shelf.dropOverlay')}
          </span>
        </div>
      )}
    </div>
  )
}

export const shelfDefinition: WidgetDefinition<ShelfWidgetType> = {
  type: 'shelf',
  label: 'Shelf',
  icon: Layers3,
  enabled: true,
  minSize: { width: 200, height: 170 },
  maxSize: { width: 480, height: 540 },
  create: (x, y) => ({
    type: 'shelf',
    x,
    y,
    width: 280,
    height: 240,
    locked: false,
  }),
  Renderer: ShelfRenderer,
}
