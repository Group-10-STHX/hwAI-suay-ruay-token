// SPIKE: daemon :7777 + popup + กล้องตรวจไหว้ (vision/worker) ปุ่ม skip ยังอยู่ไว้ dev
// ของจริงเป็นงานของ #1 (/app/main) อันนี้แค่พิสูจน์ว่า hook → popup → ปลด ทำงานได้
import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, systemPreferences, Tray } from 'electron'
import { execFile } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { codexTrusted, install, installed, SANDBOX, uninstall } from './install-hooks.mjs'
import { createSessions, planVision } from './session-state.mjs' // state machine ต่อ session (contract §4)
import { createAvatars, handleAvatarRoute } from './avatars.mjs' // เลือก/เสิร์ฟตัวละคร (~/.waikusa/avatars)
import { createVoice, defaultPlayImpl } from './voice.mjs'
import { createVoiceAdmin } from './voice-admin.mjs' // หลังบ้านอัดเสียง /admin/voice // เสียงพูด: เสียงที่เพื่อนอัด → Paxa TTS (แคช) → say กันยา
import { createStickers, isStickerStyle, normalizeStickerStyle, STICKER_FILE_RE, STICKER_STYLES } from './stickers.mjs' // สติ๊กเกอร์ตอนไหว้ผ่าน (~/.waikusa/stickers)
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
const WIN = process.platform === 'win32'
const MAC = process.platform === 'darwin'
// shortcut ตอน dev · mac: install-shortcut.sh · Windows: install-shortcut.ps1 (Start Menu .lnk → wscript launch.vbs)
const SHORTCUT = WIN
  ? join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'ไหว้กูซะ.lnk')
  : join(homedir(), 'Applications', 'ไหว้กูซะ.app')
const WIN_LAUNCHER = join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'waikusa', 'launch.vbs')
const WSCRIPT = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'wscript.exe')
const IS_MAC = MAC
const IS_WIN = WIN
const WAI_HOME = process.env.WAI_HOME ?? (DEV_INSTANCE ? join(DEV_DIR, 'waikusa') : join(homedir(), '.waikusa')) // โฟลเดอร์ของ daemon: config.json, wais.jsonl
const CONFIG = join(WAI_HOME, 'config.json')
// โหมด dev: เก็บคลิปคุณภาพต่ำ (เหมือนกล้องวงจรปิด) ต่อการไหว้ 1 ครั้ง ไว้ในเครื่องเท่านั้น
// เปิดด้วย WAI_DEV_RECORD=1 หรือใส่ "devRecord": true ใน ~/.waikusa/config.json · ค่าเริ่มต้นปิด
const CLIPS_DIR = join(WAI_HOME, 'clips')
const MAX_CLIPS = 60 // เก็บล่าสุด 60 คลิป เกินแล้วลบเฉพาะคลิปเก่าสุดในโฟลเดอร์ clips/ ของเราเอง
const MAX_CLIP_BYTES = 8 * 1024 * 1024
// โลโก้ตัวน้องไหว้ (assets/): icon.png = Dock/หน้าต่าง · tray.png (22px) + tray@2x.png บน menu bar
const ASSETS = join(HERE, 'assets')
const ICON = join(ASSETS, 'icon.png')
const TRAY_ICON = join(ASSETS, 'tray.png')

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
const MAC_CODEX_CLI = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex' // มากับแอป ChatGPT/Codex

