import {
  Link2,
  Mail,
  FolderOpen,
  Braces,
  Code2,
  Database,
  Hash,
  Palette,
  Type,
  type LucideIcon,
} from 'lucide-react'

export type ClipKind =
  | 'link'
  | 'email'
  | 'path'
  | 'json'
  | 'code'
  | 'sql'
  | 'color'
  | 'number'
  | 'text'

export interface ClipMeta {
  kind: ClipKind
  label: string
  icon: LucideIcon
  tint: string
  mono: boolean
  singleLine: boolean
  preview: string
}

const URL_RE = /^(https?:\/\/|www\.)\S+$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const WIN_PATH_RE = /^[a-zA-Z]:\\(?:[^<>:"|?*\r\n]*\\?)*$/
const UNC_RE = /^\\\\[^\\]+\\\S+/
const UNIX_PATH_RE = /^(?:\/|~\/|\.\.?\/)[^\s]+$/
const NUM_RE = /^-?\d{1,3}(?:[, ]\d{3})+(?:\.\d+)?$|^-?\d+(?:\.\d+)?$/

function looksLikeJson(t: string): boolean {
  if (!(t.startsWith('{') || t.startsWith('['))) return false
  if (t.length > 100_000) return false
  try {
    JSON.parse(t)
    return true
  } catch {
    return false
  }
}

function looksLikeSql(t: string): boolean {
  return (
    /^\s*(select|insert\s+into|update|delete\s+from|create\s+(table|database|index|view)|alter\s+table|drop\s+(table|database)|with)\b/i.test(
      t,
    ) && /\b(from|into|set|values|where|table|join)\b/i.test(t)
  )
}

function looksLikeCode(t: string): boolean {
  if (
    /=>|;\s*$|^\s*(function|const|let|var|import|export|class|def|public|private|return|if|for|while|#include|package|func)\b/m.test(
      t,
    )
  )
    return true
  // HTML / XML / JSX tag
  if (/<\/?[a-z][^>]*>/i.test(t)) return true
  // Braces/calls spanning multiple lines
  if (/[{}();]/.test(t) && /\n/.test(t)) return true
  return false
}

/** Best-effort classification of a clipboard snippet for display. */
export function detectKind(raw: string): ClipMeta {
  const t = raw.trim()
  const oneLine = raw.replace(/\s+/g, ' ').trim()

  if (looksLikeJson(t)) {
    let preview = oneLine
    try {
      const v = JSON.parse(t)
      if (Array.isArray(v)) {
        preview = `[ ${v.length} item${v.length === 1 ? '' : 's'} ]`
      } else if (v && typeof v === 'object') {
        const keys = Object.keys(v)
        preview = `{ ${keys.slice(0, 4).join(', ')}${keys.length > 4 ? ', …' : ''} }`
      }
    } catch {
      /* keep oneLine */
    }
    return {
      kind: 'json',
      label: 'JSON',
      icon: Braces,
      tint: '#e0a458',
      mono: true,
      singleLine: true,
      preview,
    }
  }

  if (URL_RE.test(t)) {
    let preview = t
    try {
      const u = new URL(t.startsWith('www.') ? `https://${t}` : t)
      preview = u.host + (u.pathname !== '/' ? u.pathname : '') + u.search
    } catch {
      /* keep raw */
    }
    return {
      kind: 'link',
      label: 'Link',
      icon: Link2,
      tint: '#5b9aff',
      mono: false,
      singleLine: true,
      preview,
    }
  }

  if (EMAIL_RE.test(t))
    return {
      kind: 'email',
      label: 'Email',
      icon: Mail,
      tint: '#5b9aff',
      mono: false,
      singleLine: true,
      preview: t,
    }

  if (HEX_RE.test(t))
    return {
      kind: 'color',
      label: 'Color',
      icon: Palette,
      tint: t,
      mono: true,
      singleLine: true,
      preview: t.toUpperCase(),
    }

  if (WIN_PATH_RE.test(t) || UNC_RE.test(t) || UNIX_PATH_RE.test(t))
    return {
      kind: 'path',
      label: 'Path',
      icon: FolderOpen,
      tint: '#c08457',
      mono: true,
      singleLine: true,
      preview: t,
    }

  if (looksLikeSql(t))
    return {
      kind: 'sql',
      label: 'Query',
      icon: Database,
      tint: '#56b6a4',
      mono: true,
      singleLine: true,
      preview: oneLine,
    }

  if (looksLikeCode(t))
    return {
      kind: 'code',
      label: 'Code',
      icon: Code2,
      tint: '#a78bfa',
      mono: true,
      singleLine: false,
      preview: t,
    }

  if (NUM_RE.test(t))
    return {
      kind: 'number',
      label: 'Number',
      icon: Hash,
      tint: '#56b6a4',
      mono: true,
      singleLine: true,
      preview: t,
    }

  return {
    kind: 'text',
    label: 'Text',
    icon: Type,
    tint: 'var(--text-tertiary)',
    mono: false,
    singleLine: false,
    preview: t,
  }
}
