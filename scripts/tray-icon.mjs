// Generates the menu bar template icon: a ring with a forward chevron (a "stride").
import { deflateSync } from 'zlib'
import { writeFileSync } from 'fs'

function png(size, draw) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      // 4x4 supersampling for anti-aliasing
      let cov = 0
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) cov += draw((x + (sx + 0.5) / 4) / size, (y + (sy + 0.5) / 4) / size) ? 1 : 0
      const o = y * (size * 4 + 1) + 1 + x * 4
      raw[o + 3] = Math.round((cov / 16) * 255)
    }
  }
  const crc = (buf) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } let r = 0xffffffff; for (const b of buf) r = t[(r ^ b) & 0xff] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

const draw = (x, y) => {
  const dx = x - 0.5, dy = y - 0.5, r = Math.hypot(dx, dy)
  if (r > 0.36 && r < 0.46) return true // ring
  // chevron ">" centred, stroke ~0.1
  const ax = Math.abs(dy)
  const d = Math.abs((x - 0.38) - ax * 0.9) // distance-ish to the two chevron arms
  return ax < 0.17 && d < 0.07
}
writeFileSync('resources/trayTemplate.png', png(16, draw))
writeFileSync('resources/trayTemplate@2x.png', png(32, draw))
