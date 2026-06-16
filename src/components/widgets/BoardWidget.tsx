import { useRef, useState } from 'react'
import { Workflow, Plus, X } from 'lucide-react'
import type {
  BoardWidget as BoardWidgetType,
  BoardCard,
  BoardConnection,
  StickyColor,
} from '../../types/widget'
import { useCanvasStore } from '../../store/canvasStore'
import { useUncontrolledText } from '../../hooks/useUncontrolledText'
import { cn, uid } from '../../lib/utils'
import { Tooltip } from '../Tooltip'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

// Reuse the sticky-note palette so cards match the rest of the app.
const COLOR_STYLES: Record<StickyColor, { bg: string; tint: string; ink: string }> =
  {
    yellow: { bg: '#fef3a1', tint: '#fbe170', ink: '#5b4a08' },
    pink: { bg: '#ffd1dc', tint: '#ffb3c1', ink: '#6b1d34' },
    blue: { bg: '#c7e5ff', tint: '#a4d3ff', ink: '#0e3a64' },
    green: { bg: '#cdf0c7', tint: '#abe2a3', ink: '#1f4a16' },
    orange: { bg: '#ffd8b0', tint: '#ffc285', ink: '#5b3206' },
    lilac: { bg: '#e1cdf5', tint: '#cdb3ec', ink: '#3a1a5e' },
  }

const COLORS: StickyColor[] = ['yellow', 'pink', 'blue', 'green', 'orange', 'lilac']

const CARD_W = 180
const CARD_H = 120
// Padding so the SVG / cards never sit flush against the scroll edge.
const PAD = 40

interface Anchor {
  x: number
  y: number
}

// Connector geometry is computed purely from card x/y/w/h (board coordinates) —
// never getBoundingClientRect — so it survives scroll/transform without reflow.
function cardCenter(c: BoardCard): Anchor {
  return { x: c.x + c.w / 2, y: c.y + c.h / 2 }
}

// Pick the edge point on `from` that faces `to` (and vice-versa) so the line
// leaves/enters the nearest side rather than always the centre.
function edgeAnchor(from: BoardCard, to: BoardCard): Anchor {
  const fc = cardCenter(from)
  const tc = cardCenter(to)
  const dx = tc.x - fc.x
  const dy = tc.y - fc.y
  if (dx === 0 && dy === 0) return fc
  const halfW = from.w / 2
  const halfH = from.h / 2
  // Scale the direction vector so it just touches the card's bounding box.
  const scale = Math.min(
    halfW / Math.abs(dx || 1e-6),
    halfH / Math.abs(dy || 1e-6),
  )
  return { x: fc.x + dx * scale, y: fc.y + dy * scale }
}

function bezier(a: Anchor, b: Anchor): string {
  const dx = Math.abs(b.x - a.x)
  const c = Math.max(40, dx * 0.5)
  return `M ${a.x} ${a.y} C ${a.x + c} ${a.y}, ${b.x - c} ${b.y}, ${b.x} ${b.y}`
}

type DragState =
  | { kind: 'move'; cardId: string; offsetX: number; offsetY: number }
  | { kind: 'connect'; fromId: string }
  | null

