import type { BoardWidget, StickyColor, WbElement, WbPage } from '../../../types/widget'
import { uid } from '../../../lib/utils'

// Pure geometry for the Whiteboard: bounds, hit-testing, transforms, arrow
// routing and migrating old Idea boards. Everything is in board coordinates.

export interface Box {
  x: number
  y: number
  w: number
  h: number
}
export interface Pt {
  x: number
  y: number
}

export const STICKY: Record<StickyColor, { bg: string; ink: string }> = {
  yellow: { bg: '#fef3a1', ink: '#5b4a08' },
  pink: { bg: '#ffd1dc', ink: '#6b1d34' },
  blue: { bg: '#c7e5ff', ink: '#0e3a64' },
  green: { bg: '#cdf0c7', ink: '#1f4a16' },
  orange: { bg: '#ffd8b0', ink: '#5b3206' },
  lilac: { bg: '#e1cdf5', ink: '#3a1a5e' },
}
export const STICKY_COLORS = Object.keys(STICKY) as StickyColor[]

export const isLinear = (e: WbElement) => e.kind === 'line' || e.kind === 'arrow'
export const isBoxy = (e: WbElement) => !isLinear(e) && e.kind !== 'stroke'

/** Bounding box (unrotated). */
export function bounds(e: WbElement): Box {
  if (e.points && (e.kind === 'stroke' || isLinear(e))) {
    let x1 = Infinity
    let y1 = Infinity
    let x2 = -Infinity
    let y2 = -Infinity
    for (const [x, y] of e.points) {
      if (x! < x1) x1 = x!
      if (y! < y1) y1 = y!
      if (x! > x2) x2 = x!
      if (y! > y2) y2 = y!
    }
    const pad = e.kind === 'stroke' ? e.width / 2 : 0
    return { x: x1 - pad, y: y1 - pad, w: x2 - x1 + pad * 2, h: y2 - y1 + pad * 2 }
  }
  return { x: e.x, y: e.y, w: e.w, h: e.h }
}

export function unionBox(boxes: Box[]): Box | null {
  if (!boxes.length) return null
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  for (const b of boxes) {
    x1 = Math.min(x1, b.x)
    y1 = Math.min(y1, b.y)
    x2 = Math.max(x2, b.x + b.w)
    y2 = Math.max(y2, b.y + b.h)
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

const rotateAround = (p: Pt, c: Pt, deg: number): Pt => {
  const r = (deg * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  const dx = p.x - c.x
  const dy = p.y - c.y
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos }
}
export const center = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })
/** A point in the element's own (unrotated) frame. */
export const toLocal = (e: WbElement, p: Pt): Pt => (e.rotation ? rotateAround(p, center(bounds(e)), -e.rotation) : p)
export const fromLocal = (e: WbElement, p: Pt): Pt => (e.rotation ? rotateAround(p, center(bounds(e)), e.rotation) : p)

function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l = dx * dx + dy * dy
  const t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Is the point on this element? `tol` in board px. */
export function hit(e: WbElement, p: Pt, tol: number): boolean {
  if (e.kind === 'stroke' && e.points) {
    const t = tol + e.width / 2
    for (let i = 1; i < e.points.length; i++) {
      const a = e.points[i - 1]!
      const b = e.points[i]!
      if (distToSeg(p, { x: a[0]!, y: a[1]! }, { x: b[0]!, y: b[1]! }) <= t) return true
    }
    return e.points.length === 1 && Math.hypot(p.x - e.points[0]![0]!, p.y - e.points[0]![1]!) <= t
  }
  if (isLinear(e) && e.points) {
    const [a, b] = e.points
    const A = { x: a![0]!, y: a![1]! }
    const B = { x: b![0]!, y: b![1]! }
    if (e.curved) {
      const c = curveControl(A, B)
      for (let i = 0; i < 16; i++) {
        const s = quad(A, c, B, i / 16)
        const t = quad(A, c, B, (i + 1) / 16)
        if (distToSeg(p, s, t) <= tol + e.width) return true
      }
      return false
    }
    return distToSeg(p, A, B) <= tol + e.width
  }
  const l = toLocal(e, p)
  const inside = l.x >= e.x - tol && l.x <= e.x + e.w + tol && l.y >= e.y - tol && l.y <= e.y + e.h + tol
  if (!inside) return false
  if (e.kind === 'ellipse') {
    const rx = e.w / 2 + tol
    const ry = e.h / 2 + tol
    const dx = l.x - (e.x + e.w / 2)
    const dy = l.y - (e.y + e.h / 2)
    return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1
  }
  if (e.kind === 'diamond') {
    const dx = Math.abs(l.x - (e.x + e.w / 2)) / (e.w / 2 + tol)
    const dy = Math.abs(l.y - (e.y + e.h / 2)) / (e.h / 2 + tol)
    return dx + dy <= 1
  }
  return true
}

/** Elements whose box meets the marquee (any overlap counts). */
export function intersects(e: WbElement, m: Box): boolean {
  const b = bounds(e)
  return b.x < m.x + m.w && b.x + b.w > m.x && b.y < m.y + m.h && b.y + b.h > m.y
}

// ── Arrows ─────────────────────────────────────────────────────────────────
export const curveControl = (a: Pt, b: Pt): Pt => {
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const dx = b.x - a.x
  const dy = b.y - a.y
  return { x: mx - dy * 0.22, y: my + dx * 0.22 }
}
export const quad = (a: Pt, c: Pt, b: Pt, t: number): Pt => ({
  x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
  y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
})

