// ถ่ายภาพร่างหน้าหลัก (default, a, b, c) ที่ 400×620 ลง docs/variants/home/ (FRONT_RULES "home variants")
//
// ไม่เพิ่ม dependency ให้โปรเจกต์: ใช้ playwright-core + Chrome for Testing ที่มีอยู่ในเครื่องแล้ว (จาก npx cache / ms-playwright)
//   PW_CORE=<dir ของ node_modules/playwright-core>   ถ้าหาเองไม่เจอ
//   CHROME=<path binary>                              ถ้าหาเองไม่เจอ
//   BASE=http://localhost:5191                        vite ที่รันอยู่ (ห้ามใช้ 5173/5180 ของผู้ใช้)  → npx vite --port 5191
//   OUT=<โฟลเดอร์ปลายทาง>                            default docs/variants/home ของรีโป
//   AVATAR=<ชื่อน้อง>                                 ตัวที่เลือกอยู่ในภาพ (default: miku ถ้ามี)
//
// daemon ปลอม: ดัก http://localhost:7777/wai/* ในเบราว์เซอร์ (page.route) ไม่เปิดพอร์ตจริง ไม่ชน daemon ของผู้ใช้
// รูปตัวละครใช้ของจริงจาก ~/.waikusa/avatars/<name>/<mood>.png ถ้ามี (ไม่ก็วาด SVG แทน) สติ๊กเกอร์ตัวอย่างใช้รูป mood forgive
// ภาพถ่ายด้วย prefers-reduced-motion: reduce ให้เนื้อหาโชว์ครบทันที (ไม่ติด fx-render/CRT กลางคัน)

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.BASE ?? 'http://localhost:5191'
const OUT = resolve(process.env.OUT ?? join(HERE, '../../../docs/variants/home'))
const WIDTH = 400
const HEIGHT = 620

// ---------- หา playwright-core + Chrome ----------
function findPlaywright() {
  const tries = [
    () => createRequire(import.meta.url)('playwright-core'),
    () => process.env.PW_CORE && createRequire(join(process.env.PW_CORE, 'package.json'))('playwright-core'),
    () => {
      const npx = join(homedir(), '.npm/_npx')
      for (const d of existsSync(npx) ? readdirSync(npx) : []) {
        const p = join(npx, d, 'node_modules/playwright-core')
        if (existsSync(join(p, 'package.json'))) return createRequire(join(p, 'package.json'))('playwright-core')
      }
    },
  ]
  for (const t of tries) {
    try {
      const pw = t()
      if (pw?.chromium) return pw
    } catch {
      /* ลองอันถัดไป */
    }
  }
  throw new Error('หา playwright-core ไม่เจอ ตั้ง PW_CORE=<dir> หรือ npx playwright-core ก่อน')
}

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME
  const cache = join(homedir(), 'Library/Caches/ms-playwright')
  const dirs = existsSync(cache) ? readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort() : []
  for (const d of dirs.reverse()) {
    for (const mac of ['chrome-mac-arm64', 'chrome-mac']) {
      const p = join(cache, d, mac, 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')
      if (existsSync(p)) return p
    }
  }
  throw new Error('หา Chrome for Testing ไม่เจอ ตั้ง CHROME=<path>')
}

// ---------- daemon ปลอม ----------
const AVATAR_DIR = join(homedir(), '.waikusa/avatars')
const MOODS = ['angry', 'sad', 'confused', 'forgive', 'default']

function loadAvatars() {
  const items = [{ name: 'jason', label: 'jason', kind: 'builtin', moods: [] }]
  if (!existsSync(AVATAR_DIR)) return items
  for (const name of readdirSync(AVATAR_DIR).sort()) {
    const dir = join(AVATAR_DIR, name)
    if (!statSync(dir).isDirectory()) continue
    const moods = MOODS.filter((m) => existsSync(join(dir, `${m}.png`)))
    if (moods.length) items.push({ name, label: name, kind: 'user', moods })
  }
  return items
}