function BoardRenderer({ widget }: { widget: BoardWidgetType }) {
  const updateWidget = useCanvasStore((s) => s.updateWidget)
  const liveUpdateWidget = useCanvasStore((s) => s.liveUpdateWidget)

  const cards = widget.cards ?? []
  const connections = widget.connections ?? []

  const surfaceRef = useRef<HTMLDivElement>(null)
  const drag = useRef<DragState>(null)
  // Live rubber-band endpoint (board coords) while creating a connection.
  const [linkPos, setLinkPos] = useState<Anchor | null>(null)
  const [linkFrom, setLinkFrom] = useState<string | null>(null)

  const byId = (id: string) => cards.find((c) => c.id === id)

  // Convert a client point to board-coordinate space (account for scroll).
  const toBoard = (clientX: number, clientY: number): Anchor => {
    const el = surfaceRef.current
    if (!el) return { x: clientX, y: clientY }
    const rect = el.getBoundingClientRect()
    return {
      x: clientX - rect.left + el.scrollLeft,
      y: clientY - rect.top + el.scrollTop,
    }
  }

  // Extent so the scroll area / SVG grow to hold everything plus padding.
  const extentW =
    cards.reduce((m, c) => Math.max(m, c.x + c.w), 0) + PAD * 2
  const extentH =
    cards.reduce((m, c) => Math.max(m, c.y + c.h), 0) + PAD * 2

  const commitCards = (next: BoardCard[]) =>
    updateWidget(widget.id, { cards: next })

  const addCard = () => {
    const el = surfaceRef.current
    const scrollX = el ? el.scrollLeft : 0
    const scrollY = el ? el.scrollTop : 0
    // Stagger new cards a little so they don't stack perfectly.
    const jitter = cards.length * 16
    const card: BoardCard = {
      id: uid(),
      x: scrollX + PAD + (jitter % 120),
      y: scrollY + PAD + (jitter % 120),
      w: CARD_W,
      h: CARD_H,
      text: '',
      color: 'yellow',
    }
    updateWidget(widget.id, { cards: [...cards, card] })
  }

  const deleteCard = (id: string) => {
    updateWidget(widget.id, {
      cards: cards.filter((c) => c.id !== id),
      // Cascade-remove any connection touching this card.
      connections: connections.filter((cn) => cn.from !== id && cn.to !== id),
    })
  }

  const deleteConnection = (id: string) => {
    updateWidget(widget.id, {
      connections: connections.filter((c) => c.id !== id),
    })
  }

  const setCardColor = (id: string, color: StickyColor) => {
    commitCards(cards.map((c) => (c.id === id ? { ...c, color } : c)))
  }

  // ---- Card move ----------------------------------------------------------
  const startMove = (e: React.PointerEvent, card: BoardCard) => {
    e.stopPropagation()
    const pt = toBoard(e.clientX, e.clientY)
    drag.current = {
      kind: 'move',
      cardId: card.id,
      offsetX: pt.x - card.x,
      offsetY: pt.y - card.y,
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  // ---- Connection drag ----------------------------------------------------
  const startConnect = (e: React.PointerEvent, card: BoardCard) => {
    e.stopPropagation()
    drag.current = { kind: 'connect', fromId: card.id }
    setLinkFrom(card.id)
    const pt = toBoard(e.clientX, e.clientY)
    setLinkPos(pt)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current
    if (!d) return
    const pt = toBoard(e.clientX, e.clientY)
    if (d.kind === 'move') {
      const cardId = d.cardId
      liveUpdateWidget(widget.id, {
        cards: (useCanvasStore.getState().widgets.find(
          (w) => w.id === widget.id,
        ) as BoardWidgetType).cards.map((c) =>
          c.id === cardId
            ? {
                ...c,
                x: Math.max(0, pt.x - d.offsetX),
                y: Math.max(0, pt.y - d.offsetY),
              }
            : c,
        ),
      })
    } else if (d.kind === 'connect') {
      setLinkPos(pt)
    }
  }

  const onPointerUp = (e: PointerEvent) => {
    const d = drag.current
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    drag.current = null
    if (!d) return
    if (d.kind === 'move') {
      // Commit the final position as a single undo entry.
      const finalCards = (
        useCanvasStore
          .getState()
          .widgets.find((w) => w.id === widget.id) as BoardWidgetType
      ).cards
      updateWidget(widget.id, { cards: finalCards })
    } else if (d.kind === 'connect') {
      // Find the card under the drop point.
      const pt = toBoard(e.clientX, e.clientY)
      const target = cards.find(
        (c) =>
          pt.x >= c.x &&
          pt.x <= c.x + c.w &&
          pt.y >= c.y &&
          pt.y <= c.y + c.h,
      )
      if (
        target &&
        target.id !== d.fromId &&
        !connections.some(
          (cn) =>
            (cn.from === d.fromId && cn.to === target.id) ||
            (cn.from === target.id && cn.to === d.fromId),
        )
      ) {
        const conn: BoardConnection = {
          id: uid(),
          from: d.fromId,
          to: target.id,
        }
        updateWidget(widget.id, { connections: [...connections, conn] })
      }
      setLinkFrom(null)
      setLinkPos(null)
    }
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--surface)]">
      <div
        ref={surfaceRef}
        className="layer-board-surface absolute inset-0 overflow-auto"
        style={{
          backgroundImage:
            'radial-gradient(var(--border) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      >
        <div
          className="relative"
          style={{
            width: Math.max(extentW, 400),
            height: Math.max(extentH, 300),
          }}
        >
          {/* Connector overlay. Sized to the surface; overflow:visible so
              beziers that bow outside the box still render. */}
          <svg
            className="pointer-events-none absolute left-0 top-0"
            width="100%"
            height="100%"
            style={{ overflow: 'visible' }}
          >
            <defs>
              <marker
                id={`board-arrow-${widget.id}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-tertiary)" />
              </marker>
            </defs>
            {connections.map((conn) => {
              const from = byId(conn.from)
              const to = byId(conn.to)
              if (!from || !to) return null
              const a = edgeAnchor(from, to)
              const b = edgeAnchor(to, from)
              return (
                <g key={conn.id}>
                  {/* Invisible fat hit-line so the connection is easy to click
                      to delete. */}
                  <path
                    d={bezier(a, b)}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14}
                    style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      deleteConnection(conn.id)
                    }}
                  />
                  <path
                    d={bezier(a, b)}
                    fill="none"
                    stroke="var(--text-tertiary)"
                    strokeWidth={2}
                    markerEnd={`url(#board-arrow-${widget.id})`}
                  />
                </g>
              )
            })}
            {/* Live rubber-band while creating a connection. */}
            {linkFrom &&
              linkPos &&
              (() => {
                const from = byId(linkFrom)
                if (!from) return null
                const a = edgeAnchor(from, {
                  ...from,
                  x: linkPos.x - from.w / 2,
                  y: linkPos.y - from.h / 2,
                })
                return (
                  <path
                    d={bezier(a, linkPos)}
                    fill="none"
                    stroke="var(--accent, #6aa6ff)"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                  />
                )
              })()}
          </svg>

          {cards.map((card) => (
            <Card
              key={card.id}
              card={card}
              widgetId={widget.id}
              onMoveStart={startMove}
              onConnectStart={startConnect}
              onDelete={deleteCard}
              onColor={setCardColor}
            />
          ))}
        </div>
      </div>

      {/* Floating "+" to add a card. */}
      <Tooltip label="Add card" side="top" className="absolute bottom-2 right-2 z-20">
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={addCard}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-2)] hover:text-[var(--text-primary)]"
          style={{ boxShadow: '0 2px 10px rgba(0,0,0,0.18)' }}
        >
          <Plus size={16} strokeWidth={2.2} />
        </button>
      </Tooltip>
    </div>
  )
}