/** ไฟล์มีอยู่และเป็นไฟล์ (ไม่ใช่โฟลเดอร์) */
const isFile = (p) => {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

/**
 * หา Codex CLI · mac: ตัวที่มากับแอป ChatGPT · Windows (ยังไม่ได้ทดสอบบนเครื่องจริง):
 * 1) CODEX_CLI_PATH (env ที่แอป Codex เองก็อ่าน) 2) %LOCALAPPDATA%\Programs\OpenAI\Codex\bin\codex.exe (จากรายงานผู้ใช้ ไม่ใช่ docs)
 * 3) %APPDATA%\npm\codex.cmd (npm i -g @openai/codex) 4) ไล่ PATH × PATHEXT เอง (ไม่ parse `where` เพราะ output เป็น OEM ทำ path ไทยเพี้ยน)
 * ตัวที่อยู่ใน WindowsApps (แอปจาก Store) เข้าถึงไม่ได้ ข้าม
 */
function findCodexCli() {
  const forced = process.env.WAI_CODEX_CLI
  if (forced && isFile(forced)) return forced
  if (!WIN) return isFile(MAC_CODEX_CLI) ? MAC_CODEX_CLI : null
  const env = process.env
  const candidates = [
    env.CODEX_CLI_PATH,
    env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe'),
    env.APPDATA && join(env.APPDATA, 'npm', 'codex.cmd'),
  ]
  const exts = (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
  for (const dir of (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean))
    for (const ext of exts) candidates.push(join(dir.replace(/^"|"$/g, ''), 'codex' + ext.toLowerCase()))
  return candidates.find((p) => p && !p.includes('WindowsApps') && isFile(p)) ?? null
}
const PORT = Number(process.env.WAI_PORT) || 7777
// dev: vite (:5173) · แอปจาก shortcut: ไฟล์ที่ build แล้ว (WAI_RENDERER_URL=file://.../dist/)
// --renderer=<url> = ทางเลือกแทน env (login item ของ Windows ตั้ง env ไม่ได้ ส่งได้แค่ args) · env มาก่อนเสมอ
const RENDERER_ARG = process.argv.find((a) => a.startsWith('--renderer='))?.slice('--renderer='.length)
// ต้องลงท้ายด้วย / (Windows file URL: file:///C:/path/to/dist/)
const RENDERER = (process.env.WAI_RENDERER_URL || RENDERER_ARG || 'http://localhost:5173/').replace(/\/?$/, '/')
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
const avatars = createAvatars({ home: WAI_HOME })
const stickers = createStickers({ home: WAI_HOME })
const voice = createVoice({ home: WAI_HOME, log: console.log }) // key อ่านจาก ~/.waikusa/secrets.json
const REPO_ROOT = join(HERE, '..', '..')
const voiceAdmin = createVoiceAdmin({
  home: WAI_HOME,
  linesFile: join(REPO_ROOT, 'voice', 'lines.all.json'),
  adminDir: join(REPO_ROOT, 'voice', 'admin'),
  play: (file) => defaultPlayImpl({ kind: 'file', path: file })?.done,
  now: Date.now,
  log: console.log,
})
// พูดเมื่อ state ของ session หัวคิวเปลี่ยน (ไม่พูดซ้ำ state เดิมของคำขอเดิม)
let lastSpoken = ''
const speak = (state) => enabled && voice.speak({ state })
// โหมดสังเกต: จับคำขอจริงจาก AI ทุกช่องทางแต่ไม่บังคับไหว้ (โชว์การ์ดสั้นๆ แล้วปล่อยผ่านเอง) ไว้ทดสอบว่าจับได้จริงไหม
// เปิดด้วย WAI_MONITOR=1 หรือ "monitor": true ใน ~/.waikusa/config.json หรือสวิตช์ในหน้าหลัก/tray
const MONITOR_HOLD_MS = 2500
let monitor = process.env.WAI_MONITOR === '1' || readConfig().monitor === true
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
    // เสียง HUD (WebAudio) ใน popup ไม่มี gesture ของผู้ใช้ ต้องอนุญาตให้เล่นเองได้
    webPreferences: { preload: join(HERE, 'preload.cjs'), autoplayPolicy: 'no-user-gesture-required' }, // window.wai.onVisionEvent
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  if (!WIN) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }) // Windows ไม่มี workspace แบบนี้
  win.webContents.on('did-finish-load', () => win.webContents.send('wai:flee', fleeSent)) // หน้า reload แล้วไม่หลุด state
  win.loadURL(RENDERER + 'avatar.html')
  // ผู้ใช้ปิด popup เอง (หรือ OS ปิดให้) → อย่าถือ window ที่ตายแล้วไว้ ไม่งั้น syncWindow พัง "Object has been destroyed"
  win.on('closed', () => {
    win = null
  })
}

/** popup ที่ยังใช้ได้ ถ้าถูกปิดไปแล้วสร้างใหม่ให้ */
function livePopup() {
  if (!win || win.isDestroyed()) createWindow()
  return win
}

