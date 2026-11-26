import { invoke } from '@tauri-apps/api/core'
import manifest from '../../src-tauri/resources/cursors/themes.json'
import previews from '../assets/cursor-previews/previews.json'
import { isTauri } from './ipc'

// Prism Pointer cursor themes: data shared by Settings → Appearance → Pointer
// and by Layer itself (which swaps its own cursors to the applied theme).

export interface PointerStatus {
  theme: string | null
  size: number | null
  hasBackup: boolean
  bundle: string
}

export const POINTER_THEMES = manifest.themes
export const POINTER_SIZES = manifest.sizes
export const POINTER_ROLES = ['Arrow', 'Help', 'AppStarting', 'Wait', 'Crosshair', 'IBeam', 'NWPen', 'No', 'SizeNS', 'SizeWE', 'SizeNWSE', 'SizeNESW', 'SizeAll', 'UpArrow', 'Hand', 'Pin', 'Person']
export const POINTER_EXTRAS = ['Grab', 'Grabbing', 'Copy', 'Alias', 'ContextMenu', 'ZoomIn', 'ZoomOut', 'LeftSelect', 'ColorSelect', 'HandCopy', 'HandAlias', 'HandNo', 'HandHelp', 'ResizeN', 'ResizeS', 'ResizeW', 'ResizeE', 'ResizeNW', 'ResizeNE', 'ResizeSW', 'ResizeSE', 'HBeam', 'Eyedropper']
export const ANIMATED = new Set(['AppStarting', 'Wait'])
export const PREVIEW = previews

// Crisp 96 px previews, bundled with the UI (not Tauri resources) so they load
// the same in dev and release.
const URLS = import.meta.glob('../assets/cursor-previews/**/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

export const isExtra = (role: string) => POINTER_EXTRAS.includes(role)

export function previewUrl(theme: string, role: string): string | undefined {
  return URLS[`../assets/cursor-previews/${theme}/${isExtra(role) ? 'Extras/' : ''}${role}.png`]
}

// Chromium draws image-set() cursors at full device resolution.
const HIDPI = typeof CSS !== 'undefined' && CSS.supports('cursor', 'image-set(url("a.png") 2x) 1 1, auto')

/** A CSS cursor value for one role at a size (hotspot included), or undefined. */
export function cursorValue(theme: string, role: string, size: number): string | undefined {
  if (ANIMATED.has(role) || !HIDPI) return undefined
  const url = previewUrl(theme, role)
  if (!url) return undefined
  const hs = (previews.themes as Record<string, Record<string, number[]>>)[theme]?.[role] ?? [32, 32]
  const k = size / 64
  return `image-set(url("${url}") ${(previews.size / size).toFixed(3)}x) ${Math.round(hs[0]! * k)} ${Math.round(hs[1]! * k)}`
}

/** Layer's own cursors (CSS variables in index.css) → the theme role used for each. */
export const LAYER_CURSORS: { key: string; role: string; label: string }[] = [
  { key: '--cur-arrow', role: 'Arrow', label: 'normal' },
  { key: '--cur-pointer', role: 'Hand', label: 'button' },
  { key: '--cur-grab', role: 'Grab', label: 'grab' },
  { key: '--cur-grabbing', role: 'Grabbing', label: 'grabbing' },
  { key: '--cur-resize', role: 'SizeNWSE', label: 'resize' },
  { key: '--cur-resize-nesw', role: 'SizeNESW', label: 'resizeNesw' },
  { key: '--cur-resize-ns', role: 'SizeNS', label: 'resizeNs' },
  { key: '--cur-resize-ew', role: 'SizeWE', label: 'resizeEw' },
]

/** Point Layer's own cursors at the applied theme (or back to Layer's). */
export function applyLayerCursors(status: PointerStatus | null) {
  const root = document.documentElement.style
  for (const c of LAYER_CURSORS) {
    const v = status?.theme && status.size ? cursorValue(status.theme, c.role, status.size) : undefined
    if (v) root.setProperty(c.key, v)
    else root.removeProperty(c.key)
  }
}

export const POINTER_EVENT = 'layer:pointer-changed'

/** Read what Windows is using now and sync Layer's own cursors to it. */
export async function refreshPointer(): Promise<PointerStatus | null> {
  if (!isTauri()) return null
  try {
    const s = await invoke<PointerStatus>('pointer_status')
    applyLayerCursors(s)
    window.dispatchEvent(new CustomEvent(POINTER_EVENT, { detail: s }))
    return s
  } catch {
    return null
  }
}
