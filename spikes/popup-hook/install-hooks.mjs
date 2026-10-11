// ติด/ถอด hook ของ Claude Code และ Codex แบบ merge (ไม่ทับ hook อื่นของผู้ใช้)
// SPIKE: ของจริงย้ายไป /integrations (#4)
//
// scope:
//   sandbox = ~/wai-sandbox เท่านั้น (ตอน dev ห้ามติด global ไม่งั้น Claude Code ของทีมพัง)
//   global  = ~/.claude/settings.json + ~/.codex/hooks.json (เฉพาะแอปที่ package แล้ว + ผู้ใช้ติ๊กเอง)
//   <โฟลเดอร์ absolute> = เฉพาะโปรเจกต์นั้น (.claude/settings.local.json · .codex/hooks.json ในโฟลเดอร์นั้น) ใช้ทดสอบกับงานจริงโดยไม่ติด global
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, delimiter, dirname, isAbsolute, join, win32 } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const HOOK = join(DIR, 'hook.mjs')
const WRAPPER = join(DIR, 'hook-run.cjs') // ใช้เมื่อไม่มี node ในเครื่อง: รันด้วย Electron แล้ว spawn ตัวเองพร้อม ELECTRON_RUN_AS_NODE=1
// marker หา entry ของเราตอนถอด: รุ่นใหม่เป็น argument ท้ายคำสั่ง (ไม่ต้องใช้ env prefix แบบ POSIX) · รุ่นเก่า WAI_HOOK=1 นำหน้า ยังรู้จักไว้ถอด/แทนที่
const MARKER = '--wai-hook'
const OLD_MARKER = 'WAI_HOOK=1'
export const SANDBOX = join(homedir(), 'wai-sandbox')

/** scope ที่ไม่ใช่ 'global': absolute path ของโปรเจกต์ ถ้าไม่ใช่ path (เช่น 'sandbox') ใช้ ~/wai-sandbox */
function scopeDir(scope) {
  return typeof scope === 'string' && scope !== 'global' && (isAbsolute(scope) || win32.isAbsolute(scope)) ? scope : SANDBOX
}

export const TOOLS = {
  claude: {
    source: 'claude-code',
    file: (scope) => (scope === 'global' ? join(homedir(), '.claude', 'settings.json') : join(scopeDir(scope), '.claude', 'settings.local.json')),
    subagentMatcher: 'Task|Agent',
  },
  codex: {
    source: 'codex',
    file: (scope) => (scope === 'global' ? join(homedir(), '.codex', 'hooks.json') : join(scopeDir(scope), '.codex', 'hooks.json')),
    subagentMatcher: 'spawn_agent|Agent',
  },
}

/** quote สำหรับคำสั่งที่ Claude Code/Codex จะรัน: win32 = "..." (ใช้ / แทน \ กัน escape พังใน Git Bash) · อื่นๆ = '...' */
export function quotePath(s, platform = process.platform) {
  if (platform === 'win32') return `"${String(s).replaceAll('\\', '/').replaceAll('"', '')}"`
  return `'${String(s).replaceAll("'", "'\\''")}'`
}

/** สร้างคำสั่ง hook ที่ไม่ต้องพึ่ง env prefix: <runtime> <script> <source> --wai-hook */
export function buildHookCommand({ platform = process.platform, runtime, hookPath = HOOK, source }) {
  return `${quotePath(runtime, platform)} ${quotePath(hookPath, platform)} ${source} ${MARKER}`
}

/** หา executable จาก PATH (ไม่ใช้ shell) · win32 ลองตาม PATHEXT */
export function findOnPath(name, { platform = process.platform, env = process.env, exists = existsSync, winExts = ['.exe'] } = {}) {
  const win = platform === 'win32'
  const sep = win ? ';' : delimiter
  const exts = win ? winExts : ['']
  for (const dir of (env.PATH ?? env.Path ?? '').split(sep)) {
    if (!dir) continue
    for (const ext of exts) {
      // ค่าเริ่มต้นรับเฉพาะ .exe บน Windows (.cmd รันตรงๆ จาก hook ไม่ได้ในทุก shell)
      const file = (win ? win32 : { join }).join(dir, name + ext)
      if (exists(file)) return file
    }
  }
  return null
}

/**
 * เลือก runtime ของ hook: ใช้ node จริงเสมอถ้ามี (ไม่ต้องตั้ง env) · ไม่มี → Electron + hook-run.cjs
 * (ตั้ง ELECTRON_RUN_AS_NODE หลัง process เริ่มแล้วสายเกินไป wrapper จึง spawn ตัวเองพร้อม env นั้น)
 */
export function pickRuntime({ platform = process.platform, execPath = process.execPath, which = (n) => findOnPath(n, { platform }), hookPath = HOOK, wrapperPath = WRAPPER } = {}) {
  const base = basename(execPath.replaceAll('\\', '/')).toLowerCase()
  if (base === 'node' || base === 'node.exe') return { runtime: execPath, script: hookPath, kind: 'node' }
  const node = which('node')
  if (node) return { runtime: node, script: hookPath, kind: 'node' }
  return { runtime: execPath, script: wrapperPath, kind: 'electron' }
}

function command(source, runtimeHint) {
  const r = pickRuntime({ execPath: runtimeHint })
  return buildHookCommand({ runtime: r.runtime, hookPath: r.script, source })
}

