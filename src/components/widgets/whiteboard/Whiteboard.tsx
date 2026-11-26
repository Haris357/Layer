import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowLeftRight,
  BringToFront,
  CaseSensitive,
  Check,
  ChevronDown,
  Circle,
  Copy,
  CopyPlus,
  Crosshair,
  Diamond,
  Download,
  Ellipsis,
  Eraser,
  Expand,
  Grid3x3,
  Group,
  Hand,
  Highlighter,
  ImagePlus,
  Lock,
  LockOpen,
  Magnet,
  Map as MapIcon,
  Maximize,
  Minimize2,
  Minus,
  MousePointer2,
  MoveUpRight,
  PaintBucket,
  PenLine,
  Plus,
  Redo2,
  SendToBack,
  Shapes,
  Spline,
  Square,
  StickyNote,
  Trash2,
  Type,
  Undo2,
  Ungroup,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import type { BoardWidget, StickyColor, WbDash, WbElement, WbFill, WbPage } from '../../../types/widget'
import { useCanvasStore } from '../../../store/canvasStore'
import { useMonitorStore } from '../../../store/monitorStore'
import { useToastStore } from '../../../store/toastStore'
import { importAsset } from '../../../lib/ipc'
import { useAssetSrc } from '../../../lib/assetSrc'
import { cn, uid } from '../../../lib/utils'
import { Tooltip } from '../../Tooltip'
import {
  STICKY,
  STICKY_COLORS,
  attachTarget,
  bounds,
  center,
  hit,
  intersects,
  isBoxy,
  isLinear,
  newPage,
  pagesOf,
  resolveLinks,
  scaleInto,
  toLocal,
  translate,
  unionBox,
  withGroups,
  type Box,
  type Pt,
} from './geom'
import { FONT, Shape, isTextual, lineHeight, strokePath, textBox } from './render'
import { copyPng, exportPng, exportSvg } from './exporter'
import { Choice, Divider, IconBtn, Label, MenuRow, PANEL, Pop, Swatch, ease } from './ui'

// ── Tools & styles ─────────────────────────────────────────────────────────
type Tool = 'select' | 'hand' | 'pen' | 'highlighter' | 'eraser' | 'rect' | 'ellipse' | 'diamond' | 'line' | 'arrow' | 'text' | 'sticky' | 'image' | 'laser'
const TOOLS: { id: Tool; icon: typeof Square; key: string }[] = [
  { id: 'select', icon: MousePointer2, key: 'V' },
  { id: 'hand', icon: Hand, key: 'H' },
  { id: 'pen', icon: PenLine, key: 'P' },
  { id: 'highlighter', icon: Highlighter, key: 'M' },
  { id: 'eraser', icon: Eraser, key: 'E' },
  { id: 'laser', icon: Crosshair, key: 'K' },
  { id: 'rect', icon: Square, key: 'R' },
  { id: 'ellipse', icon: Circle, key: 'O' },
  { id: 'diamond', icon: Diamond, key: 'D' },
  { id: 'line', icon: Minus, key: 'L' },
  { id: 'arrow', icon: MoveUpRight, key: 'A' },
  { id: 'text', icon: Type, key: 'T' },
  { id: 'sticky', icon: StickyNote, key: 'S' },
  { id: 'image', icon: ImagePlus, key: 'I' },
]
const toolOf = (id: Tool) => TOOLS.find((x) => x.id === id)!
const DRAW_GROUP: Tool[] = ['pen', 'highlighter', 'eraser', 'laser']
const SHAPE_GROUP: Tool[] = ['rect', 'ellipse', 'diamond', 'line', 'arrow']
const SHAPES = new Set<Tool>(SHAPE_GROUP)

const COLORS = ['ink', '#FF6B6B', '#FFA94D', '#FFD43B', '#69DB7C', '#38D9A9', '#4DABF7', '#9775FA', '#F783AC', '#868E96']
const WIDTHS = [1.5, 3, 6]
const SIZES = [14, 20, 28, 40]

interface Style {
  stroke: string
  fill: WbFill
  width: number
  dash: WbDash
  opacity: number
  fontSize: number
  color: StickyColor
}
const DEFAULT_STYLE: Style = { stroke: 'ink', fill: 'none', width: 3, dash: 'solid', opacity: 1, fontSize: 20, color: 'yellow' }

const ZMIN = 0.1
const ZMAX = 6
const GRID = 24
const clampZ = (z: number) => Math.min(ZMAX, Math.max(ZMIN, z))

interface View {
  x: number
  y: number
  z: number
}

