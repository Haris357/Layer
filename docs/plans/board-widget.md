# Plan: "Board" connected-notes widget (Milanote-style)

A widget containing draggable note cards linked with connector lines. State lives on
the widget object → persistence is free (auto-saved by `usePersistence.ts:89-105`).

## Key findings
- Widget types: union + registry. Add `'board'` to `WidgetType` (`types/widget.ts:1-27`),
  a `BoardWidget` interface, the `Widget` union (`:288-314`), and register in
  `widgetRegistry.ts` (`:68-95` + `widgetOrder`).
- ⚠️ **MUST add `'board'` to `KNOWN_TYPES` (`canvasStore.ts:72-98`)** or `pruneUnknown`
  silently drops saved boards on reload. (`'audio'` is already missing there —
  pre-existing, but proves the hazard.)
- Internal state pattern: store on the widget object; patch via `updateWidget`
  (undo snapshot) / `liveUpdateWidget` (no snapshot — use during drags). Precedent:
  `TodoWidget.tsx:16`, `AppsWidget.tsx:386`, `StickyWidget.tsx`.
- Outer-drag conflict already solved: Rnd drags only from `.layer-drag-handle`
  (`WidgetWrapper.tsx:81`). Cards must NOT carry that class. `stopPropagation` on card
  pointerdown so it doesn't deselect via `Canvas.tsx:13-14` or start editing wrongly.
- Hit regions: widget body already `data-hit`; portaled popovers need `data-hit`
  (`NoteWidget.tsx:1055`).
- Libs present: `@dnd-kit`, `framer-motion`, `react-rnd`, `lucide`. **Do NOT add
  react-flow** (fights the Rnd/hit-region model + bundle). Use absolute-positioned
  cards + an SVG overlay for connectors + raw pointer-drag.
- Helpers: `uid()`, `cn()`, `useUncontrolledText()` (debounced card text, like Sticky).

## Data model (on the widget)
```
BoardCard { id, x, y, w, h, text, color: StickyColor }
BoardConnection { id, from, to }      // card ids
BoardWidget extends BaseWidget { type:'board', cards: BoardCard[],
                                 connections: BoardConnection[], panX?, panY? }
```
Reuse `StickyColor` + its palette (export `COLOR_STYLES` from StickyWidget or duplicate).
Cards live in **internal board coordinate space**; connectors computed from card
x/y/w/h (not getBoundingClientRect — avoids reflow/transform issues).

## Rendering (`BoardWidget.tsx`, new)
```
board-root (relative, overflow, glass)
  board-surface (transform translate(panX,panY))   // MVP: use overflow:auto, skip pan
    <svg connector-layer absolute inset-0 overflow-visible pointer-events-none>
      paths (bezier + arrowhead marker) per connection; + live rubber-band while linking
    {cards: absolutely-positioned Card divs}
  Toolbar (floating "+", like AppsWidget.tsx:447)
```
Card: textarea via `useUncontrolledText`; a grip strip to drag (no drag-handle class);
a border dot to start a connection; hover delete (cascade-removes its connections).

## Interaction
Add card; edit text (stopPropagation); move (liveUpdateWidget during, updateWidget on
release — one undo entry); connect (pointerdown on handle → rubber-band → pointerup on
target card → create connection; guard self/dupe); delete card/connection. Gate
structural edits behind `isSelected`/`mode==='edit'`.

## Size
`minSize {480,360}`, default ~720×520, maxSize omitted.

## Files
New: `BoardWidget.tsx`. Edit: `types/widget.ts`, `widgetRegistry.ts`,
`canvasStore.ts` (KNOWN_TYPES). No changes to persistence/hit-regions/WidgetWrapper/Canvas.

## Phases
1. MVP (~1–1.5d): types+registry+KNOWN_TYPES; `overflow:auto` surface; add/edit/move/
   delete cards; SVG bezier connectors w/ arrowheads; drag-to-connect; cascade delete;
   live/commit drag split.
2. Polish (~1d): delete connection by clicking path; nearest-edge anchors; pan
   transform; card resize; per-card color popover; read-only when not selected.
3. Optional: zoom, snap-to-grid, connection labels, multi-select.

## Risks
KNOWN_TYPES pruning (one-liner, destroys data if missed); connector geometry + live
redraw (fiddliest); pointer-event isolation; undo snapshot size on big boards (use
liveUpdateWidget); portaled popovers need data-hit; Rnd resize handles vs internal area.
~1.5d MVP, ~3d full. No new deps.
