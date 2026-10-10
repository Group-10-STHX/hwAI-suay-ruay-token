// SPIKE: daemon :7777 + popup + กล้องตรวจไหว้ (vision/worker) ปุ่ม skip ยังอยู่ไว้ dev
// ของจริงเป็นงานของ #1 (/app/main) อันนี้แค่พิสูจน์ว่า hook → popup → ปลด ทำงานได้
import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, systemPreferences, Tray } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { codexTrusted, install, installed, SANDBOX, uninstall } from './install-hooks.mjs'
import { createSessions, planVision } from './session-state.mjs' // state machine ต่อ session (contract §4)
import { FLEE, homePosition, nextPosition, stepToward } from './flee.mjs' // หนีเมาส์ช่วง ANNOYED (pure, มีเทส)
import { createWaiLog } from './wai-log.mjs' // ~/.waikusa/wais.jsonl + สถิติ + sync ขึ้นเว็บ (contract §2, §3)
import { randomUUID } from 'node:crypto'
import http from 'node:http'

const HERE = dirname(fileURLToPath(import.meta.url))
// WAI_DEV_INSTANCE=1: ตัวที่สองไว้ลองของ รันคู่กับตัวจริงได้ (userData/โฟลเดอร์ daemon แยก, ไม่เปิดกล้อง, ไม่ sync เว็บ)
// ต้องตั้ง userData ก่อน requestSingleInstanceLock (lock ผูกกับ userData) · ใช้คู่กับ WAI_PORT=7778
const DEV_INSTANCE = process.env.WAI_DEV_INSTANCE === '1'
const DEV_DIR = join(tmpdir(), 'wai-dev-instance')
if (DEV_INSTANCE) app.setPath('userData', join(DEV_DIR, 'userData'))
// ตอน dev ติด hook แค่ใน ~/wai-sandbox · แอปที่ package แล้วค่อย global (ผู้ใช้ติ๊กเองใน onboarding)
const SCOPE = process.env.WAI_HOOK_SCOPE ?? (app.isPackaged ? 'global' : 'sandbox')
const SHORTCUT = join(homedir(), 'Applications', 'ไหว้กูซะ.app')
const WAI_HOME = process.env.WAI_HOME ?? (DEV_INSTANCE ? join(DEV_DIR, 'waikusa') : join(homedir(), '.waikusa')) // โฟลเดอร์ของ daemon: config.json, wais.jsonl
const CONFIG = join(WAI_HOME, 'config.json')

function readConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG, 'utf8'))
  } catch {
    return {}
  }
}
function saveConfig(patch) {
  mkdirSync(dirname(CONFIG), { recursive: true })
  writeFileSync(CONFIG, JSON.stringify({ ...readConfig(), ...patch }, null, 2))
}
const CODEX_CLI = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex' // มากับแอป ChatGPT/Codex
const PORT = Number(process.env.WAI_PORT) || 7777
// dev: vite (:5173) · แอปจาก shortcut: ไฟล์ที่ build แล้ว (WAI_RENDERER_URL=file://.../dist/)
const RENDERER = process.env.WAI_RENDERER_URL ?? 'http://localhost:5173/'
const WAIT_MS = 55_000 // long-poll รอบละไม่เกิน 60 วิ ตาม contract
const EXPIRE_MS = 300_000 // hook timeout
// หน้าต่างกล้องที่ซ่อนอยู่ ใช้ heuristic ของ Vision (vision/wai-heuristic.js)
const VISION_PAGE = join(HERE, '..', '..', 'vision', 'worker', 'index.html')

/** @type {Array<{id:string, source:string, kind:string, session_id:string, agent_label:string, created_at:number}>} */
let queue = []
/** id → ผลที่ตัดสินแล้ว */
const results = new Map()
/** id → long-poll ที่รออยู่ */
const waiters = new Map()

