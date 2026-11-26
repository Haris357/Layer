import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Clipboard, CornerDownLeft, File, Image as ImageIcon, Pin, Search } from 'lucide-react'
import { useClipboardStore, type ClipItem } from '../store/clipboardStore'
import { clipLabel, copyClip, pasteClip, timeAgo, useAppIcon } from '../lib/clipActions'
import { parseColor, textKind, toHex } from '../lib/clipKind'
import { useAssetSrc } from '../lib/assetSrc'
import { cn } from '../lib/utils'

// Quick Paste: Win+Shift+V anywhere opens this at the mouse. Type to search,
// ↑↓ to move, Enter to paste into the app you were in (Rust sends Ctrl+V
// there, see clipboard.rs), Ctrl+1–9 to paste one directly, Esc to close.

const W = 380
const H = 440
const ease = [0.32, 0.72, 0, 1] as const
type Tab = 'all' | 'pinned' | 'text' | 'image' | 'files'
const TABS: Tab[] = ['all', 'pinned', 'text', 'image', 'files']

export function QuickPaste() {
  const { t } = useTranslation()
  const items = useClipboardStore((s) => s.items)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const [sel, setSel] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const un = listen<[number, number]>('quick-paste', async ({ payload: [px, py] }) => {
      // Cursor arrives in physical screen pixels: map into this window.
      const win = getCurrentWindow()
      const [origin, scale] = await Promise.all([win.outerPosition(), win.scaleFactor()])
      const x = (px - origin.x) / scale
      const y = (py - origin.y) / scale
      const vw = window.innerWidth
      const vh = window.innerHeight
      setPos({ x: Math.min(Math.max(8, x - 24), vw - W - 8), y: Math.min(Math.max(8, y - 16), vh - H - 8) })
      setQuery('')
      setTab('all')
      setSel(0)
      window.setTimeout(() => input.current?.focus(), 30)
    })
    return () => {
      un.then((f) => f()).catch(() => {})
    }
  }, [])

  const q = query.trim().toLowerCase()
  const shown = useMemo(
    () =>
      items
        .filter((i) => (tab === 'all' ? true : tab === 'pinned' ? i.pinned : i.kind === tab))
        .filter((i) => !q || clipLabel(i).toLowerCase().includes(q) || i.source?.name.toLowerCase().includes(q))
        .sort((a, b) => (tab === 'all' ? Number(!!b.pinned) - Number(!!a.pinned) : 0))
        .slice(0, 60),
    [items, tab, q],
  )

  useEffect(() => setSel(0), [q, tab])
  useEffect(() => {
    list.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  const close = (restore = true) => {
    setPos(null)
    if (restore) invoke('clip_cancel').catch(() => {})
  }
  const paste = (i: ClipItem | undefined) => {
    if (!i) return
    setPos(null)
    pasteClip(i).catch(() => {})
  }

  const onKey = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Escape') return close()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(shown.length - 1, s + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(0, s - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      paste(shown[sel])
    } else if (e.key === 'Tab') {
      e.preventDefault()
      setTab((x) => TABS[(TABS.indexOf(x) + (e.shiftKey ? TABS.length - 1 : 1)) % TABS.length]!)
    } else if ((e.ctrlKey || e.metaKey) && /^[1-9]$/.test(e.key)) {
      e.preventDefault()
      paste(shown[Number(e.key) - 1])
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && !window.getSelection()?.toString() && shown[sel]) {
      e.preventDefault()
      copyClip(shown[sel]!).catch(() => {})
      close()
    }
  }

  return (
    <AnimatePresence>
      {pos && (
        <div data-hit className="fixed inset-0 z-[10004]" onMouseDown={() => close()}>
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.1 } }}
            transition={{ duration: 0.18, ease }}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={onKey}
            className="absolute flex flex-col overflow-hidden rounded-[16px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
            style={{ left: pos.x, top: pos.y, width: W, height: H, backdropFilter: 'blur(24px)' }}
          >
            {/* search */}
            <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-3.5 py-3">
              <Search size={15} className="text-[var(--text-tertiary)]" />
              <input ref={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('clipboard.quick.search')} className="min-w-0 flex-1 bg-transparent text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]" />
              <span className="rounded-[6px] bg-[var(--fill-2)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-tertiary)]">Esc</span>
            </div>

            {/* tabs */}
            <div className="flex gap-1 px-2.5 pt-2">
              {TABS.map((x) => (
                <button key={x} type="button" onClick={() => setTab(x)} className={cn('h-6 rounded-full px-2.5 text-[11px] font-semibold transition-colors duration-150', tab === x ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--fill-2)] hover:text-[var(--text-primary)]')}>
                  {t(`clipboard.quick.tabs.${x}`)}
                </button>
              ))}
            </div>

            {/* items */}
            <div ref={list} className="min-h-0 flex-1 overflow-y-auto p-1.5 [scrollbar-width:thin]">
              {shown.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-[12px] text-[var(--text-tertiary)]">
                  <Clipboard size={20} strokeWidth={1.6} />
                  {items.length ? t('clipboard.noMatches') : t('clipboard.empty')}
                </div>
              ) : (
                shown.map((i, n) => <Row key={i.id} item={i} n={n} active={n === sel} onHover={() => setSel(n)} onPick={() => paste(i)} />)
              )}
            </div>

            {/* hints */}
            <div className="flex items-center gap-3 border-t border-[var(--border)] px-3.5 py-2 text-[10.5px] text-[var(--text-tertiary)]">
              <span className="flex items-center gap-1">
                <CornerDownLeft size={11} /> {t('clipboard.quick.paste')}
              </span>
              <span>Ctrl+1–9 {t('clipboard.quick.direct')}</span>
              <span>Tab {t('clipboard.quick.switch')}</span>
              <span className="ml-auto">Ctrl+C {t('clipboard.quick.copyOnly')}</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

