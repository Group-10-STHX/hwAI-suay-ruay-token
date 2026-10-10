#!/usr/bin/env node
// วาดไอคอน tray / shortcut แบบไม่พึ่ง dependency (เขียน PNG เองด้วย zlib) · รันใหม่: node spikes/popup-hook/assets/make-icons.mjs
// ลาย: วงกลมสี + มือพนม (หยดน้ำชี้ขึ้นสีขาว มีเส้นแบ่งกลาง) · off = สีเทา
// ได้: tray.png/tray@2x.png (16/32), tray-off.png/tray-off@2x.png, icon.ico (16/32/48/256 = shortcut + tray Windows), tray-off.ico
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const OUT = dirname(fileURLToPath(import.meta.url))

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
/** rgba: Uint8Array(size*size*4) → PNG */
function png(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter none
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** ICO ที่ฝัง PNG (Vista+ อ่านได้ทุกขนาด) */
function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length)
  head.writeUInt16LE(0, 0)
  head.writeUInt16LE(1, 2) // type icon
  head.writeUInt16LE(images.length, 4)
  let offset = head.length
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i
    head[e] = size >= 256 ? 0 : size
    head[e + 1] = size >= 256 ? 0 : size
    head.writeUInt16LE(1, e + 4) // planes
    head.writeUInt16LE(32, e + 6) // bpp
    head.writeUInt32LE(data.length, e + 8)
    head.writeUInt32LE(offset, e + 12)
    offset += data.length
  })
  return Buffer.concat([head, ...images.map((i) => i.data)])
}

// พิกัด 0..1 · คืน [r,g,b,a] ของจุดนั้น
function shade(x, y, bg) {
  const dx = x - 0.5
  const dy = y - 0.5
  if (dx * dx + dy * dy > 0.47 * 0.47) return null // นอกวง
  // มือพนม: หยดน้ำชี้ขึ้น ปลายบน y=0.18 ฐานโค้ง y≈0.80
  const top = 0.18
  const bottom = 0.8
  if (y >= top && y <= bottom) {
    const t = (y - top) / (bottom - top) // 0 ที่ปลาย → 1 ที่ฐาน
    const half = 0.17 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.5) * (t > 0.85 ? Math.sqrt(Math.max(0, 1 - ((t - 0.85) / 0.15) ** 2)) : 1)
    if (Math.abs(dx) <= half) {
      if (Math.abs(dx) < 0.018 && t > 0.12) return bg // ร่องระหว่างมือ
      return [255, 255, 255, 255]
    }
  }
  return bg
}

function draw(size, bg) {
  const SS = 4 // supersample กันขอบแตก
  const out = new Uint8Array(size * size * 4)
  for (let py = 0; py < size; py++)
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const c = shade((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, bg)
          if (!c) continue
          r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3]
        }
      const i = (py * size + px) * 4
      if (a > 0) {
        out[i] = Math.round(r / a)
        out[i + 1] = Math.round(g / a)
        out[i + 2] = Math.round(b / a)
      }
      out[i + 3] = Math.round(a / (SS * SS))
    }
  return png(size, out)
}

const ON = [220, 38, 38, 255] // แดง
const OFF = [113, 113, 122, 255] // เทา
for (const [name, bg] of [['tray', ON], ['tray-off', OFF]]) {
  writeFileSync(join(OUT, `${name}.png`), draw(16, bg))
  writeFileSync(join(OUT, `${name}@2x.png`), draw(32, bg))
}
const icoOf = (bg) => ico([16, 32, 48, 256].map((size) => ({ size, data: draw(size, bg) })))
writeFileSync(join(OUT, 'icon.ico'), icoOf(ON)) // ชื่อเรียงก่อน tray-off.ico → install-shortcut.ps1 หยิบตัวนี้
writeFileSync(join(OUT, 'tray-off.ico'), icoOf(OFF))
console.log('เขียนไอคอนแล้วที่', OUT)
