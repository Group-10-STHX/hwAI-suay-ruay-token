// session-state: anger state machine per session_id
// Contract: docs/wai-data-contract.md §4 · copy/states: app/renderer/FRONT_RULES.md §4 · types: app/renderer/src/api/types.ts
//
// Pure module: no I/O, no timers, no Electron. main.mjs owns the queue and calls
//   demand(id)          a request of this session is now waiting (top of queue): PASSED → DEMANDING, RAGE_QUIT → FORGIVE
//   onPass(id, pass)    vision:pass while this session is top of the queue
//   onFail(id, fail)    vision:fail while this session is top of the queue
//   requiredLevel(id)   what main sends in vision:control
//   get(id)/snapshot(id)   {session_id, fails, anger, state, required, forgave}  (read-only, never creates a session)
//
// Rules
//   anger = min(fails, 6)
//   fails 0 → DEMANDING (PASSED right after a pass) · 1–2 RETRY · 3–4 ANNOYED · 5 SULKING · 6 RAGE_QUIT · after rage quit FORGIVE
//   required level: DEMANDING/PASSED/RETRY 1 · ANNOYED/SULKING 2 · RAGE_QUIT/FORGIVE 3
//   a pass at level ≥ required → fails = 0, state PASSED, action 'allow'; leaving FORGIVE this way sets forgave:true
//   a pass BELOW the required level is treated exactly like a fail (anger +1, not released). The worker only sends
//     vision:pass when level ≥ the required level it knows about, so this only happens in the IPC race right after the
//     required level rose; had the worker known, it would have sent vision:fail. Treating it as a fail keeps the outcome
//     independent of IPC timing.
//   fails in SULKING keep the request waiting (action 'retry'); the 6th fail is RAGE_QUIT (action 'rage_quit')
//   fails in FORGIVE keep waiting (action 'retry'); fails keep counting but anger stays at 6
//   forgave is true from the forgiving pass until the next attempt (pass or fail) of that session
//   WATCHING is a renderer-side state (camera sees someone) and is not modelled here; IDLE = no request (main decides)
//   skip (dev), bypass, expiry and disabled-app never touch the machine
//   SAFETY: RAGE_QUIT only changes state. Nothing here (or in main) moves, renames or deletes any session file.

export const MAX_ANGER = 6
export const ANNOYED_AT = 3
export const SULK_AT = 5
export const RAGE_AT = 6

/** level ขั้นต่ำต่อ state ตรงกับ REQUIRED_LEVEL ใน app/renderer/src/api/types.ts */
export const REQUIRED_LEVEL = Object.freeze({
  IDLE: 1,
  DEMANDING: 1,
  WATCHING: 1,
  PASSED: 1,
  RETRY: 1,
  ANNOYED: 2,
  SULKING: 2,
  RAGE_QUIT: 3,
  FORGIVE: 3,
})

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const key = (id) => String(id ?? 'unknown')
const fresh = () => ({ fails: 0, forgiving: false, passed: false, forgave: false })

export const angerFor = (fails) => Math.min(Math.max(0, Math.trunc(num(fails))), MAX_ANGER)

/** state จากข้อเท็จจริงของ session (ไม่มี side effect) */
export function stateFor({ fails = 0, forgiving = false, passed = false } = {}) {
  if (forgiving) return 'FORGIVE'
  if (fails >= RAGE_AT) return 'RAGE_QUIT'
  if (fails >= SULK_AT) return 'SULKING'
  if (fails >= ANNOYED_AT) return 'ANNOYED'
  if (fails >= 1) return 'RETRY'
  return passed ? 'PASSED' : 'DEMANDING'
}

