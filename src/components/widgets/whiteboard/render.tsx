import type { ReactNode } from 'react'
import { getStroke } from 'perfect-freehand'
import type { WbElement } from '../../../types/widget'
import { STICKY, curveControl, isLinear, type Pt } from './geom'

// Pure SVG for every element kind. Used live on the board AND to build PNG/SVG
// exports, so it never uses hooks; images get their href from the caller.

export const FONT = "Inter, 'Segoe UI', system-ui, sans-serif"

// ── text measuring (shared canvas) ─────────────────────────────────────────
let ctx: CanvasRenderingContext2D | null = null
export function measure(text: string, size: number, weight = 500): number {
  if (!ctx) ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return text.length * size * 0.55
  ctx.font = `${weight} ${size}px ${FONT}`
  return ctx.measureText(text).width
}
/** Word-wrap to a width (keeps explicit line breaks). */
export function wrap(text: string, size: number, maxW: number, weight = 500): string[] {
  const out: string[] = []
  for (const para of (text || '').split('\n')) {
    const words = para.split(' ')
    let line = ''
    for (const w of words) {
      const next = line ? `${line} ${w}` : w
      if (line && measure(next, size, weight) > maxW) {
        out.push(line)
        line = w
      } else line = next
    }
    out.push(line)
  }
  return out
}
export const lineHeight = (size: number) => size * 1.32

/** Fit a free text element's box to its content. */
export function textBox(text: string, size: number): { w: number; h: number } {
  const lines = (text || ' ').split('\n')
  const w = Math.max(24, ...lines.map((l) => measure(l || ' ', size))) + 4
  return { w, h: lines.length * lineHeight(size) + 4 }
}

// ── strokes ────────────────────────────────────────────────────────────────
function outlinePath(pts: number[][]): string {
  if (!pts.length) return ''
  const d = pts.reduce<(string | number)[]>(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length]!
      acc.push(x0!, y0!, (x0! + x1!) / 2, (y0! + y1!) / 2)
      return acc
    },
    ['M', ...pts[0]!, 'Q'],
  )
  d.push('Z')
  return d.join(' ')
}
export function strokePath(e: WbElement): string {
  const pts = e.points ?? []
  const pressured = pts.some((p) => p[2] !== undefined && p[2] !== 0.5)
  return outlinePath(
    getStroke(pts, {
      size: e.highlighter ? e.width * 3.2 : e.width * 1.6,
      thinning: e.highlighter ? 0 : 0.55,
      smoothing: 0.6,
      streamline: 0.45,
      simulatePressure: !pressured && !e.highlighter,
      last: true,
    }),
  )
}

const dashArray = (e: WbElement) =>
  e.dash === 'dashed' ? `${e.width * 4} ${e.width * 3}` : e.dash === 'dotted' ? `0 ${e.width * 2.4}` : undefined

function arrowHead(tip: Pt, from: Pt, w: number): string {
  const a = Math.atan2(tip.y - from.y, tip.x - from.x)
  const len = 10 + w * 2.6
  const s = 0.48
  const l = { x: tip.x - len * Math.cos(a - s), y: tip.y - len * Math.sin(a - s) }
  const r = { x: tip.x - len * Math.cos(a + s), y: tip.y - len * Math.sin(a + s) }
  return `M${l.x} ${l.y} L${tip.x} ${tip.y} L${r.x} ${r.y}`
}

/** Text lines inside a box, centred (shape labels, stickies) or top-left (text). */
function Lines({ lines, x, y, w, h, size, color, align }: { lines: string[]; x: number; y: number; w: number; h: number; size: number; color: string; align: 'center' | 'start' }) {
  const lh = lineHeight(size)
  const top = align === 'center' ? y + h / 2 - (lines.length * lh) / 2 + lh * 0.78 : y + lh * 0.82
  return (
    <text
      fill={color}
      fontFamily={FONT}
      fontSize={size}
      fontWeight={500}
      textAnchor={align === 'center' ? 'middle' : 'start'}
      style={{ userSelect: 'none', pointerEvents: 'none' }}
    >
      {lines.map((l, i) => (
        <tspan key={i} x={align === 'center' ? x + w / 2 : x + 2} y={top + i * lh}>
          {l || ' '}
        </tspan>
      ))}
    </text>
  )
}

/**
 * One element. `ink` is the theme's text colour (used for 'ink' strokes);
 * `href` is the image URL for image elements; `hideText` while editing it.
 */
