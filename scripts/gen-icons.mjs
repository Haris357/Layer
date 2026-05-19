import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const iconDir = join(root, 'src-tauri', 'icons')
mkdirSync(iconDir, { recursive: true })

const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function renderRGBA(size) {
  const px = Buffer.alloc(size * size * 4)
  const radius = size * 0.22
  const inCorner = (x, y) => {
    const cx = x < radius ? radius : x > size - radius ? size - radius : x
    const cy = y < radius ? radius : y > size - radius ? size - radius : y
    return Math.hypot(x - cx, y - cy) <= radius
  }
  const barW = size * 0.16
  const lx = size * 0.34
  const lTop = size * 0.26
  const lBottom = size * 0.74
  const lRight = size * 0.66
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const inside = inCorner(x + 0.5, y + 0.5)
      const t = (x + y) / (2 * size)
      let r = Math.round(26 - t * 13)
      let g = Math.round(26 - t * 13)
      let b = Math.round(31 - t * 15)
      const onVert = x >= lx && x <= lx + barW && y >= lTop && y <= lBottom
      const onHorz = y >= lBottom - barW && y <= lBottom && x >= lx && x <= lRight
      if (onVert || onHorz) {
        r = 255
        g = 255
        b = 255
      }
      px[i] = r
      px[i + 1] = g
      px[i + 2] = b
      px[i + 3] = inside ? 255 : 0
    }
  }
  return px
}

function encodePNG(size) {
  const rgba = renderRGBA(size)
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const idat = deflateSync(raw, { level: 9 })
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function encodeICO(sizes) {
  const pngs = sizes.map((s) => encodePNG(s))
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(sizes.length, 4)
  const dir = Buffer.alloc(16 * sizes.length)
  let offset = 6 + 16 * sizes.length
  sizes.forEach((s, idx) => {
    const o = idx * 16
    dir[o] = s >= 256 ? 0 : s
    dir[o + 1] = s >= 256 ? 0 : s
    dir[o + 2] = 0
    dir[o + 3] = 0
    dir.writeUInt16LE(1, o + 4)
    dir.writeUInt16LE(32, o + 6)
    dir.writeUInt32LE(pngs[idx].length, o + 8)
    dir.writeUInt32LE(offset, o + 12)
    offset += pngs[idx].length
  })
  return Buffer.concat([header, dir, ...pngs])
}

writeFileSync(join(iconDir, '32x32.png'), encodePNG(32))
writeFileSync(join(iconDir, '128x128.png'), encodePNG(128))
writeFileSync(join(iconDir, '128x128@2x.png'), encodePNG(256))
writeFileSync(join(iconDir, 'icon.png'), encodePNG(512))
writeFileSync(join(iconDir, 'icon.ico'), encodeICO([16, 32, 48, 64, 128, 256]))

console.log('Icons generated in src-tauri/icons/')