export function createSessions() {
  /** session_id → {fails, forgiving, passed, forgave} */
  const map = new Map()

  const peek = (id) => map.get(key(id)) ?? fresh()
  const touch = (id) => {
    const k = key(id)
    if (!map.has(k)) map.set(k, fresh())
    return map.get(k)
  }
  const view = (id, s) => {
    const state = stateFor(s)
    return { session_id: key(id), fails: s.fails, anger: angerFor(s.fails), state, required: REQUIRED_LEVEL[state], forgave: s.forgave }
  }

  function get(id) {
    return view(id, peek(id))
  }

  function requiredLevel(id) {
    return REQUIRED_LEVEL[stateFor(peek(id))]
  }

  /** คำขอของ session นี้ขึ้นเป็นหัวคิว: PASSED → DEMANDING, RAGE_QUIT → FORGIVE (idempotent) */
  function demand(id) {
    const s = touch(id)
    s.passed = false
    if (!s.forgiving && s.fails >= RAGE_AT) s.forgiving = true
    return view(id, s)
  }

  function fail(s, id) {
    s.passed = false
    s.forgave = false
    s.fails += 1
    const v = view(id, s)
    return { accepted: false, action: v.state === 'RAGE_QUIT' ? 'rage_quit' : 'retry', ...v }
  }

  /** vision:fail ของ session หัวคิว → {accepted:false, action:'retry'|'rage_quit', state, anger, forgave, required, fails} */
  function onFail(id, _fail = {}) {
    return fail(touch(id), id)
  }

  /** vision:pass ของ session หัวคิว → {accepted, action:'allow'|'retry'|'rage_quit', state, anger, forgave, required, fails, reason?} */
  function onPass(id, pass = {}) {
    const s = touch(id)
    const required = REQUIRED_LEVEL[stateFor(s)]
    const level = num(pass.level)
    if (level < required) return { ...fail(s, id), reason: 'BELOW_REQUIRED', required_was: required }
    const forgave = s.forgiving
    s.fails = 0
    s.forgiving = false
    s.passed = true
    s.forgave = forgave
    return { accepted: true, action: 'allow', ...view(id, s) }
  }

  function reset(id) {
    map.delete(key(id))
  }

  return { get, snapshot: get, demand, onPass, onFail, requiredLevel, reset, get size() { return map.size } }
}

/**
 * แผนการตัดสินของ main.mjs เมื่อได้ vision:pass / vision:fail ขณะ `item` เป็นหัวคิว (pure, ทดสอบได้โดยไม่ boot Electron)
 *   resolve          ผลที่ใช้ปลดคำขอ หรือ null = ยังรอต่อ (RETRY/ANNOYED/SULKING/FORGIVE)
 *   releaseSession   true เมื่อ rage quit: ปลดทุกคำขอของ session นี้ด้วยผลเดียวกัน (AI งอนทั้ง session)
 *   record           ฟิลด์ตาม contract §2 ที่ส่งให้ waiLog.record (ตัว log เติม v/id/at/awards/tokens เอง)
 */
export function planVision(sessions, item, type, payload = {}) {
  const sid = item.session_id
  const r = type === 'pass' ? sessions.onPass(sid, payload) : sessions.onFail(sid, payload)
  const level = num(payload.level)
  const score = num(payload.score)
  const resolve = r.accepted
    ? { passed: true, level, score, action: 'allow' }
    : r.action === 'rage_quit'
      ? { passed: false, level, score, action: 'rage_quit' }
      : null
  const record = {
    session_id: sid,
    source: item.source,
    kind: item.kind,
    agent_label: item.agent_label,
    passed: r.accepted,
    action: r.action,
    level,
    score,
    hold_ms: num(payload.holdMs ?? payload.hold_ms),
    parts: payload.parts ?? null,
    attempts: payload.attempts ?? r.fails, // vision:fail ไม่ส่ง attempts มา ใช้จำนวน fail ของ session แทน
    style: payload.style,
    state: r.state,
    anger: r.anger,
    forgave: r.forgave,
  }
  return { ...r, resolve, releaseSession: r.action === 'rage_quit', record }
}