export function Shape({ e, ink, href, hideText }: { e: WbElement; ink: string; href?: string; hideText?: boolean }): ReactNode {
  const color = e.stroke === 'ink' ? ink : e.stroke
  const opacity = e.opacity ?? 1
  const rot = e.rotation ? `rotate(${e.rotation} ${e.x + e.w / 2} ${e.y + e.h / 2})` : undefined
  const fill = e.fill === 'solid' ? color : e.fill === 'semi' ? color : 'none'
  const fillOpacity = e.fill === 'semi' ? 0.22 : 1
  const common = { stroke: color, strokeWidth: e.width, strokeDasharray: dashArray(e), strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const labelColor = e.fill === 'solid' ? '#ffffff' : color
  const label = !hideText && e.text ? (
    <Lines lines={wrap(e.text, e.fontSize ?? 16, Math.max(20, e.w - 16))} x={e.x} y={e.y} w={e.w} h={e.h} size={e.fontSize ?? 16} color={labelColor} align="center" />
  ) : null

  switch (e.kind) {
    case 'stroke':
      return <path d={strokePath(e)} fill={color} opacity={e.highlighter ? 0.38 * opacity : opacity} style={e.highlighter ? { mixBlendMode: 'multiply' } : undefined} />
    case 'rect':
      return (
        <g transform={rot} opacity={opacity}>
          <rect x={e.x} y={e.y} width={e.w} height={e.h} rx={Math.min(14, e.w / 6, e.h / 6)} fill={fill} fillOpacity={fillOpacity} {...common} />
          {label}
        </g>
      )
    case 'ellipse':
      return (
        <g transform={rot} opacity={opacity}>
          <ellipse cx={e.x + e.w / 2} cy={e.y + e.h / 2} rx={e.w / 2} ry={e.h / 2} fill={fill} fillOpacity={fillOpacity} {...common} />
          {label}
        </g>
      )
    case 'diamond': {
      const cx = e.x + e.w / 2
      const cy = e.y + e.h / 2
      return (
        <g transform={rot} opacity={opacity}>
          <path d={`M${cx} ${e.y} L${e.x + e.w} ${cy} L${cx} ${e.y + e.h} L${e.x} ${cy} Z`} fill={fill} fillOpacity={fillOpacity} {...common} />
          {label}
        </g>
      )
    }
    case 'line':
    case 'arrow': {
      const [a, b] = e.points ?? [[0, 0], [0, 0]]
      const A = { x: a![0]!, y: a![1]! }
      const B = { x: b![0]!, y: b![1]! }
      const c = curveControl(A, B)
      const d = e.curved ? `M${A.x} ${A.y} Q${c.x} ${c.y} ${B.x} ${B.y}` : `M${A.x} ${A.y} L${B.x} ${B.y}`
      return (
        <g opacity={opacity} fill="none">
          <path d={d} {...common} />
          {e.kind === 'arrow' && <path d={arrowHead(B, e.curved ? c : A, e.width)} {...common} strokeDasharray={undefined} />}
          {e.kind === 'arrow' && e.arrowStart && <path d={arrowHead(A, e.curved ? c : B, e.width)} {...common} strokeDasharray={undefined} />}
        </g>
      )
    }
    case 'text':
      return (
        <g transform={rot} opacity={opacity}>
          {!hideText && <Lines lines={(e.text || '').split('\n')} x={e.x} y={e.y} w={e.w} h={e.h} size={e.fontSize ?? 20} color={color} align="start" />}
        </g>
      )
    case 'sticky': {
      const s = STICKY[e.color ?? 'yellow']
      return (
        <g transform={rot} opacity={opacity}>
          <rect x={e.x} y={e.y + 3} width={e.w} height={e.h} rx={8} fill="rgba(0,0,0,0.18)" />
          <rect x={e.x} y={e.y} width={e.w} height={e.h} rx={8} fill={s.bg} />
          <rect x={e.x} y={e.y} width={e.w} height={10} rx={8} fill="rgba(0,0,0,0.05)" />
          {!hideText && (
            <Lines lines={wrap(e.text ?? '', e.fontSize ?? 15, e.w - 24)} x={e.x} y={e.y} w={e.w} h={e.h} size={e.fontSize ?? 15} color={s.ink} align="center" />
          )}
        </g>
      )
    }
    case 'image':
      return (
        <g transform={rot} opacity={opacity}>
          {href ? (
            <image href={href} x={e.x} y={e.y} width={e.w} height={e.h} preserveAspectRatio="xMidYMid slice" style={{ clipPath: 'inset(0 round 8px)' }} />
          ) : (
            <rect x={e.x} y={e.y} width={e.w} height={e.h} rx={8} fill="rgba(127,127,127,0.15)" />
          )}
        </g>
      )
  }
  return null
}

export const isTextual = (e: WbElement) => e.kind === 'text' || e.kind === 'sticky' || (!isLinear(e) && e.kind !== 'stroke' && e.kind !== 'image')
