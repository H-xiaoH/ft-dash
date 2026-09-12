/**
 * Generates the PWA icon set with no image dependencies.
 *
 * Draws a gradient rounded square with a candlestick glyph, supersampled 3x for
 * antialiasing, then encodes straight RGBA to PNG by hand (IHDR/IDAT/IEND + CRC32).
 *
 *   node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public/icons')
const SS = 3

/* ------------------------------------------------------------------ drawing */

const from = [0x7c, 0x5c, 0xff]
const to = [0x22, 0xd3, 0xee]

/** Candlestick glyph, expressed in a 0..1 unit box. */
const CANDLES = [
  { body: [0.215, 0.38, 0.115, 0.3], wick: [0.2725, 0.245, 0.008, 0.53] },
  { body: [0.4425, 0.27, 0.115, 0.32], wick: [0.5, 0.155, 0.008, 0.55] },
  { body: [0.67, 0.43, 0.115, 0.36], wick: [0.7275, 0.295, 0.008, 0.58] },
]

function lerp(a, b, t) {
  return a + (b - a) * t
}

function insideRoundRect(x, y, size, radius) {
  if (radius <= 0) return x >= 0 && y >= 0 && x < size && y < size
  const cx = Math.min(Math.max(x, radius), size - radius)
  const cy = Math.min(Math.max(y, radius), size - radius)
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= radius * radius
}

function insideRect(x, y, rect, scale, offset) {
  const [rx, ry, rw, rh] = rect
  const x0 = offset + rx * scale
  const y0 = offset + ry * scale
  return x >= x0 && x < x0 + rw * scale && y >= y0 && y < y0 + rh * scale
}

function render(size, { maskable = false } = {}) {
  const W = size * SS
  const radius = maskable ? 0 : W * 0.235
  // Maskable icons keep the glyph inside the 80% safe zone.
  const scale = maskable ? W * 0.58 : W * 0.82
  const offset = (W - scale) / 2

  const pixels = new Float32Array(W * W * 4)

  for (let y = 0; y < W; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const index = (y * W + x) * 4
      if (!insideRoundRect(x + 0.5, y + 0.5, W, radius)) continue

      const t = (x / W + y / W) / 2
      let r = lerp(from[0], to[0], t)
      let g = lerp(from[1], to[1], t)
      let b = lerp(from[2], to[2], t)

      for (const candle of CANDLES) {
        if (
          insideRect(x + 0.5, y + 0.5, candle.wick, scale, offset) ||
          insideRect(x + 0.5, y + 0.5, candle.body, scale, offset)
        ) {
          r = 255
          g = 255
          b = 255
        }
      }

      pixels[index] = r
      pixels[index + 1] = g
      pixels[index + 2] = b
      pixels[index + 3] = 255
    }
  }

  // Downsample (box filter) back to the target size.
  const out = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const index = ((y * SS + sy) * W + (x * SS + sx)) * 4
          const alpha = pixels[index + 3] / 255
          r += pixels[index] * alpha
          g += pixels[index + 1] * alpha
          b += pixels[index + 2] * alpha
          a += alpha
        }
      }
      const count = SS * SS
      const outIndex = (y * size + x) * 4
      if (a > 0) {
        out[outIndex] = Math.round(r / a)
        out[outIndex + 1] = Math.round(g / a)
        out[outIndex + 2] = Math.round(b / a)
      }
      out[outIndex + 3] = Math.round((a / count) * 255)
    }
  }

  return out
}

/* --------------------------------------------------------------- PNG writer */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let crc = -1
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData), 0)
  return Buffer.concat([length, typeAndData, crc])
}

function encodePng(rgba, size) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  // Each scanline is prefixed with filter type 0 (None).
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* --------------------------------------------------------------------- main */

mkdirSync(OUT_DIR, { recursive: true })

const targets = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
]

for (const target of targets) {
  const png = encodePng(render(target.size, { maskable: target.maskable }), target.size)
  writeFileSync(resolve(OUT_DIR, target.file), png)
  console.log(`✓ ${target.file} (${target.size}×${target.size}, ${png.length} bytes)`)
}

// Favicon as SVG so it stays crisp at any size.
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7c5cff"/>
      <stop offset="1" stop-color="#22d3ee"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="15" fill="url(#g)"/>
  <g fill="#fff">
    <rect x="18.5" y="24" width="7" height="19" rx="1.6"/>
    <rect x="28.5" y="17" width="7" height="21" rx="1.6"/>
    <rect x="38.5" y="27" width="7" height="23" rx="1.6"/>
  </g>
  <g stroke="#fff" stroke-width="2" stroke-linecap="round">
    <line x1="22" y1="16" x2="22" y2="50"/>
    <line x1="32" y1="10" x2="32" y2="45"/>
    <line x1="42" y1="19" x2="42" y2="56"/>
  </g>
</svg>
`
writeFileSync(resolve(OUT_DIR, '../favicon.svg'), favicon)
console.log('✓ favicon.svg')
