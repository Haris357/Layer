import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PinnedApp } from '../types/widget'

export type NotchModuleId =
  | 'nowplaying'
  | 'timer'
  | 'system'
  | 'weather'
  | 'notifications'
  | 'clipboard'
  | 'calendar'
  | 'shortcuts'
  | 'toggles'

export interface NotchModuleConfig {
  id: NotchModuleId
  enabled: boolean
}

const DEFAULT_MODULES: NotchModuleConfig[] = [
  { id: 'nowplaying', enabled: true },
  { id: 'shortcuts', enabled: true },
  { id: 'timer', enabled: true },
  { id: 'system', enabled: true },
  { id: 'weather', enabled: true },
  { id: 'calendar', enabled: true },
  { id: 'notifications', enabled: true },
  { id: 'clipboard', enabled: true },
  { id: 'toggles', enabled: true },
]

export interface QuickLink {
  id: string
  label: string
  url: string
}

interface NotchState {
  // Persisted config
  modules: NotchModuleConfig[]
  pinned: PinnedApp[]
  quickLinks: QuickLink[]
  colorful: boolean
  // Transient (session) UI state — not persisted
  expanded: boolean
  activeModule: NotchModuleId | null

  setExpanded: (v: boolean) => void
  setActiveModule: (id: NotchModuleId | null) => void
  toggleModule: (id: NotchModuleId) => void
  reorderModules: (modules: NotchModuleConfig[]) => void
  setPinned: (pinned: PinnedApp[]) => void
  setQuickLinks: (links: QuickLink[]) => void
  setColorful: (v: boolean) => void
}

export const useNotchStore = create<NotchState>()(
  persist(
    (set) => ({
      modules: DEFAULT_MODULES,
      pinned: [],
      quickLinks: [],
      colorful: true,
      expanded: false,
      activeModule: null,

      setExpanded: (expanded) => set({ expanded }),
      setActiveModule: (activeModule) => set({ activeModule }),
      toggleModule: (id) =>
        set((s) => ({
          modules: s.modules.map((m) =>
            m.id === id ? { ...m, enabled: !m.enabled } : m,
          ),
        })),
      reorderModules: (modules) => set({ modules }),
      setPinned: (pinned) => set({ pinned }),
      setQuickLinks: (quickLinks) => set({ quickLinks }),
      setColorful: (colorful) => set({ colorful }),
    }),
    {
      name: 'layer-notch',
      // Only persist config — never the transient expand/active state, and
      // backfill any modules added in newer versions.
      partialize: (s) => ({
        modules: s.modules,
        pinned: s.pinned,
        quickLinks: s.quickLinks,
        colorful: s.colorful,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<NotchState>
        const saved = p.modules ?? []
        const byId = new Map(saved.map((m) => [m.id, m]))
        // Keep saved order/enabled, then append any new modules at the end.
        const modules = [
          ...saved.filter((m) => DEFAULT_MODULES.some((d) => d.id === m.id)),
          ...DEFAULT_MODULES.filter((d) => !byId.has(d.id)),
        ]
        return { ...current, ...p, modules }
      },
    },
  ),
)
