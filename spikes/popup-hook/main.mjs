// SPIKE: daemon :7777 + popup แบบโง่ที่สุด (ยังไม่มีกล้อง ใช้ปุ่ม skip แทนการไหว้)
// ของจริงเป็นงานของ #1 (/app/main) อันนี้แค่พิสูจน์ว่า hook → popup → ปลด ทำงานได้
import { app, BrowserWindow, Menu, nativeImage, screen, Tray } from 'electron'
import { randomUUID } from 'node:crypto'
import http from 'node:http'

const PORT = 7777
const RENDERER_URL = process.env.WAI_RENDERER_URL ?? 'http://localhost:5173/avatar.html'
const WAIT_MS = 55_000 // long-poll รอบละไม่เกิน 60 วิ ตาม contract
const EXPIRE_MS = 300_000 // hook timeout

/** @type {Array<{id:string, source:string, kind:string, session_id:string, agent_label:string, created_at:number}>} */
let queue = []
/** id → ผลที่ตัดสินแล้ว */
const results = new Map()
/** id → long-poll ที่รออยู่ */
const waiters = new Map()

let win = null
let tray = null
// ปิดจาก tray = bypass: ทุกคำขอผ่านทันที (เหมือน WAI_BYPASS=1 แต่สลับได้ตอนรัน)
let enabled = process.env.WAI_BYPASS !== '1'

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay()
  const width = 380
  const height = 600
  win = new BrowserWindow({
    width,
    height,
    x: workArea.x + workArea.width - width - 16,
    y: workArea.y + Math.round((workArea.height - height) / 2),
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.loadURL(RENDERER_URL)
}

/** มีคิว = เด้ง popup, คิวหมด = ซ่อน */
function syncWindow() {
  if (tray) updateTray()
  if (!win) return
  if (queue.length > 0 && !win.isVisible()) win.showInactive()
  if (queue.length === 0 && win.isVisible()) win.hide()
}

function resolve(id, result) {
  queue = queue.filter((q) => q.id !== id)
  results.set(id, result)
  for (const res of waiters.get(id) ?? []) send(res, 200, result)
  waiters.delete(id)
  syncWindow()
}

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*', // renderer รันบน vite :5173
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(body === undefined ? '' : JSON.stringify(body))
}

function readJson(req) {
  return new Promise((ok) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      try {
        ok(JSON.parse(raw || '{}'))
      } catch {
        ok({})
      }
    })
  })
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const [, , route, id] = url.pathname.split('/') // /wai/<route>/<id>
  if (req.method === 'OPTIONS') return send(res, 204)

  // POST /wai/request → { id }
  if (req.method === 'POST' && route === 'request') {
    const body = await readJson(req)
    const item = {
      id: randomUUID(),
      source: body.source ?? 'claude-code',
      kind: body.kind ?? 'prompt',
      session_id: body.session_id ?? 'unknown',
      agent_label: body.agent_label ?? 'Claude Code',
      created_at: Date.now(),
    }
    if (!enabled) {
      results.set(item.id, { passed: true, level: 0, score: 0, action: 'allow' })
      console.log('[wai] bypass', item.agent_label)
      return send(res, 200, { id: item.id })
    }
    queue.push(item)
    console.log('[wai] request', item.id, item.agent_label)
    syncWindow()
    return send(res, 200, { id: item.id })
  }

  // GET /wai/wait/:id → ผล หรือ 202 ถ้ายังไม่ไหว้ (hook วนถามใหม่)
  if (req.method === 'GET' && route === 'wait' && id) {
    if (results.has(id)) return send(res, 200, results.get(id))
    if (!queue.some((q) => q.id === id)) return send(res, 404, { error: 'unknown id' })
    const list = waiters.get(id) ?? []
    list.push(res)
    waiters.set(id, list)
    const t = setTimeout(() => {
      waiters.set(id, (waiters.get(id) ?? []).filter((r) => r !== res))
      send(res, 202, { pending: true })
    }, WAIT_MS)
    res.on('close', () => clearTimeout(t))
    return
  }

  // GET /wai/queue → คิว + state (state/fail_count เป็นฟิลด์ที่ Front ขอเพิ่ม)
  if (req.method === 'GET' && route === 'queue') {
    return send(res, 200, {
      items: queue,
      state: queue.length > 0 ? 'DEMANDING' : 'IDLE',
      fail_count: 0,
      bypass: !enabled,
    })
  }

  // POST /wai/skip/:id  ← SPIKE เท่านั้น แทนการไหว้จริง ไม่อยู่ใน contract
  if (req.method === 'POST' && route === 'skip' && id) {
    if (!queue.some((q) => q.id === id)) return send(res, 404, { error: 'unknown id' })
    console.log('[wai] skip', id)
    resolve(id, { passed: true, level: 1, score: 0, action: 'allow' })
    return send(res, 200, { ok: true })
  }

  send(res, 404, { error: 'not found' })
})

// การ์ดที่ hook ตายไปแล้ว (เกิน 300 วิ) ทิ้งออกจากคิว
setInterval(() => {
  const now = Date.now()
  for (const q of queue) if (now - q.created_at > EXPIRE_MS) resolve(q.id, { passed: false, level: 0, score: 0, action: 'deny' })
}, 5_000)

function setEnabled(next) {
  enabled = next
  // ปิดแล้ว ปล่อยทุกใบที่ค้างอยู่ ไม่ให้ AI ค้าง
  if (!enabled) for (const q of [...queue]) resolve(q.id, { passed: true, level: 0, score: 0, action: 'allow' })
  updateTray()
}

function updateTray() {
  tray.setTitle(enabled ? ' 🙏' : ' 💤') // mac แสดงเป็นตัวหนังสือบน menu bar
  tray.setToolTip(enabled ? 'ไหว้กูซะ: เปิดอยู่' : 'ไหว้กูซะ: ปิดอยู่ (bypass)')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: enabled ? '● ต้องไหว้ก่อนใช้ AI' : '○ ปิดอยู่ AI ใช้ได้เลย', enabled: false },
      { label: `รอไหว้ ${queue.length} ใบ`, enabled: false },
      { type: 'separator' },
      { label: 'เปิดใช้งาน', type: 'checkbox', checked: enabled, click: (i) => setEnabled(i.checked) },
      { label: 'โชว์ popup', click: () => win?.showInactive() },
      { type: 'separator' },
      { label: 'ออก', role: 'quit' },
    ]),
  )
}

app.whenReady().then(() => {
  app.dock?.hide() // เป็นแอป menu bar ไม่ขึ้น Dock
  tray = new Tray(nativeImage.createEmpty()) // SPIKE: ยังไม่มีไอคอน (Windows ต้องมีไอคอนจริง)
  updateTray()
  createWindow()
  server.listen(PORT, '127.0.0.1', () => console.log(`[wai] daemon on http://127.0.0.1:${PORT} → ${RENDERER_URL}`))
})
app.on('window-all-closed', (e) => e.preventDefault()) // daemon อยู่ต่อแม้ไม่มี window
