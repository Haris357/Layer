import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return 'w_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

// Convert a #rgb / #rrggbb hex to an rgba() string. Used for per-widget accent
// tints (avoids relying on CSS color-mix, which older WebView2 may not support).
export function hexToRgba(hex: string, alpha: number): string {
  let h = (hex || '').replace('#', '').trim()
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return `rgba(0,0,0,${alpha})`
  const n = parseInt(h, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