/** รูป fallback ถ้าไม่มีไฟล์จริง: วงกลมสี + ตา (ไม่ใช่ของแบรนด์ไหน) */
function stubSvg(name) {
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="55" r="38" fill="hsl(${hue} 70% 55%)" stroke="white" stroke-width="4"/><circle cx="38" cy="50" r="5" fill="#111"/><circle cx="62" cy="50" r="5" fill="#111"/><path d="M38 68 Q50 76 62 68" stroke="#111" stroke-width="3" fill="none"/></svg>`
}

function avatarFile(name, mood) {
  const dir = join(AVATAR_DIR, name)
  for (const m of [mood, 'default', 'confused', ...MOODS]) {
    const p = join(dir, `${m}.png`)
    if (existsSync(p)) return p
  }
  return null
}

function makeDaemon(avatars, current) {
  const state = { enabled: true, pending: 2, monitor: false, avatar: current, stickerStyle: 'photo' }
  const today = new Date()
  const iso = (minAgo) => new Date(today.getTime() - minAgo * 60_000).toISOString()
  // สติ๊กเกอร์ตัวอย่าง: ใช้รูป mood ของน้องที่มีจริง (ของจริงจะเป็นรูปคนไหว้ตัดฉากหลัง)
  const stickers = avatars
    .filter((a) => a.kind === 'user')
    .flatMap((a) => ['forgive', 'confused'].filter((m) => a.moods.includes(m)).map((m) => `${a.name}-${m}.png`))
    .slice(0, 6)
    .map((file, i) => ({ id: `s${i}`, file, at: iso(12 + i * 47), score: [94, 88, 81, 76, 91, 69][i], level: [3, 2, 2, 1, 3, 1][i] }))

  const status = () => ({
    enabled: state.enabled,
    pending: state.enabled ? state.pending : 0,
    stats: {
      requests: 42,
      passed: 37,
      bypassed: 2,
      today: { wais: 37, passed: 30, beautiful: 9, tokens: 630 },
      total: { wais: 312, passed: 270, beautiful: 71, tokens: 5470 },
      best_score: 96,
    },
    last_seen: { 'claude-code': Date.now() - 90_000 },
    avatar: state.avatar,
    monitor: state.monitor,
  })

  const json = (body) => ({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
  const png = (buf) => ({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: buf })
  const svg = (s) => ({ status: 200, contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' }, body: s })

  const handler = async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname
    if (req.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' } })
    }
    if (path === '/wai/status') return route.fulfill(json(status()))
    if (path === '/wai/queue') return route.fulfill(json({ items: [], state: 'IDLE', fail_count: 0, bypass: false, monitor: state.monitor, avatar: state.avatar }))
    if (path === '/wai/avatars') return route.fulfill(json({ current: state.avatar, items: avatars }))
    if (path === '/wai/stickers') return route.fulfill(json({ items: stickers, style: state.stickerStyle }))
    if (path === '/wai/enabled' && req.method() === 'POST') {
      state.enabled = !!JSON.parse(req.postData() ?? '{}').enabled
      return route.fulfill(json({ ok: true }))
    }
    if (path === '/wai/monitor' && req.method() === 'POST') {
      state.monitor = !!JSON.parse(req.postData() ?? '{}').monitor
      return route.fulfill(json({ ok: true }))
    }
    if (path === '/wai/avatar' && req.method() === 'POST') {
      state.avatar = JSON.parse(req.postData() ?? '{}').name ?? state.avatar
      return route.fulfill(json({ current: state.avatar }))
    }
    if (path === '/wai/sticker-style' && req.method() === 'POST') {
      state.stickerStyle = JSON.parse(req.postData() ?? '{}').style ?? state.stickerStyle
      return route.fulfill(json({ style: state.stickerStyle }))
    }
    let m = path.match(/^\/wai\/avatar\/([^/]+)\/([^/]+)\.png$/)
    if (m) {
      const f = avatarFile(decodeURIComponent(m[1]), m[2])
      return route.fulfill(f ? png(readFileSync(f)) : svg(stubSvg(m[1])))
    }
    m = path.match(/^\/wai\/sticker\/(.+)$/)
    if (m) {
      const [, name, mood] = decodeURIComponent(m[1]).match(/^(.+)-([a-z]+)\.png$/) ?? []
      const f = name ? avatarFile(name, mood) : null
      return route.fulfill(f ? png(readFileSync(f)) : svg(stubSvg(m[1])))
    }
    if (req.method() === 'POST') return route.fulfill(json({ ok: true }))
    return route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: 'not found' })
  }
  return { state, handler }
}

// ---------- ถ่าย ----------
const SHOTS = [
  // ร่างเดิมสูง ~640: ถ่ายที่ 680 (ขนาด window ตอนเปิดของ main) ไม่งั้นแถวสวิตช์โดนบีบ (ดู FRONT_RULES "home variants")
  { variant: 'default', file: 'default', note: 'ร่างเดิม (เทียบ · viewport 680)', height: 680 },
  { variant: 'a', file: 'a', note: 'A · Compact HUD' },
  { variant: 'a', file: 'a-drawer', note: 'A · เปิดลิ้นชักตั้งค่าเร็ว', act: async (page) => page.click('button[aria-expanded]') },
  { variant: 'a', file: 'a-off', note: 'A · ปิดสวิตช์', off: true },
  { variant: 'b', file: 'b', note: 'B · Mascot-first' },
  { variant: 'b', file: 'b-poke', note: 'B · จิ้มน้อง', act: async (page) => page.click('.hv-mascot') },
  { variant: 'b', file: 'b-off', note: 'B · ปิดสวิตช์ (น้องงอน)', off: true },
  { variant: 'c', file: 'c', note: 'C · Dashboard' },
  { variant: 'c', file: 'c-off', note: 'C · ปิดสวิตช์', off: true },
]

async function main() {
  const pw = findPlaywright()
  const chrome = findChrome()
  const avatars = loadAvatars()
  const wanted = process.env.AVATAR ?? 'miku'
  const current = avatars.some((a) => a.name === wanted) ? wanted : avatars.at(-1)?.name ?? 'jason'
  mkdirSync(OUT, { recursive: true })
  console.log(`vite ${BASE} · chrome ${chrome.split('/').slice(-1)[0]} · น้อง ${avatars.map((a) => a.name).join(',')} (เลือก ${current}) · out ${OUT}`)

  const browser = await pw.chromium.launch({ executablePath: chrome, headless: true })
  const rows = []
  for (const shot of SHOTS) {
    const { state, handler } = makeDaemon(avatars, current)
    if (shot.off) state.enabled = false
    const height = shot.height ?? HEIGHT
    const ctx = await browser.newContext({ viewport: { width: WIDTH, height }, deviceScaleFactor: 2, reducedMotion: 'reduce', locale: 'th-TH' })
    const page = await ctx.newPage()
    await page.route(/^http:\/\/localhost:7777\//, handler)
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.goto(`${BASE}/home.html?variant=${shot.variant}`, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => document.querySelector('#root > div') && document.fonts.status === 'loaded')
    // รอ status poll รอบแรก + รูปโหลด
    await page.waitForFunction(() => !document.body.innerText.includes('กำลังต่อ daemon'), null, { timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(600)
    if (shot.act) {
      await shot.act(page)
      await page.waitForTimeout(400)
    }
    const m = await page.evaluate(() => {
      const root = document.querySelector('#root > div')
      return { content: root ? root.scrollHeight : 0, viewport: innerHeight, overflowX: document.documentElement.scrollWidth > innerWidth }
    })
    const file = join(OUT, `${shot.file}.png`)
    await page.screenshot({ path: file })
    rows.push({ shot: shot.file, note: shot.note, viewport: height, contentHeight: m.content, fits: m.content <= height ? 'ok' : `เกิน ${m.content - height}px`, overflowX: m.overflowX ? 'มี' : '-', errors: errors.length })
    await ctx.close()
  }
  await browser.close()
  console.table(rows)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
