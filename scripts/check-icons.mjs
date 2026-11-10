// Fails if two widgets use the same toolbar icon. Every widget must be
// recognisable at a glance in the toolbar strip.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'src/components/widgets'

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name.endsWith('.tsx')) out.push(p)
  }
  return out
}

// A widget definition is the object exported as `xxxDefinition`; its icon is
// the `icon:` line inside it.
const seen = new Map()
const dupes = []
for (const file of walk(DIR)) {
  const text = readFileSync(file, 'utf8')
  const def = text.indexOf('Definition: WidgetDefinition')
  if (def < 0) continue
  const m = /\n\s+icon:\s*([A-Za-z0-9_]+)/.exec(text.slice(def))
  if (!m) continue
  const icon = m[1]
  if (seen.has(icon)) dupes.push(`${icon}: ${seen.get(icon)} and ${file}`)
  else seen.set(icon, file)
}

if (dupes.length) {
  console.error('Widgets sharing a toolbar icon:\n  ' + dupes.join('\n  '))
  process.exit(1)
}
console.log(`All ${seen.size} widget icons are unique.`)
