import { create } from 'zustand'
import type { Mode, NewWidget, Template, Widget } from '../types/widget'
import { uid } from '../lib/utils'
import { deleteAsset, isTauri } from '../lib/ipc'

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
  templates: Template[]
  activeId: string
  past: Widget[][]
  future: Widget[][]
  clipboard: Widget | null
  guides: { v: number[]; h: number[] }
  setGuides: (guides: { v: number[]; h: number[] }) => void
  addWidget: (widget: NewWidget) => string
  updateWidget: (id: string, patch: Partial<Widget>) => void
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
  hydrateTemplates: (templates: Template[], activeId: string) => void
  switchTemplate: (id: string) => void
  createTemplate: (name: string) => void
  renameTemplate: (id: string, name: string) => void
  deleteTemplate: (id: string) => void
  importTemplate: (name: string, widgets: Widget[]) => void
}

function syncTemplates(
  templates: Template[],
  activeId: string,
  widgets: Widget[],
): Template[] {
  return templates.map((t) => (t.id === activeId ? { ...t, widgets } : t))
}

function nextZIndex(widgets: Widget[]): number {
  return widgets.reduce((max, w) => Math.max(max, w.zIndex), 0) + 1
}

export const useCanvasStore = create<CanvasState>((set, get) => {
  const pushHistory = () =>
    set((s) => ({ past: [...s.past, s.widgets].slice(-60), future: [] }))

  return {
    widgets: [],
    mode: isTauri() ? 'view' : 'edit',
    selectedId: null,
    hydrated: false,
    templates: [],
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

    deleteWidget: (id) => {
      const state = get()
      const target = state.widgets.find((w) => w.id === id)
      if (target) {
        const stillUsed = new Set(
          state.widgets
            .filter((w) => w.id !== id)
            .flatMap((w) => widgetAssets(w)),
        )
        widgetAssets(target).forEach((src) => {
          if (src && !stillUsed.has(src)) {
            deleteAsset(src).catch(() => {})
          }
        })
      }
      pushHistory()
      set((s) => ({
        widgets: s.widgets.filter((w) => w.id !== id),
        selectedId: s.selectedId === id ? null : s.selectedId,
      }))
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

    hydrate: (widgets) => set({ widgets, hydrated: true }),

    hydrateTemplates: (templates, activeId) => {
      const active =
        templates.find((t) => t.id === activeId) ?? templates[0]
      set({
        templates,
        activeId: active ? active.id : '',
        widgets: active ? active.widgets : [],
        selectedId: null,
        hydrated: true,
        past: [],
        future: [],
      })
    },

    switchTemplate: (id) => {
      set((state) => {
        const synced = syncTemplates(
          state.templates,
          state.activeId,
          state.widgets,
        )
        const target = synced.find((t) => t.id === id)
        if (!target) return { templates: synced }
        return {
          templates: synced,
          activeId: id,
          widgets: target.widgets,
          selectedId: null,
          past: [],
          future: [],
        }
      })
    },

    createTemplate: (name) => {
      set((state) => {
        const synced = syncTemplates(
          state.templates,
          state.activeId,
          state.widgets,
        )
        const id = uid()
        const widgets = state.widgets.map((w) => ({ ...w, id: uid() }))
        const template: Template = { id, name, builtin: false, widgets }
        return {
          templates: [...synced, template],
          activeId: id,
          widgets,
          selectedId: null,
          past: [],
          future: [],
        }
      })
    },

    renameTemplate: (id, name) => {
      set((state) => ({
        templates: state.templates.map((t) =>
          t.id === id && !t.builtin ? { ...t, name } : t,
        ),
      }))
    },

    deleteTemplate: (id) => {
      set((state) => {
        const target = state.templates.find((t) => t.id === id)
        if (!target || target.builtin) return {}
        const remaining = state.templates.filter((t) => t.id !== id)
        if (remaining.length === 0) return {}
        const next = remaining[0]
        if (state.activeId !== id || !next) {
          return { templates: remaining }
        }
        return {
          templates: remaining,
          activeId: next.id,
          widgets: next.widgets,
          selectedId: null,
          past: [],
          future: [],
        }
      })
    },

    importTemplate: (name, widgets) => {
      set((state) => {
        const synced = syncTemplates(
          state.templates,
          state.activeId,
          state.widgets,
        )
        const id = uid()
        const fresh = widgets.map((w) => ({ ...w, id: uid() }))
        const template: Template = {
          id,
          name,
          builtin: false,
          widgets: fresh,
        }
        return {
          templates: [...synced, template],
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
