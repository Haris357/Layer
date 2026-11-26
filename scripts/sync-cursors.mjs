// Copies Prism Pointer's generated cursor files into Layer's bundled resources
// (src-tauri/resources/cursors/<theme-slug>-<size>/…, Extras included) and
// writes the theme manifest the Pointer widget reads.
//
// Regenerate the files in the Prism Pointer project first (its self-test
// writes and verifies every theme/size):
//   cd ../../CustomMousePointer
//   Start-Process .\release\PrismPointer.exe -ArgumentList '--self-test' -Wait
// then:
//   node scripts/sync-cursors.mjs [path/to/release/validation]
//
// The widget's crisp previews (96 px PNGs + animation strips) come from
// Prism Pointer's vector art via its --export-previews mode; this script runs
// it when the exe is found (PRISM_EXE, or release/PrismPointer.exe).
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..')
const src = path.resolve(process.argv[2] ?? path.join(root, '..', '..', 'CustomMousePointer', 'release', 'validation'))
const dest = path.join(root, 'src-tauri', 'resources', 'cursors')

// Keep in sync with Prism Pointer's CursorArt.Themes (name, accent, description).
const THEMES = [
  ['Ink', '#FFFFFF', 'Bold arrows · monochrome details'],
  ['Material Dark', '#29B6F6', 'Angular charcoal · white edges'],
  ['Rounded Light', '#FFFFFF', 'Soft white · colored badges'],
  ['Facet', '#2196F3', 'Charcoal facets · four-color orbit'],
  ['Facet Outline', '#2196F3', 'Open facets · four-color orbit'],
  ['Contour', '#B388FF', 'Airy outlines · violet orbit'],
  ['Afterglow', '#FFAA54', 'White outlines · ember orbit'],
  ['Obsidian', '#EDF1F7', 'Bold black · white border'],
  ['Mono', '#FFFFFF', 'Minimal forms · bold strokes'],
]
const SIZES = [28, 30, 32, 48, 64]
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-')

if (!fs.existsSync(src)) {
  console.error(`Prism Pointer output not found: ${src}`)
  process.exit(1)
}
fs.rmSync(dest, { recursive: true, force: true })
let files = 0
const manifest = []
for (const [name, color] of THEMES) {
  let extras = false
  for (const size of SIZES) {
    const from = path.join(src, `${name}-${size}`)
    if (!fs.existsSync(from)) throw new Error(`missing ${from}`)
    const to = path.join(dest, `${slug(name)}-${size}`)
    fs.mkdirSync(to, { recursive: true })
    for (const f of fs.readdirSync(from)) {
      if (/\.(cur|ani)$/i.test(f)) {
        fs.copyFileSync(path.join(from, f), path.join(to, f))
        files++
      }
    }
    const ex = path.join(from, 'Extras')
    if (fs.existsSync(ex)) {
      extras = true
      fs.mkdirSync(path.join(to, 'Extras'), { recursive: true })
      for (const f of fs.readdirSync(ex)) {
        if (/\.(cur|ani)$/i.test(f)) {
          fs.copyFileSync(path.join(ex, f), path.join(to, 'Extras', f))
          files++
        }
      }
    }
  }
  manifest.push({ id: slug(name), name, color, extras })
}
fs.writeFileSync(path.join(dest, 'themes.json'), JSON.stringify({ sizes: SIZES, themes: manifest }, null, 2) + '\n')
const exe = process.env.PRISM_EXE ?? path.join(src, '..', 'PrismPointer.exe')
if (fs.existsSync(exe)) {
  execFileSync(exe, [`--export-previews=${path.join(root, 'src', 'assets', 'cursor-previews')}`], { stdio: 'inherit' })
  console.log('previews rendered')
} else console.warn(`Prism Pointer exe not found (${exe}): previews not rendered`)
console.log(`${files} cursor files, ${manifest.length} themes → ${path.relative(root, dest)}`)