/** หน้าหลัก: เปิดตอนเริ่มแอป ปิดแล้วแอปยังอยู่บน menu bar */
function openHome() {
  if (home) {
    if (home.isMinimized()) home.restore()
    home.show()
    return home.focus()
  }
  home = new BrowserWindow({
    icon: ICON,
    width: 400,
    height: 680,
    title: 'ไหว้กูซะ',
    backgroundColor: '#0A0A0C',
    // mac: ซ่อน title bar (ปุ่มไฟจราจรลอยบนแถบลาก 32px ของ renderer) · Windows: title bar ปกติ (มีปุ่มปิด/ย่อ) ไม่มีเมนู
    ...(MAC ? { titleBarStyle: 'hiddenInset' } : { autoHideMenuBar: true, icon: join(HERE, 'assets', 'icon.ico') }),
    resizable: false,
    webPreferences: { preload: join(HERE, 'preload.cjs') },
  })
  if (!MAC) home.removeMenu()
  home.loadURL(RENDERER + 'home.html')
  // ขนาดพอดีเนื้อหา ไม่ต้องเลื่อน: วัดความสูงจริงของหน้าแล้วปรับหน้าต่าง (จำกัด 360–900)
  const fit = setInterval(async () => {
    if (!home || home.isDestroyed()) return clearInterval(fit)
    try {
      const h = await home.webContents.executeJavaScript(
        "(() => { const p = document.querySelector('#root > div'); return p ? p.scrollHeight : 0 })()",
      )
      if (typeof h !== 'number' || h <= 0) return
      const want = Math.min(900, Math.max(360, Math.ceil(h)))
      const [w, cur] = home.getContentSize()
      if (Math.abs(cur - want) > 2) home.setContentSize(w, want)
    } catch {
      /* หน้ากำลังโหลด ลองรอบหน้า */
    }
  }, 400)
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
/** ชื่อไฟล์คลิป: เรียงตามเวลา อักขระปลอดภัยเท่านั้น (ทำซ้ำใน vision/worker/clip-plan.js เพราะไฟล์นั้นเป็น ESM ของ renderer) */
function clipFileName({ at, outcome, level, score }) {
  const d = new Date(at)
  const p = (n) => String(n).padStart(2, '0')
  const o = ['pass', 'fail', 'long', 'cut'].includes(outcome) ? outcome : 'clip'
  const lv = Number.isInteger(level) ? Math.max(0, Math.min(3, level)) : 0
  const sc = Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0
  return `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}_${o}_L${lv}_s${sc}.webm`
}

const devRecord = () => process.env.WAI_DEV_RECORD === '1' || readConfig().devRecord === true

function syncVision() {
  if (!vision || vision.isDestroyed()) return
  const top = queue[0]
  vision.webContents.send('vision:control', {
    run: enabled && queue.some((q) => !q.monitor), // โหมดสังเกตไม่เปิดกล้อง
    requiredLevel: top ? sessions.requiredLevel(top.session_id) : 1,
    devRecord: devRecord(),
    stickerStyle: stickerStyle(),
    stickers: enabled && !monitor, // โหมดสังเกต/bypass ไม่ใช่การไหว้จริง ไม่ทำสติ๊กเกอร์
  })
}

// ---------- สติ๊กเกอร์ตอนไหว้ผ่าน ----------
// worker ส่ง vision:pass {seq} แล้วตามด้วย vision:sticker {seq, png} (ประมวลผลตัดฉากหลังทีหลังเล็กน้อย)
// ลำดับอาจสลับ: เก็บ pass ที่ผ่านแล้ว (seq → wai id) และสติ๊กเกอร์ที่มาก่อน (seq → รูป) ไว้ราว 10 วิ
const stickerStyle = () => normalizeStickerStyle(readConfig().sticker_style) // photo | cartoon | comic | pixel | neon | kawaii
const STICKER_WAIT_MS = 10_000
const passedBySeq = new Map() // seq → { id, t }
const pendingStickers = new Map() // seq → { png: Buffer, t }

function sweepStickerBuffers() {
  const cut = Date.now() - STICKER_WAIT_MS
  for (const m of [passedBySeq, pendingStickers]) for (const [k, v] of m) if (v.t < cut) m.delete(k)
}

function finishSticker(seq) {
  const pass = passedBySeq.get(seq)
  const pend = pendingStickers.get(seq)
  if (!pass || !pend) return
  passedBySeq.delete(seq)
  pendingStickers.delete(seq)
  const file = stickers.save(pass.id, pend.png)
  if (!file) return
  waiLog.attachSticker(pass.id, file)
  waiLog.uploadSticker(pass.id, join(stickers.dir, file)) // เปิดเฉพาะ web.upload_stickers === true · ไม่ throw
  console.log(`[wai] sticker ${file} (${Math.round(pend.png.length / 1024)} KB)`)
}

ipcMain.on('vision:sticker', (_e, s) => {
  try {
    if (!enabled || monitor || !s || !Number.isInteger(s.seq) || !(s.png instanceof ArrayBuffer || ArrayBuffer.isView(s.png))) return
    sweepStickerBuffers()
    const png = Buffer.from(s.png instanceof ArrayBuffer ? s.png : s.png.buffer, s.png.byteOffset ?? 0, s.png.byteLength)
    pendingStickers.set(s.seq, { png, t: Date.now() })
    finishSticker(s.seq)
  } catch (e) {
    console.log('[wai] sticker failed:', e.message)
  }
})

/** เก็บคลิป dev: ชื่อไฟล์สร้างในนี้เองจากค่าที่ตรวจแล้ว ไม่เอาชื่อจาก renderer */
ipcMain.on('vision:clip', (_e, clip) => {
  if (!devRecord() || !clip || !(clip.bytes instanceof ArrayBuffer)) return
  if (clip.bytes.byteLength === 0 || clip.bytes.byteLength > MAX_CLIP_BYTES) return
  try {
    const now = new Date()
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const dir = join(CLIPS_DIR, day)
    mkdirSync(dir, { recursive: true })
    const name = clipFileName({ at: now.getTime(), outcome: clip.outcome, level: clip.level, score: clip.score })
    writeFileSync(join(dir, name), Buffer.from(clip.bytes))
    appendFileSync(
      join(CLIPS_DIR, 'index.jsonl'),
      JSON.stringify({ file: `${day}/${name}`, at: now.toISOString(), outcome: clip.outcome, level: clip.level, score: clip.score, ms: clip.ms, bytes: clip.bytes.byteLength }) + '\n',
    )
    console.log(`[wai] dev clip ${day}/${name} (${Math.round(clip.bytes.byteLength / 1024)} KB)`)
    pruneClips()
  } catch (e) {
    console.log('[wai] dev clip save failed:', e.message)
  }
})

function pruneClips() {
  const files = []
  for (const d of readdirSync(CLIPS_DIR, { withFileTypes: true })) {
    if (!d.isDirectory()) continue
    for (const f of readdirSync(join(CLIPS_DIR, d.name))) {
      if (f.endsWith('.webm')) files.push(join(CLIPS_DIR, d.name, f))
    }
  }
  if (files.length <= MAX_CLIPS) return
  files.sort() // yyyy-mm-dd/HHMMSS_… จึงเรียงตามเวลา
  for (const f of files.slice(0, files.length - MAX_CLIPS)) unlinkSync(f)
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
  const rec = waiLog.record(plan.record)
  if (type === 'pass' && rec?.passed && Number.isInteger(payload.seq) && !top.monitor) {
    passedBySeq.set(payload.seq, { id: rec.id, t: Date.now() })
    // บอก worker ว่า seq นี้คือ wai id ไหน (สไตล์ kawaii ใช้เป็น seed ของดาววิบวับ) · worker ไม่รอเกิน ~0.4 วิ
    if (vision && !vision.isDestroyed()) vision.webContents.send('vision:wai', { seq: payload.seq, id: rec.id })
    finishSticker(payload.seq)
  }
  if (!plan.resolve) return syncWindow() // ยังไม่ปลด แต่ state เปลี่ยน → ส่ง requiredLevel ใหม่ให้กล้อง
  const ids = plan.releaseSession ? queue.filter((q) => q.session_id === top.session_id).map((q) => q.id) : [top.id]
  for (const id of ids) resolve(id, plan.resolve)
  // ไหว้ผ่าน / RAGE_QUIT: พูดตาม state ที่ตัดสินแล้ว (หัวคิวถัดไปจะพูดเองตอน syncWindow)
  if (plan.resolve.passed && plan.resolve.level > 0) speak('PASSED')
  else if (plan.resolve.action === 'rage_quit') speak('RAGE_QUIT')
}
ipcMain.on('vision:pass', (_e, payload) => onVision('pass', payload))
ipcMain.on('vision:fail', (_e, payload) => onVision('fail', payload))

/** มีคิว = เด้ง popup, คิวหมด = ซ่อน */
function syncWindow() {
  if (queue[0] && !queue[0].monitor) {
    sessions.demand(queue[0].session_id) // หัวคิวใบใหม่: PASSED → DEMANDING, RAGE_QUIT → FORGIVE
    const key = `${queue[0].id}:${sessions.get(queue[0].session_id).state}`
    if (key !== lastSpoken) {
      lastSpoken = key
      speak(sessions.get(queue[0].session_id).state)
    }
  }
  if (tray) updateTray()
  syncVision()
  if (queue.length > 0) {
    const w = livePopup()
    if (!w.isVisible()) w.showInactive()
  } else if (win && !win.isDestroyed() && win.isVisible()) {
    win.hide()
  }
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
  if (await voiceAdmin.handle(req, res, url)) return // /admin/voice, /wai/voice/lines|recording|play
  if (req.method === 'OPTIONS') return send(res, 204)
  if (handleAvatarRoute(req, res, { avatars })) return // /wai/avatars, /wai/avatar, /wai/avatar/<name>/<mood>.png

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
    if (monitor) {
      // สังเกตเฉยๆ: ขึ้นการ์ดให้เห็นว่าจับได้ แล้วปล่อยผ่านเอง ไม่แตะ state machine และไม่บันทึกเป็นการไหว้
      item.monitor = true
      queue.push(item)
      console.log(`[wai] MONITOR ${item.source} ${item.kind} · ${item.agent_label}`)
      setTimeout(() => {
        if (queue.some((q) => q.id === item.id)) resolve(item.id, { passed: true, level: 0, score: 0, action: 'allow' })
      }, MONITOR_HOLD_MS)
      syncWindow()
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
      monitor: queue.length > 0 && queue.every((q) => q.monitor),
      avatar: avatars.current(),
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
    return send(res, 200, { enabled, pending: queue.length, stats: { ...stats, ...waiLog.stats() }, last_seen: lastSeen, avatar: avatars.current(), monitor })
  }

  // GET /wai/voice → บุคลิก + สถานะเสียง · POST /wai/voice { persona?, muted? } (ไม่มี key ในคำตอบ)
  if (route === 'voice') {
    if (req.method === 'POST') {
      const body = await readJson(req)
      if (typeof body.persona === 'string') voice.setPersona(body.persona)
      if (typeof body.muted === 'boolean') voice.setMuted(body.muted)
      // ลองฟังเสียงตาม state โดยไม่ต้องมีคำขอ: { demo: 'RETRY', persona?: 'p7' } (ใช้ทดสอบอารมณ์ของเสียง)
      if (typeof body.demo === 'string') voice.speak({ state: body.demo, persona: typeof body.persona === 'string' ? body.persona : undefined })
    }
    return send(res, 200, { personas: voice.list(), persona: voice.getPersona(), status: voice.status() })
  }

  // GET /wai/stickers → { items:[{id,file,at,score,level}], style } ใหม่สุดก่อน 24 ใบ
  if (req.method === 'GET' && url.pathname === '/wai/stickers') {
    const items = stickers.list(24).map((s) => {
      const m = waiLog.lookup(s.id)
      return { id: s.id, file: s.file, at: m?.at ?? new Date(s.mtimeMs).toISOString(), score: m?.score ?? 0, level: m?.level ?? 0 }
    })
    return send(res, 200, { items, style: stickerStyle() })
  }

  // GET /wai/sticker/<file>.png → ไฟล์ PNG (ชื่อต้องตรง ^[A-Za-z0-9_-]+\.png$)
  if (req.method === 'GET' && url.pathname.startsWith('/wai/sticker/')) {
    let name = ''
    try {
      name = decodeURIComponent(url.pathname.slice('/wai/sticker/'.length))
    } catch {}
    if (!STICKER_FILE_RE.test(name)) return send(res, 400, { error: 'bad name' })
    const f = stickers.resolveFile(name)
    if (!f) return send(res, 404, { error: 'not found' })
    try {
      const buf = readFileSync(f)
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' })
      return res.end(buf)
    } catch {
      return send(res, 404, { error: 'not found' })
    }
  }

  // POST /wai/sticker-style { style: 'photo' | 'cartoon' | 'comic' | 'pixel' | 'neon' | 'kawaii' } → { style }
  if (req.method === 'POST' && url.pathname === '/wai/sticker-style') {
    const body = await readJson(req)
    if (!isStickerStyle(body.style)) return send(res, 400, { error: `style must be one of ${STICKER_STYLES.join(', ')}` })
    saveConfig({ sticker_style: body.style })
    syncVision()
    return send(res, 200, { style: body.style })
  }

  // POST /wai/monitor { monitor } ← สวิตช์โหมดสังเกต (ไม่บังคับไหว้) ในหน้าหลัก/tray
  if (req.method === 'POST' && route === 'monitor') {
    const body = await readJson(req)
    setMonitor(Boolean(body.monitor))
    return send(res, 200, { monitor })
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
  const cli = findCodexCli()
  if (!cli)
    return {
      ok: false,
      error: WIN ? 'ไม่เจอ Codex CLI (ลง npm i -g @openai/codex หรือตั้ง CODEX_CLI_PATH)' : 'ไม่เจอ Codex CLI ในแอป ChatGPT',
    }
  try {
    install('codex', SCOPE, process.execPath)
  } catch (e) {
    return { ok: false, error: `อ่าน hooks.json ไม่ได้ (JSON เสีย?) ไม่ได้แก้อะไร: ${e.message}` }
  }
  const folder = SCOPE === 'global' ? homedir() : SANDBOX
  mkdirSync(folder, { recursive: true })
  try {
    if (WIN) await openConsoleWin(cli, folder)
    else {
      const cmd = `cd '${folder}' && '${cli}'`
      await run('osascript', ['-e', `tell application "Terminal" to do script "${cmd}"`, '-e', 'tell application "Terminal" to activate'])
    }
  } catch (e) {
    return { ok: false, error: e.message }
  }
  return { ok: true }
})

/**
 * Windows: เปิดหน้าต่าง console ใหม่ใน folder แล้วรัน codex (ยังไม่ได้ทดสอบบนเครื่องจริง)
 * ให้ `start` สร้าง console จริง (spawn detached + stdio ignore = TUI ไม่มี terminal)
 * cmd /d /c start "" /D <cwd> <cli> · "" = ชื่อหน้าต่าง · Node quote path ที่มีเว้นวรรคให้เอง
 * ข้อความหลัง /c ขึ้นต้นด้วย start (ไม่ใช่ ") cmd เลยไม่ตัด quote · .cmd ของ npm start เปิดผ่าน cmd /k ให้เอง
 */
export const winConsoleArgs = (cli, cwd) => ['/d', '/c', 'start', '', '/D', cwd, cli]
const openConsoleWin = (cli, cwd) => run(process.env.ComSpec || 'cmd.exe', winConsoleArgs(cli, cwd))

// ---------- onboarding ----------
const run = (bin, args) => new Promise((ok, fail) => execFile(bin, args, (e, out) => (e ? fail(e) : ok(out))))

function cameraStatus() {
  if (!MAC && !WIN) return 'granted'
  try {
    return systemPreferences.getMediaAccessStatus('camera') // mac + Windows 10 1809+
  } catch {
    return 'granted'
  }
}

/**
 * login item ของ Windows (ยังไม่ได้ทดสอบบนเครื่องจริง) · ตอนปิดต้องส่ง path+args ชุดเดิม ไม่งั้นลบ entry ไม่เจอ
 * package แล้ว: ตัวแอปเอง · dev: launch.vbs จาก install-shortcut.ps1 (build renderer + ซ่อนหน้าต่าง)
 * ไม่มี launcher แต่เปิดจากไฟล์ build อยู่ (file://): Electron + โฟลเดอร์ spike + --renderer=... (login item ตั้ง env ไม่ได้)
 */
function winLoginTarget() {
  if (app.isPackaged) return { path: process.execPath, args: [] }
  if (existsSync(WIN_LAUNCHER)) return { path: WSCRIPT, args: [WIN_LAUNCHER] }
  if (RENDERER.startsWith('file:')) return { path: process.execPath, args: [HERE, `--renderer=${RENDERER}`] }
  return null
}

ipcMain.handle('wai:setup-status', () => {
  const cfg = readConfig()
  return {
    scope: SCOPE,
    folder: SCOPE === 'global' ? homedir() : SANDBOX,
    onboarded: Boolean(cfg.onboarded),
    camera: cameraStatus(),
    claude: { installed: installed('claude', SCOPE) },
    codex: { installed: installed('codex', SCOPE), trusted: codexTrusted(SCOPE), cli: Boolean(findCodexCli()) },
    loginItem: Boolean(cfg.loginItem),
    canLoginItem: WIN ? Boolean(winLoginTarget()) : app.isPackaged || existsSync(SHORTCUT),
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
  if (!MAC) return { ok: cameraStatus() !== 'denied' } // Windows ไม่มี API ขอสิทธิ์ ถูกบล็อก = ให้ผู้ใช้ไปเปิดใน Settings > Privacy > Camera
  return { ok: await systemPreferences.askForMediaAccess('camera') }
})

// เปิดตอนเข้าเครื่อง: แอปจริงใช้ API ของ Electron · ตอน dev ชี้ไปที่ shortcut (ไม่งั้นจะเปิด Electron เปล่า)
ipcMain.handle('wai:login-item', async (_e, on) => {
  try {
    if (WIN) {
      const target = winLoginTarget()
      if (!target) return { ok: false, error: 'ติดตั้ง shortcut ก่อน (install-shortcut.ps1)' }
      app.setLoginItemSettings({ openAtLogin: on, path: target.path, args: target.args })
    } else if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: on })
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

function setMonitor(next) {
  monitor = next
  saveConfig({ monitor })
  updateTray()
  console.log(`[wai] โหมดสังเกต ${monitor ? 'เปิด (ไม่บังคับไหว้)' : 'ปิด (บังคับไหว้)'}`)
}

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

/** ไอคอน tray: mac ใช้ emoji เป็น title (รูปว่าง) · Windows/Linux ต้องมีรูปจริง ไม่งั้นไม่เห็นอะไรเลย */
function trayImage() {
  if (MAC) return nativeImage.createEmpty()
  const file = WIN ? (enabled ? 'icon.ico' : 'tray-off.ico') : enabled ? 'tray.png' : 'tray-off.png'
  return nativeImage.createFromPath(join(HERE, 'assets', file))
}

function updateTray() {
  if (MAC) tray.setTitle(enabled ? ' 🙏' : ' 💤') // mac แสดงเป็นตัวหนังสือบน menu bar
  else tray.setImage(trayImage())
  tray.setToolTip(enabled ? 'ไหว้กูซะ: เปิดอยู่' : 'ไหว้กูซะ: ปิดอยู่ (bypass)')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: !enabled ? '○ ปิดอยู่ AI ใช้ได้เลย' : monitor ? '◐ โหมดสังเกต (ไม่บังคับไหว้)' : '● ต้องไหว้ก่อนใช้ AI', enabled: false },
      { label: `รอไหว้ ${queue.length} ใบ`, enabled: false },
      { type: 'separator' },
      { label: 'เปิดใช้งาน', type: 'checkbox', checked: enabled, click: (i) => setEnabled(i.checked) },
      { label: 'โหมดสังเกต (จับได้ไหม ไม่บังคับไหว้)', type: 'checkbox', checked: monitor, click: (i) => setMonitor(i.checked) },
      { label: 'หนีเมาส์', type: 'checkbox', checked: fleeOn, click: (i) => setFlee(i.checked) },
      { label: 'เปิดหน้าหลัก', click: openHome },
      { label: 'โชว์ popup', click: () => livePopup().showInactive() },
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
  if (WIN) app.setAppUserModelId('com.group10sthx.waikusa') // ชื่อ/ไอคอนบน taskbar + notification
  tray = new Tray(trayImage())
  if (!MAC) tray.on('click', openHome) // Windows: คลิกซ้าย = เปิดหน้าหลัก (คลิกขวา = เมนู)
  updateTray()
  createWindow()
  if (!DEV_INSTANCE) createVision() // ตัวลองของไม่เปิดกล้อง ใช้ POST /wai/dev/fail แทน
  if (!DEV_INSTANCE) openHome() // ตัวลองของไม่แย่ง focus (เปิดจาก tray ได้)
  server.listen(PORT, '127.0.0.1', () => console.log(`[wai] daemon on http://127.0.0.1:${PORT} → ${RENDERER}`))
  if (devRecord()) console.log(`[wai] DEV RECORD on → ${CLIPS_DIR} (คุณภาพต่ำ เก็บในเครื่อง ล่าสุด ${MAX_CLIPS} คลิป)`)
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
