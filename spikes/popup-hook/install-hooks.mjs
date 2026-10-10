// ติด/ถอด hook ของ Claude Code และ Codex แบบ merge (ไม่ทับ hook อื่นของผู้ใช้)
// SPIKE: ของจริงย้ายไป /integrations (#4)
//
// scope:
//   sandbox = ~/wai-sandbox เท่านั้น (ตอน dev ห้ามติด global ไม่งั้น Claude Code ของทีมพัง)
//   global  = ~/.claude/settings.json + ~/.codex/hooks.json (เฉพาะแอปที่ package แล้ว + ผู้ใช้ติ๊กเอง)
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOOK = join(dirname(fileURLToPath(import.meta.url)), 'hook.mjs')
const MARKER = 'WAI_HOOK=1' // ใช้หา entry ของเราตอนถอด
export const SANDBOX = join(homedir(), 'wai-sandbox')

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

const q = (s) => `'${s.replaceAll("'", "'\\''")}'`

/** คำสั่งที่ hook รัน: ใช้ binary ของ Electron เป็น node เครื่องผู้ใช้ไม่ต้องมี node */
function command(source, runtime) {
  return `${MARKER} ELECTRON_RUN_AS_NODE=1 ${q(runtime)} ${q(HOOK)} ${source}`
}

function readJson(file) {
  if (!existsSync(file)) return {}
  const raw = readFileSync(file, 'utf8')
  if (!raw.trim()) return {}
  return JSON.parse(raw) // JSON เสียอยู่แล้ว → throw ห้ามเขียนทับ
}

// รวม hook รุ่นเก่าจาก setup-sandbox.sh ที่ยังไม่มี marker (ชี้ไป hook.mjs ตัวเดียวกัน) กันติดซ้อน 2 ตัว
const isOurs = (entry) =>
  entry?.hooks?.some((h) => typeof h.command === 'string' && (h.command.includes(MARKER) || h.command.includes(HOOK)))

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
