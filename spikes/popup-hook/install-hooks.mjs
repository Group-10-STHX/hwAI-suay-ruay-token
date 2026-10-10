// ติด/ถอด hook ของ Claude Code และ Codex แบบ merge (ไม่ทับ hook อื่นของผู้ใช้)
// SPIKE: ของจริงย้ายไป /integrations (#4)
//
// scope:
//   sandbox = ~/wai-sandbox เท่านั้น (ตอน dev ห้ามติด global ไม่งั้น Claude Code ของทีมพัง)
//   global  = ~/.claude/settings.json + ~/.codex/hooks.json (เฉพาะแอปที่ package แล้ว + ผู้ใช้ติ๊กเอง)
//
// คำสั่งใน settings ชี้ไปที่ shim ที่ path คงที่ ~/.waikusa/hook.sh (mac/Linux) หรือ hook.cmd (Windows)
// shim ตั้ง ELECTRON_RUN_AS_NODE=1 แล้วเรียก Electron + hook.mjs (เครื่องผู้ใช้ไม่ต้องมี node)
// → แอปย้ายที่/อัปเดตเวอร์ชัน คำสั่งใน settings ไม่เปลี่ยน → Codex ไม่ต้อง trust ใหม่ (trust ผูกกับ hash ของคำสั่ง)
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOOK = join(dirname(fileURLToPath(import.meta.url)), 'hook.mjs')
const MARKER = 'WAI_HOOK=1' // ใช้หา entry ของเราตอนถอด (mac/Linux) · Windows หาจาก path ของ shim แทน
const SHIM_RE = /[\\/]\.waikusa[\\/]hook\.(cmd|sh)\b/
export const SANDBOX = join(homedir(), 'wai-sandbox')
export const shimPath = (platform = process.platform) => join(homedir(), '.waikusa', platform === 'win32' ? 'hook.cmd' : 'hook.sh')

export const TOOLS = {
  claude: {
    source: 'claude-code',
    file: (scope) => (scope === 'global' ? join(homedir(), '.claude', 'settings.json') : join(SANDBOX, '.claude', 'settings.local.json')),
    subagentMatcher: 'Task|Agent',
  },
  codex: {
    source: 'codex',
    file: (scope) => (scope === 'global' ? join(homedir(), '.codex', 'hooks.json') : join(SANDBOX, '.codex', 'hooks.json')),
    subagentMatcher: 'spawn_agent|Agent',
  },
}

/** quote สำหรับ sh: 'a b' (ใส่ ' ข้างในเป็น '\'') */
export const shQuote = (s) => `'${s.replaceAll("'", "'\\''")}'`

/** shim ของ mac/Linux · exec = exit code ของ hook (0/2) เป็นของ shim ตรงๆ */
export function shShim(runtime, hook = HOOK) {
  return `#!/bin/sh\n# ไหว้กูซะ: hook shim (สร้างอัตโนมัติ ห้ามแก้) ลบได้ถ้าถอด hook แล้ว\nELECTRON_RUN_AS_NODE=1 exec ${shQuote(runtime)} ${shQuote(hook)} "$@"\n`
}

/**
 * path ใน .cmd: cmd อ่านไฟล์ batch ด้วย code page OEM (ไทย = 874) ไม่ใช่ UTF-8 → path ไทยเพี้ยน
 * เลยแทนส่วนต้นด้วย env (%LOCALAPPDATA% ฯลฯ ซึ่ง cmd ขยายเป็น Unicode ถูกเสมอ) ที่เหลือ escape % เป็น %%
 */
export function cmdPath(p, env = process.env) {
  const vars = ['LOCALAPPDATA', 'APPDATA', 'USERPROFILE']
    .map((name) => [name, env[name]])
    .filter(([, v]) => v)
    .sort((a, b) => b[1].length - a[1].length) // ยาวสุดก่อน (LOCALAPPDATA อยู่ใต้ USERPROFILE)
  for (const [name, value] of vars) {
    const v = value.replace(/[\\/]+$/, '')
    if (p.toLowerCase().startsWith(v.toLowerCase() + '\\') || p.toLowerCase() === v.toLowerCase())
      return `%${name}%` + p.slice(v.length).replaceAll('%', '%%')
  }
  return p.replaceAll('%', '%%')
}

/**
 * shim ของ Windows (แบบเดียวกับ code.cmd ของ VS Code: set ELECTRON_RUN_AS_NODE=1 แล้วเรียก Code.exe + cli.js)
 * - CRLF, ไม่มี BOM (BOM ทำบรรทัดแรกพัง)
 * - ใช้ %1 ไม่ใช่ %* เพราะคำสั่งของ Codex ต่อท้าย "; exit $LASTEXITCODE" (ไว้ให้ PowerShell) ถ้าโดน cmd รันจะติดมาเป็น arg
 * - ถ้า path ยังมีตัวอักษรนอก ASCII (เช่น repo อยู่ D:\โปรเจกต์) สลับ chcp 65001 ชั่วคราวแล้วคืนค่าเดิม (console ใช้ร่วมกับ terminal ของผู้ใช้)
 * - cmd รอ electron.exe (GUI subsystem) จบเสมอเมื่ออยู่ใน batch → %ERRORLEVEL% = exit code ของ hook.mjs (2 = บล็อก)
 */
