import { create } from 'zustand'
import type { Mode, NewWidget, Space, Widget } from '../types/widget'
import { uid } from '../lib/utils'
import { deleteAsset, isTauri } from '../lib/ipc'
import i18n from '../lib/i18n'
import { useToastStore } from './toastStore'

function widgetAssets(widget: Widget): string[] {
  if (widget.type === 'image' || widget.type === 'video') return [widget.src]
  if (widget.type === 'gallery') return widget.sources
  return []
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

interface CanvasState {
  widgets: Widget[]
  // Main monitor's top-left on the canvas for the current positions (see
  // SpacesFile.anchor). null = not known yet (older saves).
  anchor: { x: number; y: number } | null
  // The monitors (canvas coords) the current positions were laid out for.
  screens: Rect[]
  mode: Mode
  selectedId: string | null
  hydrated: boolean
  spaces: Space[]
  activeId: string
  past: Widget[][]
  future: Widget[][]
  guides: { v: number[]; h: number[] }
  setGuides: (guides: { v: number[]; h: number[] }) => void
  addWidget: (widget: NewWidget) => string
  updateWidget: (id: string, patch: Partial<Widget>) => void
  // Like updateWidget but skips the undo snapshot — for high-frequency live
  // edits (e.g. dragging the colour picker). Commit once with updateWidget.
  liveUpdateWidget: (id: string, patch: Partial<Widget>) => void
  deleteWidget: (id: string) => void
  duplicateWidget: (id: string) => void
  toggleLock: (id: string) => void
  bringToFront: (id: string) => void
  sendToBack: (id: string) => void
  lockAll: (locked: boolean) => void
  setBackgroundAll: (background: boolean) => void
  undo: () => void
  redo: () => void
  setMode: (mode: Mode) => void
  toggleMode: () => void
  setSelected: (id: string | null) => void
  resetAll: () => void
  hydrate: (widgets: Widget[]) => void
  hydrateSpaces: (
    spaces: Space[],
    activeId: string,
    anchor?: { x: number; y: number } | null,
    screens?: Rect[],
  ) => void
  // Monitor setup changed: shift every space so widgets keep their place
  // relative to the main monitor, then bring any widget stranded on a monitor
  // that's gone back onto the main one.
  reanchor: (main: { x: number; y: number }, screens: Rect[], home: Rect) => void
  switchSpace: (id: string) => void
  cycleSpace: (dir?: number) => void
  createSpace: (name: string) => void
  renameSpace: (id: string, name: string) => void
  deleteSpace: (id: string) => void
  resetSpace: (id: string) => void
  importSpace: (name: string, widgets: Widget[]) => void
}

function syncSpaces(
  spaces: Space[],
  activeId: string,
  widgets: Widget[],
): Space[] {
  return spaces.map((t) => (t.id === activeId ? { ...t, widgets } : t))
}

function nextZIndex(widgets: Widget[]): number {
  return widgets.reduce((max, w) => Math.max(max, w.zIndex), 0) + 1
}

// Re-pack every widget's zIndex into a clean 1..N by current stacking order,
// forcing `id` to the top or bottom. Crucially this keeps all z-indices
// POSITIVE: a negative zIndex (the old "send to back" used min-1) drops a
// widget behind the canvas, so the transparent window turns click-through over
// it and it can't be selected, typed in, or clicked — it looks "stuck".
function restack(widgets: Widget[], id: string, to: 'front' | 'back'): Widget[] {
  const target = widgets.find((w) => w.id === id)
  if (!target) return widgets
  const ordered = [...widgets]
    .filter((w) => w.id !== id)
    .sort((a, b) => a.zIndex - b.zIndex)
  const seq = to === 'front' ? [...ordered, target] : [target, ...ordered]
  const z = new Map(seq.map((w, i) => [w.id, i + 1]))
  return widgets.map((w) => ({ ...w, zIndex: z.get(w.id) ?? w.zIndex }))
}

// Strip widgets whose type isn't registered anymore (e.g. saved data that
// references a widget we've since removed). Keeps the canvas from crashing
// on stale persisted state.
const KNOWN_TYPES: ReadonlySet<string> = new Set([
  'note',
  'link',
  'clock',
  'image',
  'video',
  'gallery',
  'weather',
  'stats',
  'todo',
  'countdown',
  'worldclock',
  'calendar',
  'apps',
  'search',
  'nowplaying',
  'notifications',
  'converter',
  'pomodoro',
  'sticky',
  'inbox',
  'clipboard',
  'webembed',
  'diskinfo',
  'greeting',
  'shelf',
  'audio',
  'board',
  'camera',
  'keepawake',
  'mixer',
  'quick',
  'winget',
  'yearprogress',
  'screentime',
  'pet',
  // Browser-extension-only widgets. The desktop has no renderer for these, so
  // WidgetWrapper draws nothing (its `if (!def) return null` guard) — but they
  // are listed here so a space synced from the Chrome extension keeps them in
  // the data instead of pruning them away. Tolerated-but-not-rendered, the
  // exact mirror of how the extension hides the desktop's native widgets.
  'bookmarks',
  'topsites',
  'recentlyclosed',
  'focusblocklist',
])
function pruneUnknown(widgets: Widget[]): Widget[] {
  return healZ(widgets.filter((w) => KNOWN_TYPES.has(w.type)))
}

// Self-heal saved layouts: if any widget has a non-positive zIndex (the old
// "send to back" bug wrote negatives, which made the widget click-through and
// stuck), re-pack the whole set into a clean positive 1..N by current order.
function healZ(widgets: Widget[]): Widget[] {
  if (widgets.every((w) => w.zIndex >= 1)) return widgets
  const ordered = [...widgets].sort((a, b) => a.zIndex - b.zIndex)
  const z = new Map(ordered.map((w, i) => [w.id, i + 1]))
  return widgets.map((w) => ({ ...w, zIndex: z.get(w.id) ?? w.zIndex }))
}

export const useCanvasStore = create<CanvasState>((set, get) => {
  const pushHistory = () =>
    set((s) => ({ past: [...s.past, s.widgets].slice(-60), future: [] }))

  return {
    widgets: [],
    anchor: null,
    screens: [],
    mode: isTauri() ? 'view' : 'edit',
    selectedId: null,
    hydrated: false,
    spaces: [],
    activeId: '',
    past: [],
    future: [],
    guides: { v: [], h: [] },

    setGuides: (guides) => set({ guides }),

    addWidget: (widget) => {
      pushHistory()
      const id = uid()
      set((state) => ({
        widgets: [
          ...state.widgets,
          { ...widget, id, zIndex: nextZIndex(state.widgets) } as Widget,
        ],
        selectedId: id,
      }))
      return id
    },

    updateWidget: (id, patch) => {
      pushHistory()
      // Moving a widget by hand means "it lives here now": forget any parked
      // spot so reconnecting a monitor won't pull it back.
      const moved = 'x' in patch || 'y' in patch
      set((state) => ({
        widgets: state.widgets.map((w) =>
          w.id === id ? ({ ...w, ...patch, ...(moved ? { parked: undefined } : {}) } as Widget) : w,
        ),
      }))
    },

    liveUpdateWidget: (id, patch) => {
      set((state) => ({
        widgets: state.widgets.map((w) =>
          w.id === id ? ({ ...w, ...patch } as Widget) : w,
        ),
      }))
    },

    deleteWidget: (id) => {
      const state = get()
      const target = state.widgets.find((w) => w.id === id)
      if (!target) return
      const index = state.widgets.findIndex((w) => w.id === id)
      pushHistory()
      set((s) => ({
        widgets: s.widgets.filter((w) => w.id !== id),
        selectedId: s.selectedId === id ? null : s.selectedId,
      }))

      // Offer a one-tap undo, and hold off on cleaning up assets until the
      // window passes so an undo can fully restore image/video widgets.
      let undone = false
      useToastStore.getState().showToast({
        message: i18n.t('toasts.widgetDeleted'),
        icon: 'undo',
        duration: 6000,
        actions: [
          {
            label: 'Undo',
            primary: true,
            onClick: () => {
              undone = true
              set((s) => {
                if (s.widgets.some((w) => w.id === target.id)) return {}
                const widgets = [...s.widgets]
                widgets.splice(Math.min(index, widgets.length), 0, target)
                return { widgets, selectedId: target.id }
              })
            },
          },
        ],
      })

      setTimeout(() => {
        if (undone) return
        const stillUsed = new Set(get().widgets.flatMap((w) => widgetAssets(w)))
        widgetAssets(target).forEach((src) => {
          if (src && !stillUsed.has(src)) deleteAsset(src).catch(() => {})
        })
      }, 6500)
    },

    duplicateWidget: (id) => {
      const original = get().widgets.find((w) => w.id === id)
      if (!original) return
      pushHistory()
      const newId = uid()
      set((state) => ({
        widgets: [
          ...state.widgets,
          {
            ...original,
            id: newId,
            x: original.x + 24,
            y: original.y + 24,
            zIndex: nextZIndex(state.widgets),
          } as Widget,
        ],
        selectedId: newId,
      }))
    },

    toggleLock: (id) => {
      pushHistory()
      set((state) => ({
        widgets: state.widgets.map((w) =>
          w.id === id ? { ...w, locked: !w.locked } : w,
        ),
      }))
    },

    bringToFront: (id) => {
      pushHistory()
      set((state) => ({ widgets: restack(state.widgets, id, 'front') }))
    },

    sendToBack: (id) => {
      pushHistory()
      set((state) => ({ widgets: restack(state.widgets, id, 'back') }))
    },

    lockAll: (locked) => {
      pushHistory()
      set((state) => ({
        widgets: state.widgets.map((w) => ({ ...w, locked })),
        selectedId: locked ? null : state.selectedId,
      }))
      useToastStore.getState().showToast({
        message: locked
          ? i18n.t('toasts.allLocked')
          : i18n.t('toasts.allUnlocked'),
        icon: 'lock',
      })
    },

    setBackgroundAll: (background) => {
      pushHistory()
      set((state) => ({
        widgets: state.widgets.map((w) =>
          w.type === 'note' ? w : { ...w, background },
        ),
      }))
    },

    undo: () => {
      set((s) => {
        const prev = s.past[s.past.length - 1]
        if (!prev) return {}
        return {
          widgets: prev,
          past: s.past.slice(0, -1),
          future: [s.widgets, ...s.future].slice(0, 60),
          selectedId: null,
        }
      })
    },

    redo: () => {
      set((s) => {
        const next = s.future[0]
        if (!next) return {}
        return {
          widgets: next,
          future: s.future.slice(1),
          past: [...s.past, s.widgets].slice(-60),
          selectedId: null,
        }
      })
    },

    setMode: (mode) =>
      set({ mode, selectedId: mode === 'view' ? null : get().selectedId }),

    toggleMode: () => {
      const mode = get().mode === 'edit' ? 'view' : 'edit'
      set({ mode, selectedId: mode === 'view' ? null : get().selectedId })
    },

    setSelected: (selectedId) => set({ selectedId }),

    resetAll: () => {
      pushHistory()
      set({ widgets: [], selectedId: null })
    },

    hydrate: (widgets) =>
      set({ widgets: pruneUnknown(widgets), hydrated: true }),

    reanchor: (main, screens, home) => {
      set((state) => {
        const dx = state.anchor ? main.x - state.anchor.x : 0
        const dy = state.anchor ? main.y - state.anchor.y : 0
        // Monitors are identified relative to the main one, so the key
        // survives the canvas origin moving.
        const keyOf = (m: Rect) =>
          `${Math.round(m.x - main.x)},${Math.round(m.y - main.y)},${Math.round(m.w)},${Math.round(m.h)}`
        const present = new Map(screens.map((m) => [keyOf(m), m]))
        // The previous setup, moved into today's coordinates.
        const before = state.screens.map((m) => ({ ...m, x: m.x + dx, y: m.y + dy }))
        const at = (list: Rect[], x: number, y: number) =>
          list.find((m) => x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h)
        let changed = false
        const fix = (ws: Widget[]) =>
          ws.map((w) => {
            // A parked widget whose monitor is back goes home.
            if (w.parked && present.has(w.parked.screen)) {
              changed = true
              const { parked, ...rest } = w
              return { ...rest, x: main.x + parked.x, y: main.y + parked.y } as Widget
            }
            let x = w.x + dx
            let y = w.y + dy
            // Judge by the top strip's centre: that's what you grab to move it.
            const px = x + w.width / 2
            const py = y + Math.min(w.height, 40) / 2
            let parked = w.parked
            if (!at(screens, px, py)) {
              const lost = at(before, px, py)
              if (lost) {
                // Its monitor is gone: map it onto the main screen in
                // proportion, so a whole monitor's layout keeps its shape
                // instead of piling up, and remember where it came from.
                parked = { x: x - main.x, y: y - main.y, screen: keyOf(lost) }
                x = home.x + ((x - lost.x) / lost.w) * home.w
                y = home.y + ((y - lost.y) / lost.h) * home.h
              }
              x = Math.max(home.x + 8, Math.min(x, home.x + home.w - w.width - 8))
              y = Math.max(home.y + 8, Math.min(y, home.y + home.h - w.height - 8))
            }
            if (x === w.x && y === w.y && parked === w.parked) return w
            changed = true
            return { ...w, x, y, parked } as Widget
          })
        const synced = syncSpaces(state.spaces, state.activeId, state.widgets)
        const spaces = synced.map((sp) => ({ ...sp, widgets: fix(sp.widgets) }))
        const active = spaces.find((sp) => sp.id === state.activeId)
        if (!changed) return { anchor: main, screens }
        return { anchor: main, screens, spaces, widgets: active ? active.widgets : state.widgets }
      })
    },

    hydrateSpaces: (spaces, activeId, anchor, screens) => {
      const cleaned = spaces.map((t) => ({
        ...t,
        widgets: pruneUnknown(t.widgets),
      }))
      const active = cleaned.find((t) => t.id === activeId) ?? cleaned[0]
      set({
        spaces: cleaned,
        activeId: active ? active.id : '',
        widgets: active ? active.widgets : [],
        anchor: anchor ?? null,
        screens: screens ?? [],
        selectedId: null,
        hydrated: true,
        past: [],
        future: [],
      })
    },

    cycleSpace: (dir = 1) => {
      const { spaces, activeId } = get()
      if (spaces.length < 2) return
      const i = spaces.findIndex((t) => t.id === activeId)
      const base = i < 0 ? 0 : i
      const next =
        spaces[(base + dir + spaces.length) % spaces.length]
      if (!next) return
      get().switchSpace(next.id)
      useToastStore.getState().showToast({
        message: i18n.t('toasts.spaceSwitched', { name: next.name }),
        icon: 'success',
        duration: 1800,
      })
    },

    switchSpace: (id) => {
      set((state) => {
        const synced = syncSpaces(
          state.spaces,
          state.activeId,
          state.widgets,
        )
        const target = synced.find((t) => t.id === id)
        if (!target) return { spaces: synced }
        return {
          spaces: synced,
          activeId: id,
          widgets: target.widgets,
          selectedId: null,
          past: [],
          future: [],
        }
      })
    },

    createSpace: (name) => {
      set((state) => {
        const synced = syncSpaces(
          state.spaces,
          state.activeId,
          state.widgets,
        )
        const id = uid()
        const widgets = state.widgets.map((w) => ({ ...w, id: uid() }))
        const space: Space = { id, name, builtin: false, widgets }
        return {
          spaces: [...synced, space],
          activeId: id,
          widgets,
          selectedId: null,
          past: [],
          future: [],
        }
      })
    },

    renameSpace: (id, name) => {
      set((state) => ({
        spaces: state.spaces.map((t) =>
          t.id === id && !t.builtin ? { ...t, name } : t,
        ),
      }))
    },

    resetSpace: (id) => {
      set((state) => {
        const synced = syncSpaces(state.spaces, state.activeId, state.widgets)
        const spaces = synced.map((t) =>
          t.id === id ? { ...t, widgets: [] } : t,
        )
        if (id === state.activeId) {
          return {
            spaces,
            widgets: [],
            selectedId: null,
            past: [...state.past, state.widgets].slice(-60),
            future: [],
          }
        }
        return { spaces }
      })
    },

    deleteSpace: (id) => {
      set((state) => {
        const target = state.spaces.find((t) => t.id === id)
        if (!target || target.builtin) return {}
        const remaining = state.spaces.filter((t) => t.id !== id)
        if (remaining.length === 0) return {}
        const next = remaining[0]
        if (state.activeId !== id || !next) {
          return { spaces: remaining }
        }
        return {
          spaces: remaining,
          activeId: next.id,
          widgets: next.widgets,
          selectedId: null,
          past: [],
          future: [],
        }
      })
    },

    importSpace: (name, widgets) => {
      set((state) => {
        const synced = syncSpaces(
          state.spaces,
          state.activeId,
          state.widgets,
        )
        const id = uid()
        const fresh = pruneUnknown(widgets).map((w) => ({ ...w, id: uid() }))
        const space: Space = {
          id,
          name,
          builtin: false,
          widgets: fresh,
        }
        return {
          spaces: [...synced, space],
          activeId: id,
          widgets: fresh,
          selectedId: null,
          past: [],
          future: [],
        }
      })
    },

  }
})
