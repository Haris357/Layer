import JSZip from 'jszip'
import { save, open } from '@tauri-apps/plugin-dialog'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import {
  captureScreenBase64,
  writeBinaryFile,
  readBinaryFile,
  readTextFile,
} from './ipc'
import type { Template, Widget } from '../types/widget'

// Captures the desktop canvas as a base64 PNG (no data: prefix).
export const captureCanvas = () => captureScreenBase64()

// Downscales a base64 PNG to a compact JPEG data URL for the gallery thumb.
function toThumbnail(pngBase64: string, maxW = 1100): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('no canvas context'))
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => reject(new Error('image decode failed'))
    img.src = `data:image/png;base64,${pngBase64}`
  })
}

// Exports a template as a ZIP: {name}/template.json + {name}/screenshot.png
export async function exportTemplateZip(t: Template, screenshotPng: string) {
  const path = await save({
    defaultPath: `${t.name}.zip`,
    filters: [{ name: 'Layer template', extensions: ['zip'] }],
  })
  if (!path) return
  const zip = new JSZip()
  const folder = zip.folder(t.name) ?? zip
  folder.file(
    'template.json',
    JSON.stringify({ version: 1, name: t.name, widgets: t.widgets }, null, 2),
  )
  folder.file('screenshot.png', screenshotPng, { base64: true })
  const b64 = await zip.generateAsync({ type: 'base64' })
  await writeBinaryFile(path, b64)
}

// Imports a template from a .zip, .layer or .json file the user picks.
export async function importTemplateFile(): Promise<{
  name: string
  widgets: Widget[]
} | null> {
  const path = await open({
    multiple: false,
    filters: [{ name: 'Layer template', extensions: ['zip', 'layer', 'json'] }],
  })
  if (!path || typeof path !== 'string') return null
  try {
    let raw: string
    if (path.toLowerCase().endsWith('.zip')) {
      const b64 = await readBinaryFile(path)
      const zip = await JSZip.loadAsync(b64, { base64: true })
      const entry = Object.values(zip.files).find(
        (f) => !f.dir && f.name.toLowerCase().endsWith('template.json'),
      )
      if (!entry) return null
      raw = await entry.async('string')
    } else {
      raw = await readTextFile(path)
    }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed.widgets)) return null
    return {
      name: typeof parsed.name === 'string' ? parsed.name : 'Imported',
      widgets: parsed.widgets,
    }
  } catch {
    return null
  }
}

// Publishes a template to the public gallery on the website.
export async function publishToGallery(opts: {
  template: Template
  author: string
  description: string
  screenshotPng: string
}) {
  const thumb = await toThumbnail(opts.screenshotPng)
  await addDoc(collection(db, 'templates'), {
    name: opts.template.name.slice(0, 79),
    description:
      opts.description.trim() ||
      `A ${opts.template.widgets.length}-widget Layer layout.`,
    author: opts.author.trim() || 'Anonymous',
    widgetCount: opts.template.widgets.length,
    widgets: opts.template.widgets,
    thumb,
    upvotes: 0,
    downvotes: 0,
    score: 0,
    createdAt: serverTimestamp(),
  })
}