export function cmdShim(runtime, hook = HOOK, env = process.env) {
  const e = cmdPath(runtime, env)
  const h = cmdPath(hook, env)
  const unicode = /[^\x00-\x7f]/.test(e + h)
  const lines = [
    '@echo off',
    'rem waikusa hook shim (generated, do not edit; safe to delete after removing hooks)', // ASCII ล้วน: cmd อ่านเป็น OEM
    'setlocal DisableDelayedExpansion',
    'set "ELECTRON_RUN_AS_NODE=1"',
    ...(unicode
      ? [
          'set "WAI_CP="',
          'for /f "tokens=2 delims=:." %%a in (\'chcp\') do set /a WAI_CP=%%a >nul 2>&1',
          'chcp 65001 >nul 2>&1',
          `set "WAI_E=${e}"`,
          `set "WAI_H=${h}"`,
          'if defined WAI_CP chcp %WAI_CP% >nul 2>&1',
        ]
      : [`set "WAI_E=${e}"`, `set "WAI_H=${h}"`]),
    '"%WAI_E%" "%WAI_H%" %1',
    'exit /b %ERRORLEVEL%',
  ]
  return lines.join('\r\n') + '\r\n'
}

/** เขียน shim ที่ path คงที่ (เขียนทับทุกครั้ง เผื่อแอปย้ายที่) */
function writeShim(runtime, platform) {
  const file = shimPath(platform)
  mkdirSync(dirname(file), { recursive: true })
  if (platform === 'win32') writeFileSync(file, cmdShim(runtime), 'utf8')
  else {
    writeFileSync(file, shShim(runtime))
    chmodSync(file, 0o755)
  }
  return file
}

/** hook หนึ่งตัวใน settings ตาม tool + OS */
export function hookEntry(tool, platform = process.platform, shim = shimPath(platform), env = process.env) {
  const source = TOOLS[tool].source
  const timeout = 300 // default ของ UserPromptSubmit แค่ 30 วิ
  if (platform !== 'win32') return { type: 'command', command: `${MARKER} ${shQuote(shim)} ${source}`, timeout }
  if (tool === 'claude') {
    // Claude Code บน Windows รัน command ผ่าน Git Bash หรือ PowerShell แล้วแต่เครื่อง → ไม่มีสตริงไหน quote ถูกทั้งคู่
    // ใช้ exec form (args) spawn cmd.exe ตรงๆ ไม่ผ่าน shell · "call" กัน cmd /c ตัด quote ของ path ที่มีเว้นวรรค
    return { type: 'command', command: env.ComSpec || 'C:\\Windows\\System32\\cmd.exe', args: ['/d', '/c', 'call', shim, source], timeout }
  }
  // Codex บน Windows ไม่มี exec form · commandWindows รันผ่าน PowerShell ของ session (หรือ cmd.exe /c ถ้าไม่มี)
  // → ต้อง parse ได้ทั้งสองแบบ: ตัวโปรแกรมไม่มี quote, quote แค่ path (double quote ใช้ได้ทั้งคู่)
  // "; exit $LASTEXITCODE" ไม่งั้น PowerShell -Command แปลง exit 2 เป็น 1 (= ไม่บล็อก) · ถ้าโดน cmd รัน ส่วนนี้กลายเป็น arg ที่ shim ไม่อ่าน
  const cmd = `cmd.exe /d /c call "${shim}" ${source}; exit $LASTEXITCODE`
  return { type: 'command', command: cmd, commandWindows: cmd, timeout }
}

function readJson(file) {
  if (!existsSync(file)) return {}
  const raw = readFileSync(file, 'utf8')
  if (!raw.trim()) return {}
  return JSON.parse(raw) // JSON เสียอยู่แล้ว → throw ห้ามเขียนทับ
}

const mentionsUs = (s) => typeof s === 'string' && (s.includes(MARKER) || s.includes(HOOK) || SHIM_RE.test(s))
// รวม hook รุ่นเก่า (setup-sandbox.sh ไม่มี marker, รุ่นก่อน shim ที่ชี้ hook.mjs ตรง) กันติดซ้อน 2 ตัว
const isOurs = (entry) =>
  entry?.hooks?.some((h) => [h.command, h.commandWindows, ...(Array.isArray(h.args) ? h.args : [])].some(mentionsUs))

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

/** runtime = path ของ Electron (process.execPath) · opts.platform ไว้ทดสอบฝั่ง Windows บน mac */
export function install(tool, scope, runtime, { platform = process.platform } = {}) {
  const t = TOOLS[tool]
  const file = t.file(scope)
  const json = withoutOurs(readJson(file)) // อ่านก่อน: JSON เสีย = throw ก่อนเขียนอะไรทั้งนั้น
  const shim = writeShim(runtime, platform)
  const hook = hookEntry(tool, platform, shim)
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
 * Windows: path ใน TOML basic string มี \ ถูก escape เป็น \\ → เช็กทั้งสองแบบ
 */
export function codexTrusted(scope) {
  const cfg = join(homedir(), '.codex', 'config.toml')
  if (!existsSync(cfg)) return false
  const file = TOOLS.codex.file(scope)
  const toml = readFileSync(cfg, 'utf8')
  return [file, file.replaceAll('\\', '\\\\')].some((f) => toml.includes(`[hooks.state."${f}:user_prompt_submit:`))
}
