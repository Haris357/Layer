// What a copied piece of text is (for smart cards), colour conversions, and
// the text transforms offered on clipboard items. Regexes stay simple and
// anchored (see scripts/check-regex).

export type TextKind = 'color' | 'link' | 'email' | 'phone' | 'path' | 'json' | 'code' | 'number' | 'text'

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const RGB = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/i
const HSL = /^hsla?\(\s*(\d{1,3})\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%\s*(?:,\s*[\d.]+\s*)?\)$/i
const URL_RE = /^https?:\/\/[^\s]+$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i
const PHONE = /^\+?[\d\s().-]{7,20}$/
const WIN_PATH = /^(?:[a-z]:\\|\\\\)[^\n]*$/i
const NUMBER = /^-?[\d,]+(?:\.\d+)?$/
const CODE_HINT = /[{};]|=>|\bfunction\b|\bconst\b|\bimport\b|\bdef\b|\bclass\b|<\/?[a-z]/

export function textKind(raw: string): TextKind {
  const t = raw.trim()
  if (!t) return 'text'
  if (t.length < 60 && (HEX.test(t) || RGB.test(t) || HSL.test(t))) return 'color'
  if (!t.includes('\n')) {
    if (URL_RE.test(t)) return 'link'
    if (EMAIL.test(t)) return 'email'
    if (PHONE.test(t) && (t.match(/\d/g)?.length ?? 0) >= 7) return 'phone'
    if (WIN_PATH.test(t)) return 'path'
    if (NUMBER.test(t)) return 'number'
  }
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    try {
      JSON.parse(t)
      return 'json'
    } catch {
      /* not JSON */
    }
  }
  const lines = t.split('\n')
  if (lines.length >= 2 && lines.filter((l) => CODE_HINT.test(l)).length >= Math.min(2, lines.length)) return 'code'
  return 'text'
}

// ── colours ─────────────────────────────────────────────────────────────────
export interface RGBc {
  r: number
  g: number
  b: number
}
export function parseColor(raw: string): RGBc | null {
  const t = raw.trim()
  if (HEX.test(t)) {
    let h = t.slice(1)
    if (h.length <= 4) h = h.split('').map((c) => c + c).join('')
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }
  }
  const m = RGB.exec(t)
  if (m) return { r: +m[1]!, g: +m[2]!, b: +m[3]! }
  const h = HSL.exec(t)
  if (h) return hslToRgb(+h[1]!, +h[2]!, +h[3]!)
  return null
}
function hslToRgb(h: number, s: number, l: number): RGBc {
  s /= 100
  l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) }
}
export const toHex = ({ r, g, b }: RGBc) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()
export const toRgb = ({ r, g, b }: RGBc) => `rgb(${r}, ${g}, ${b})`
export function toHsl({ r, g, b }: RGBc) {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4
    h *= 60
  }
  return `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`
}

// ── transforms ──────────────────────────────────────────────────────────────
export type Transform = 'upper' | 'lower' | 'title' | 'sentence' | 'trim' | 'oneLine' | 'urlDecode' | 'urlEncode' | 'json'
export const TRANSFORMS: Transform[] = ['upper', 'lower', 'title', 'sentence', 'trim', 'oneLine', 'urlDecode', 'urlEncode', 'json']

export function transform(text: string, t: Transform): string {
  switch (t) {
    case 'upper':
      return text.toUpperCase()
    case 'lower':
      return text.toLowerCase()
    case 'title':
      return text.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase())
    case 'sentence': {
      const l = text.toLowerCase()
      return l.replace(/(^\s*\p{L}|[.!?]\s+\p{L})/gu, (c) => c.toUpperCase())
    }
    case 'trim':
      return text
        .split('\n')
        .map((l) => l.trim())
        .join('\n')
        .trim()
    case 'oneLine':
      return text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .join(' ')
    case 'urlDecode':
      try {
        return decodeURIComponent(text)
      } catch {
        return text
      }
    case 'urlEncode':
      return encodeURIComponent(text)
    case 'json':
      try {
        return JSON.stringify(JSON.parse(text), null, 2)
      } catch {
        return text
      }
  }
}

export const domainOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export const fileName = (p: string) => p.split(/[\\/]/).pop() || p
export const extOf = (p: string) => {
  const n = fileName(p)
  const i = n.lastIndexOf('.')
  return i > 0 ? n.slice(i + 1).toLowerCase() : ''
}