function Row({ item: i, n, active, onHover, onPick }: { item: ClipItem; n: number; active: boolean; onHover: () => void; onPick: () => void }) {
  const { t } = useTranslation()
  const icon = useAppIcon(i.source?.exe)
  const img = useAssetSrc(i.kind === 'image' ? i.image?.path : null)
  const color = i.kind === 'text' && textKind(i.text ?? '') === 'color' ? parseColor(i.text ?? '') : null
  return (
    <button
      type="button"
      data-i={n}
      onMouseMove={onHover}
      onClick={onPick}
      className={cn('relative flex w-full items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left transition-colors duration-100', active ? 'bg-[var(--fill-2)]' : 'hover:bg-[var(--fill-1)]')}
    >
      {i.kind === 'image' ? (
        <span className="h-8 w-11 shrink-0 overflow-hidden rounded-[7px] bg-[var(--fill-2)]">{img.src ? <img src={img.src} onError={img.onError} alt="" className="h-full w-full object-cover" /> : <ImageIcon size={14} />}</span>
      ) : color ? (
        <span className="h-8 w-8 shrink-0 rounded-[7px] shadow-[inset_0_0_0_1px_rgba(127,127,127,0.3)]" style={{ background: toHex(color) }} />
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-[var(--fill-1)]">{icon ? <img src={icon} alt="" className="h-4 w-4" /> : i.kind === 'files' ? <File size={14} className="text-[var(--text-secondary)]" /> : <Clipboard size={13} className="text-[var(--text-tertiary)]" />}</span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] text-[var(--text-primary)]">{i.kind === 'image' ? `${t('clipboard.image')} · ${clipLabel(i)}` : clipLabel(i).replace(/\s+/g, ' ')}</span>
        <span className="block truncate text-[10.5px] text-[var(--text-tertiary)]">
          {i.source ? `${i.source.name} · ` : ''}
          {timeAgo(i.createdAt, t)}
        </span>
      </span>
      {i.pinned && <Pin size={11} fill="currentColor" className="shrink-0 text-[var(--text-tertiary)]" />}
      {n < 9 && <span className={cn('shrink-0 rounded-[5px] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums', active ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'bg-[var(--fill-1)] text-[var(--text-tertiary)]')}>{n + 1}</span>}
    </button>
  )
}
