// Generates the Layer app icons + branded NSIS installer images.
// Source art is defined as SVG and rasterized with sharp — no external tools.
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const iconDir = join(root, 'src-tauri', 'icons')
mkdirSync(iconDir, { recursive: true })

// --- Layer glyph: three stacked layers (matches the island/notch icon) ---
const glyph = (stroke) => `
  <g fill="none" stroke="#ffffff" stroke-width="${stroke}"
     stroke-linecap="round" stroke-linejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2"/>
    <polyline points="2 17 12 22 22 17"/>
    <polyline points="2 12 12 17 22 12"/>
  </g>`

// --- App icon: rounded tile, dark gradient, white glyph ---
function appIconSvg(size) {
  const r = Math.round(size * 0.22)
  const s = (size * 0.48) / 24 // glyph spans 48% of the tile
  const off = size / 2
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"
    xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#2C2C36"/>
        <stop offset="1" stop-color="#141418"/>
      </linearGradient>
    </defs>
    <rect width="${size}" height="${size}" rx="${r}" fill="url(#bg)"/>
    <g transform="translate(${off} ${off}) scale(${s}) translate(-12 -12)">
      ${glyph(2.1)}
    </g>
  </svg>`
}

// --- Installer art: full-bleed dark gradient with the glyph ---
function bannerSvg(w, h, glyphScale, cx, cy) {
  const s = (Math.min(w, h) * glyphScale) / 24
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"
    xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#2C2C36"/>
        <stop offset="1" stop-color="#141418"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/>
    <g transform="translate(${cx} ${cy}) scale(${s}) translate(-12 -12)">
      ${glyph(2.1)}
    </g>
  </svg>`
}

const png = (svg, size) =>
  sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()

// --- ICO assembly (ICO entries may be PNG-encoded) ---
function encodeICO(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)
  const dir = Buffer.alloc(16 * entries.length)
  let offset = 6 + 16 * entries.length
  entries.forEach(({ size, buf }, idx) => {
    const o = idx * 16
    dir[o] = size >= 256 ? 0 : size
    dir[o + 1] = size >= 256 ? 0 : size
    dir.writeUInt16LE(1, o + 4)
    dir.writeUInt16LE(32, o + 6)
    dir.writeUInt32LE(buf.length, o + 8)
    dir.writeUInt32LE(offset, o + 12)
    offset += buf.length
  })
  return Buffer.concat([header, dir, ...entries.map((e) => e.buf)])
}

// --- 24-bit BMP writer (NSIS header/sidebar images must be BMP) ---
async function writeBmp(svg, w, h, outPath) {
  const { data } = await sharp(Buffer.from(svg))
    .resize(w, h)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const rowSize = Math.ceil((w * 3) / 4) * 4
  const pixels = Buffer.alloc(rowSize * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 3
      const dst = (h - 1 - y) * rowSize + x * 3 // BMP rows are bottom-up
      pixels[dst] = data[src + 2] // B
      pixels[dst + 1] = data[src + 1] // G
      pixels[dst + 2] = data[src] // R
    }
  }
  const fileHeader = Buffer.alloc(14)
  fileHeader.write('BM', 0)
  fileHeader.writeUInt32LE(54 + pixels.length, 2)
  fileHeader.writeUInt32LE(54, 10)
  const infoHeader = Buffer.alloc(40)
  infoHeader.writeUInt32LE(40, 0)
  infoHeader.writeInt32LE(w, 4)
  infoHeader.writeInt32LE(h, 8)
  infoHeader.writeUInt16LE(1, 12)
  infoHeader.writeUInt16LE(24, 14)
  infoHeader.writeUInt32LE(pixels.length, 20)
  infoHeader.writeInt32LE(2835, 24)
  infoHeader.writeInt32LE(2835, 28)
  writeFileSync(outPath, Buffer.concat([fileHeader, infoHeader, pixels]))
}

const main = async () => {
  // App icons
  writeFileSync(join(iconDir, '32x32.png'), await png(appIconSvg(32), 32))
  writeFileSync(join(iconDir, '128x128.png'), await png(appIconSvg(128), 128))
  writeFileSync(
    join(iconDir, '128x128@2x.png'),
    await png(appIconSvg(256), 256),
  )
  writeFileSync(join(iconDir, 'icon.png'), await png(appIconSvg(512), 512))

  const icoSizes = [16, 32, 48, 64, 128, 256]
  const entries = []
  for (const size of icoSizes) {
    entries.push({ size, buf: await png(appIconSvg(size), size) })
  }
  writeFileSync(join(iconDir, 'icon.ico'), encodeICO(entries))

  // Installer branding (NSIS): header 150x57, sidebar 164x314
  await writeBmp(
    bannerSvg(150, 57, 1.2, 30, 28),
    150,
    57,
    join(iconDir, 'installer-header.bmp'),
  )
  await writeBmp(
    bannerSvg(164, 314, 1.7, 82, 96),
    164,
    314,
    join(iconDir, 'installer-sidebar.bmp'),
  )

  console.log('Icons + installer art written to src-tauri/icons/')
}

main()
