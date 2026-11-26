import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import type { WbElement } from '../../../types/widget'
import { bounds, unionBox } from './geom'
import { Shape } from './render'

// PNG / SVG export of a page (or a selection), and copy-as-image.

const PAD = 32

async function dataUrl(path: string): Promise<string> {
  const buf = await invoke<ArrayBuffer>('read_asset', { assetPath: path })
  const ext = path.split('.').pop()?.toLowerCase() ?? 'png'
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/png'
  let s = ''
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${mime};base64,${btoa(s)}`
}

/** A standalone SVG of the elements (images inlined so it works anywhere). */
export async function toSvg(els: WbElement[], opts: { ink: string; background: string | null }): Promise<{ svg: string; w: number; h: number } | null> {
  const box = unionBox(els.map(bounds))
  if (!box) return null
  const hrefs = new Map<string, string>()
  for (const e of els) if (e.kind === 'image' && e.src) hrefs.set(e.id, await dataUrl(e.src).catch(() => ''))
  const w = Math.ceil(box.w + PAD * 2)
  const h = Math.ceil(box.h + PAD * 2)
  const body = renderToStaticMarkup(
    createElement(
      'g',
      { transform: `translate(${PAD - box.x} ${PAD - box.y})` },
      els.map((e) => createElement(Shape, { key: e.id, e, ink: opts.ink, href: hrefs.get(e.id) })),
    ),
  )
  const bg = opts.background ? `<rect width="100%" height="100%" fill="${opts.background}"/>` : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bg}${body}</svg>`
  return { svg, w, h }
}

export async function toPng(els: WbElement[], opts: { ink: string; background: string | null; scale?: number }): Promise<Blob | null> {
  const out = await toSvg(els, opts)
  if (!out) return null
  const scale = opts.scale ?? 2
  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(out.svg)}`
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = out.w * scale
  canvas.height = out.h * scale
  const c = canvas.getContext('2d')
  if (!c) return null
  c.scale(scale, scale)
  c.drawImage(img, 0, 0)
  return new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'))
}

async function saveBytes(bytes: Uint8Array, name: string, ext: 'png' | 'svg'): Promise<boolean> {
  const path = await save({ defaultPath: `${name}.${ext}`, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] })
  if (!path) return false
  await invoke('save_export', { path, bytes: Array.from(bytes) })
  return true
}

export async function exportPng(els: WbElement[], name: string, opts: { ink: string; background: string | null }) {
  const blob = await toPng(els, opts)
  if (!blob) return false
  return saveBytes(new Uint8Array(await blob.arrayBuffer()), name, 'png')
}

export async function exportSvg(els: WbElement[], name: string, opts: { ink: string; background: string | null }) {
  const out = await toSvg(els, opts)
  if (!out) return false
  return saveBytes(new TextEncoder().encode(out.svg), name, 'svg')
}

export async function copyPng(els: WbElement[], opts: { ink: string; background: string | null }) {
  const blob = await toPng(els, opts)
  if (!blob) return false
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
  return true
}
