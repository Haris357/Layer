import { create } from 'zustand'
import type { Mode, NewWidget, Space, Widget } from '../types/widget'
import { uid } from '../lib/utils'
import { deleteAsset, isTauri } from '../lib/ipc'
import { useToastStore } from './toastStore'

function widgetAssets(widget: Widget): string[] {
  if (widget.type === 'image' || widget.type === 'video') return [widget.src]
  if (widget.type === 'gallery') return widget.sources
  return []
}

interface CanvasState {
  widgets: Widget[]
  mode: Mode
  selectedId: string | null
  hydrated: boolean
  spaces: Space[]
  activeId: string
  past: Widget[][]
  future: Widget[][]
  clipboard: Widget | null
  guides: { v: number[]; h: number[] }
  setGuides: (guides: { v: number[]; h: number[] }) => void
  addWidget: (widget: NewWidget) => string
  updateWidget: (id: string, patch: Partial<Widget>) => void
  // Like updateWidget but skips the undo snapshot — for high-frequency live
  // edits (e.g. dragging the colour picker). Commit once with updateWidget.
  liveUpdateWidget: (id: string, patch: Partial<Widget>) => void
  deleteWidget: (id: string) => void
  duplicateWidget: (id: string) => void
  copyWidget: (id: string) => void
  pasteWidget: () => void
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
  clampViewport: (vw: number, vh: number) => void
  hydrateSpaces: (spaces: Space[], activeId: string) => void
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
])
function pruneUnknown(widgets: Widget[]): Widget[] {
  return widgets.filter((w) => KNOWN_TYPES.has(w.type))
}

export const useCanvasStore = create<CanvasState>((set, get) => {
  const pushHistory = () =>
    set((s) => ({ past: [...s.past, s.widgets].slice(-60), future: [] }))

  return {
    widgets: [],
    mode: isTauri() ? 'view' : 'edit',
    selectedId: null,
    hydrated: false,
    spaces: [],
    activeId: '',
    past: [],
    future: [],
    clipboard: null,
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
      set((state) => ({
        widgets: state.widgets.map((w) =>
          w.id === id ? ({ ...w, ...patch } as Widget) : w,
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
        message: 'Widget deleted',
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

    copyWidget: (id) => {
      const w = get().widgets.find((x) => x.id === id)
      if (w) set({ clipboard: { ...w } })
    },

    pasteWidget: () => {
      const clip = get().clipboard
      if (!clip) return
      pushHistory()
      const newId = uid()
      set((state) => ({
        widgets: [
          ...state.widgets,
          {
            ...clip,
            id: newId,
            x: clip.x + 28,
            y: clip.y + 28,
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
      set((state) => ({
        widgets: state.widgets.map((w) =>
          w.id === id ? { ...w, zIndex: nextZIndex(state.widgets) } : w,
        ),
      }))
    },

    sendToBack: (id) => {
      pushHistory()
      set((state) => {
        const min = state.widgets.reduce(
          (acc, w) => Math.min(acc, w.zIndex),
          0,
        )
        return {
          widgets: state.widgets.map((w) =>
            w.id === id ? { ...w, zIndex: min - 1 } : w,
          ),
        }
      })
    },

    lockAll: (locked) => {
      pushHistory()
      set((state) => ({
        widgets: state.widgets.map((w) => ({ ...w, locked })),
        selectedId: locked ? null : state.selectedId,
      }))
      useToastStore.getState().showToast({
        message: locked ? 'All widgets locked' : 'All widgets unlocked',
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

    hydrateSpaces: (spaces, activeId) => {
      const cleaned = spaces.map((t) => ({
        ...t,
        widgets: pruneUnknown(t.widgets),
      }))
      const active = cleaned.find((t) => t.id === activeId) ?? cleaned[0]
      set({
        spaces: cleaned,
        activeId: active ? active.id : '',
        widgets: active ? active.widgets : [],
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
        message: `Space · ${next.name}`,
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

    clampViewport: (vw, vh) => {
      if (vw <= 0 || vh <= 0) return
      set((state) => {
        let changed = false
        const widgets = state.widgets.map((w) => {
          const width = Math.min(w.width, vw)
          const height = Math.min(w.height, vh)
          const x = Math.min(Math.max(0, w.x), Math.max(0, vw - width))
          const y = Math.min(Math.max(0, w.y), Math.max(0, vh - height))
          if (
            width !== w.width ||
            height !== w.height ||
            x !== w.x ||
            y !== w.y
          ) {
            changed = true
            return { ...w, width, height, x, y }
          }
          return w
        })
        return changed ? { widgets } : {}
      })
    },
  }
})