let win = null
let home = null
let vision = null
let tray = null
// สถิติให้หน้าหลัก (หายเมื่อปิดแอป)
const stats = { requests: 0, passed: 0, bypassed: 0 }
/** source → เวลาที่เห็นคำขอล่าสุด ใช้บอกว่าต่อ Claude Code / Codex ได้แล้ว */
const lastSeen = {}
// ปิดจาก tray = bypass: ทุกคำขอผ่านทันที (เหมือน WAI_BYPASS=1 แต่สลับได้ตอนรัน)
let enabled = process.env.WAI_BYPASS !== '1'
// ความโกรธต่อ session_id (RETRY/ANNOYED/SULKING/RAGE_QUIT/FORGIVE) ตัดสินจาก vision:pass / vision:fail ของหัวคิว
const sessions = createSessions()
// บันทึกการไหว้จริงทุกครั้ง (ผ่าน/ไม่ผ่าน) ไม่บันทึก skip, bypass, หมดเวลา, ปิดแอป
const waiLog = createWaiLog({ home: WAI_HOME, sync: !DEV_INSTANCE })
// ขนาด Avatar window คงที่ตลอด (FRONT_RULES §2) · ตอนหนีเมาส์ก็ setBounds ด้วยค่านี้เสมอ กันขนาดเพี้ยนบน Windows ที่ scale DPI
const AVATAR = Object.freeze({ width: 380, height: 600 })

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay()
  win = new BrowserWindow({
    ...AVATAR,
    ...homePosition(workArea, AVATAR), // ขอบขวา กลางแนวตั้ง
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: { preload: join(HERE, 'preload.cjs') }, // window.wai.onVisionEvent
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.webContents.on('did-finish-load', () => win.webContents.send('wai:flee', fleeSent)) // หน้า reload แล้วไม่หลุด state
  win.loadURL(RENDERER + 'avatar.html')
}

/** หน้าหลัก: เปิดตอนเริ่มแอป ปิดแล้วแอปยังอยู่บน menu bar */
function openHome() {
  if (home) return home.show()
  home = new BrowserWindow({
    width: 420,
    height: 600,
    title: 'ไหว้กูซะ',
    backgroundColor: '#0A0A0C',
    titleBarStyle: 'hiddenInset',
    resizable: false,
    webPreferences: { preload: join(HERE, 'preload.cjs') },
  })
  home.loadURL(RENDERER + 'home.html')
  app.dock?.show()
  home.on('closed', () => {
    home = null
    app.dock?.hide()
  })
}

// ---------- กล้อง: เปิดเฉพาะตอนมีคนรอไหว้ ----------
function createVision() {
  vision = new BrowserWindow({
    show: false,
    webPreferences: { preload: join(HERE, 'vision-preload.cjs'), backgroundThrottling: false },
  })
  vision.webContents.on('console-message', (_e, _level, message) => {
    if (message.startsWith('[vision]')) console.log(message)
  })
  vision.loadFile(VISION_PAGE)
  vision.on('closed', () => (vision = null))
}

/** สั่งกล้องเปิด/ปิดตามคิว + level ขั้นต่ำตาม state ของ session หัวคิว (เรียกทุกครั้งที่คิวหรือ state เปลี่ยน) */
function syncVision() {
  if (!vision || vision.isDestroyed()) return
  const top = queue[0]
  vision.webContents.send('vision:control', {
    run: enabled && queue.length > 0,
    requiredLevel: top ? sessions.requiredLevel(top.session_id) : 1,
  })
}

ipcMain.on('vision:ready', syncVision)

// VisionEvent ส่งต่อให้หน้าจอของ Front (popup + หน้าหลัก)
// WAI_DEBUG_VISION=1 พิมพ์ event ทุก ~2 วิ ไว้ดูว่ากล้องเห็นอะไร
let lastVisionLog = 0
ipcMain.on('vision:event', (_e, event) => {
  if (process.env.WAI_DEBUG_VISION === '1' && Date.now() - lastVisionLog > 2000) {
    lastVisionLog = Date.now()
    console.log('[vision] event', JSON.stringify(event))
  }
  for (const w of [win, home]) if (w && !w.isDestroyed()) w.webContents.send('vision:event', event)
})

// ผลจากกล้องนับให้ session ของคำขอหัวคิว (contract §1, §4) · ตรรกะอยู่ใน planVision (pure, มีเทส)
//   pass ถึง level ที่ต้องการ → ปลดคำขอเก่าสุด 1 ใบ · pass ต่ำกว่า level ที่ต้องการ = นับเป็น fail
//   fail → โกรธขึ้น คำขอรอต่อ (SULKING ก็รอ) · fail ครั้งที่ 6 = RAGE_QUIT ปลดทุกคำขอของ session นั้นด้วย action 'rage_quit'
//   ทุกครั้งลง ~/.waikusa/wais.jsonl · ไม่ย้าย/ลบไฟล์ session ใดๆ ทั้งสิ้น
function onVision(type, payload = {}) {
  const top = queue[0]
  if (!enabled || !top) return
  const plan = planVision(sessions, top, type, payload)
  console.log(`[wai] ${type} ${top.id} level ${payload.level} score ${payload.score} → ${plan.action} (${plan.state} anger ${plan.anger}${plan.forgave ? ' forgave' : ''})`)
  waiLog.record(plan.record)
  if (!plan.resolve) return syncWindow() // ยังไม่ปลด แต่ state เปลี่ยน → ส่ง requiredLevel ใหม่ให้กล้อง
  const ids = plan.releaseSession ? queue.filter((q) => q.session_id === top.session_id).map((q) => q.id) : [top.id]
  for (const id of ids) resolve(id, plan.resolve)
}
ipcMain.on('vision:pass', (_e, payload) => onVision('pass', payload))
ipcMain.on('vision:fail', (_e, payload) => onVision('fail', payload))

/** มีคิว = เด้ง popup, คิวหมด = ซ่อน */
function syncWindow() {
  if (queue[0]) sessions.demand(queue[0].session_id) // หัวคิวใบใหม่: PASSED → DEMANDING, RAGE_QUIT → FORGIVE
  if (tray) updateTray()
  syncVision()
  if (!win) return
  if (queue.length > 0 && !win.isVisible()) win.showInactive()
  if (queue.length === 0 && win.isVisible()) win.hide()
  syncFlee()
}

// ---------- หนีเมาส์ (FRONT_RULES §4): ช่วง ANNOYED ตัว popup วิ่งหนีเคอร์เซอร์ ----------
// renderer มองไม่เห็นเมาส์นอก window เลยทำใน main: timer ~30 fps อ่าน cursor → nextPosition (flee.mjs) → setBounds
// timer มีเฉพาะตอนหนี + ตอน glide กลับที่เดิม · IDLE/คิวว่าง ไม่มี timer (FRONT_RULES: ห้ามวนไม่จบตอนไม่มีคำขอ)
// ส่ง 'wai:flee' {active, fleeing} ให้ Avatar window เฉพาะตอนค่าเปลี่ยน
//   active  = โหมดหนีเปิดอยู่ (หัวคิว ANNOYED และไม่ได้ปิดไว้) · fleeing = window ขยับภายใน ~300ms ล่าสุด (ขากลับบ้านไม่นับ)
// ปิดได้: WAI_NO_FLEE=1 (เริ่มแบบปิด) หรือ tray ติ๊ก "หนีเมาส์" ออก (เวลาต้องกดปุ่มข้าม dev)
let fleeOn = process.env.WAI_NO_FLEE !== '1'
let fleeTimer = null
let fleeMem = {}
let fleeSent = { active: false, fleeing: false }
let fleeDisplaced = false // หนีจนออกจากที่เดิมแล้ว ต้องพากลับ (ไม่แตะตำแหน่งถ้าไม่ได้หนี)
const DEBUG_FLEE = process.env.WAI_DEBUG_FLEE === '1'
// ตัวลองของเท่านั้น: WAI_DEV_CURSOR="x,y" แทนเมาส์จริง ไว้ทดสอบโดยไม่ต้องขยับเมาส์ของคนใช้เครื่อง
const DEV_CURSOR = DEV_INSTANCE && /^-?\d+,-?\d+$/.test(process.env.WAI_DEV_CURSOR ?? '') ? (([x, y]) => ({ x, y }))(process.env.WAI_DEV_CURSOR.split(',').map(Number)) : null

function fleeWanted() {
  const top = queue[0]
  return Boolean(fleeOn && enabled && top && win && !win.isDestroyed() && win.isVisible() && sessions.get(top.session_id).state === 'ANNOYED')
}

function sendFlee(active, fleeing) {
  if (active === fleeSent.active && fleeing === fleeSent.fleeing) return
  fleeSent = { active, fleeing }
  if (DEBUG_FLEE) console.log('[flee] send', JSON.stringify(fleeSent))
  if (win && !win.isDestroyed()) win.webContents.send('wai:flee', fleeSent)
}

/** หน้าต่างที่ห้ามบัง: กล้อง (ถ้าโผล่มา) ห้ามเด็ดขาด · หน้าหลักพยายามไม่บัง (soft) */
function fleeAvoid() {
  const out = []
  if (vision && !vision.isDestroyed() && vision.isVisible()) out.push(vision.getBounds())
  if (home && !home.isDestroyed() && home.isVisible() && !home.isMinimized()) out.push({ ...home.getBounds(), soft: true })
  return out
}

const placeAvatar = ({ x, y }) => win.setBounds({ x, y, ...AVATAR }) // ขนาดคงที่เสมอ
/** ที่พักของ popup บนจอที่ window อยู่ตอนนี้ (ไม่ข้ามจอ) */
const avatarHome = () => homePosition(screen.getDisplayMatching(win.getBounds()).workArea, AVATAR)

function stopFleeTimer() {
  if (!fleeTimer) return
  clearInterval(fleeTimer)
  fleeTimer = null
  if (DEBUG_FLEE) console.log('[flee] timer stop')
}

function startFleeTimer() {
  if (fleeTimer) return
  fleeTimer = setInterval(fleeTick, FLEE.TICK_MS)
  if (DEBUG_FLEE) console.log('[flee] timer start')
}

/** เรียกทุกครั้งที่คิว/state/สวิตช์เปลี่ยน (ผ่าน syncWindow) */
function syncFlee() {
  if (!win || win.isDestroyed()) return stopFleeTimer()
  if (fleeWanted()) {
    sendFlee(true, fleeSent.fleeing)
    return startFleeTimer()
  }
  fleeMem = {}
  sendFlee(false, false)
  if (!fleeDisplaced) return stopFleeTimer()
  if (win.isVisible()) return startFleeTimer() // ยังเห็นอยู่ (เช่น ANNOYED → SULKING): ค่อยๆ glide กลับ แล้ว timer หยุดเอง
  stopFleeTimer() // ซ่อนอยู่ (คิวหมด): วางกลับที่เดิมทันที ไม่ต้อง animate
  const h = avatarHome()
  placeAvatar(h)
  fleeDisplaced = false
  if (DEBUG_FLEE) console.log(`[flee] home ${h.x},${h.y} (hidden, snap)`)
}

function fleeTick() {
  if (!win || win.isDestroyed()) return stopFleeTimer()
  const b = win.getBounds()
  const { workArea } = screen.getDisplayMatching(b)
  if (fleeWanted()) {
    const r = nextPosition({
      cursor: DEV_CURSOR ?? screen.getCursorScreenPoint(),
      bounds: { x: b.x, y: b.y, ...AVATAR },
      workArea,
      avoid: fleeAvoid(),
      now: Date.now(),
      mem: fleeMem,
    })
    fleeMem = r.mem
    if (r.x !== b.x || r.y !== b.y) {
      placeAvatar(r)
      fleeDisplaced = true
      if (DEBUG_FLEE) console.log(`[flee] ${r.jumped ? 'jump' : 'move'} ${b.x},${b.y} → ${r.x},${r.y}`)
    }
    return sendFlee(true, r.fleeing)
  }
  sendFlee(false, false)
  if (!fleeDisplaced) return stopFleeTimer()
  const h = homePosition(workArea, AVATAR)
  const p = win.isVisible() ? stepToward(b, h) : h // ซ่อนอยู่ก็วางทีเดียว
  placeAvatar(p)
  if (p.x === h.x && p.y === h.y) {
    fleeDisplaced = false
    stopFleeTimer()
    if (DEBUG_FLEE) console.log(`[flee] home ${h.x},${h.y}`)
  }
}

function resolve(id, result) {
  // level 0 = ถูกปล่อยตอนปิดแอป · ไม่ผ่าน (deny/rage_quit) ไม่นับทั้งคู่
  if (queue.some((q) => q.id === id) && result.passed) result.level > 0 ? stats.passed++ : stats.bypassed++
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
    stats.requests++
    lastSeen[item.source] = Date.now()
    if (!enabled) {
      stats.bypassed++
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

  // GET /wai/queue → คิว + state/fail_count จริงของ session หัวคิว (contract §4) · ไม่มีคิว = IDLE
  if (req.method === 'GET' && route === 'queue') {
    const top = queue[0] ? sessions.get(queue[0].session_id) : null
    return send(res, 200, {
      items: queue,
      state: top ? top.state : 'IDLE',
      fail_count: top ? top.fails : 0,
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

  // POST /wai/dev/fail · /wai/dev/pass ← WAI_DEV_INSTANCE เท่านั้น (ไม่มีกล้อง) ไว้ดัน state เช่นให้ถึง ANNOYED แล้วดูหนีเมาส์
  if (DEV_INSTANCE && req.method === 'POST' && route === 'dev' && (id === 'fail' || id === 'pass')) {
    if (!queue[0]) return send(res, 409, { error: 'queue empty' })
    onVision(id, id === 'pass' ? { level: 3, score: 90, holdMs: 1100 } : { level: 1, score: 30, holdMs: 400, reasons: ['HANDS_TOO_LOW'] })
    const top = queue[0] ? sessions.get(queue[0].session_id) : null
    return send(res, 200, { state: top ? top.state : 'IDLE', fail_count: top ? top.fails : 0 })
  }

  // GET /wai/status ← หน้าหลัก (contract §5): requests/passed/bypassed ของรอบนี้ + today/total/best_score จาก wais.jsonl
  if (req.method === 'GET' && route === 'status') {
    return send(res, 200, { enabled, pending: queue.length, stats: { ...stats, ...waiLog.stats() }, last_seen: lastSeen })
  }

  // POST /wai/enabled { enabled } ← สวิตช์ในหน้าหลัก (ตัวเดียวกับใน tray)
  if (req.method === 'POST' && route === 'enabled') {
    const body = await readJson(req)
    setEnabled(Boolean(body.enabled))
    return send(res, 200, { enabled })
  }

  send(res, 404, { error: 'not found' })
})

// การ์ดที่ hook ตายไปแล้ว (เกิน 300 วิ) ทิ้งออกจากคิว
setInterval(() => {
  const now = Date.now()
  for (const q of queue) if (now - q.created_at > EXPIRE_MS) resolve(q.id, { passed: false, level: 0, score: 0, action: 'deny' })
}, 5_000)

// ปุ่มในหน้าหลัก: ติด hook ใน sandbox แล้วเปิด Terminal รัน Codex CLI ให้ผู้ใช้พิมพ์ /hooks กด trust เอง
ipcMain.handle('wai:open-codex-hooks', async () => {
  if (!existsSync(CODEX_CLI)) return { ok: false, error: 'ไม่เจอ Codex CLI ในแอป ChatGPT' }
  install('codex', SCOPE, process.execPath)
  const cmd = `cd '${SCOPE === 'global' ? homedir() : SANDBOX}' && '${CODEX_CLI}'`
  await new Promise((ok, fail) =>
    execFile(
      'osascript',
      ['-e', `tell application "Terminal" to do script "${cmd}"`, '-e', 'tell application "Terminal" to activate'],
      (e) => (e ? fail(e) : ok()),
    ),
  )
  return { ok: true }
})

// ---------- onboarding ----------
const run = (bin, args) => new Promise((ok, fail) => execFile(bin, args, (e, out) => (e ? fail(e) : ok(out))))

ipcMain.handle('wai:setup-status', () => {
  const cfg = readConfig()
  return {
    scope: SCOPE,
    folder: SCOPE === 'global' ? homedir() : SANDBOX,
    onboarded: Boolean(cfg.onboarded),
    camera: process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('camera') : 'granted',
    claude: { installed: installed('claude', SCOPE) },
    codex: { installed: installed('codex', SCOPE), trusted: codexTrusted(SCOPE), cli: existsSync(CODEX_CLI) },
    loginItem: Boolean(cfg.loginItem),
    canLoginItem: app.isPackaged || existsSync(SHORTCUT),
  }
})

ipcMain.handle('wai:hooks', (_e, tool, on) => {
  try {
    const file = on ? install(tool, SCOPE, process.execPath) : uninstall(tool, SCOPE)
    console.log(`[wai] hook ${tool} ${on ? 'install' : 'uninstall'} → ${file}`)
    return { ok: true, file }
  } catch (e) {
    return { ok: false, error: `อ่านไฟล์ settings ไม่ได้ (JSON เสีย?) ไม่ได้แก้อะไร: ${e.message}` }
  }
})

ipcMain.handle('wai:camera', async () => {
  if (process.platform !== 'darwin') return { ok: true }
  return { ok: await systemPreferences.askForMediaAccess('camera') }
})

// เปิดตอนเข้าเครื่อง: แอปจริงใช้ API ของ Electron · ตอน dev ชี้ไปที่ shortcut (ไม่งั้นจะเปิด Electron เปล่า)
ipcMain.handle('wai:login-item', async (_e, on) => {
  try {
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: on })
    else if (!existsSync(SHORTCUT)) return { ok: false, error: 'ติดตั้ง shortcut ก่อน (install-shortcut.sh)' }
    else if (on) await run('osascript', ['-e', `tell application "System Events" to make login item at end with properties {path:"${SHORTCUT}", hidden:true}`])
    else await run('osascript', ['-e', 'tell application "System Events" to delete (every login item whose name is "ไหว้กูซะ")'])
    saveConfig({ loginItem: on })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('wai:onboarded', (_e, done) => {
  saveConfig({ onboarded: done })
  return { ok: true }
})

function setEnabled(next) {
  enabled = next
  // ปิดแล้ว ปล่อยทุกใบที่ค้างอยู่ ไม่ให้ AI ค้าง
  if (!enabled) for (const q of [...queue]) resolve(q.id, { passed: true, level: 0, score: 0, action: 'allow' })
  updateTray()
  syncVision()
  syncFlee()
}

function setFlee(on) {
  fleeOn = on
  syncFlee()
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
      { label: 'หนีเมาส์', type: 'checkbox', checked: fleeOn, click: (i) => setFlee(i.checked) },
      { label: 'เปิดหน้าหลัก', click: openHome },
      { label: 'โชว์ popup', click: () => win?.showInactive() },
      { type: 'separator' },
      { label: 'ออก', role: 'quit' },
    ]),
  )
}

// เปิดได้ตัวเดียว: กด shortcut ซ้ำ = เปิดหน้าหลักของตัวที่รันอยู่ (ไม่งั้นชน port 7777)
if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', () => openHome())

app.whenReady().then(() => {
  app.dock?.hide() // เป็นแอป menu bar ไม่ขึ้น Dock
  tray = new Tray(nativeImage.createEmpty()) // SPIKE: ยังไม่มีไอคอน (Windows ต้องมีไอคอนจริง)
  updateTray()
  createWindow()
  if (!DEV_INSTANCE) createVision() // ตัวลองของไม่เปิดกล้อง ใช้ POST /wai/dev/fail แทน
  if (!DEV_INSTANCE) openHome() // ตัวลองของไม่แย่ง focus (เปิดจาก tray ได้)
  server.listen(PORT, '127.0.0.1', () => console.log(`[wai] daemon on http://127.0.0.1:${PORT} → ${RENDERER}`))
})
app.on('window-all-closed', (e) => e.preventDefault()) // daemon อยู่ต่อแม้ไม่มี window
app.on('activate', openHome) // กดไอคอนใน Dock/Launchpad = เปิดหน้าหลัก

// ก่อนปิด: ส่งที่ค้างขึ้นเว็บให้จบก่อน (รอไม่เกิน 2 วิ) แล้วค่อยปิดจริง
let flushing = false
app.on('before-quit', (e) => {
  if (flushing) return
  flushing = true
  e.preventDefault()
  Promise.race([waiLog.flush(), new Promise((ok) => setTimeout(ok, 2_000))])
    .catch(() => {})
    .finally(() => {
      waiLog.stop()
      app.quit()
    })
})
