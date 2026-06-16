// Builds the Tauri updater manifest (latest.json) from finished build(s).
//   node scripts/make-latest-json.mjs v1.2.0 [arm64BundleDir]
// The optional second arg points at a directory holding the ARM64 NSIS
// installer (+ .sig) — when present, a `windows-aarch64` platform is added so
// native ARM64 installs auto-update to ARM64 builds. x64 is always required.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const RELEASES_REPO = 'Haris357/Layer-releases'
const X64_BUNDLE_DIR = 'src-tauri/target/release/bundle/nsis'

const version = (process.argv[2] || '').replace(/^v/, '')
const arm64Dir = process.argv[3] || ''
if (!version) {
  console.error('usage: node scripts/make-latest-json.mjs <version> [arm64Dir]')
  process.exit(1)
}

// Find the *-setup.exe + matching .sig in a bundle dir. Returns null if absent.
function findBundle(dir) {
  if (!dir || !existsSync(dir)) return null
  const files = readdirSync(dir)
  const exe = files.find((f) => f.endsWith('-setup.exe'))
  const sig = files.find((f) => f.endsWith('-setup.exe.sig'))
  if (!exe || !sig) return null
  return {
    exe,
    signature: readFileSync(join(dir, sig), 'utf8').trim(),
  }
}

const assetUrl = (file) =>
  `https://github.com/${RELEASES_REPO}/releases/download/v${version}/${file}`

const x64 = findBundle(X64_BUNDLE_DIR)
if (!x64) {
  console.error(`x64 setup .exe / .sig not found in ${X64_BUNDLE_DIR}`)
  process.exit(1)
}

const platforms = {
  'windows-x86_64': { signature: x64.signature, url: assetUrl(x64.exe) },
}

const arm64 = findBundle(arm64Dir)
if (arm64) {
  platforms['windows-aarch64'] = {
    signature: arm64.signature,
    url: assetUrl(arm64.exe),
  }
  console.log(`+ windows-aarch64 (${arm64.exe})`)
} else if (arm64Dir) {
  console.warn(`! ARM64 bundle not found in "${arm64Dir}" — x64-only manifest`)
}

const manifest = {
  version,
  notes: process.env.RELEASE_NOTES || `Layer v${version}`,
  pub_date: new Date().toISOString(),
  platforms,
}

writeFileSync('latest.json', JSON.stringify(manifest, null, 2))
console.log(
  `latest.json written for v${version} (${Object.keys(platforms).join(', ')})`,
)
