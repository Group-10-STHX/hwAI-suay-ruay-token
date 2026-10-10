#!/usr/bin/env node
// SPIKE: hook UserPromptSubmit ของ Claude Code / Codex (argv[2] = claude-code | codex) → ขอไหว้จาก daemon แล้วรอผล
// exit 0 = ให้ AI ทำงาน · exit 2 = บล็อก prompt (stderr โชว์ให้ผู้ใช้)
// ของจริงเป็นงานของ #4 (/integrations)
const DAEMON = process.env.WAI_DAEMON_URL ?? 'http://127.0.0.1:7777'
const GIVE_UP_MS = 290_000 // ต้องจบก่อน timeout 300 วิ ของ hook
// Claude Code กับ Codex ใช้ hook รูปแบบเดียวกัน (UserPromptSubmit, exit 2 = บล็อก) ต่างกันแค่ชื่อ
const SOURCE = process.argv[2] ?? 'claude-code'
const LABEL = { 'claude-code': 'Claude Code', codex: 'Codex' }[SOURCE] ?? SOURCE

if (process.env.WAI_BYPASS === '1') process.exit(0)

let raw = ''
for await (const chunk of process.stdin) raw += chunk
const input = JSON.parse(raw || '{}')

let id
try {
  const res = await fetch(`${DAEMON}/wai/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: SOURCE, kind: 'prompt', session_id: input.session_id, agent_label: LABEL }),
  })
  ;({ id } = await res.json())
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
  const result = await res.json()
  if (result.action === 'allow') process.exit(0)
  process.stderr.write(result.action === 'rage_quit' ? 'AI งอนแล้ว ไปขอขมาซะ' : 'ไหว้ไม่สวย ส่ง prompt ใหม่แล้วไหว้ใหม่\n')
  process.exit(2)
}
process.stderr.write('หมดเวลาไหว้ (300 วิ) AI ไม่ทำงานให้\n')
process.exit(2)
