import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../lib/ipc'

// Clipboard history. Items arrive from the Rust listener (clipboard.rs) as
// text, files or images, each tagged with the app it came from.

export type ClipKind = 'text' | 'image' | 'files'

export interface ClipImage {
  path: string
  w: number
  h: number
}
export interface ClipSource {
  name: string
  exe: string
}

export interface ClipItem {
  id: string
  kind: ClipKind
  text?: string
  files?: string[]
  image?: ClipImage
  source?: ClipSource
  createdAt: string
  pinned?: boolean
  /** pinboards this item is saved to */
  boards?: string[]
}

export interface ClipSettings {
  paused: boolean
  /** unpinned items kept */
  max: number
  /** forget unpinned items after this many days (0 = never) */
  ttlDays: number
  images: boolean
  files: boolean
  /** Quick Paste on Win+Shift+V */
  hotkey: boolean
  /** apps whose copies are never recorded (exe file names, lower case) */
  ignoreApps: string[]
}

export type NewClip = Omit<ClipItem, 'id' | 'createdAt' | 'pinned' | 'boards'>

interface State {
  items: ClipItem[]
  boards: string[]
  settings: ClipSettings
  push: (clip: NewClip) => void
  togglePin: (id: string) => void
  remove: (ids: string | string[]) => void
  clearUnpinned: () => void
  setSettings: (patch: Partial<ClipSettings>) => void
  addBoard: (name: string) => void
  removeBoard: (name: string) => void
  toggleBoard: (id: string, board: string) => void
  update: (id: string, patch: Partial<ClipItem>) => void
  prune: () => void
}

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)
const MAX_TEXT = 20000

/** What makes two copies "the same" for de-duplication. */
export const signature = (c: Pick<ClipItem, 'kind' | 'text' | 'files' | 'image'>) =>
  c.kind === 'image' ? `i:${c.image?.path}` : c.kind === 'files' ? `f:${(c.files ?? []).join('|')}` : `t:${c.text ?? ''}`

const kept = (i: ClipItem) => i.pinned || (i.boards?.length ?? 0) > 0

/** Delete image files that no remaining item uses. */
function forgetImages(before: ClipItem[], after: ClipItem[]) {
  if (!isTauri()) return
  const live = new Set(after.filter((i) => i.image).map((i) => i.image!.path))
  for (const i of before) if (i.image && !live.has(i.image.path)) invoke('clip_forget_image', { path: i.image.path }).catch(() => {})
}

function trim(items: ClipItem[], s: ClipSettings): ClipItem[] {
  const cutoff = s.ttlDays > 0 ? Date.now() - s.ttlDays * 86400000 : 0
  let n = 0
  return items.filter((it) => {
    if (kept(it)) return true
    if (cutoff && Date.parse(it.createdAt) < cutoff) return false
    n += 1
    return n <= s.max
  })
}

export const DEFAULT_CLIP_SETTINGS: ClipSettings = { paused: false, max: 100, ttlDays: 0, images: true, files: true, hotkey: true, ignoreApps: [] }

export const useClipboardStore = create<State>()(
  persist(
    (set, get) => ({
      items: [],
      boards: [],
      settings: DEFAULT_CLIP_SETTINGS,
      push: (raw) => {
        const clip: NewClip = raw.kind === 'text' ? { ...raw, text: (raw.text ?? '').slice(0, MAX_TEXT) } : raw
        if (clip.kind === 'text' && !clip.text?.trim()) return
        const sig = signature(clip)
        set((s) => {
          if (s.items[0] && signature(s.items[0]) === sig) return s
          const hit = s.items.find((i) => signature(i) === sig)
          const fresh: ClipItem = hit
            ? { ...hit, ...clip, createdAt: new Date().toISOString() }
            : { ...clip, id: uid(), createdAt: new Date().toISOString() }
          const next = trim([fresh, ...s.items.filter((i) => i !== hit)], s.settings)
          forgetImages(s.items, next)
          return { items: next }
        })
      },
      togglePin: (id) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, pinned: !i.pinned } : i)) })),
      remove: (ids) =>
        set((s) => {
          const drop = new Set(Array.isArray(ids) ? ids : [ids])
          const next = s.items.filter((i) => !drop.has(i.id))
          forgetImages(s.items, next)
          return { items: next }
        }),
      clearUnpinned: () =>
        set((s) => {
          const next = s.items.filter(kept)
          forgetImages(s.items, next)
          return { items: next }
        }),
      setSettings: (patch) =>
        set((s) => {
          const settings = { ...s.settings, ...patch }
          const next = trim(s.items, settings)
          forgetImages(s.items, next)
          return { settings, items: next }
        }),
      addBoard: (name) => {
        const n = name.trim()
        if (n && !get().boards.includes(n)) set((s) => ({ boards: [...s.boards, n] }))
      },
      removeBoard: (name) =>
        set((s) => ({ boards: s.boards.filter((b) => b !== name), items: s.items.map((i) => (i.boards?.includes(name) ? { ...i, boards: i.boards.filter((b) => b !== name) } : i)) })),
      toggleBoard: (id, board) =>
        set((s) => ({
          items: s.items.map((i) => {
            if (i.id !== id) return i
            const has = i.boards?.includes(board)
            return { ...i, boards: has ? i.boards!.filter((b) => b !== board) : [...(i.boards ?? []), board] }
          }),
        })),
      update: (id, patch) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
      prune: () =>
        set((s) => {
          const next = trim(s.items, s.settings)
          if (next.length === s.items.length) return s
          forgetImages(s.items, next)
          return { items: next }
        }),
    }),
    {
      name: 'layer-clipboard',
      version: 2,
      // v1 stored text only: { id, text, createdAt, pinned }
      migrate: (old, version) => {
        const o = (old ?? {}) as { items?: ClipItem[]; boards?: string[]; settings?: ClipSettings }
        if (version < 2) {
          return {
            items: (o.items ?? []).map((i) => ({ ...i, kind: 'text' as const })),
            boards: [],
            settings: DEFAULT_CLIP_SETTINGS,
          }
        }
        return o as State
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>
        return { ...current, ...p, settings: { ...DEFAULT_CLIP_SETTINGS, ...(p.settings ?? {}) } }
      },
    },
  ),
)
