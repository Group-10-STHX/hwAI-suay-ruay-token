#!/usr/bin/env node
// SPIKE: hook UserPromptSubmit + PreToolUse(subagent) ของ Claude Code / Codex (argv[2] = claude-code | codex) → ขอไหว้จาก daemon แล้วรอผล
// exit 0 = ให้ทำงาน · exit 2 = บล็อก (prompt: stderr โชว์ผู้ใช้ · subagent: stderr ส่งให้ AI อ่าน)
// ของจริงเป็นงานของ #4 (/integrations)
const DAEMON = process.env.WAI_DAEMON_URL ?? 'http://127.0.0.1:7777'
const GIVE_UP_MS = 290_000 // ต้องจบก่อน timeout 300 วิ ของ hook
// Claude Code กับ Codex ใช้ hook รูปแบบเดียวกัน (UserPromptSubmit, exit 2 = บล็อก) ต่างกันแค่ชื่อ
const SOURCE = process.argv[2] ?? 'claude-code'
const LABEL = { 'claude-code': 'Claude Code', codex: 'Codex' }[SOURCE] ?? SOURCE

if (process.env.WAI_BYPASS === '1') process.exit(0)

// อ่าน stdin (JSON จาก Claude Code / Codex) · กันค้าง: ถ้า wrapper (cmd/PowerShell บน Windows) ไม่ส่งต่อหรือไม่ปิด stdin
// รอแค่ 3 วิ แล้วไปต่อด้วยเท่าที่ได้ (field ที่ใช้มีแค่ hook_event_name, session_id, tool_input)
const STDIN_MS = 3_000
const raw = await new Promise((done) => {
  let buf = ''
  const finish = () => {
    clearTimeout(timer)
    done(buf)
  }
  const timer = setTimeout(() => {
    process.stdin.pause()
    process.stdin.unref?.()
    finish()
  }, STDIN_MS)
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (c) => (buf += c))
  process.stdin.on('end', finish)
  process.stdin.on('error', finish)
})
let input = {}
try {
  input = JSON.parse(raw || '{}')
} catch {
  // stdin เพี้ยน (เช่น encoding ของ PowerShell) → ใช้ค่า default ยังขอไหว้ได้
}

// UserPromptSubmit = prompt หลัก · PreToolUse (Task|Agent / spawn_agent) = subagent
const isSubagent = input.hook_event_name === 'PreToolUse'
const tool = input.tool_input ?? {}
const agentLabel = isSubagent
  ? `${LABEL} › ${tool.subagent_type ?? tool.agent_type ?? tool.description ?? 'subagent'}`
  : LABEL

let id
try {
  const res = await fetch(`${DAEMON}/wai/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: SOURCE, kind: isSubagent ? 'subagent' : 'prompt', session_id: input.session_id, agent_label: agentLabel }),
  })
  ;({ id } = await res.json())
  if (!id) throw new Error('no id')
} catch {
  // daemon ไม่ได้เปิด → ปล่อยผ่าน ไม่งั้นทีมใช้ Claude Code ทำงานไม่ได้
  process.exit(0)
}

const deadline = Date.now() + GIVE_UP_MS
while (Date.now() < deadline) {
  let res
  try {
    res = await fetch(`${DAEMON}/wai/wait/${id}`)
  } catch {
    process.exit(0) // daemon ตายกลางทาง → ปล่อยผ่าน
  }
  if (res.status === 202) continue // ยังไม่ไหว้ long-poll ใหม่
  // 404 (daemon restart แล้วลืม id) / 5xx / body เพี้ยน → ปล่อยผ่าน (fail-open) ไม่ใช่ "ไหว้ไม่สวย"
  let result = null
  if (res.ok) result = await res.json().catch(() => null)
  if (!result || typeof result.action !== 'string') {
    process.stderr.write(`[ไหว้กูซะ] daemon ตอบแปลก (HTTP ${res.status}) ปล่อยผ่าน\n`)
    process.exit(0)
  }
  if (result.action === 'allow') process.exit(0)
  if (['retry', 'deny', 'rage_quit'].includes(result.action)) {
    process.stderr.write(result.action === 'rage_quit' ? 'AI งอนแล้ว ไปขอขมาซะ\nไหว้ไม่ผ่าน 6 ครั้ง AI ไม่คุยกับ session นี้แล้ว · ส่ง prompt ใหม่แล้วไหว้พระ (level 3) ค้างไว้ AI ถึงจะกลับมาคุย\n' : 'ไหว้ไม่สวย ส่ง prompt ใหม่แล้วไหว้ใหม่\n')
    process.exit(2)
  }
  process.stderr.write(`[ไหว้กูซะ] ไม่รู้จัก action "${result.action}" ปล่อยผ่าน\n`)
  process.exit(0)
}
process.stderr.write('หมดเวลาไหว้ (300 วิ) AI ไม่ทำงานให้\n')
process.exit(2)
