// Fails if any literal t('key') / i18nKey="key" in src/ is missing from the
// English locale (or if another locale lacks a key English has). Catches the
// "UI shows common.delete instead of Delete" class of bug before it ships.
// Dynamic keys (template literals) can't be checked statically and are skipped.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = 'src'
const LOCALES = join(SRC, 'locales')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

function flatten(obj, prefix = '', out = new Set()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') flatten(v, key, out)
    else out.add(key)
  }
  return out
}

// i18next plural forms: t('x', { count }) resolves x_one / x_other / …
const PLURAL = ['zero', 'one', 'two', 'few', 'many', 'other']
const has = (keys, k) => keys.has(k) || PLURAL.some((p) => keys.has(`${k}_${p}`))

const en = flatten(JSON.parse(readFileSync(join(LOCALES, 'en.json'), 'utf8')))
const KEY_RE = /\b(?:t|i18n\.t)\(\s*['"]([a-zA-Z0-9_.-]+)['"]/g
const ATTR_RE = /i18nKey=["']([a-zA-Z0-9_.-]+)["']/g

const missing = []
for (const file of walk(SRC)) {
  const text = readFileSync(file, 'utf8')
  for (const re of [KEY_RE, ATTR_RE]) {
    for (const m of text.matchAll(re)) {
      const key = m[1]
      if (!key.includes('.')) continue // not a namespaced UI key
      if (!has(en, key)) {
        const line = text.slice(0, m.index).split('\n').length
        missing.push(`${file}:${line}  ${key}`)
      }
    }
  }
}

const gaps = []
for (const name of readdirSync(LOCALES).filter((f) => f.endsWith('.json') && f !== 'en.json')) {
  const keys = flatten(JSON.parse(readFileSync(join(LOCALES, name), 'utf8')))
  for (const k of en) {
    // plural suffixes differ per language (ru has _few/_many, ja only _other)
    const base = k.replace(/_(zero|one|two|few|many|other)$/, '')
    if (!keys.has(k) && !has(keys, base)) gaps.push(`${name}  ${k}`)
  }
}

if (missing.length || gaps.length) {
  if (missing.length) console.error(`Keys used in code but missing from en.json (${missing.length}):\n  ` + missing.join('\n  '))
  if (gaps.length) console.error(`Keys in en.json missing from other locales (${gaps.length}):\n  ` + gaps.join('\n  '))
  process.exit(1)
}
console.log('All i18n keys resolve.')