type Drag =
  | { mode: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { mode: 'move'; start: Pt; base: WbElement[]; ids: Set<string>; moved: boolean }
  | { mode: 'resize'; handle: string; start: Pt; base: WbElement[]; ids: Set<string>; box: Box }
  | { mode: 'rotate'; base: WbElement[]; id: string; c: Pt }
  | { mode: 'end'; base: WbElement[]; id: string; which: 0 | 1 }
  | { mode: 'create'; start: Pt; tool: Tool }
  | { mode: 'draw' }
  | { mode: 'erase' }
  | { mode: 'marquee'; start: Pt; add: Set<string> }
  | { mode: 'laser' }
  | { mode: 'connect'; from: string; start: Pt }

type Menu = 'pages' | 'bg' | 'export' | 'clear' | 'color' | 'fill' | 'line' | 'text' | 'more' | null

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const

// ── one element, memoised so moving one doesn't redraw the rest ────────────
// Plain SVG on purpose: no per-element motion (it re-measured on every change).
const ImageShape = ({ e, ink }: { e: WbElement; ink: string }) => {
  const asset = useAssetSrc(e.src)
  return (
    <>
      <Shape e={e} ink={ink} href={asset.src} />
      {/* the hidden probe triggers the read_asset fallback if the protocol refuses */}
      {asset.src && <image href={asset.src} width={0} height={0} onError={asset.onError} />}
    </>
  )
}
const Node = memo(function Node({ e, ink, editing, fading }: { e: WbElement; ink: string; editing: boolean; fading: boolean }) {
  return (
    <g opacity={fading ? 0.2 : 1} style={{ transition: 'opacity 120ms' }}>
      {e.kind === 'image' ? <ImageShape e={e} ink={ink} /> : <Shape e={e} ink={ink} hideText={editing} />}
    </g>
  )
})

// ── the board ──────────────────────────────────────────────────────────────
export function Whiteboard({ widget }: { widget: BoardWidget }) {
  const { t } = useTranslation()
  const liveUpdate = useCanvasStore((s) => s.liveUpdateWidget)
  const toast = useToastStore((s) => s.showToast)

  // Document: pages (an old Idea board migrates into page 1).
  const [pages, setPages] = useState<WbPage[]>(() => pagesOf(widget, t('whiteboard.page', { n: 1 })))
  const [pageId, setPageId] = useState(() => widget.pageId && pages.some((p) => p.id === widget.pageId) ? widget.pageId : pages[0]!.id)
  const page = pages.find((p) => p.id === pageId) ?? pages[0]!
  const els = page.elements

  const [view, setView] = useState<View>({ x: page.panX, y: page.panY, z: page.zoom })
  const [tool, setToolRaw] = useState<Tool>('select')
  const [lastDraw, setLastDraw] = useState<Tool>('pen')
  const [lastShape, setLastShape] = useState<Tool>('rect')
  const [style, setStyle] = useState<Style>(DEFAULT_STYLE)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [draft, setDraft] = useState<WbElement | null>(null)
  const [marquee, setMarquee] = useState<Box | null>(null)
  const [erasing, setErasing] = useState<Set<string>>(new Set())
  const [laser, setLaser] = useState<{ x: number; y: number; t: number }[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [menu, setMenu] = useState<Menu>(null)
  const [minimap, setMinimap] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [space, setSpace] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [connectHover, setConnectHover] = useState<string | null>(null)
  const [size, setSize] = useState({ w: widget.width, h: widget.height })
  const bg = widget.bg ?? 'dots'
  const snap = !!widget.snap

  const root = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const past = useRef<WbElement[][]>([])
  const future = useRef<WbElement[][]>([])
  const viewRef = useRef(view)
  viewRef.current = view

  const setTool = (id: Tool) => {
    setToolRaw(id)
    setMenu(null)
    if (DRAW_GROUP.includes(id)) setLastDraw(id)
    if (SHAPE_GROUP.includes(id)) setLastShape(id)
    if (id !== 'select') setSel(new Set())
  }

  // "Auto" ink = the theme's text colour, read from the board itself (so a
  // per-widget theme counts) and re-read whenever the theme changes, so it's
  // light on a dark board and dark on a light one.
  const [ink, setInk] = useState('#fff')
  useLayoutEffect(() => {
    const read = () => {
      const el = root.current ?? document.documentElement
      setInk(getComputedStyle(el).getPropertyValue('--text-primary').trim() || '#fff')
    }
    read()
    const mo = new MutationObserver(read)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] })
    let p = root.current?.parentElement
    while (p) {
      if (p.hasAttribute('data-widget-theme')) mo.observe(p, { attributes: true, attributeFilter: ['data-widget-theme'] })
      p = p.parentElement
    }
    return () => mo.disconnect()
  }, [fullscreen])

  // Board size (for placing the floating bars).
  useEffect(() => {
    const el = root.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e!.contentRect.width, h: e!.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [fullscreen])

  // ── persistence: save the document a moment after it settles ────────────
  const pagesRef = useRef(pages)
  pagesRef.current = pages
  useEffect(() => {
    const id = window.setTimeout(() => {
      liveUpdate(widget.id, { pages: pagesRef.current.map((p) => (p.id === pageId ? { ...p, panX: view.x, panY: view.y, zoom: view.z } : p)), pageId } as Partial<BoardWidget>)
    }, 400)
    return () => window.clearTimeout(id)
  }, [pages, pageId, view, widget.id, liveUpdate])

  const setEls = useCallback(
    (next: WbElement[]) => setPages((ps) => ps.map((p) => (p.id === pageId ? { ...p, elements: next } : p))),
    [pageId],
  )
  /** Change the page's elements as one undoable step. */
  const commit = useCallback(
    (next: WbElement[], before: WbElement[] = els) => {
      past.current = [...past.current.slice(-99), before]
      future.current = []
      setEls(resolveLinks(next))
    },
    [els, setEls],
  )
  const undo = () => {
    const prev = past.current.pop()
    if (!prev) return
    future.current.push(els)
    setEls(prev)
    setSel(new Set())
  }
  const redo = () => {
    const next = future.current.pop()
    if (!next) return
    past.current.push(els)
    setEls(next)
  }

  // ── coordinates ──────────────────────────────────────────────────────────
  const toBoard = useCallback((cx: number, cy: number): Pt => {
    const r = root.current!.getBoundingClientRect()
    const v = viewRef.current
    return { x: (cx - r.left - v.x) / v.z, y: (cy - r.top - v.y) / v.z }
  }, [])
  const snapPt = (p: Pt): Pt => (snap ? { x: Math.round(p.x / GRID) * GRID, y: Math.round(p.y / GRID) * GRID } : p)

  // Smoothly animate the view (buttons, fit, page switches).
  const anim = useRef<number | null>(null)
  const animateView = useCallback((to: View) => {
    if (anim.current) cancelAnimationFrame(anim.current)
    const from = viewRef.current
    const t0 = performance.now()
    const D = 320
    const stepFn = (now: number) => {
      const k = Math.min(1, (now - t0) / D)
      const e = 1 - Math.pow(1 - k, 3)
      setView({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, z: from.z + (to.z - from.z) * e })
      anim.current = k < 1 ? requestAnimationFrame(stepFn) : null
    }
    anim.current = requestAnimationFrame(stepFn)
  }, [])
  const zoomBy = (f: number, at?: Pt) => {
    const r = root.current!.getBoundingClientRect()
    const v = viewRef.current
    const z = clampZ(v.z * f)
    const ax = at ? at.x : r.width / 2
    const ay = at ? at.y : r.height / 2
    return { x: ax - ((ax - v.x) / v.z) * z, y: ay - ((ay - v.y) / v.z) * z, z }
  }
  const fit = (list = els) => {
    const box = unionBox(list.map(bounds))
    const r = root.current?.getBoundingClientRect()
    if (!r) return
    if (!box) return animateView({ x: r.width / 2, y: r.height / 2, z: 1 })
    const pad = 80
    const z = clampZ(Math.min((r.width - pad * 2) / Math.max(box.w, 1), (r.height - pad * 2) / Math.max(box.h, 1), 2))
    animateView({ x: r.width / 2 - (box.x + box.w / 2) * z, y: r.height / 2 - (box.y + box.h / 2) * z, z })
  }

  // First open: centre an empty board, or fit an old Idea board's content.
  useEffect(() => {
    if (widget.pages?.length) return
    const id = window.setTimeout(() => fit(), 60)
    return () => window.clearTimeout(id)
    // once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Laser trail fades out on its own.
  useEffect(() => {
    if (!laser.length) return
    const id = requestAnimationFrame(() => setLaser((l) => l.filter((p) => performance.now() - p.t < 700)))
    return () => cancelAnimationFrame(id)
  }, [laser])

  // ── element helpers ─────────────────────────────────────────────────────
  const topHit = (p: Pt): WbElement | undefined => {
    const tol = 6 / viewRef.current.z
    for (let i = els.length - 1; i >= 0; i--) if (hit(els[i]!, p, tol)) return els[i]
    return undefined
  }
  const make = (kind: WbElement['kind'], p: Pt, extra: Partial<WbElement> = {}): WbElement => ({
    id: uid(),
    kind,
    x: p.x,
    y: p.y,
    w: 0,
    h: 0,
    stroke: style.stroke,
    fill: style.fill,
    width: style.width,
    dash: style.dash,
    opacity: style.opacity,
    fontSize: style.fontSize,
    ...extra,
  })
  const selected = els.filter((e) => sel.has(e.id))
  const selBox = unionBox(selected.map(bounds))

  /** Apply a style change to the selection (and remember it for new elements). */
  const applyStyle = (patch: Partial<Style> & Partial<WbElement>) => {
    setStyle((s) => ({ ...s, ...patch }))
    if (!selected.length) return
    commit(
      els.map((e) => {
        if (!sel.has(e.id)) return e
        const next = { ...e, ...patch } as WbElement
        if (patch.fontSize && e.kind === 'text') Object.assign(next, textBox(e.text ?? '', patch.fontSize))
        return next
      }),
    )
  }

  // ── live pen stroke: drawn straight into one <path>, no React render per
  // point, using every coalesced pointer sample, so ink follows the pen. ──
  const livePath = useRef<SVGPathElement>(null)
  const live = useRef<{ el: WbElement; pts: number[][]; raf: number } | null>(null)
  const clearLive = useRef(false)
  const paintLive = () => {
    const l = live.current
    const path = livePath.current
    if (!l || !path) return
    path.setAttribute('d', strokePath({ ...l.el, points: l.pts }))
  }
  useLayoutEffect(() => {
    // the committed stroke is on screen now: drop the live copy in the same frame
    if (clearLive.current && livePath.current) {
      livePath.current.setAttribute('d', '')
      clearLive.current = false
    }
  }, [els])

  // ── pointer ─────────────────────────────────────────────────────────────
  const onPointerDown = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (editing) return finishEdit()
    setMenu(null)
    root.current?.focus()
    const target = ev.target as HTMLElement
    const p = toBoard(ev.clientX, ev.clientY)
    const capture = () => (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId)

    if (ev.button === 1 || tool === 'hand' || space) {
      drag.current = { mode: 'pan', sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y }
      setDragging(true)
      return capture()
    }
    if (ev.button !== 0) return

    // selection handles
    const h = target.closest('[data-handle]')?.getAttribute('data-handle')
    if (h && selected.length) {
      if (h.startsWith('c-') && selected.length === 1) {
        // drag out a connector from this element's side dot
        const from = selected[0]!
        const b = bounds(from)
        const side = h.slice(2)
        const start = { x: side === 'w' ? b.x : side === 'e' ? b.x + b.w : b.x + b.w / 2, y: side === 'n' ? b.y : side === 's' ? b.y + b.h : b.y + b.h / 2 }
        drag.current = { mode: 'connect', from: from.id, start }
        setDraft(make('arrow', start, { points: [[start.x, start.y], [p.x, p.y]], fill: 'none', width: Math.min(style.width, 3) }))
        setDragging(true)
        return capture()
      }
      if (h === 'rotate' && selected.length === 1) {
        drag.current = { mode: 'rotate', base: els, id: selected[0]!.id, c: center(bounds(selected[0]!)) }
      } else if (h === 'p0' || h === 'p1') {
        drag.current = { mode: 'end', base: els, id: selected[0]!.id, which: h === 'p0' ? 0 : 1 }
      } else {
        drag.current = { mode: 'resize', handle: h, start: p, base: els, ids: new Set(sel), box: selected.length === 1 && selected[0]!.rotation ? bounds(selected[0]!) : selBox! }
      }
      setDragging(true)
      return capture()
    }

    if (tool === 'select') {
      const e = topHit(p)
      if (e) {
        const ids = withGroups(els, new Set([e.id]))
        let next = sel
        if (ev.shiftKey) {
          next = new Set(sel)
          const on = sel.has(e.id)
          ids.forEach((id) => (on ? next.delete(id) : next.add(id)))
        } else if (!sel.has(e.id)) next = ids
        setSel(next)
        drag.current = { mode: 'move', start: p, base: els, ids: next, moved: false }
      } else {
        if (!ev.shiftKey) setSel(new Set())
        drag.current = { mode: 'marquee', start: p, add: ev.shiftKey ? new Set(sel) : new Set() }
      }
      return capture()
    }
    if (tool === 'pen' || tool === 'highlighter') {
      const el = make('stroke', p, { highlighter: tool === 'highlighter', width: tool === 'highlighter' ? Math.max(style.width, 3) : style.width, fill: 'none' })
      live.current = { el, pts: [[p.x, p.y, ev.pressure || 0.5]], raf: 0 }
      const path = livePath.current
      if (path) {
        path.setAttribute('fill', el.stroke === 'ink' ? ink : el.stroke)
        path.setAttribute('opacity', String(el.highlighter ? 0.38 * (el.opacity ?? 1) : el.opacity ?? 1))
      }
      paintLive()
      drag.current = { mode: 'draw' }
      return capture()
    }
    if (tool === 'eraser') {
      drag.current = { mode: 'erase' }
      eraseAt(p)
      return capture()
    }
    if (tool === 'laser') {
      drag.current = { mode: 'laser' }
      setLaser([{ ...p, t: performance.now() }])
      return capture()
    }
    if (SHAPES.has(tool)) {
      const s = snapPt(p)
      drag.current = { mode: 'create', start: s, tool }
      setDraft(
        isLinear({ kind: tool } as WbElement)
          ? make(tool as WbElement['kind'], s, { points: [[s.x, s.y], [s.x, s.y]], fill: 'none' })
          : make(tool as WbElement['kind'], s),
      )
      return capture()
    }
    if (tool === 'text' || tool === 'sticky') {
      // Stop the browser's own mousedown from moving focus back to the board
      // a moment later (that blurred the new editor and closed it at once).
      ev.preventDefault()
      const onIt = topHit(p)
      if (onIt && isTextual(onIt) && !onIt.locked) {
        // clicking an existing note/text edits it instead of stacking a new one
        startEdit(onIt.id)
        return
      }
      const s = snapPt(p)
      const el =
        tool === 'text'
          ? make('text', s, { ...textBox('', style.fontSize), text: '' })
          : make('sticky', { x: s.x - 100, y: s.y - 80 }, { w: 200, h: 160, text: '', color: style.color, fontSize: 15 })
      commit([...els, el])
      startEdit(el.id)
    }
  }

  /** Select an element, switch to Select, and open its text editor. */
  const startEdit = (id: string) => {
    setToolRaw('select')
    setSel(new Set([id]))
    setMenu(null)
    // next frame: after this pointer event has fully finished
    requestAnimationFrame(() => setEditing(id))
  }

  const eraseAt = (p: Pt) => {
    const tol = 10 / viewRef.current.z
    const hits = els.filter((e) => !e.locked && hit(e, p, tol)).map((e) => e.id)
    if (hits.length) setErasing((s) => new Set([...s, ...hits]))
  }

  const onPointerMove = (ev: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    if (d.mode === 'draw') {
      const l = live.current
      if (!l) return
      const samples = ev.nativeEvent.getCoalescedEvents?.() ?? []
      for (const s of samples.length ? samples : [ev.nativeEvent]) {
        const q = toBoard(s.clientX, s.clientY)
        l.pts.push([q.x, q.y, s.pressure || 0.5])
      }
      if (!l.raf) l.raf = requestAnimationFrame(() => {
        l.raf = 0
        paintLive()
      })
      return
    }
    const p = toBoard(ev.clientX, ev.clientY)
    switch (d.mode) {
      case 'pan':
        setView((v) => ({ ...v, x: d.vx + ev.clientX - d.sx, y: d.vy + ev.clientY - d.sy }))
        break
      case 'move': {
        let dx = p.x - d.start.x
        let dy = p.y - d.start.y
        if (ev.shiftKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0)
        if (snap) {
          const b = unionBox(d.base.filter((e) => d.ids.has(e.id)).map(bounds))
          if (b) {
            dx = Math.round((b.x + dx) / GRID) * GRID - b.x
            dy = Math.round((b.y + dy) / GRID) * GRID - b.y
          }
        }
        if (!d.moved && Math.hypot(dx, dy) < 2 / viewRef.current.z) return
        if (!d.moved) setDragging(true)
        d.moved = true
        setEls(resolveLinks(d.base.map((e) => (d.ids.has(e.id) && !e.locked ? translate(e, dx, dy) : e))))
        break
      }
      case 'resize': {
        const one = d.ids.size === 1 ? d.base.find((e) => d.ids.has(e.id))! : null
        const q = one?.rotation ? toLocal(one, p) : p
        const b = d.box
        let x1 = b.x
        let y1 = b.y
        let x2 = b.x + b.w
        let y2 = b.y + b.h
        if (d.handle.includes('w')) x1 = q.x
        if (d.handle.includes('e')) x2 = q.x
        if (d.handle.includes('n')) y1 = q.y
        if (d.handle.includes('s')) y2 = q.y
        if (ev.shiftKey && b.w && b.h) {
          const r = b.w / b.h
          const w = x2 - x1
          const h = y2 - y1
          if (Math.abs(w / r) > Math.abs(h)) {
            const nh = (Math.abs(w) / r) * Math.sign(h || 1)
            d.handle.includes('n') ? (y1 = y2 - nh) : (y2 = y1 + nh)
          } else {
            const nw = Math.abs(h) * r * Math.sign(w || 1)
            d.handle.includes('w') ? (x1 = x2 - nw) : (x2 = x1 + nw)
          }
        }
        const to = { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.max(6, Math.abs(x2 - x1)), h: Math.max(6, Math.abs(y2 - y1)) }
        setEls(resolveLinks(d.base.map((e) => (d.ids.has(e.id) && !e.locked ? scaleInto(e, b, to) : e))))
        break
      }
      case 'rotate': {
        let a = (Math.atan2(p.y - d.c.y, p.x - d.c.x) * 180) / Math.PI + 90
        if (ev.shiftKey) a = Math.round(a / 15) * 15
        setEls(d.base.map((e) => (e.id === d.id ? { ...e, rotation: ((a % 360) + 360) % 360 } : e)))
        break
      }
      case 'end': {
        const s = snapPt(p)
        const target = attachTarget(d.base, s, d.id)
        setEls(
          resolveLinks(
            d.base.map((e) => {
              if (e.id !== d.id || !e.points) return e
              const pts = e.points.map((pt) => [...pt])
              pts[d.which] = [s.x, s.y]
              return { ...e, points: pts, ...(d.which === 0 ? { startId: target?.id } : { endId: target?.id }) }
            }),
          ),
        )
        break
      }
      case 'create': {
        const s = snapPt(p)
        setDraft((dr) => {
          if (!dr) return dr
          if (isLinear(dr)) {
            let ex = s.x
            let ey = s.y
            if (ev.shiftKey) {
              const ang = Math.round(Math.atan2(ey - d.start.y, ex - d.start.x) / (Math.PI / 4)) * (Math.PI / 4)
              const len = Math.hypot(ex - d.start.x, ey - d.start.y)
              ex = d.start.x + Math.cos(ang) * len
              ey = d.start.y + Math.sin(ang) * len
            }
            return { ...dr, points: [[d.start.x, d.start.y], [ex, ey]] }
          }
          let w = s.x - d.start.x
          let h = s.y - d.start.y
          if (ev.shiftKey) {
            const m = Math.max(Math.abs(w), Math.abs(h))
            w = m * Math.sign(w || 1)
            h = m * Math.sign(h || 1)
          }
          return { ...dr, x: Math.min(d.start.x, d.start.x + w), y: Math.min(d.start.y, d.start.y + h), w: Math.abs(w), h: Math.abs(h) }
        })
        break
      }
      case 'erase':
        eraseAt(p)
        break
      case 'marquee': {
        const m = { x: Math.min(d.start.x, p.x), y: Math.min(d.start.y, p.y), w: Math.abs(p.x - d.start.x), h: Math.abs(p.y - d.start.y) }
        setMarquee(m)
        const ids = new Set(d.add)
        for (const e of els) if (intersects(e, m)) ids.add(e.id)
        setSel(withGroups(els, ids))
        break
      }
      case 'laser':
        setLaser((l) => [...l, { ...p, t: performance.now() }])
        break
      case 'connect': {
        const target = attachTarget(els, p, d.from, true)
        setConnectHover(target?.id ?? null)
        // snap the loose end to the target's edge so you see where it lands
        const end = target ? resolveLinks([...els, { ...(draft ?? make('arrow', p)), id: '__c', startId: d.from, endId: target.id, points: [[d.start.x, d.start.y], [p.x, p.y]] }]).slice(-1)[0]!.points![1]! : [p.x, p.y]
        setDraft((dr) => (dr ? { ...dr, points: [[d.start.x, d.start.y], [end[0]!, end[1]!]] } : dr))
        break
      }
    }
  }

  const onPointerUp = () => {
    const d = drag.current
    drag.current = null
    setDragging(false)
    if (!d) return
    if ((d.mode === 'move' && d.moved) || d.mode === 'resize' || d.mode === 'rotate' || d.mode === 'end') {
      const now = pagesRef.current.find((p) => p.id === pageId)!.elements
      past.current = [...past.current.slice(-99), d.base]
      future.current = []
      setEls(resolveLinks(now))
    }
    if (d.mode === 'draw') {
      const l = live.current
      live.current = null
      if (l) {
        if (l.raf) cancelAnimationFrame(l.raf)
        clearLive.current = true
        commit([...els, { ...l.el, points: l.pts }])
      }
    }
    if (d.mode === 'create' && draft) {
      let el = draft
      if (isLinear(el)) {
        const [a, b] = el.points!
        if (Math.hypot(b![0]! - a![0]!, b![1]! - a![1]!) < 6) el = { ...el, points: [a!, [a![0]! + 140, a![1]!]] }
        const s = attachTarget(els, { x: el.points![0]![0]!, y: el.points![0]![1]! })
        const t2 = attachTarget(els, { x: el.points![1]![0]!, y: el.points![1]![1]! }, s?.id)
        el = { ...el, startId: s?.id, endId: t2?.id }
      } else if (el.w < 6 || el.h < 6) {
        el = { ...el, x: el.x - 70, y: el.y - 50, w: 140, h: 100 }
      }
      commit([...els, el])
      setDraft(null)
      // like Miro: a placed shape is selected, ready to style or type into
      setToolRaw('select')
      setSel(new Set([el.id]))
    }
    if (d.mode === 'connect') {
      setConnectHover(null)
      if (draft) {
        const end = draft.points![1]!
        const target = attachTarget(els, { x: end[0]!, y: end[1]! }, d.from, true)
        const a = draft.points![0]!
        if (target || Math.hypot(end[0]! - a[0]!, end[1]! - a[1]!) > 12) {
          const el = { ...draft, startId: d.from, endId: target?.id }
          commit([...els, el])
          setSel(new Set([el.id]))
        }
        setDraft(null)
      }
    }
    if (d.mode === 'erase' && erasing.size) {
      commit(els.filter((e) => !erasing.has(e.id)))
      setErasing(new Set())
    }
    if (d.mode === 'marquee') setMarquee(null)
  }

  const onDoubleClick = (ev: React.MouseEvent) => {
    if (tool !== 'select') return
    const p = toBoard(ev.clientX, ev.clientY)
    const e = topHit(p)
    if (e && isTextual(e) && !e.locked) {
      setSel(new Set([e.id]))
      setEditing(e.id)
    } else if (!e) {
      const el = make('text', p, { ...textBox('', style.fontSize), text: '' })
      commit([...els, el])
      setSel(new Set([el.id]))
      setEditing(el.id)
    }
  }

  const onWheel = (ev: React.WheelEvent) => {
    ev.stopPropagation()
    const r = root.current!.getBoundingClientRect()
    if (ev.ctrlKey || ev.metaKey) {
      setView(zoomBy(Math.exp(-ev.deltaY * 0.0018), { x: ev.clientX - r.left, y: ev.clientY - r.top }))
    } else {
      const dx = ev.shiftKey ? ev.deltaY : ev.deltaX
      const dy = ev.shiftKey ? 0 : ev.deltaY
      setView((v) => ({ ...v, x: v.x - dx, y: v.y - dy }))
    }
  }

  // ── text editing ────────────────────────────────────────────────────────
  const editEl = editing ? els.find((e) => e.id === editing) : undefined
  const [editText, setEditText] = useState('')
  useEffect(() => {
    if (editEl) setEditText(editEl.text ?? '')
    // only when a new element starts editing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])
  const finishEdit = () => {
    if (!editEl) return setEditing(null)
    const text = editText.trimEnd()
    let next: WbElement[]
    if (!text && editEl.kind === 'text') next = els.filter((e) => e.id !== editEl.id)
    else next = els.map((e) => (e.id === editEl.id ? { ...e, text, ...(e.kind === 'text' ? textBox(text, e.fontSize ?? 20) : {}) } : e))
    commit(next)
    setEditing(null)
  }

  // ── actions ─────────────────────────────────────────────────────────────
  const remove = () => {
    if (!selected.length) return
    commit(els.filter((e) => !sel.has(e.id) || e.locked))
    setSel(new Set())
    setMenu(null)
  }
  const clone = (list: WbElement[], dx: number, dy: number) => {
    const ids = new Map(list.map((e) => [e.id, uid()]))
    const groups = new Map<string, string>()
    return list.map((e) => ({
      ...translate(e, dx, dy),
      id: ids.get(e.id)!,
      locked: false,
      startId: e.startId && ids.get(e.startId),
      endId: e.endId && ids.get(e.endId),
      groupId: e.groupId && (groups.get(e.groupId) ?? (groups.set(e.groupId, uid()), groups.get(e.groupId))),
    }))
  }
  const duplicate = () => {
    if (!selected.length) return
    const copies = clone(selected, 24, 24)
    commit([...els, ...copies])
    setSel(new Set(copies.map((e) => e.id)))
  }
  const reorder = (front: boolean) => {
    const picked = els.filter((e) => sel.has(e.id))
    const rest = els.filter((e) => !sel.has(e.id))
    commit(front ? [...rest, ...picked] : [...picked, ...rest])
  }
  const group = () => {
    if (selected.length < 2) return
    const g = uid()
    commit(els.map((e) => (sel.has(e.id) ? { ...e, groupId: g } : e)))
  }
  const ungroup = () => commit(els.map((e) => (sel.has(e.id) ? { ...e, groupId: undefined } : e)))
  const allLocked = selected.length > 0 && selected.every((e) => e.locked)
  const toggleLock = () => commit(els.map((e) => (sel.has(e.id) ? { ...e, locked: !allLocked } : e)))
  const align = (how: 'l' | 'c' | 'r' | 't' | 'm' | 'b') => {
    if (!selBox || selected.length < 2) return
    commit(
      els.map((e) => {
        if (!sel.has(e.id) || e.locked) return e
        const b = bounds(e)
        const dx = how === 'l' ? selBox.x - b.x : how === 'c' ? selBox.x + selBox.w / 2 - (b.x + b.w / 2) : how === 'r' ? selBox.x + selBox.w - (b.x + b.w) : 0
        const dy = how === 't' ? selBox.y - b.y : how === 'm' ? selBox.y + selBox.h / 2 - (b.y + b.h / 2) : how === 'b' ? selBox.y + selBox.h - (b.y + b.h) : 0
        return translate(e, dx, dy)
      }),
    )
  }

  const addImages = async (paths: string[]) => {
    const r = root.current!.getBoundingClientRect()
    const c = toBoard(r.left + r.width / 2, r.top + r.height / 2)
    const added: WbElement[] = []
    for (const [i, src] of paths.entries()) {
      const dims = await new Promise<{ w: number; h: number }>((res) => {
        const img = new Image()
        img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight })
        img.onerror = () => res({ w: 320, h: 240 })
        img.src = convertFileSrc(src)
      })
      const k = Math.min(1, 420 / Math.max(dims.w, dims.h))
      const w = dims.w * k
      const h = dims.h * k
      added.push(make('image', { x: c.x - w / 2 + i * 24, y: c.y - h / 2 + i * 24 }, { w, h, src, fill: 'none' }))
    }
    if (!added.length) return
    commit([...els, ...added])
    setToolRaw('select')
    setSel(new Set(added.map((e) => e.id)))
  }
  const pickImages = async () => {
    setMenu(null)
    const picked = await open({ multiple: true, filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }] })
    if (!picked) return
    const list = Array.isArray(picked) ? picked : [picked]
    const paths = await Promise.all(list.map((p) => importAsset(p as string)))
    addImages(paths)
  }

  // Copy/paste: within and across boards via a marked clipboard payload,
  // plus pasting images (screenshots) and plain text from anywhere.
  const MARK = 'layer-whiteboard:'
  const copy = async (cut = false) => {
    if (!selected.length) return
    await navigator.clipboard.writeText(MARK + JSON.stringify(selected)).catch(() => {})
    if (cut) remove()
  }
  const onPaste = async (ev: React.ClipboardEvent) => {
    if (editing) return
    ev.preventDefault()
    const items = Array.from(ev.clipboardData.items)
    const img = items.find((i) => i.type.startsWith('image/'))
    if (img) {
      const file = img.getAsFile()
      if (!file) return
      const bytes = Array.from(new Uint8Array(await file.arrayBuffer()))
      const path = await invoke<string>('import_asset_bytes', { bytes, ext: file.type.split('/')[1] ?? 'png' })
      return addImages([path])
    }
    const text = ev.clipboardData.getData('text/plain')
    if (!text) return
    if (text.startsWith(MARK)) {
      try {
        const list = JSON.parse(text.slice(MARK.length)) as WbElement[]
        const copies = clone(list, 24, 24)
        commit([...els, ...copies])
        setSel(new Set(copies.map((e) => e.id)))
      } catch {
        /* not ours after all */
      }
      return
    }
    const r = root.current!.getBoundingClientRect()
    const c = toBoard(r.left + r.width / 2, r.top + r.height / 2)
    const el = make('text', c, { ...textBox(text, style.fontSize), text })
    commit([...els, el])
    setSel(new Set([el.id]))
  }

  // ── keyboard (only while the board has focus) ───────────────────────────
  const onKeyDown = (ev: ReactKeyboardEvent) => {
    if (editing) {
      if (ev.key === 'Escape') {
        ev.preventDefault()
        finishEdit()
      }
      ev.stopPropagation()
      return
    }
    if ((ev.target as HTMLElement).tagName === 'INPUT') return
    const ctrl = ev.ctrlKey || ev.metaKey
    const k = ev.key.toLowerCase()
    let handled = true
    if (ev.key === ' ') setSpace(true)
    else if (ctrl && k === 'z' && !ev.shiftKey) undo()
    else if (ctrl && (k === 'y' || (k === 'z' && ev.shiftKey))) redo()
    else if (ctrl && k === 'a') setSel(new Set(els.map((e) => e.id)))
    else if (ctrl && k === 'c') copy()
    else if (ctrl && k === 'x') copy(true)
    else if (ctrl && k === 'v') handled = false // let the paste event through
    else if (ctrl && k === 'd') duplicate()
    else if (ctrl && k === 'g') (ev.shiftKey ? ungroup() : group())
    else if (ctrl && k === '0') animateView({ ...zoomBy(1 / viewRef.current.z) })
    else if (ctrl && k === '1') fit()
    else if (ctrl && (k === '=' || k === '+')) animateView(zoomBy(1.25))
    else if (ctrl && k === '-') animateView(zoomBy(0.8))
    else if (k === 'delete' || k === 'backspace') remove()
    else if (k === 'escape') {
      if (menu) setMenu(null)
      else if (sel.size) setSel(new Set())
      else if (tool !== 'select') setTool('select')
      else if (fullscreen) setFullscreen(false)
    } else if (k === ']') reorder(true)
    else if (k === '[') reorder(false)
    else if (k.startsWith('arrow') && selected.length) {
      const s = ev.shiftKey ? 10 : 1
      const dx = k === 'arrowleft' ? -s : k === 'arrowright' ? s : 0
      const dy = k === 'arrowup' ? -s : k === 'arrowdown' ? s : 0
      commit(els.map((e) => (sel.has(e.id) && !e.locked ? translate(e, dx, dy) : e)))
    } else if (ev.shiftKey && k === 'l') toggleLock()
    else if (k === 'enter' && selected.length === 1 && isTextual(selected[0]!)) {
      ev.preventDefault()
      setEditing(selected[0]!.id)
    } else if (!ctrl && !ev.altKey) {
      const tl = TOOLS.find((x) => x.key.toLowerCase() === k)
      if (tl) tl.id === 'image' ? pickImages() : setTool(tl.id)
      else handled = false
    } else handled = false
    if (handled) {
      ev.preventDefault()
      // Keep Layer's own canvas shortcuts (delete widget, undo layout…) out.
      ev.stopPropagation()
    }
  }
  const onKeyUp = (ev: ReactKeyboardEvent) => {
    if (ev.key === ' ') setSpace(false)
  }

  // ── pages ───────────────────────────────────────────────────────────────
  const switchPage = (id: string) => {
    if (id === pageId) return
    setPages((ps) => ps.map((p) => (p.id === pageId ? { ...p, panX: view.x, panY: view.y, zoom: view.z } : p)))
    const next = pages.find((p) => p.id === id)!
    setPageId(id)
    setSel(new Set())
    past.current = []
    future.current = []
    setView({ x: next.panX, y: next.panY, z: next.zoom })
    setMenu(null)
  }
  const addPage = () => {
    const p = newPage(t('whiteboard.page', { n: pages.length + 1 }))
    const r = root.current?.getBoundingClientRect()
    if (r) {
      p.panX = r.width / 2
      p.panY = r.height / 2
    }
    setPages((ps) => ps.map((x) => (x.id === pageId ? { ...x, panX: view.x, panY: view.y, zoom: view.z } : x)).concat(p))
    setPageId(p.id)
    setSel(new Set())
    past.current = []
    future.current = []
    setView({ x: p.panX, y: p.panY, z: p.zoom })
    setMenu(null)
  }
  const deletePage = (id: string) => {
    if (pages.length < 2) return
    const rest = pages.filter((p) => p.id !== id)
    setPages(rest)
    if (id === pageId) {
      const next = rest[0]!
      setPageId(next.id)
      setSel(new Set())
      past.current = []
      future.current = []
      setView({ x: next.panX, y: next.panY, z: next.zoom })
    }
  }

  // ── export ──────────────────────────────────────────────────────────────
  const exportOpts = () => ({
    ink,
    background: getComputedStyle(root.current ?? document.documentElement).getPropertyValue('--wb-base').trim() || '#18181c',
  })
  const scope = selected.length ? selected : els
  const doExport = async (kind: 'png' | 'svg' | 'copy') => {
    setMenu(null)
    if (!scope.length) return
    try {
      const ok = kind === 'copy' ? await copyPng(scope, exportOpts()) : kind === 'png' ? await exportPng(scope, page.name, exportOpts()) : await exportSvg(scope, page.name, exportOpts())
      if (ok) toast({ message: t(kind === 'copy' ? 'whiteboard.copied' : 'whiteboard.exported'), icon: 'success' })
    } catch {
      toast({ message: t('whiteboard.exportFailed'), icon: 'error' })
    }
  }

  // ── derived UI state ────────────────────────────────────────────────────
  const hs = 9 / view.z // handle size in board units
  const single = selected.length === 1 ? selected[0]! : null
  const kinds = new Set(selected.map((e) => e.kind))
  const anyOf = (...k: WbElement['kind'][]) => k.some((x) => kinds.has(x))
  const first = selected[0]
  const cur = {
    stroke: first?.stroke ?? style.stroke,
    fill: first?.fill ?? style.fill,
    width: first?.width ?? style.width,
    dash: first?.dash ?? style.dash,
    opacity: first?.opacity ?? style.opacity,
    fontSize: first?.fontSize ?? style.fontSize,
    color: first?.color ?? style.color,
  }
  const toggle = (m: Menu) => setMenu((x) => (x === m ? null : m))
  const nearest = <T extends number>(list: T[], v: number) => list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a))

  const bgImage =
    bg === 'dots'
      ? `radial-gradient(var(--grid-dot) ${1.2 * Math.min(1.4, view.z)}px, transparent 0)`
      : bg === 'grid'
        ? 'linear-gradient(var(--grid-dot) 1px, transparent 1px), linear-gradient(90deg, var(--grid-dot) 1px, transparent 1px)'
        : bg === 'lines'
          ? 'linear-gradient(var(--grid-dot) 1px, transparent 1px)'
          : 'none'
  const bgSize = `${GRID * view.z}px ${GRID * view.z}px`

  const cursor = space || tool === 'hand' ? (dragging ? 'grabbing' : 'grab') : tool === 'select' ? 'default' : tool === 'text' ? 'text' : tool === 'eraser' ? 'cell' : 'crosshair'

  const work = useMonitorStore((s) => s.work)
  const fsRect = useMemo(() => {
    const cx = widget.x + widget.width / 2
    const cy = widget.y + widget.height / 2
    const m = work.find((w) => cx >= w.x && cx < w.x + w.w && cy >= w.y && cy < w.y + w.h) ?? work[0]
    return m ? { left: m.x, top: m.y, width: m.w, height: m.h } : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
  }, [work, widget.x, widget.y, widget.width, widget.height])

  // Tool options panel (beside the rail) for the active tool.
  const drawGroup = DRAW_GROUP.includes(tool)
  const shapeGroup = SHAPE_GROUP.includes(tool)
  const showToolPanel = !sel.size && (drawGroup || shapeGroup || tool === 'text' || tool === 'sticky')
  const RAIL_H = 372
  const railTop = Math.max(60, (size.h - RAIL_H) / 2)

  // Selection bar position (screen space), above the selection or below it.
  const barW = 300
  const selScreen = selBox && {
    x: view.x + (selBox.x + selBox.w / 2) * view.z,
    top: view.y + selBox.y * view.z,
    bottom: view.y + (selBox.y + selBox.h) * view.z,
  }
  const barBelow = !!selScreen && selScreen.top - 64 < 56
  const barX = selScreen ? Math.min(Math.max(selScreen.x, barW / 2 + 8), size.w - barW / 2 - 8) : 0
  const barY = selScreen ? (barBelow ? Math.min(selScreen.bottom + 18, size.h - 110) : selScreen.top - 58) : 0
  const showBar = !!selScreen && !editing && !dragging && tool === 'select'

  const colorOf = (c: string) => (c === 'ink' ? 'var(--text-primary)' : c)
  const stop = (e: React.PointerEvent) => e.stopPropagation()

  const body = (
    <div
      ref={root}
      tabIndex={0}
      className={cn('relative h-full w-full select-none overflow-hidden border border-[var(--border)] outline-none', fullscreen ? 'rounded-none' : 'rounded-[14px]')}
      style={{ backgroundColor: 'var(--wb-base)', backgroundImage: bgImage, backgroundSize: bgSize, backgroundPosition: `${view.x}px ${view.y}px`, cursor, touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      onWheel={onWheel}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onPaste={onPaste}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <svg className="absolute inset-0 h-full w-full" style={{ overflow: 'visible' }}>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.z})`}>
          {els.map((e) => (
            <Node key={e.id} e={e} ink={ink} editing={editing === e.id} fading={erasing.has(e.id)} />
          ))}
          {draft && <Shape e={draft} ink={ink} />}
          <path ref={livePath} d="" style={{ pointerEvents: 'none' }} />

          {/* selection */}
          {selBox && !editing && (single && single.rotation ? (
            <g transform={`rotate(${single.rotation} ${selBox.x + selBox.w / 2} ${selBox.y + selBox.h / 2})`}>{frame(selBox)}</g>
          ) : (
            frame(selBox)
          ))}
          {connectHover && (() => {
            const t2 = els.find((e) => e.id === connectHover)
            if (!t2) return null
            const b = bounds(t2)
            const pd = 6 / view.z
            return <rect x={b.x - pd} y={b.y - pd} width={b.w + pd * 2} height={b.h + pd * 2} rx={6 / view.z} fill="var(--fill-1)" stroke="var(--accent)" strokeWidth={2 / view.z} style={{ pointerEvents: 'none' }} />
          })()}
          {marquee && <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill="var(--fill-1)" stroke="var(--accent)" strokeWidth={1 / view.z} strokeDasharray={`${4 / view.z} ${3 / view.z}`} rx={4 / view.z} />}
          {laser.length > 1 && (
            <g style={{ pointerEvents: 'none' }}>
              {laser.slice(1).map((pt, i) => {
                const a = laser[i]!
                const age = (performance.now() - pt.t) / 700
                return <line key={i} x1={a.x} y1={a.y} x2={pt.x} y2={pt.y} stroke="#ff3b5c" strokeWidth={(5 * (1 - age)) / view.z + 1 / view.z} strokeLinecap="round" opacity={Math.max(0, 1 - age)} />
              })}
            </g>
          )}
        </g>
      </svg>

      {/* text editor over the element */}
      {editEl && (() => {
        const b = bounds(editEl)
        const fs = (editEl.fontSize ?? (editEl.kind === 'sticky' ? 15 : 20)) * view.z
        const centered = editEl.kind !== 'text'
        const ink2 = editEl.kind === 'sticky' ? STICKY[editEl.color ?? 'yellow'].ink : editEl.stroke === 'ink' ? ink : editEl.stroke
        return (
          <textarea
            autoFocus
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={finishEdit}
            onPointerDown={stop}
            placeholder={t('whiteboard.textPlaceholder')}
            className="absolute resize-none overflow-hidden bg-transparent outline-none placeholder:opacity-40"
            style={{
              left: view.x + b.x * view.z,
              top: view.y + b.y * view.z + (centered ? Math.max(0, (b.h * view.z - Math.max(1, editText.split('\n').length) * lineHeight(fs)) / 2) : 0),
              width: Math.max(80, b.w * view.z) + (editEl.kind === 'text' ? 200 : 0),
              height: centered ? b.h * view.z : Math.max(lineHeight(fs) * Math.max(1, editText.split('\n').length) + 8, b.h * view.z),
              padding: centered ? '0 12px' : 2,
              fontFamily: FONT,
              fontSize: fs,
              fontWeight: 500,
              lineHeight: `${lineHeight(fs)}px`,
              textAlign: centered ? 'center' : 'left',
              color: ink2,
              transform: editEl.rotation ? `rotate(${editEl.rotation}deg)` : undefined,
            }}
          />
        )
      })()}

      {/* empty-state hint */}
      <AnimatePresence>
        {!els.length && !draft && (
          <motion.div className="pointer-events-none absolute inset-0 flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <span className="text-[13px] text-[var(--text-tertiary)]">{t('whiteboard.empty')}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── left rail: tools ── */}
      <div className={cn('absolute left-3 z-20 flex w-[46px] flex-col items-center gap-1 rounded-[14px] p-[5px]', PANEL)} style={{ top: railTop }} onPointerDown={stop}>
        <IconBtn icon={MousePointer2} side="right" label={`${t('whiteboard.tools.select')} · V`} active={tool === 'select'} onClick={() => setTool('select')} />
        <IconBtn icon={Hand} side="right" label={`${t('whiteboard.tools.hand')} · H`} active={tool === 'hand'} onClick={() => setTool('hand')} />
        <Divider vertical={false} />
        <IconBtn icon={toolOf(lastDraw).icon} side="right" corner label={t('whiteboard.groups.draw')} active={drawGroup} onClick={() => setTool(lastDraw)} />
        <IconBtn icon={drawGroup || !shapeGroup ? Shapes : toolOf(lastShape).icon} side="right" corner label={t('whiteboard.groups.shapes')} active={shapeGroup} onClick={() => setTool(lastShape)} />
        <IconBtn icon={Type} side="right" label={`${t('whiteboard.tools.text')} · T`} active={tool === 'text'} onClick={() => setTool('text')} />
        <IconBtn icon={StickyNote} side="right" label={`${t('whiteboard.tools.sticky')} · S`} active={tool === 'sticky'} onClick={() => setTool('sticky')} />
        <IconBtn icon={ImagePlus} side="right" label={`${t('whiteboard.tools.image')} · I`} onClick={pickImages} />
        <Divider vertical={false} />
        <IconBtn icon={Undo2} side="right" label={`${t('whiteboard.undo')} · Ctrl+Z`} onClick={undo} disabled={!past.current.length} />
        <IconBtn icon={Redo2} side="right" label={`${t('whiteboard.redo')} · Ctrl+Y`} onClick={redo} disabled={!future.current.length} />
      </div>

      {/* ── tool options, beside the rail ── */}
      <AnimatePresence>
        {showToolPanel && (
          <Pop key="toolpanel" from="right" className="left-[66px] w-[92px] p-2" style={{ top: railTop }}>
            {(drawGroup || shapeGroup) && (
              <div className="grid grid-cols-2 gap-1">
                {(drawGroup ? DRAW_GROUP : SHAPE_GROUP).map((id) => (
                  <IconBtn key={id} icon={toolOf(id).icon} side="right" label={`${t(`whiteboard.tools.${id}`)} · ${toolOf(id).key}`} active={tool === id} onClick={() => setTool(id)} />
                ))}
              </div>
            )}
            {tool === 'sticky' ? (
              <>
                <Label>{t('whiteboard.style.stickyColor')}</Label>
                <div className="grid grid-cols-2 justify-items-center gap-1.5">
                  {STICKY_COLORS.map((c) => (
                    <Swatch key={c} square color={STICKY[c].bg} on={style.color === c} label={c} onClick={() => setStyle((s) => ({ ...s, color: c }))} />
                  ))}
                </div>
              </>
            ) : tool !== 'eraser' && tool !== 'laser' ? (
              <>
                <Label>{t('whiteboard.style.stroke')}</Label>
                <div className="grid grid-cols-2 justify-items-center gap-1.5">
                  {COLORS.map((c) => (
                    <Swatch key={c} color={colorOf(c)} on={style.stroke === c} label={c === 'ink' ? t('whiteboard.style.auto') : c} onClick={() => setStyle((s) => ({ ...s, stroke: c }))} />
                  ))}
                </div>
                {tool === 'text' ? (
                  <>
                    <Label>{t('whiteboard.style.fontSize')}</Label>
                    <div className="grid grid-cols-2 gap-1">
                      {SIZES.map((s, i) => (
                        <button key={s} type="button" onClick={() => setStyle((x) => ({ ...x, fontSize: s }))} className={cn('h-7 rounded-[7px] text-[11.5px] font-semibold transition-colors', style.fontSize === s ? 'bg-[var(--fill-3)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:bg-[var(--fill-2)] hover:text-[var(--text-primary)]')}>
                          {['S', 'M', 'L', 'XL'][i]}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <Label>{t('whiteboard.style.width')}</Label>
                    <div className="flex flex-col gap-1">
                      {WIDTHS.map((w, i) => (
                        <Tooltip key={w} label={t(`whiteboard.width.${['thin', 'medium', 'bold'][i]}`)} side="right">
                          <button type="button" onClick={() => setStyle((s) => ({ ...s, width: w }))} className={cn('flex h-7 items-center justify-center rounded-[7px] transition-colors', style.width === w ? 'bg-[var(--fill-3)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:bg-[var(--fill-2)] hover:text-[var(--text-primary)]')}>
                            <span className="block w-9 rounded-full bg-current" style={{ height: Math.max(1.5, w * 0.9) }} />
                          </button>
                        </Tooltip>
                      ))}
                    </div>
                    {shapeGroup && !isLinear({ kind: tool } as WbElement) && (
                      <>
                        <Label>{t('whiteboard.style.fill')}</Label>
                        <div className="flex flex-col gap-1">
                          {(['none', 'semi', 'solid'] as const).map((f) => (
                            <button key={f} type="button" onClick={() => setStyle((s) => ({ ...s, fill: f }))} className={cn('h-7 rounded-[7px] text-[11.5px] font-semibold transition-colors', style.fill === f ? 'bg-[var(--fill-3)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:bg-[var(--fill-2)] hover:text-[var(--text-primary)]')}>
                              {t(`whiteboard.fill.${f}`)}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
              </>
            ) : null}
          </Pop>
        )}
      </AnimatePresence>

      {/* ── top-left: page ── */}
      <div className="absolute left-3 top-3 z-20" onPointerDown={stop}>
        <button
          type="button"
          onClick={() => toggle('pages')}
          className={cn('flex h-9 max-w-[200px] items-center gap-2 rounded-[11px] pl-3 pr-2.5 text-[12.5px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--wb-panel)]', PANEL)}
        >
          <span className="truncate">{page.name}</span>
          <span className="rounded-[5px] bg-[var(--fill-2)] px-1.5 text-[10.5px] tabular-nums text-[var(--text-secondary)]">{pages.length}</span>
          <ChevronDown size={14} className={cn('shrink-0 text-[var(--text-tertiary)] transition-transform duration-200', menu === 'pages' && 'rotate-180')} />
        </button>
      </div>

      {/* ── top-right: board options ── */}
      <div className={cn('absolute right-3 top-3 z-20 flex items-center gap-0.5 rounded-[11px] p-0.5', PANEL)} onPointerDown={stop}>
        <IconBtn icon={Grid3x3} label={t('whiteboard.background')} onClick={() => toggle('bg')} active={menu === 'bg'} />
        <IconBtn icon={Download} label={t('whiteboard.export')} onClick={() => toggle('export')} active={menu === 'export'} />
        <IconBtn icon={Trash2} danger label={t('whiteboard.clear')} onClick={() => toggle('clear')} active={menu === 'clear'} disabled={!els.length} />
        <IconBtn icon={fullscreen ? Minimize2 : Expand} label={fullscreen ? t('whiteboard.exitFullscreen') : t('whiteboard.fullscreen')} onClick={() => setFullscreen(!fullscreen)} />
      </div>

      <AnimatePresence>
        {menu === 'pages' && (
          <Pop key="pages" from="top" className="left-3 top-[54px] w-[230px] p-1.5">
            {pages.map((p) => (
              <div key={p.id} className={cn('group flex h-8 items-center gap-1 rounded-[8px] px-2 transition-colors', p.id === pageId ? 'bg-[var(--fill-2)]' : 'hover:bg-[var(--fill-1)]')}>
                {renaming === p.id ? (
                  <input
                    autoFocus
                    defaultValue={p.name}
                    onBlur={(e) => {
                      const name = e.target.value.trim()
                      if (name) setPages((ps) => ps.map((x) => (x.id === p.id ? { ...x, name } : x)))
                      setRenaming(null)
                    }}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    }}
                    className="h-6 min-w-0 flex-1 rounded-[6px] bg-[var(--fill-1)] px-1.5 text-[12px] text-[var(--text-primary)] outline-none"
                  />
                ) : (
                  <button type="button" onClick={() => switchPage(p.id)} onDoubleClick={() => setRenaming(p.id)} className="min-w-0 flex-1 truncate text-left text-[12.5px] font-medium text-[var(--text-primary)]">
                    {p.name}
                  </button>
                )}
                {p.id === pageId && renaming !== p.id && <Check size={13} className="shrink-0 text-[var(--text-secondary)]" />}
                {pages.length > 1 && (
                  <Tooltip label={t('whiteboard.deletePage')} side="right">
                    <button type="button" onClick={() => deletePage(p.id)} className="shrink-0 text-[var(--text-tertiary)] opacity-0 transition-opacity hover:text-[var(--danger)] group-hover:opacity-100">
                      <X size={13} />
                    </button>
                  </Tooltip>
                )}
              </div>
            ))}
            <Divider vertical={false} />
            <MenuRow icon={Plus} onClick={addPage}>{t('whiteboard.addPage')}</MenuRow>
            <div className="px-2 pb-0.5 pt-1 text-[10.5px] text-[var(--text-tertiary)]">{t('whiteboard.renameHint')}</div>
          </Pop>
        )}
        {menu === 'bg' && (
          <Pop key="bg" from="top" className="right-3 top-[54px] w-[240px] p-2">
            <Label>{t('whiteboard.background')}</Label>
            <Choice value={bg} onChange={(v) => liveUpdate(widget.id, { bg: v } as Partial<BoardWidget>)} options={(['dots', 'grid', 'lines', 'none'] as const).map((v) => ({ value: v, label: t(`whiteboard.bg.${v}`), content: t(`whiteboard.bg.${v}`) }))} />
            <div className="mt-1.5">
              <MenuRow
                icon={Magnet}
                onClick={() => liveUpdate(widget.id, { snap: !snap } as Partial<BoardWidget>)}
                right={
                  <span className={cn('h-4 w-7 rounded-full p-0.5 transition-colors duration-200', snap ? 'bg-[var(--accent)]' : 'bg-[var(--fill-3)]')}>
                    <span className="block h-3 w-3 rounded-full bg-[var(--wb-panel)] transition-transform duration-200" style={{ transform: `translateX(${snap ? 12 : 0}px)` }} />
                  </span>
                }
              >
                {t('whiteboard.snap')}
              </MenuRow>
            </div>
          </Pop>
        )}
        {menu === 'clear' && (
          <Pop key="clear" from="top" className="right-3 top-[54px] w-[250px] p-3">
            <div className="text-[13px] font-semibold text-[var(--text-primary)]">{t('whiteboard.clearTitle', { name: page.name })}</div>
            <div className="mt-1 text-[11.5px] leading-snug text-[var(--text-secondary)]">{t('whiteboard.clearBody')}</div>
            <div className="mt-3 flex justify-end gap-1.5">
              <button type="button" onClick={() => setMenu(null)} className="h-8 rounded-[8px] px-3 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-2)] hover:text-[var(--text-primary)]">{t('whiteboard.cancel')}</button>
              <button type="button" onClick={() => { commit([]); setSel(new Set()); setMenu(null) }} className="h-8 rounded-[8px] bg-[var(--danger)] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90">{t('whiteboard.clearConfirm')}</button>
            </div>
          </Pop>
        )}
        {menu === 'export' && (
          <Pop key="export" from="top" className="right-3 top-[54px] w-[220px] p-1.5">
            <div className="px-2 pb-1 pt-0.5 text-[10.5px] text-[var(--text-tertiary)]">{selected.length ? t('whiteboard.exportSelection') : t('whiteboard.exportPage')}</div>
            <MenuRow icon={Download} onClick={() => doExport('png')} disabled={!scope.length}>{t('whiteboard.exportPng')}</MenuRow>
            <MenuRow icon={Download} onClick={() => doExport('svg')} disabled={!scope.length}>{t('whiteboard.exportSvg')}</MenuRow>
            <MenuRow icon={Copy} onClick={() => doExport('copy')} disabled={!scope.length}>{t('whiteboard.copyImage')}</MenuRow>
          </Pop>
        )}
      </AnimatePresence>

      {/* ── selection bar: floats with the selection ── */}
      <AnimatePresence>
        {showBar && (
          <motion.div
            key="selbar"
            className={cn('absolute z-20 flex items-center gap-0.5 rounded-[12px] p-1', PANEL)}
            style={{ left: barX, top: barY, x: '-50%' }}
            initial={{ opacity: 0, y: barBelow ? -4 : 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            transition={{ duration: 0.14, ease }}
            onPointerDown={stop}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            {(anyOf('rect', 'ellipse', 'diamond', 'line', 'arrow', 'stroke', 'text') || kinds.has('sticky')) && (
              <Tooltip label={kinds.has('sticky') && kinds.size === 1 ? t('whiteboard.style.stickyColor') : t('whiteboard.style.stroke')} side="top">
                <button type="button" onClick={() => toggle('color')} className={cn('flex h-9 w-9 items-center justify-center rounded-[9px] transition-colors', menu === 'color' ? 'bg-[var(--fill-2)]' : 'hover:bg-[var(--fill-2)]')}>
                  <span className="h-[18px] w-[18px] rounded-full" style={{ background: kinds.has('sticky') && kinds.size === 1 ? STICKY[cur.color].bg : colorOf(cur.stroke), boxShadow: 'inset 0 0 0 1px rgba(127,127,127,0.35)' }} />
                </button>
              </Tooltip>
            )}
            {anyOf('rect', 'ellipse', 'diamond') && <IconBtn icon={PaintBucket} side="top" label={t('whiteboard.style.fill')} active={menu === 'fill'} onClick={() => toggle('fill')} />}
            {anyOf('rect', 'ellipse', 'diamond', 'line', 'arrow', 'stroke') && <IconBtn icon={Spline} side="top" label={t('whiteboard.style.width')} active={menu === 'line'} onClick={() => toggle('line')} />}
            {anyOf('text', 'sticky', 'rect', 'ellipse', 'diamond') && <IconBtn icon={CaseSensitive} side="top" label={t('whiteboard.style.fontSize')} active={menu === 'text'} onClick={() => toggle('text')} />}
            <Divider />
            <IconBtn icon={CopyPlus} side="top" label={`${t('whiteboard.actions.duplicate')} · Ctrl+D`} onClick={duplicate} />
            <IconBtn icon={allLocked ? LockOpen : Lock} side="top" label={`${allLocked ? t('whiteboard.actions.unlock') : t('whiteboard.actions.lock')} · Shift+L`} onClick={toggleLock} />
            <IconBtn icon={Trash2} side="top" danger label={`${t('whiteboard.actions.delete')} · Del`} onClick={remove} />
            <IconBtn icon={Ellipsis} side="top" label={t('whiteboard.more')} active={menu === 'more'} onClick={() => toggle('more')} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* selection bar popovers (open below/above the bar) */}
      <AnimatePresence>
        {showBar && menu && ['color', 'fill', 'line', 'text', 'more'].includes(menu) && (
          <Pop
            key={menu}
            from={barBelow ? 'top' : 'bottom'}
            className="p-2"
            style={(() => {
              // numeric centring: Pop's own animation owns `transform`
              const w = menu === 'more' ? 228 : menu === 'color' ? 196 : 200
              const left = Math.min(Math.max(barX - w / 2, 8), size.w - w - 8)
              return { left, width: w, ...(barBelow ? { top: barY + 52 } : { bottom: size.h - barY + 8 }) }
            })()}
          >
            {menu === 'color' &&
              (kinds.has('sticky') && kinds.size === 1 ? (
                <div className="grid grid-cols-5 justify-items-center gap-1.5">
                  {STICKY_COLORS.map((c) => (
                    <Swatch key={c} square color={STICKY[c].bg} on={cur.color === c} label={c} onClick={() => applyStyle({ color: c })} />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-5 justify-items-center gap-1.5">
                  {COLORS.map((c) => (
                    <Swatch key={c} color={colorOf(c)} on={cur.stroke === c} label={c === 'ink' ? t('whiteboard.style.auto') : c} onClick={() => applyStyle({ stroke: c })} />
                  ))}
                </div>
              ))}
            {menu === 'fill' && (
              <Choice value={cur.fill ?? 'none'} onChange={(v) => applyStyle({ fill: v })} options={(['none', 'semi', 'solid'] as const).map((v) => ({ value: v, label: t(`whiteboard.fill.${v}`), content: t(`whiteboard.fill.${v}`) }))} />
            )}
            {menu === 'line' && (
              <>
                <Label>{t('whiteboard.style.width')}</Label>
                <Choice
                  value={nearest(WIDTHS, cur.width)}
                  onChange={(v) => applyStyle({ width: v })}
                  options={WIDTHS.map((w, i) => ({ value: w, label: t(`whiteboard.width.${['thin', 'medium', 'bold'][i]}`), content: <span className="block rounded-full bg-current" style={{ width: 18, height: Math.max(1.5, w * 0.9) }} /> }))}
                />
                {!(kinds.size === 1 && kinds.has('stroke')) && (
                  <>
                    <Label>{t('whiteboard.style.dash')}</Label>
                    <Choice
                      value={cur.dash ?? 'solid'}
                      onChange={(v) => applyStyle({ dash: v })}
                      options={(['solid', 'dashed', 'dotted'] as const).map((v) => ({
                        value: v,
                        label: t(`whiteboard.dash.${v}`),
                        content: <svg width={22} height={6}><line x1={2} y1={3} x2={20} y2={3} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeDasharray={v === 'dashed' ? '5 3' : v === 'dotted' ? '0 4' : undefined} /></svg>,
                      }))}
                    />
                  </>
                )}
                {single && isLinear(single) && (
                  <div className="mt-2 flex flex-col">
                    <MenuRow icon={Spline} onClick={() => commit(els.map((e) => (e.id === single.id ? { ...e, curved: !e.curved } : e)))} right={single.curved ? <Check size={14} /> : null}>
                      {t('whiteboard.style.curved')}
                    </MenuRow>
                    {single.kind === 'arrow' && (
                      <MenuRow icon={ArrowLeftRight} onClick={() => commit(els.map((e) => (e.id === single.id ? { ...e, arrowStart: !e.arrowStart } : e)))} right={single.arrowStart ? <Check size={14} /> : null}>
                        {t('whiteboard.style.doubleArrow')}
                      </MenuRow>
                    )}
                  </div>
                )}
              </>
            )}
            {menu === 'text' && (
              <Choice value={nearest(SIZES, cur.fontSize)} onChange={(v) => applyStyle({ fontSize: v })} options={SIZES.map((s, i) => ({ value: s, label: t(`whiteboard.size.${['s', 'm', 'l', 'xl'][i]}`), content: ['S', 'M', 'L', 'XL'][i] }))} />
            )}
            {menu === 'more' && (
              <>
                <Label>{t('whiteboard.style.opacity')}</Label>
                <input type="range" min={10} max={100} value={Math.round(cur.opacity * 100)} onChange={(e) => applyStyle({ opacity: Number(e.target.value) / 100 })} className="mb-1 w-full accent-[var(--accent)]" />
                <Divider vertical={false} />
                <MenuRow icon={BringToFront} onClick={() => reorder(true)} right={<Kbd>]</Kbd>}>{t('whiteboard.actions.forward')}</MenuRow>
                <MenuRow icon={SendToBack} onClick={() => reorder(false)} right={<Kbd>[</Kbd>}>{t('whiteboard.actions.backward')}</MenuRow>
                {selected.some((e) => e.groupId) ? (
                  <MenuRow icon={Ungroup} onClick={ungroup} right={<Kbd>Ctrl+Shift+G</Kbd>}>{t('whiteboard.actions.ungroup')}</MenuRow>
                ) : (
                  <MenuRow icon={Group} onClick={group} disabled={selected.length < 2} right={<Kbd>Ctrl+G</Kbd>}>{t('whiteboard.actions.group')}</MenuRow>
                )}
                {selected.length > 1 && (
                  <>
                    <Divider vertical={false} />
                    <div className="grid grid-cols-6 gap-0.5">
                      <IconBtn icon={AlignStartVertical} side="top" size={15} label={t('whiteboard.actions.alignLeft')} onClick={() => align('l')} className="h-8 w-8" />
                      <IconBtn icon={AlignCenterVertical} side="top" size={15} label={t('whiteboard.actions.alignCenter')} onClick={() => align('c')} className="h-8 w-8" />
                      <IconBtn icon={AlignEndVertical} side="top" size={15} label={t('whiteboard.actions.alignRight')} onClick={() => align('r')} className="h-8 w-8" />
                      <IconBtn icon={AlignStartHorizontal} side="top" size={15} label={t('whiteboard.actions.alignTop')} onClick={() => align('t')} className="h-8 w-8" />
                      <IconBtn icon={AlignCenterHorizontal} side="top" size={15} label={t('whiteboard.actions.alignMiddle')} onClick={() => align('m')} className="h-8 w-8" />
                      <IconBtn icon={AlignEndHorizontal} side="top" size={15} label={t('whiteboard.actions.alignBottom')} onClick={() => align('b')} className="h-8 w-8" />
                    </div>
                  </>
                )}
              </>
            )}
          </Pop>
        )}
      </AnimatePresence>

      {/* ── bottom-right: zoom & minimap ── */}
      <div className={cn('absolute bottom-3 right-3 z-20 flex items-center gap-0.5 rounded-[11px] p-0.5', PANEL)} onPointerDown={stop}>
        <IconBtn icon={MapIcon} side="top" label={t('whiteboard.minimap')} onClick={() => setMinimap(!minimap)} active={minimap} />
        <Divider />
        <IconBtn icon={ZoomOut} side="top" label={`${t('whiteboard.zoomOut')} · Ctrl+-`} onClick={() => animateView(zoomBy(0.8))} />
        <Tooltip label={`${t('whiteboard.zoomReset')} · Ctrl+0`} side="top">
          <button type="button" onClick={() => animateView(zoomBy(1 / view.z))} className="h-9 min-w-[50px] rounded-[9px] px-1 text-[12px] font-semibold tabular-nums text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-2)] hover:text-[var(--text-primary)]">
            {Math.round(view.z * 100)}%
          </button>
        </Tooltip>
        <IconBtn icon={ZoomIn} side="top" label={`${t('whiteboard.zoomIn')} · Ctrl+=`} onClick={() => animateView(zoomBy(1.25))} />
        <IconBtn icon={Maximize} side="top" label={`${t('whiteboard.fit')} · Ctrl+1`} onClick={() => fit()} />
      </div>

      <AnimatePresence>{minimap && <Minimap key="mm" els={els} view={view} size={size} onJump={(v) => animateView(v)} />}</AnimatePresence>
    </div>
  )

  function frame(b: Box) {
    const pad = 4 / view.z
    const x = b.x - pad
    const y = b.y - pad
    const w = b.w + pad * 2
    const h = b.h + pad * 2
    const pos: Record<string, Pt> = { nw: { x, y }, n: { x: x + w / 2, y }, ne: { x: x + w, y }, e: { x: x + w, y: y + h / 2 }, se: { x: x + w, y: y + h }, s: { x: x + w / 2, y: y + h }, sw: { x, y: y + h }, w: { x, y: y + h / 2 } }
    const cursorOf: Record<string, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' }
    const lineOnly = single && isLinear(single)
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} fill="none" stroke="var(--accent)" strokeWidth={1.2 / view.z} strokeDasharray={lineOnly ? `${4 / view.z} ${3 / view.z}` : undefined} rx={3 / view.z} />
        {lineOnly && single.points
          ? single.points.map((pt, i) => (
              <circle key={i} data-handle={`p${i}`} cx={pt[0]} cy={pt[1]} r={hs * 0.7} fill="var(--wb-panel)" stroke="var(--accent)" strokeWidth={1.5 / view.z} style={{ cursor: 'move' }} />
            ))
          : !selected.every((e) => e.locked) &&
            HANDLES.map((k) => (
              <rect key={k} data-handle={k} x={pos[k]!.x - hs / 2} y={pos[k]!.y - hs / 2} width={hs} height={hs} rx={2 / view.z} fill="var(--wb-panel)" stroke="var(--accent)" strokeWidth={1.4 / view.z} style={{ cursor: cursorOf[k] }} />
            ))}
        {single && isBoxy(single) && !single.locked && (
          <>
            <line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y - 18 / view.z} stroke="var(--accent)" strokeWidth={1.2 / view.z} />
            <circle data-handle="rotate" cx={x + w / 2} cy={y - 22 / view.z} r={hs * 0.6} fill="var(--accent)" style={{ cursor: 'grab' }} />
          </>
        )}
        {/* connector dots: drag one onto anything to link them */}
        {single && !isLinear(single) && !single.rotation &&
          (() => {
            const o = 16 / view.z
            const pts: [string, number, number][] = [
              ['e', x + w + o, y + h / 2],
              ['s', x + w / 2, y + h + o],
              ['w', x - o, y + h / 2],
              ...(isBoxy(single) ? [] : ([['n', x + w / 2, y - o]] as [string, number, number][])),
            ]
            return pts.map(([k, cx, cy]) => (
              <g key={k} data-handle={`c-${k}`} style={{ cursor: 'crosshair' }}>
                <circle cx={cx} cy={cy} r={11 / view.z} fill="transparent" />
                <circle cx={cx} cy={cy} r={5.5 / view.z} fill="var(--wb-panel)" stroke="var(--accent)" strokeWidth={1.6 / view.z} />
                <circle cx={cx} cy={cy} r={2 / view.z} fill="var(--accent)" />
              </g>
            ))
          })()}
      </g>
    )
  }

  if (fullscreen) {
    return createPortal(
      <motion.div data-hit className="fixed z-[9500]" style={fsRect} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18, ease }}>
        {body}
      </motion.div>,
      document.body,
    )
  }
  return body
}

const Kbd = ({ children }: { children: React.ReactNode }) => <span className="text-[10.5px] tabular-nums text-[var(--text-tertiary)]">{children}</span>

// ── minimap: every element as a block, the viewport as a frame; click to go ─
function Minimap({ els, view, size, onJump }: { els: WbElement[]; view: View; size: { w: number; h: number }; onJump: (v: View) => void }) {
  const W = 180
  const H = 120
  const vbox = { x: -view.x / view.z, y: -view.y / view.z, w: size.w / view.z, h: size.h / view.z }
  const box = unionBox([...els.map(bounds), vbox])!
  const k = Math.min(W / box.w, H / box.h) * 0.9
  const ox = (W - box.w * k) / 2 - box.x * k
  const oy = (H - box.h * k) / 2 - box.y * k
  return (
    <Pop from="bottom" className="bottom-[60px] right-3 overflow-hidden">
      <svg
        width={W}
        height={H}
        className="block cursor-pointer"
        onClick={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          const bx = (e.clientX - rect.left - ox) / k
          const by = (e.clientY - rect.top - oy) / k
          onJump({ x: size.w / 2 - bx * view.z, y: size.h / 2 - by * view.z, z: view.z })
        }}
      >
        {els.map((e) => {
          const b = bounds(e)
          return <rect key={e.id} x={ox + b.x * k} y={oy + b.y * k} width={Math.max(1.5, b.w * k)} height={Math.max(1.5, b.h * k)} rx={1} fill={e.kind === 'sticky' ? STICKY[e.color ?? 'yellow'].bg : 'var(--text-tertiary)'} opacity={0.75} />
        })}
        <rect x={ox + vbox.x * k} y={oy + vbox.y * k} width={vbox.w * k} height={vbox.h * k} fill="var(--fill-1)" stroke="var(--accent)" strokeWidth={1.2} rx={2} />
      </svg>
    </Pop>
  )
}
