#!/usr/bin/env node
// รันทั้งชุดด้วยคำสั่งเดียว (macOS / Windows / Linux): vite (renderer) + Electron daemon
//   node scripts/dev.mjs            หรือ  npm run dev   (ที่ root)
// เลือกพอร์ตว่างให้ vite (ชอบ 5173 ก่อน) แล้วส่งเป็น WAI_RENDERER_URL ให้ daemon · Ctrl+C = ปิดทั้งคู่
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import net from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brandElectron } from './brand-electron.mjs' // Dock: ชื่อ "ไหว้กูซะ" + ไอคอนโลโก้ แทน Electron อะตอม (macOS)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RENDERER_DIR = join(ROOT, 'app', 'renderer')
const DAEMON_DIR = join(ROOT, 'spikes', 'popup-hook')
const VITE_BIN = join(RENDERER_DIR, 'node_modules', 'vite', 'bin', 'vite.js')

function fail(msg) {
  console.error(`[dev] ${msg}`)
  process.exit(1)
}
if (!existsSync(VITE_BIN) || !existsSync(join(DAEMON_DIR, 'node_modules', 'electron'))) {
  fail('ยังไม่ได้ติดตั้ง dependency · รัน: npm run setup')
}

try {
  brandElectron({ log: console.log })
} catch {
  /* ตกแต่งอย่างเดียว ไม่ขวางการรัน */
}

const freePort = (preferred) =>
  new Promise((ok) => {
    const tryPort = (port) => {
      const s = net.createServer()
      s.once('error', () => (port === 0 ? ok(0) : tryPort(0)))
      s.listen(port, '127.0.0.1', () => {
        const got = s.address().port
        s.close(() => ok(got))
      })
    }
    tryPort(preferred)
  })

async function waitFor(url, ms = 30_000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return true
    } catch {
      /* ยังไม่พร้อม */
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  return false
}

const port = await freePort(5173)
const url = `http://127.0.0.1:${port}/`
const children = []
let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const c of children) {
    try {
      c.kill()
    } catch {
      /* ตายไปแล้ว */
    }
  }
  setTimeout(() => process.exit(code), 300)
}
process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))

console.log(`[dev] vite → ${url}`)
const vite = spawn(process.execPath, [VITE_BIN, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: RENDERER_DIR,
  stdio: 'inherit',
})
children.push(vite)
vite.on('exit', (code) => {
  if (!stopping) {
    console.error('[dev] vite หยุดทำงาน')
    stop(code ?? 1)
  }
})

if (!(await waitFor(`${url}home.html`))) { // multi-page: ไม่มี index.html ที่ /
  console.error('[dev] vite ไม่ตอบใน 30 วินาที')
  stop(1)
} else {
  const electronPath = createRequire(join(DAEMON_DIR, 'package.json'))('electron') // path ของ binary
  console.log('[dev] เปิด Electron (daemon :7777)')
  const env = { ...process.env, WAI_RENDERER_URL: url }
  delete env.ELECTRON_RUN_AS_NODE // ถ้าค้างมาจาก shell จะเปิดแอปไม่ขึ้น
  const electron = spawn(electronPath, [DAEMON_DIR], { stdio: 'inherit', env })
  children.push(electron)
  electron.on('exit', (code) => {
    if (!stopping) stop(code ?? 0)
  })
}
