// Builds the Tauri updater manifest (latest.json) from a finished build.
// Run after `npm run tauri build`:  node scripts/make-latest-json.mjs v1.2.0
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const RELEASES_REPO = 'Haris357/Layer-releases'
const BUNDLE_DIR = 'src-tauri/target/release/bundle/nsis'

const version = (process.argv[2] || '').replace(/^v/, '')
if (!version) {
  console.error('usage: node scripts/make-latest-json.mjs <version>')
  process.exit(1)
}

const files = readdirSync(BUNDLE_DIR)
const exe = files.find((f) => f.endsWith('-setup.exe'))
const sig = files.find((f) => f.endsWith('-setup.exe.sig'))
if (!exe || !sig) {
  console.error(`setup .exe / .sig not found in ${BUNDLE_DIR}`)
  console.error(`found: ${files.join(', ')}`)
  process.exit(1)
}

const signature = readFileSync(join(BUNDLE_DIR, sig), 'utf8').trim()
const notes = process.env.RELEASE_NOTES || `Layer v${version}`

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature,
      url: `https://github.com/${RELEASES_REPO}/releases/download/v${version}/${exe}`,
    },
  },
}

writeFileSync('latest.json', JSON.stringify(manifest, null, 2))
console.log(`latest.json written for v${version} (asset: ${exe})`)
