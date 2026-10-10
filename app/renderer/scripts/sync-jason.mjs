// copy น้อง Jason จาก characters/jason/moods มาไว้ใน src/mascot/assets แล้วเปลี่ยนสีให้ตรง token (FRONT_RULES §5)
// รันใหม่ทุกครั้งที่ทีมวาดแก้ไฟล์ใน characters/jason:  node scripts/sync-jason.mjs
//
// - ใช้แค่ moods/jason-<state>.svg (CSS animation มี reduced-motion อยู่แล้ว)
//   ไม่ใช้ line/ เพราะมี SMIL <animate> ที่ปิดด้วย prefers-reduced-motion ไม่ได้
// - ไม่ใช้ moods/jason-opus-*.svg เพราะฝังป้ายชื่อโมเดล "Opus 5.5" ไว้ในตัวน้อง (ป้าย provider ต้องมาจากข้อมูล)
// - ไม่ใช้ logos.json (ห้ามโลโก้แบรนด์ AI §5)
// - เส้นหมึกดำ → สี text เพราะ window โปร่งใส ลอยบนจอมืด/สว่าง (เงาใส่ทาง CSS)
// - สร้างไฟล์ -still ที่ไม่มี animation สำหรับ IDLE และน้องตัวเล็กบนการ์ด (§5 ห้าม animation วนตอนว่าง)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SRC = new URL('../../../characters/jason/moods/', import.meta.url)
const OUT = new URL('../src/mascot/assets/', import.meta.url)

// ค่าเดียวกับ src/theme/tokens.ts (ถ้า token เปลี่ยน แก้ตรงนี้แล้วรันใหม่)
const RECOLOR = {
  '#1d1b18': '#F2F2F2', // หมึก → text
  '#facc15': '#FFD54A', // ทอง → blessed
  '#f472b6': '#FFD54A', // ชมพู (forgive) → blessed
  '#dc2626': '#FF0040', // แดง → danger
  '#f97316': '#FF2A2A', // ส้ม (rage_quit) → hud
  '#9ca3af': '#8A8A99', // เทา → sulk
  '#60a5fa': '#9A9AA5', // ฟ้า (เหงื่อ retry) → textDim
}
const ALLOWED = new Set(Object.values(RECOLOR).map((h) => h.toLowerCase()))

const MOODS = ['neutral', 'demanding', 'watching', 'passed', 'retry', 'annoyed', 'sulking', 'rage_quit', 'forgive']
const STILL = new Set(['neutral', 'watching'])
const NO_MOTION = '<style>*{animation:none!important}</style>'

mkdirSync(OUT, { recursive: true })
for (const mood of MOODS) {
  let svg = readFileSync(new URL(`jason-${mood}.svg`, SRC), 'utf8')
  for (const [from, to] of Object.entries(RECOLOR)) svg = svg.replaceAll(new RegExp(from, 'gi'), to)
  const stray = (svg.match(/#[0-9a-f]{3,8}\b/gi) ?? []).filter((h) => !ALLOWED.has(h.toLowerCase()))
  if (stray.length) throw new Error(`jason-${mood}.svg มีสีนอก token: ${[...new Set(stray)].join(', ')}`)
  if (/<image|href=/i.test(svg)) throw new Error(`jason-${mood}.svg มีรูป/ลิงก์ฝังอยู่ ตรวจก่อนว่าไม่ใช่โลโก้`)
  writeFileSync(new URL(`jason-${mood}.svg`, OUT), svg)
  if (STILL.has(mood)) writeFileSync(new URL(`jason-${mood}-still.svg`, OUT), svg.replace('</svg>', `${NO_MOTION}</svg>`))
}
console.log(`ok copy ${MOODS.length} mood → ${fileURLToPath(OUT)}`)
