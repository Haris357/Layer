import { invoke } from '@tauri-apps/api/core'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { useEffect, useState } from 'react'
import type { ClipItem } from '../store/clipboardStore'
import { fileName } from './clipKind'
import { getAppIcon, isTauri } from './ipc'

// Copy / paste clipboard items back out (Rust writes text, files and images
// natively, see clipboard.rs), plus small shared helpers for the UI.

const payload = (i: ClipItem, text?: string) => ({ kind: text !== undefined ? 'text' : i.kind, text: text ?? i.text, files: i.files, image: i.image })

/** Put an item (optionally replaced by transformed text) on the clipboard. */
export async function copyClip(item: ClipItem, text?: string): Promise<void> {
  if (isTauri()) return invoke('clip_copy', { clip: payload(item, text) })
  if (text ?? item.text) await writeText(text ?? item.text ?? '')
}

/** Quick Paste: copy, close, and paste into the app underneath. */
export const pasteClip = (item: ClipItem, text?: string) => invoke('clip_paste', { clip: payload(item, text) })

/** One-line description of an item (search, notch, merged copies). */
export function clipLabel(i: ClipItem): string {
  if (i.kind === 'files') return (i.files ?? []).map(fileName).join(', ')
  if (i.kind === 'image') return `${i.image?.w ?? 0}×${i.image?.h ?? 0}`
  return i.text ?? ''
}

// App icons for "copied from" badges, fetched once per exe.
const icons = new Map<string, Promise<string | null>>()
export function useAppIcon(exe?: string): string | null {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    if (!exe || !isTauri()) return
    let p = icons.get(exe)
    if (!p) {
      p = getAppIcon(exe).then((x) => x ?? null).catch(() => null)
      icons.set(exe, p)
    }
    let live = true
    p.then((v) => live && setSrc(v))
    return () => {
      live = false
    }
  }, [exe])
  return src
}

export function timeAgo(iso: string, t: (k: string, o?: Record<string, unknown>) => string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  if (s < 45) return t('clipboard.time.now')
  if (s < 3600) return t('clipboard.time.min', { n: Math.round(s / 60) })
  if (s < 86400) return t('clipboard.time.hour', { n: Math.round(s / 3600) })
  return t('clipboard.time.day', { n: Math.round(s / 86400) })
}

export type Group = 'today' | 'yesterday' | 'earlier'
export function groupOf(iso: string): Group {
  const d = new Date(iso)
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (d.getTime() >= start) return 'today'
  if (d.getTime() >= start - 86400000) return 'yesterday'
  return 'earlier'
}
