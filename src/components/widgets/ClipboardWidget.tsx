import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Check,
  ChevronDown,
  Clipboard,
  Code2,
  Copy,
  ExternalLink,
  File,
  FileText,
  FolderOpen,
  Hash,
  Image as ImageIcon,
  Keyboard,
  Link2,
  Mail,
  MoreHorizontal,
  Palette,
  Pause,
  Phone,
  Pin,
  Play,
  Plus,
  Search,
  Trash2,
  Type,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { ClipboardWidget as ClipboardWidgetType } from '../../types/widget'
import type { WidgetDefinition } from '../../lib/widgetRegistry'
import { useClipboardStore, type ClipItem } from '../../store/clipboardStore'
import { useToastStore } from '../../store/toastStore'
import { TRANSFORMS, domainOf, extOf, fileName, parseColor, textKind, toHex, toHsl, toRgb, transform, type TextKind, type Transform } from '../../lib/clipKind'
import { clipLabel, copyClip, groupOf, timeAgo, useAppIcon, type Group } from '../../lib/clipActions'
import { launchApp, openUrl, showInFolder } from '../../lib/ipc'
import { useAssetSrc } from '../../lib/assetSrc'
import { Tooltip } from '../Tooltip'
import { FieldRow, Segmented, TextField, Toggle } from '../ui'
import { cn } from '../../lib/utils'

// Clipboard history: text, links, colours, code, images and files, each as
// its own card, grouped by day, filterable, with pinboards, transforms and
// multi-select. Quick Paste (Win+Shift+V) lives in QuickPaste.tsx.

const ease = [0.32, 0.72, 0, 1] as const

type Filter = 'all' | 'pinned' | 'text' | 'link' | 'image' | 'files' | 'color' | 'code' | `b:${string}`
const FILTERS: { id: Filter; icon: LucideIcon }[] = [
  { id: 'all', icon: Clipboard },
  { id: 'pinned', icon: Pin },
  { id: 'text', icon: Type },
  { id: 'link', icon: Link2 },
  { id: 'image', icon: ImageIcon },
  { id: 'files', icon: File },
  { id: 'color', icon: Palette },
  { id: 'code', icon: Code2 },
]

const KIND_ICON: Record<TextKind, LucideIcon> = { color: Palette, link: Link2, email: Mail, phone: Phone, path: FolderOpen, json: Code2, code: Code2, number: Hash, text: FileText }

export const kindOf = (i: ClipItem): TextKind | 'image' | 'files' => (i.kind === 'text' ? textKind(i.text ?? '') : i.kind)

function matches(i: ClipItem, k: ReturnType<typeof kindOf>, f: Filter): boolean {
  if (f === 'all') return true
  if (f === 'pinned') return !!i.pinned
  if (f.startsWith('b:')) return !!i.boards?.includes(f.slice(2))
  if (f === 'code') return k === 'code' || k === 'json'
  if (f === 'text') return i.kind === 'text' && k !== 'link' && k !== 'color' && k !== 'code' && k !== 'json'
  return k === f
}