/** Where the line from the box centre toward `toward` leaves the box (+gap). */
function edgePoint(b: Box, toward: Pt, gap = 6): Pt {
  const c = center(b)
  const dx = toward.x - c.x
  const dy = toward.y - c.y
  if (!dx && !dy) return c
  const sx = dx ? b.w / 2 / Math.abs(dx) : Infinity
  const sy = dy ? b.h / 2 / Math.abs(dy) : Infinity
  const s = Math.min(sx, sy)
  const len = Math.hypot(dx, dy)
  return { x: c.x + dx * s + (dx / len) * gap, y: c.y + dy * s + (dy / len) * gap }
}

/** Re-route arrows/lines attached to elements so they meet their edges. */
export function resolveLinks(els: WbElement[]): WbElement[] {
  const byId = new Map(els.map((e) => [e.id, e]))
  return els.map((e) => {
    if (!isLinear(e) || !e.points || (!e.startId && !e.endId)) return e
    const s = e.startId ? byId.get(e.startId) : undefined
    const t = e.endId ? byId.get(e.endId) : undefined
    let A: Pt = { x: e.points[0]![0]!, y: e.points[0]![1]! }
    let B: Pt = { x: e.points[1]![0]!, y: e.points[1]![1]! }
    const cs = s ? center(bounds(s)) : A
    const ct = t ? center(bounds(t)) : B
    if (s) A = edgePoint(bounds(s), t ? ct : B)
    if (t) B = edgePoint(bounds(t), s ? cs : A)
    return {
      ...e,
      startId: s ? e.startId : undefined,
      endId: t ? e.endId : undefined,
      points: [
        [A.x, A.y],
        [B.x, B.y],
      ],
    }
  })
}

/** The topmost boxy element under a point (to attach an arrow end to). */
/** What a connector end lands on: anything but another line/arrow. `loose`
 * accepts anywhere inside the element's box (for drag-to-connect). */
export function attachTarget(els: WbElement[], p: Pt, skip?: string, loose = false): WbElement | undefined {
  for (let i = els.length - 1; i >= 0; i--) {
    const e = els[i]!
    if (e.id === skip || isLinear(e)) continue
    if (loose) {
      const b = bounds(e)
      if (p.x >= b.x - 8 && p.x <= b.x + b.w + 8 && p.y >= b.y - 8 && p.y <= b.y + b.h + 8) return e
    } else if (hit(e, p, 4)) return e
  }
  return undefined
}

// ── Transforms ─────────────────────────────────────────────────────────────
export function translate(e: WbElement, dx: number, dy: number): WbElement {
  return {
    ...e,
    x: e.x + dx,
    y: e.y + dy,
    points: e.points?.map((pt) => [pt[0]! + dx, pt[1]! + dy, ...pt.slice(2)]),
  }
}

/** Map an element from box `from` into box `to` (resize). */
export function scaleInto(e: WbElement, from: Box, to: Box): WbElement {
  const sx = from.w ? to.w / from.w : 1
  const sy = from.h ? to.h / from.h : 1
  const mx = (x: number) => to.x + (x - from.x) * sx
  const my = (y: number) => to.y + (y - from.y) * sy
  return {
    ...e,
    x: mx(e.x),
    y: my(e.y),
    w: Math.max(4, e.w * sx),
    h: Math.max(4, e.h * sy),
    points: e.points?.map((pt) => [mx(pt[0]!), my(pt[1]!), ...pt.slice(2)]),
    fontSize: e.kind === 'text' && e.fontSize ? Math.max(8, e.fontSize * Math.min(Math.abs(sx), Math.abs(sy)) || e.fontSize) : e.fontSize,
  }
}

/** Expand a selection to whole groups. */
export function withGroups(els: WbElement[], ids: Set<string>): Set<string> {
  const groups = new Set(els.filter((e) => ids.has(e.id) && e.groupId).map((e) => e.groupId!))
  if (!groups.size) return ids
  const out = new Set(ids)
  for (const e of els) if (e.groupId && groups.has(e.groupId)) out.add(e.id)
  return out
}

// ── Pages / migration ──────────────────────────────────────────────────────
export function newPage(name: string): WbPage {
  return { id: uid(), name, elements: [], panX: 0, panY: 0, zoom: 1 }
}

/** The pages to show; an old Idea board becomes page 1 (cards → stickies, links → arrows). */
export function pagesOf(w: BoardWidget, firstName: string): WbPage[] {
  if (w.pages && w.pages.length) return w.pages
  const page = newPage(firstName)
  page.panX = -(w.panX ?? 0)
  page.panY = -(w.panY ?? 0)
  page.elements = (w.cards ?? []).map((c) => ({
    id: c.id,
    kind: 'sticky' as const,
    x: c.x,
    y: c.y,
    w: c.w,
    h: c.h,
    text: c.text,
    color: c.color,
    stroke: 'ink',
    width: 2,
    fontSize: 15,
  }))
  for (const k of w.connections ?? []) {
    page.elements.push({
      id: k.id,
      kind: 'arrow',
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      points: [
        [0, 0],
        [0, 0],
      ],
      startId: k.from,
      endId: k.to,
      curved: true,
      stroke: 'ink',
      width: 2,
    })
  }
  page.elements = resolveLinks(page.elements)
  return [page]
}
