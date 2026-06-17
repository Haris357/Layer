import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { LayoutGrid, Folder, X, Plus, GripVertical } from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
import { Tooltip } from '../Tooltip'
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

// --- Sortable list/grid items ---------------------------------------------

function SortableListItem({
  app,
  onRemove,
}: {
  app: PinnedApp
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: app.path })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    zIndex: isDragging ? 5 : undefined,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group/item relative flex items-center rounded-[9px] transition-colors hover:bg-[var(--surface-hover)]"
    >
      <Tooltip label={app.name} side="top" className="min-w-0 flex-1">
        <button
          type="button"
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
      </Tooltip>
      <div className="mr-1 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/item:opacity-100">
        <Tooltip label={t('apps.dragToReorder')} side="top">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab rounded-[5px] p-1 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] active:cursor-grabbing"
          >
            <GripVertical size={13} />
          </button>
        </Tooltip>
        <Tooltip label={t('apps.remove')} side="top">
          <button
            type="button"
            onClick={onRemove}
            className="rounded-[5px] p-1 text-[var(--text-tertiary)] hover:text-[var(--danger)]"
          >
            <X size={14} />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}

function SortableGridItem({
  app,
  onRemove,
}: {
  app: PinnedApp
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: app.path })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    zIndex: isDragging ? 5 : undefined,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group/item relative flex flex-col items-center gap-1.5"
    >
      <Tooltip label={app.name} side="top">
        <button
          type="button"
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
      </Tooltip>
      <Tooltip label={t('apps.dragToReorder')} side="top" className="absolute -left-1 -top-1 z-10">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex h-4 w-4 cursor-grab items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] opacity-0 transition-opacity group-hover/item:opacity-100 active:cursor-grabbing"
        >
          <GripVertical size={10} strokeWidth={2} />
        </button>
      </Tooltip>
      <Tooltip label={t('apps.remove')} side="top" className="absolute -right-1 -top-1 z-10">
        <button
          type="button"
          onClick={onRemove}
          className="flex h-4 w-4 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] opacity-0 transition-opacity group-hover/item:opacity-100 hover:text-[var(--danger)]"
        >
          <X size={10} strokeWidth={2.5} />
        </button>
      </Tooltip>
    </div>
  )
}

// --- Add Apps menu (used inline on the widget + in the settings popover) --

function AddAppsContent({
  widget,
  onUpdate,
  compact = false,
}: {
  widget: AppsWidgetType
  onUpdate: (patch: Partial<AppsWidgetType>) => void
  compact?: boolean
}) {
  const { t } = useTranslation()
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
      onUpdate({
        pinned: widget.pinned.filter((p) => p.path !== app.path),
      })
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
      const name = sel.split(/[\\/]/).filter(Boolean).pop() ?? sel
      onUpdate({
        pinned: [...widget.pinned, { name, path: sel, isFolder: true }],
      })
    }
  }

  return (
    <div className={cn('flex flex-col gap-2', compact ? 'w-full' : 'w-[252px]')}>
      {!compact && (
        <Segmented
          value={widget.layout}
          options={[
            { value: 'list', label: t('apps.layout.list') },
            { value: 'grid', label: t('apps.layout.grid') },
          ]}
          onChange={(v) =>
            onUpdate({ layout: v as AppsWidgetType['layout'] })
          }
        />
      )}
      <TextField
        value={query}
        placeholder={t('apps.searchInstalled')}
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
                className="flex items-center justify-between px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--fill-2)]"
                style={{
                  color: pinned ? 'var(--accent)' : 'rgba(255,255,255,0.8)',
                }}
              >
                <span className="truncate">{a.name}</span>
                <span className="ml-2 shrink-0">
                  {pinned ? t('apps.pinned') : t('apps.pin')}
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
        {t('apps.addFolder')}
      </button>
    </div>
  )
}

// --- Main renderer --------------------------------------------------------

function AppsRenderer({ widget }: { widget: AppsWidgetType }) {
  const { t } = useTranslation()
  const updateWidget = useCanvasStore((s) => s.updateWidget)
  const [addOpen, setAddOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
  )

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

  // Close the add-menu when clicking outside the widget.
  useEffect(() => {
    if (!addOpen) return
    const onDown = (e: MouseEvent) => {
      const el = containerRef.current
      if (el && !el.contains(e.target as Node)) setAddOpen(false)
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [addOpen])

  const remove = (path: string) =>
    updateWidget(widget.id, {
      pinned: widget.pinned.filter((p) => p.path !== path),
    })

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = widget.pinned.map((p) => p.path)
    const oldIndex = ids.indexOf(active.id as string)
    const newIndex = ids.indexOf(over.id as string)
    if (oldIndex < 0 || newIndex < 0) return
    updateWidget(widget.id, {
      pinned: arrayMove(widget.pinned, oldIndex, newIndex),
    })
  }

  const ids = widget.pinned.map((p) => p.path)
  const empty = widget.pinned.length === 0
  const isGrid = widget.layout === 'grid'

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
    >
      {empty ? (
        <div className="glass flex h-full w-full flex-col items-center justify-center gap-2 rounded-[12px] border border-[var(--border)] text-[var(--text-tertiary)]">
          <LayoutGrid size={26} strokeWidth={1.5} />
          <span style={{ fontSize: 12, fontWeight: 500 }}>
            {t('apps.emptyHint')}
          </span>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={ids}
            strategy={isGrid ? rectSortingStrategy : verticalListSortingStrategy}
          >
            {isGrid ? (
              <div
                className="glass grid h-full w-full content-start gap-3 overflow-y-auto rounded-[12px] border border-[var(--border)] p-3.5 pb-12"
                style={{
                  gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))',
                }}
              >
                {widget.pinned.map((app) => (
                  <SortableGridItem
                    key={app.path}
                    app={app}
                    onRemove={() => remove(app.path)}
                  />
                ))}
              </div>
            ) : (
              <div className="glass flex h-full w-full flex-col gap-0.5 overflow-y-auto rounded-[12px] border border-[var(--border)] p-2 pb-12">
                {widget.pinned.map((app) => (
                  <SortableListItem
                    key={app.path}
                    app={app}
                    onRemove={() => remove(app.path)}
                  />
                ))}
              </div>
            )}
          </SortableContext>
        </DndContext>
      )}

      {/* Floating "+" — always visible, lock-state independent. */}
      <Tooltip
        label={t('apps.addAppsOrFolder')}
        side="top"
        className="absolute bottom-2 right-2 z-20"
      >
        <button
          type="button"
          onClick={() => setAddOpen((v) => !v)}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full border transition-colors',
            addOpen
              ? 'border-[var(--border-strong)] bg-[var(--fill-2)] text-[var(--text-primary)]'
              : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--fill-2)] hover:text-[var(--text-primary)]',
          )}
          style={{ boxShadow: '0 2px 10px rgba(0,0,0,0.18)' }}
        >
          <Plus size={16} strokeWidth={2.2} />
        </button>
      </Tooltip>

      <AnimatePresence>
        {addOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            onMouseDown={(e) => e.stopPropagation()}
            className="absolute bottom-12 right-2 z-30 w-[252px] rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-2.5"
            style={{ boxShadow: '0 12px 30px -14px rgba(0,0,0,0.5)' }}
          >
            <AddAppsContent
              widget={widget}
              onUpdate={(patch) => updateWidget(widget.id, patch)}
              compact
            />
          </motion.div>
        )}
      </AnimatePresence>
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
  return <AddAppsContent widget={widget} onUpdate={onUpdate} />
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