function ClipboardRenderer({ widget }: { widget: ClipboardWidgetType }) {
  const { t } = useTranslation()
  const items = useClipboardStore((s) => s.items)
  const boards = useClipboardStore((s) => s.boards)
  const paused = useClipboardStore((s) => s.settings.paused)
  const setSettings = useClipboardStore((s) => s.setSettings)
  const clearUnpinned = useClipboardStore((s) => s.clearUnpinned)
  const remove = useClipboardStore((s) => s.remove)
  const toast = useToastStore((s) => s.showToast)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [picked, setPicked] = useState<string[]>([])
  const [menu, setMenu] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const grid = widget.width >= 460

  const kinds = useMemo(() => new Map(items.map((i) => [i.id, kindOf(i)])), [items])
  const q = query.trim().toLowerCase()
  const shown = items.filter((i) => matches(i, kinds.get(i.id)!, filter) && (!q || clipLabel(i).toLowerCase().includes(q) || i.source?.name.toLowerCase().includes(q)))
  const groups = (['today', 'yesterday', 'earlier'] as Group[]).map((g) => ({ g, list: shown.filter((i) => groupOf(i.createdAt) === g) })).filter((x) => x.list.length)

  // Pinned float to the top of "All".
  if (filter === 'all') for (const x of groups) x.list.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned))

  const copy = async (i: ClipItem, text?: string) => {
    try {
      await copyClip(i, text)
      toast({ message: t('clipboard.copied'), icon: 'success' })
    } catch {
      toast({ message: t('clipboard.copyFailed'), icon: 'error' })
    }
  }
  const onPick = (i: ClipItem, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || picked.length) {
      setPicked((p) => (p.includes(i.id) ? p.filter((x) => x !== i.id) : [...p, i.id]))
      return
    }
    copy(i)
  }
  const mergeCopy = () => {
    const list = items.filter((i) => picked.includes(i.id))
    const text = list.map(clipLabel).join('\n')
    if (list[0]) copy(list[0], text)
    setPicked([])
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const f of FILTERS) c[f.id] = f.id === 'all' ? items.length : items.filter((i) => matches(i, kinds.get(i.id)!, f.id)).length
    return c
  }, [items, kinds])

  return (
    <div className="glass relative flex h-full w-full flex-col overflow-hidden rounded-[14px] border border-[var(--border)]">
      {/* header */}
      <div className="flex items-center justify-between gap-2 px-3.5 pt-3">
        <div className="flex min-w-0 items-center gap-1.5 text-[var(--text-tertiary)]">
          <Clipboard size={13} strokeWidth={1.8} />
          <span className="text-[11px] font-semibold tracking-[0.3px]">{t('clipboard.title')}</span>
          <span className="rounded-full bg-[var(--fill-1)] px-1.5 text-[10px] font-semibold tabular-nums">{items.length}</span>
          <AnimatePresence>
            {paused && (
              <motion.span initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="rounded-full bg-amber-400/15 px-1.5 text-[10px] font-semibold text-amber-400">
                {t('clipboard.pausedBadge')}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="flex items-center gap-0.5">
          <Tooltip label={paused ? t('clipboard.resume') : t('clipboard.pause')} side="bottom">
            <button type="button" onClick={() => setSettings({ paused: !paused })} className="flex h-7 w-7 items-center justify-center rounded-[8px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--fill-2)] hover:text-[var(--text-primary)]">
              {paused ? <Play size={13} /> : <Pause size={13} />}
            </button>
          </Tooltip>
          <Tooltip label={confirmClear ? t('clipboard.clearConfirm') : t('clipboard.clearUnpinned')} side="bottom">
            <button
              type="button"
              onClick={() => (confirmClear ? (clearUnpinned(), setConfirmClear(false)) : setConfirmClear(true))}
              onMouseLeave={() => setConfirmClear(false)}
              className={cn('flex h-7 items-center justify-center rounded-[8px] transition-all duration-200', confirmClear ? 'gap-1 bg-[var(--danger)] px-2 text-[11px] font-semibold text-white' : 'w-7 text-[var(--text-tertiary)] hover:bg-[var(--fill-2)] hover:text-[var(--danger)]')}
            >
              <Trash2 size={13} />
              {confirmClear && t('clipboard.clear')}
            </button>
          </Tooltip>
        </div>
      </div>

      {/* search */}
      <div className="px-3 pt-2.5">
        <div className="flex h-8 items-center gap-2 rounded-[9px] bg-[var(--fill-1)] px-2.5 transition-colors focus-within:bg-[var(--fill-2)]">
          <Search size={13} className="shrink-0 text-[var(--text-tertiary)]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('clipboard.search')} className="min-w-0 flex-1 bg-transparent text-[12.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]" />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* filters */}
      <div className="flex flex-wrap gap-1 px-3 pt-2">
        {FILTERS.filter((f) => f.id === 'all' || counts[f.id]).map((f) => (
          <Tooltip key={f.id} label={t(`clipboard.filters.${f.id}`)} side="bottom">
            <button
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn('flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-semibold transition-colors duration-150', filter === f.id ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'bg-[var(--fill-1)] text-[var(--text-secondary)] hover:bg-[var(--fill-2)] hover:text-[var(--text-primary)]')}
            >
              <f.icon size={11} />
              {(filter === f.id || f.id === 'all') && <span>{t(`clipboard.filters.${f.id}`)}</span>}
              {f.id !== 'all' && <span className="tabular-nums opacity-70">{counts[f.id]}</span>}
            </button>
          </Tooltip>
        ))}
        {boards.map((b) => (
          <button key={b} type="button" onClick={() => setFilter(`b:${b}`)} className={cn('flex h-6 max-w-[120px] items-center gap-1 rounded-full px-2 text-[11px] font-semibold transition-colors duration-150', filter === `b:${b}` ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'border border-dashed border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]')}>
            <span className="truncate">{b}</span>
          </button>
        ))}
      </div>

      {/* list */}
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-2 [scrollbar-width:thin]">
        {shown.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[var(--fill-1)] text-[var(--text-tertiary)]">
              <Clipboard size={20} strokeWidth={1.6} />
            </div>
            <span className="text-[12px] text-[var(--text-tertiary)]">{items.length ? t('clipboard.noMatches') : t('clipboard.empty')}</span>
            {!items.length && (
              <span className="flex items-center gap-1 text-[11px] text-[var(--text-tertiary)] opacity-80">
                <Keyboard size={11} /> {t('clipboard.quickPasteHint')}
              </span>
            )}
          </motion.div>
        ) : (
          groups.map(({ g, list }) => (
            <div key={g}>
              <div className="px-1.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{t(`clipboard.groups.${g}`)}</div>
              <div className={cn(grid ? 'grid grid-cols-2 gap-1.5' : 'flex flex-col gap-1')}>
                <AnimatePresence initial={false}>
                  {list.map((i) => (
                    <Card
                      key={i.id}
                      item={i}
                      kind={kinds.get(i.id)!}
                      selected={picked.includes(i.id)}
                      menuOpen={menu === i.id}
                      onMenu={(open) => setMenu(open ? i.id : null)}
                      onPick={onPick}
                      onCopy={copy}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          ))
        )}
      </div>

      {/* multi-select bar */}
      <AnimatePresence>
        {picked.length > 0 && (
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.25, ease }}
            className="absolute inset-x-2 bottom-2 flex items-center gap-1 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-xl"
          >
            <span className="px-1.5 text-[12px] font-semibold text-[var(--text-primary)]">{t('clipboard.selected', { n: picked.length })}</span>
            <button type="button" onClick={mergeCopy} className="ml-auto flex h-7 items-center gap-1 rounded-[8px] bg-[var(--accent)] px-2.5 text-[11.5px] font-semibold text-[var(--on-accent)]">
              <Copy size={12} /> {t('clipboard.copyMerged')}
            </button>
            <Tooltip label={t('clipboard.remove')} side="top">
              <button type="button" onClick={() => (remove(picked), setPicked([]))} className="flex h-7 w-7 items-center justify-center rounded-[8px] text-[var(--text-secondary)] hover:bg-[var(--fill-2)] hover:text-[var(--danger)]">
                <Trash2 size={13} />
              </button>
            </Tooltip>
            <Tooltip label={t('clipboard.cancelSelect')} side="top">
              <button type="button" onClick={() => setPicked([])} className="flex h-7 w-7 items-center justify-center rounded-[8px] text-[var(--text-secondary)] hover:bg-[var(--fill-2)] hover:text-[var(--text-primary)]">
                <X size={13} />
              </button>
            </Tooltip>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── one item ──────────────────────────────────────────────────────────────
const Card = memo(function Card({
  item: i,
  kind,
  selected,
  menuOpen,
  onMenu,
  onPick,
  onCopy,
}: {
  item: ClipItem
  kind: ReturnType<typeof kindOf>
  selected: boolean
  menuOpen: boolean
  onMenu: (open: boolean) => void
  onPick: (i: ClipItem, e: React.MouseEvent) => void
  onCopy: (i: ClipItem, text?: string) => void
}) {
  const { t } = useTranslation()
  const togglePin = useClipboardStore((s) => s.togglePin)
  const icon = useAppIcon(i.source?.exe)
  const [open, setOpen] = useState(false)
  const moreRef = useRef<HTMLButtonElement>(null)
  const closeMenu = useCallback(() => onMenu(false), [onMenu])
  const text = i.text ?? ''
  const long = i.kind === 'text' && (text.length > 160 || text.split('\n').length > 3)
  const Icon = kind === 'image' ? ImageIcon : kind === 'files' ? File : KIND_ICON[kind]
  const color = kind === 'color' ? parseColor(text) : null

  const meta = [
    kind === 'image' ? `${i.image?.w}×${i.image?.h}` : kind === 'files' ? t('clipboard.nFiles', { count: i.files?.length ?? 0 }) : kind === 'link' ? domainOf(text) : i.kind === 'text' && text.length > 40 ? t('clipboard.nChars', { n: text.length }) : null,
  ].filter(Boolean)

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
      transition={{ duration: 0.25, ease }}
      onClick={(e) => onPick(i, e)}
      className={cn(
        'group relative flex cursor-pointer gap-2.5 rounded-[11px] p-2 transition-colors duration-150',
        selected ? 'bg-[var(--fill-3)] ring-1 ring-[var(--accent)]' : i.pinned ? 'bg-[var(--fill-1)] hover:bg-[var(--fill-2)]' : 'hover:bg-[var(--fill-1)]',
      )}
    >
      {/* preview */}
      {kind === 'image' && i.image ? (
        <Thumb path={i.image.path} />
      ) : color ? (
        <span className="h-10 w-10 shrink-0 rounded-[9px] shadow-[inset_0_0_0_1px_rgba(127,127,127,0.3)]" style={{ background: toHex(color) }} />
      ) : kind === 'files' ? (
        <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-[9px] bg-[var(--fill-2)] text-[var(--text-secondary)]">
          <File size={15} />
          <span className="max-w-[36px] truncate text-[8.5px] font-bold uppercase">{extOf(i.files?.[0] ?? '') || t('clipboard.folder')}</span>
        </span>
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] bg-[var(--fill-1)] text-[var(--text-secondary)]">
          <Icon size={15} />
        </span>
      )}

      {/* body */}
      <div className="min-w-0 flex-1">
        {kind === 'files' ? (
          <div className="flex flex-col">
            {(i.files ?? []).slice(0, open ? 50 : 2).map((f) => (
              <span key={f} className="truncate text-[12.5px] font-medium text-[var(--text-primary)]" title={f}>
                {fileName(f)}
              </span>
            ))}
            {(i.files?.length ?? 0) > 2 && !open && <span className="text-[11px] text-[var(--text-tertiary)]">+{(i.files?.length ?? 0) - 2}</span>}
          </div>
        ) : kind === 'image' ? (
          <span className="text-[12.5px] font-medium text-[var(--text-primary)]">{t('clipboard.image')}</span>
        ) : color ? (
          <div className="flex flex-col gap-1">
            <span className="text-[12.5px] font-semibold text-[var(--text-primary)]">{text.trim()}</span>
            <div className="flex flex-wrap gap-1">
              {[toHex(color), toRgb(color), toHsl(color)].map((v) => (
                <button key={v} type="button" onClick={(e) => (e.stopPropagation(), onCopy(i, v))} className="rounded-[6px] bg-[var(--fill-1)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-3)] hover:text-[var(--text-primary)]">
                  {v}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <span
            className={cn(
              'block whitespace-pre-wrap break-words text-[12.5px] leading-[1.4] text-[var(--text-primary)]',
              (kind === 'code' || kind === 'json' || kind === 'path') && 'font-mono text-[11.5px]',
              kind === 'link' && 'text-sky-400',
              !open && (kind === 'code' || kind === 'json' ? 'line-clamp-4' : 'line-clamp-3'),
            )}
          >
            {text}
          </span>
        )}
        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[10.5px] text-[var(--text-tertiary)]">
          {i.source && (
            <span className="flex min-w-0 items-center gap-1">
              {icon ? <img src={icon} alt="" className="h-3 w-3 shrink-0" /> : null}
              <span className="truncate">{i.source.name}</span>
            </span>
          )}
          {i.source && <span>·</span>}
          <span className="shrink-0">{timeAgo(i.createdAt, t)}</span>
          {meta.map((m) => (
            <span key={m} className="truncate">
              · {m}
            </span>
          ))}
          {(i.boards?.length ?? 0) > 0 && <span className="truncate rounded-full bg-[var(--fill-2)] px-1.5 text-[9.5px] font-semibold text-[var(--text-secondary)]">{i.boards!.join(', ')}</span>}
          {(long || (i.files?.length ?? 0) > 2) && (
            <button type="button" onClick={(e) => (e.stopPropagation(), setOpen(!open))} className="ml-auto flex shrink-0 items-center gap-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
              {open ? t('clipboard.less') : t('clipboard.more')}
              <ChevronDown size={11} className={cn('transition-transform duration-200', open && 'rotate-180')} />
            </button>
          )}
        </div>
      </div>

      {/* actions */}
      <div className={cn('absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-[9px] bg-[var(--surface)] p-0.5 shadow-md transition-opacity duration-150', menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')} onClick={(e) => e.stopPropagation()}>
        <Tooltip label={t('clipboard.copy')} side="top">
          <button type="button" onClick={() => onCopy(i)} className="flex h-6 w-6 items-center justify-center rounded-[7px] text-[var(--text-secondary)] hover:bg-[var(--fill-2)] hover:text-[var(--text-primary)]">
            <Copy size={12} />
          </button>
        </Tooltip>
        <Tooltip label={i.pinned ? t('clipboard.unpin') : t('clipboard.pin')} side="top">
          <button type="button" onClick={() => togglePin(i.id)} className={cn('flex h-6 w-6 items-center justify-center rounded-[7px] hover:bg-[var(--fill-2)]', i.pinned ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]')}>
            <Pin size={12} fill={i.pinned ? 'currentColor' : 'none'} />
          </button>
        </Tooltip>
        <Tooltip label={t('clipboard.moreActions')} side="top">
          <button ref={moreRef} type="button" onMouseDown={(e) => e.stopPropagation()} onClick={() => onMenu(!menuOpen)} className={cn('flex h-6 w-6 items-center justify-center rounded-[7px] hover:bg-[var(--fill-2)]', menuOpen ? 'bg-[var(--fill-2)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]')}>
            <MoreHorizontal size={12} />
          </button>
        </Tooltip>
      </div>
      {i.pinned && <Pin size={10} fill="currentColor" className="absolute right-2 top-2 text-[var(--text-tertiary)] transition-opacity group-hover:opacity-0" />}

      <AnimatePresence>{menuOpen && <ItemMenu item={i} kind={kind} anchor={moreRef.current} onClose={closeMenu} onCopy={onCopy} />}</AnimatePresence>
    </motion.div>
  )
})

function Thumb({ path }: { path: string }) {
  const a = useAssetSrc(path)
  return (
    <span className="h-10 w-14 shrink-0 overflow-hidden rounded-[9px] bg-[var(--fill-2)] shadow-[inset_0_0_0_1px_rgba(127,127,127,0.25)]">
      {a.src && <img src={a.src} onError={a.onError} alt="" draggable={false} className="h-full w-full object-cover" />}
    </span>
  )
}

// ── item menu: open, transforms, pinboards, delete ────────────────────────
function ItemMenu({ item: i, kind, anchor, onClose, onCopy }: { item: ClipItem; kind: ReturnType<typeof kindOf>; anchor: HTMLElement | null; onClose: () => void; onCopy: (i: ClipItem, text?: string) => void }) {
  const { t } = useTranslation()
  const boards = useClipboardStore((s) => s.boards)
  const addBoard = useClipboardStore((s) => s.addBoard)
  const toggleBoard = useClipboardStore((s) => s.toggleBoard)
  const remove = useClipboardStore((s) => s.remove)
  const [newBoard, setNewBoard] = useState('')
  const [copyAs, setCopyAs] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number; up: boolean } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const text = i.text ?? ''

  // Floats above everything (portal), next to the ⋯ button; flips upward when
  // there isn't room below, and re-measures as "Copy as" opens.
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return
    const a = anchor.getBoundingClientRect()
    const h = ref.current.offsetHeight
    const w = ref.current.offsetWidth
    const up = a.bottom + 6 + h > window.innerHeight - 8 && a.top - 6 - h > 8
    setPos({ left: Math.min(Math.max(8, a.right - w), window.innerWidth - w - 8), top: up ? a.top - 6 - h : a.bottom + 6, up })
  }, [anchor, copyAs, boards.length])

  // Close on a click elsewhere or Esc. (The ⋯ button stops its own mousedown,
  // so clicking it again toggles instead of closing-then-reopening.)
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    // the list scrolling would leave a floating menu behind
    const scroll = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc)
    window.addEventListener('scroll', scroll, true)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc)
      window.removeEventListener('scroll', scroll, true)
    }
  }, [onClose])

  const run = (fn: () => void) => () => {
    fn()
    onClose()
  }
  const quick: { icon: LucideIcon; label: string; fn: () => void; danger?: boolean }[] = [
    { icon: Copy, label: t('clipboard.copy'), fn: () => onCopy(i) },
    ...(kind === 'link' ? [{ icon: ExternalLink, label: t('clipboard.openLink'), fn: () => void openUrl(text.trim()).catch(() => {}) }] : []),
    ...(kind === 'email' ? [{ icon: Mail, label: t('clipboard.writeEmail'), fn: () => void openUrl(`mailto:${text.trim()}`).catch(() => {}) }] : []),
    ...(kind === 'files' && i.files?.[0] ? [{ icon: ExternalLink, label: t('clipboard.openFile'), fn: () => void launchApp(i.files![0]!).catch(() => {}) }] : []),
    ...(kind === 'path' || kind === 'files' || kind === 'image'
      ? [{ icon: FolderOpen, label: t('clipboard.showInFolder'), fn: () => void showInFolder(kind === 'path' ? text.trim() : kind === 'image' ? i.image!.path : i.files![0]!).catch(() => {}) }]
      : []),
    { icon: Trash2, label: t('clipboard.remove'), fn: () => remove(i.id), danger: true },
  ]

  return createPortal(
    <motion.div
      ref={ref}
      data-hit
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: pos ? 1 : 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.1 } }}
      transition={{ duration: 0.16, ease }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-[9700] w-[228px] rounded-[13px] border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.4)]"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, transformOrigin: pos?.up ? 'bottom right' : 'top right' }}
    >
      {/* main actions: one row of icons */}
      <div className="flex gap-1">
        {quick.map((q) => (
          <Tooltip key={q.label} label={q.label} side="top">
            <button
              type="button"
              onClick={run(q.fn)}
              className={cn('flex h-9 flex-1 items-center justify-center rounded-[9px] bg-[var(--fill-1)] transition-colors duration-150', q.danger ? 'text-[var(--text-secondary)] hover:bg-[var(--danger)] hover:text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--fill-3)] hover:text-[var(--text-primary)]')}
            >
              <q.icon size={15} />
            </button>
          </Tooltip>
        ))}
      </div>

      {/* copy as… (folded) */}
      {i.kind === 'text' && (
        <>
          <button type="button" onClick={() => setCopyAs(!copyAs)} className="mt-1.5 flex h-8 w-full items-center gap-2 rounded-[8px] px-2 text-left text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--fill-2)]">
            <Type size={13} className="text-[var(--text-secondary)]" />
            <span className="flex-1">{t('clipboard.copyAs')}</span>
            <ChevronDown size={13} className={cn('text-[var(--text-tertiary)] transition-transform duration-200', copyAs && 'rotate-180')} />
          </button>
          <AnimatePresence initial={false}>
            {copyAs && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease }} className="overflow-hidden">
                <div className="grid grid-cols-2 gap-1 px-0.5 pb-1 pt-0.5">
                  {TRANSFORMS.filter((x) => x !== 'json' || kind === 'json').map((x: Transform) => (
                    <button key={x} type="button" onClick={run(() => onCopy(i, transform(text, x)))} className="truncate rounded-[7px] bg-[var(--fill-1)] px-2 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-3)] hover:text-[var(--text-primary)]">
                      {t(`clipboard.transforms.${x}`)}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* pinboards as chips */}
      <div className="mt-1 border-t border-[var(--border)] px-1 pt-2">
        <div className="pb-1.5 text-[9.5px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{t('clipboard.pinboards')}</div>
        <div className="flex flex-wrap gap-1">
          {boards.map((b) => {
            const on = i.boards?.includes(b)
            return (
              <button key={b} type="button" onClick={() => toggleBoard(i.id, b)} className={cn('flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors duration-150', on ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'bg-[var(--fill-1)] text-[var(--text-secondary)] hover:bg-[var(--fill-2)] hover:text-[var(--text-primary)]')}>
                {on && <Check size={10} />}
                <span className="truncate">{b}</span>
              </button>
            )
          })}
        </div>
        <form
          className="mt-1.5 flex items-center gap-1 pb-0.5"
          onSubmit={(e) => {
            e.preventDefault()
            const n = newBoard.trim()
            if (!n) return
            addBoard(n)
            toggleBoard(i.id, n)
            setNewBoard('')
          }}
        >
          <input value={newBoard} onChange={(e) => setNewBoard(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder={t('clipboard.newBoard')} className="h-7 min-w-0 flex-1 rounded-[7px] bg-[var(--fill-1)] px-2 text-[11.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:bg-[var(--fill-2)]" />
          <button type="submit" disabled={!newBoard.trim()} className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-2)] disabled:opacity-40">
            <Plus size={13} />
          </button>
        </form>
      </div>
    </motion.div>,
    document.body,
  )
}

// ── settings (widget settings popover) ─────────────────────────────────────
function ClipSettings() {
  const { t } = useTranslation()
  const s = useClipboardStore((x) => x.settings)
  const set = useClipboardStore((x) => x.setSettings)
  const items = useClipboardStore((x) => x.items)
  const boards = useClipboardStore((x) => x.boards)
  const addBoard = useClipboardStore((x) => x.addBoard)
  const removeBoard = useClipboardStore((x) => x.removeBoard)
  const [board, setBoard] = useState('')
  const seen = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of items) if (i.source) m.set(i.source.exe.split(/[\\/]/).pop()!.toLowerCase(), i.source.name)
    return [...m.entries()].filter(([exe]) => !s.ignoreApps.includes(exe))
  }, [items, s.ignoreApps])

  return (
    <div className="flex w-[240px] flex-col gap-3">
      <FieldRow label={t('clipboard.settings.quickPaste')}>
        <Toggle checked={s.hotkey} onChange={(v) => set({ hotkey: v })} />
      </FieldRow>
      <span className="-mt-2 text-[11px] text-[var(--text-tertiary)]">{t('clipboard.settings.quickPasteHint')}</span>
      <FieldRow label={t('clipboard.settings.pause')}>
        <Toggle checked={s.paused} onChange={(v) => set({ paused: v })} />
      </FieldRow>
      <FieldRow label={t('clipboard.settings.images')}>
        <Toggle checked={s.images} onChange={(v) => set({ images: v })} />
      </FieldRow>
      <FieldRow label={t('clipboard.settings.files')}>
        <Toggle checked={s.files} onChange={(v) => set({ files: v })} />
      </FieldRow>

      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">{t('clipboard.settings.keep')}</span>
        <Segmented value={String(s.max)} options={['30', '100', '500'].map((v) => ({ value: v, label: v }))} onChange={(v) => set({ max: Number(v) })} />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">{t('clipboard.settings.forget')}</span>
        <Segmented value={String(s.ttlDays)} options={[['0', t('clipboard.settings.never')], ['1', t('clipboard.settings.days', { n: 1 })], ['7', t('clipboard.settings.days', { n: 7 })], ['30', t('clipboard.settings.days', { n: 30 })]].map(([value, label]) => ({ value: value!, label: label! }))} onChange={(v) => set({ ttlDays: Number(v) })} />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">{t('clipboard.settings.ignore')}</span>
        <span className="text-[11px] text-[var(--text-tertiary)]">{t('clipboard.settings.ignoreHint')}</span>
        <div className="flex flex-wrap gap-1">
          {s.ignoreApps.map((exe) => (
            <button key={exe} type="button" onClick={() => set({ ignoreApps: s.ignoreApps.filter((x) => x !== exe) })} className="flex items-center gap-1 rounded-full bg-[var(--fill-2)] px-2 py-0.5 text-[11px] text-[var(--text-primary)] hover:bg-[var(--fill-3)]">
              {exe} <X size={10} />
            </button>
          ))}
          {seen.map(([exe, name]) => (
            <button key={exe} type="button" onClick={() => set({ ignoreApps: [...s.ignoreApps, exe] })} className="flex items-center gap-1 rounded-full border border-dashed border-[var(--border-strong)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              <Plus size={10} /> {name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">{t('clipboard.pinboards')}</span>
        <div className="flex flex-wrap gap-1">
          {boards.map((b) => (
            <button key={b} type="button" onClick={() => removeBoard(b)} className="flex items-center gap-1 rounded-full bg-[var(--fill-2)] px-2 py-0.5 text-[11px] text-[var(--text-primary)] hover:bg-[var(--fill-3)]">
              {b} <X size={10} />
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            addBoard(board)
            setBoard('')
          }}
        >
          <TextField value={board} placeholder={t('clipboard.newBoard')} onChange={setBoard} />
        </form>
      </div>
    </div>
  )
}

export const clipboardDefinition: WidgetDefinition<ClipboardWidgetType> = {
  type: 'clipboard',
  label: 'Clipboard',
  icon: Clipboard,
  enabled: true,
  minSize: { width: 280, height: 300 },
  maxSize: { width: 640, height: 820 },
  create: (x, y) => ({
    type: 'clipboard',
    x,
    y,
    width: 330,
    height: 460,
    locked: false,
  }),
  Renderer: ClipboardRenderer,
  Settings: ClipSettings,
}