function Card({
  card,
  widgetId,
  onMoveStart,
  onConnectStart,
  onDelete,
  onColor,
}: {
  card: BoardCard
  widgetId: string
  onMoveStart: (e: React.PointerEvent, card: BoardCard) => void
  onConnectStart: (e: React.PointerEvent, card: BoardCard) => void
  onDelete: (id: string) => void
  onColor: (id: string, color: StickyColor) => void
}) {
  const updateWidget = useCanvasStore((s) => s.updateWidget)
  const palette = COLOR_STYLES[card.color] ?? COLOR_STYLES.yellow
  const [colorOpen, setColorOpen] = useState(false)

  // Edit text without React re-renders, committing to the store on a debounce.
  const { ref, syncKey, onChange } = useUncontrolledText(card.text, (v) => {
    const widget = useCanvasStore
      .getState()
      .widgets.find((w) => w.id === widgetId) as BoardWidgetType | undefined
    if (!widget) return
    updateWidget(widgetId, {
      cards: widget.cards.map((c) => (c.id === card.id ? { ...c, text: v } : c)),
    })
  })

  return (
    <div
      className="group/card absolute flex flex-col overflow-visible rounded-[10px]"
      // stopPropagation so clicking a card doesn't deselect the widget /
      // start an outer drag. Note: NO .layer-drag-handle class here.
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        left: card.x,
        top: card.y,
        width: card.w,
        height: card.h,
        background: palette.bg,
        boxShadow: '0 1px 0 rgba(0,0,0,0.05), 0 6px 18px -8px rgba(0,0,0,0.3)',
      }}
    >
      {/* Grip strip — drag to move the card. */}
      <div
        className="layer-grab flex h-5 shrink-0 items-center justify-between rounded-t-[10px] px-2"
        style={{ background: palette.tint, cursor: 'grab' }}
        onPointerDown={(e) => onMoveStart(e, card)}
      >
        <span className="text-[10px] font-medium" style={{ color: palette.ink }}>
          ⠿
        </span>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/card:opacity-100">
          <button
            type="button"
            title="Change color"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setColorOpen((v) => !v)}
            className="h-3 w-3 rounded-full border border-black/20"
            style={{ background: palette.ink }}
          />
          <button
            type="button"
            title="Delete card"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onDelete(card.id)}
            className="flex h-3.5 w-3.5 items-center justify-center rounded-full hover:bg-black/10"
            style={{ color: palette.ink }}
          >
            <X size={11} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <textarea
        key={syncKey}
        ref={ref}
        defaultValue={card.text}
        onChange={onChange}
        onPointerDown={(e) => e.stopPropagation()}
        placeholder="Note…"
        spellCheck={false}
        className="min-h-0 flex-1 resize-none border-0 bg-transparent px-2.5 py-1.5 text-[13px] leading-snug outline-none"
        style={{ color: palette.ink, caretColor: palette.ink }}
      />

      {/* Connection handle — drag out to link to another card. */}
      <Tooltip label="Drag to connect" side="bottom">
        <button
          type="button"
          aria-label="Drag to connect"
          onPointerDown={(e) => onConnectStart(e, card)}
          className="absolute -right-1.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-white opacity-0 transition-opacity group-hover/card:opacity-100"
          style={{ background: palette.ink, cursor: 'crosshair' }}
        />
      </Tooltip>

      {colorOpen && (
        <div
          data-hit
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute right-0 top-6 z-30 flex gap-1 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-1.5"
          style={{ boxShadow: '0 8px 24px -12px rgba(0,0,0,0.5)' }}
        >
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                onColor(card.id, c)
                setColorOpen(false)
              }}
              className={cn(
                'h-5 w-5 rounded-full border-2 transition-transform hover:scale-110',
                card.color === c
                  ? 'border-[var(--text-primary)]'
                  : 'border-transparent',
              )}
              style={{ background: COLOR_STYLES[c].bg }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export const boardDefinition: WidgetDefinition<BoardWidgetType> = {
  type: 'board',
  label: 'Board',
  icon: Workflow,
  enabled: true,
  minSize: { width: 480, height: 360 },
  create: (x, y) => ({
    type: 'board',
    x,
    y,
    width: 720,
    height: 520,
    locked: false,
    cards: [],
    connections: [],
  }),
  Renderer: BoardRenderer,
}