function readJson(file) {
  if (!existsSync(file)) return {}
  const raw = readFileSync(file, 'utf8')
  if (!raw.trim()) return {}
  return JSON.parse(raw) // JSON เสียอยู่แล้ว → throw ห้ามเขียนทับ
}

// รวม hook รุ่นเก่าจาก setup-sandbox.sh ที่ยังไม่มี marker (ชี้ไป hook.mjs ตัวเดียวกัน) กันติดซ้อน 2 ตัว
export const isOurCommand = (c) =>
  typeof c === 'string' &&
  [MARKER, OLD_MARKER, HOOK, HOOK.replaceAll('\\', '/'), WRAPPER, WRAPPER.replaceAll('\\', '/')].some((m) => c.includes(m))

const isOurs = (entry) =>
  entry?.hooks?.some((h) => isOurCommand(h.command))

function withoutOurs(json) {
  const hooks = { ...(json.hooks ?? {}) }
  for (const event of Object.keys(hooks)) {
    hooks[event] = (hooks[event] ?? []).filter((e) => !isOurs(e))
    if (hooks[event].length === 0) delete hooks[event]
  }
  return { ...json, hooks }
}

function write(file, json) {
  mkdirSync(dirname(file), { recursive: true })
  if (existsSync(file) && !existsSync(file + '.wai.bak')) copyFileSync(file, file + '.wai.bak') // backup ครั้งแรกครั้งเดียว
  if (Object.keys(json.hooks ?? {}).length === 0) delete json.hooks
  writeFileSync(file, JSON.stringify(json, null, 2) + '\n')
}

export function install(tool, scope, runtime) {
  const t = TOOLS[tool]
  const file = t.file(scope)
  const json = withoutOurs(readJson(file))
  const hook = { type: 'command', command: command(t.source, runtime), timeout: 300 } // default ของ UserPromptSubmit แค่ 30 วิ
  json.hooks.UserPromptSubmit = [...(json.hooks.UserPromptSubmit ?? []), { hooks: [hook] }]
  json.hooks.PreToolUse = [...(json.hooks.PreToolUse ?? []), { matcher: t.subagentMatcher, hooks: [hook] }]
  write(file, json)
  return file
}

export function uninstall(tool, scope) {
  const file = TOOLS[tool].file(scope)
  if (!existsSync(file)) return file
  write(file, withoutOurs(readJson(file)))
  return file
}

export function installed(tool, scope) {
  try {
    const json = readJson(TOOLS[tool].file(scope))
    return Object.values(json.hooks ?? {}).some((list) => list.some(isOurs))
  } catch {
    return false
  }
}

/**
 * Codex ไม่รัน hook ที่ยังไม่ trust · trust เก็บใน ~/.codex/config.toml [hooks.state."<file>:<event>:..."]
 * อ่านอย่างเดียว ห้ามเขียน trust แทนผู้ใช้ (ผูกกับ hash ถ้าคำสั่งเปลี่ยนต้อง trust ใหม่ เลยบอกได้แค่ว่า "เคย trust ไฟล์นี้")
 */
export function codexTrusted(scope) {
  const cfg = join(homedir(), '.codex', 'config.toml')
  if (!existsSync(cfg)) return false
  const file = TOOLS.codex.file(scope)
  const toml = readFileSync(cfg, 'utf8')
  return toml.includes(`[hooks.state."${file}:user_prompt_submit:`)
}

// CLI ข้ามแพลตฟอร์ม (แทน setup-sandbox.sh ที่ต้องมี bash): node install-hooks.mjs <install|uninstall|status> [sandbox|global|<โฟลเดอร์>] [claude|codex|both]
function cli(argv) {
  const [action, scope = 'sandbox', which = 'both'] = argv
  const tools = which === 'both' ? ['claude', 'codex'] : [which]
  if (!['install', 'uninstall', 'status'].includes(action) || tools.some((t) => !TOOLS[t])) {
    console.error('ใช้: node install-hooks.mjs <install|uninstall|status> [sandbox|global|<โฟลเดอร์ absolute>] [claude|codex|both]')
    return 1
  }
  if (scope !== 'sandbox' && scope !== 'global' && !(isAbsolute(scope) || win32.isAbsolute(scope))) {
    console.error('scope ต้องเป็น sandbox, global หรือ path โฟลเดอร์แบบเต็ม')
    return 1
  }
  for (const t of tools) {
    try {
      if (action === 'status') console.log(`${t}: ${installed(t, scope) ? 'ติดแล้ว' : 'ยังไม่ติด'} (${TOOLS[t].file(scope)})`)
      else if (action === 'install') console.log(`${t}: ติด hook แล้ว → ${install(t, scope, process.execPath)}`)
      else console.log(`${t}: ถอด hook แล้ว → ${uninstall(t, scope)}`)
    } catch (e) {
      console.error(`${t}: ไม่ได้แก้อะไร (อ่านไฟล์ settings ไม่ได้ JSON เสีย?) ${e.message}`)
      return 1
    }
  }
  if (action === 'install' && tools.includes('codex')) console.log('Codex: เปิดโฟลเดอร์นั้นใน Codex แล้ว trust โปรเจกต์ + อนุมัติ hook (/hooks) ก่อน')
  return 0
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = cli(process.argv.slice(2))
