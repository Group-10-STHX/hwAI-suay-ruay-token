import test from 'node:test'
import assert from 'node:assert/strict'
import { createSessions, planVision, stateFor, angerFor, REQUIRED_LEVEL, MAX_ANGER } from '../session-state.mjs'

const S = 'sess-1'
const fail = (level = 1, score = 40) => ({ level, score, holdMs: 400, reasons: ['HANDS_TOO_LOW'], parts: { sym: 1, cen: 1, hold: 0.4, bow: null } })
const pass = (level = 1, score = 85) => ({ level, score, holdMs: 1100, parts: { sym: 1, cen: 1, hold: 1, bow: 12 }, attempts: 0, style: 'normal' })
const failN = (m, id, n, level = 1) => {
  let last
  for (let i = 0; i < n; i++) last = m.onFail(id, fail(level))
  return last
}

test('fresh session: DEMANDING, anger 0, level 1, not created by get()', () => {
  const m = createSessions()
  assert.deepEqual(m.get(S), { session_id: S, fails: 0, anger: 0, state: 'DEMANDING', required: 1, forgave: false })
  assert.equal(m.requiredLevel(S), 1)
  assert.equal(m.size, 0)
  assert.equal(m.snapshot, m.get)
})

test('full progression 0..6 fails: state, anger, required level, action', () => {
  const m = createSessions()
  const expect = [
    // fails, state, required, action
    [1, 'RETRY', 1, 'retry'],
    [2, 'RETRY', 1, 'retry'],
    [3, 'ANNOYED', 2, 'retry'],
    [4, 'ANNOYED', 2, 'retry'],
    [5, 'SULKING', 2, 'retry'],
    [6, 'RAGE_QUIT', 3, 'rage_quit'],
  ]
  for (const [fails, state, required, action] of expect) {
    const r = m.onFail(S, fail())
    assert.equal(r.accepted, false)
    assert.equal(r.fails, fails, `fails after ${fails}`)
    assert.equal(r.anger, fails)
    assert.equal(r.state, state, `state at ${fails} fails`)
    assert.equal(r.required, required)
    assert.equal(r.action, action)
    assert.equal(r.forgave, false)
    assert.equal(m.requiredLevel(S), required)
  }
})

test('anger caps at 6 while fails keep counting', () => {
  const m = createSessions()
  failN(m, S, 9)
  assert.equal(m.get(S).fails, 9)
  assert.equal(m.get(S).anger, MAX_ANGER)
  assert.equal(angerFor(100), 6)
  assert.equal(angerFor(-3), 0)
  assert.equal(angerFor(NaN), 0)
})

test('pass at the required level resets fails and reports PASSED', () => {
  const m = createSessions()
  failN(m, S, 2)
  const r = m.onPass(S, pass(1))
  assert.equal(r.accepted, true)
  assert.equal(r.action, 'allow')
  assert.equal(r.state, 'PASSED')
  assert.equal(r.anger, 0)
  assert.equal(r.fails, 0)
  assert.equal(r.forgave, false)
  assert.equal(m.requiredLevel(S), 1)
  // next request of the session is DEMANDING again
  assert.equal(m.demand(S).state, 'DEMANDING')
})

test('ANNOYED needs level 2: a level-1 pass counts as a fail and does not release', () => {
  const m = createSessions()
  failN(m, S, 3) // ANNOYED
  const r = m.onPass(S, pass(1))
  assert.equal(r.accepted, false)
  assert.equal(r.action, 'retry')
  assert.equal(r.reason, 'BELOW_REQUIRED')
  assert.equal(r.required_was, 2)
  assert.equal(r.fails, 4)
  assert.equal(r.state, 'ANNOYED')
  const ok = m.onPass(S, pass(2))
  assert.equal(ok.accepted, true)
  assert.equal(ok.state, 'PASSED')
})

test('SULKING keeps waiting; a level-2 pass brings it back', () => {
  const m = createSessions()
  const r = failN(m, S, 5)
  assert.equal(r.state, 'SULKING')
  assert.equal(r.action, 'retry')
  assert.equal(m.requiredLevel(S), 2)
  const low = m.onPass(S, pass(1)) // below required = fail #6 = rage quit
  assert.equal(low.accepted, false)
  assert.equal(low.action, 'rage_quit')
  assert.equal(low.state, 'RAGE_QUIT')

  const m2 = createSessions()
  failN(m2, S, 5)
  const ok = m2.onPass(S, pass(2))
  assert.equal(ok.accepted, true)
  assert.equal(ok.anger, 0)
  assert.equal(ok.forgave, false, 'coming back from SULKING is not a forgive')
})

test('FORGIVE flow: rage quit → next request needs level 3 → pass sets forgave and resets', () => {
  const m = createSessions()
  const rq = failN(m, S, 6)
  assert.equal(rq.state, 'RAGE_QUIT')
  assert.equal(rq.action, 'rage_quit')
  assert.equal(m.get(S).state, 'RAGE_QUIT')

  // a new request of the session arrives
  const d = m.demand(S)
  assert.equal(d.state, 'FORGIVE')
  assert.equal(d.required, 3)
  assert.equal(d.anger, 6)
  assert.equal(m.requiredLevel(S), 3)
  assert.deepEqual(m.demand(S), d, 'demand is idempotent')

  // level 2 is not enough: still FORGIVE, waits, never rage-quits again
  const low = m.onPass(S, pass(2))
  assert.equal(low.accepted, false)
  assert.equal(low.action, 'retry')
  assert.equal(low.state, 'FORGIVE')
  assert.equal(low.anger, 6)
  const f = m.onFail(S, fail(1))
  assert.equal(f.state, 'FORGIVE')
  assert.equal(f.action, 'retry')
  assert.equal(f.fails, 8)
  assert.equal(f.anger, 6)

  // level 3 forgives
  const ok = m.onPass(S, pass(3, 90))
  assert.equal(ok.accepted, true)
  assert.equal(ok.action, 'allow')
  assert.equal(ok.state, 'PASSED')
  assert.equal(ok.forgave, true)
  assert.equal(ok.fails, 0)
  assert.equal(ok.anger, 0)
  assert.equal(m.get(S).forgave, true, 'forgave stays visible until the next attempt')
  assert.equal(m.requiredLevel(S), 1)

  // afterwards the session is normal again
  assert.equal(m.demand(S).state, 'DEMANDING')
  const next = m.onFail(S, fail())
  assert.equal(next.forgave, false)
  assert.equal(next.state, 'RETRY')
  assert.equal(next.fails, 1)
})

test('per-session isolation', () => {
  const m = createSessions()
  failN(m, 'a', 5)
  failN(m, 'b', 1)
  assert.equal(m.get('a').state, 'SULKING')
  assert.equal(m.get('b').state, 'RETRY')
  assert.equal(m.get('c').state, 'DEMANDING')
  assert.equal(m.requiredLevel('a'), 2)
  assert.equal(m.requiredLevel('b'), 1)
  m.onPass('b', pass(1))
  assert.equal(m.get('a').fails, 5)
  assert.equal(m.get('b').fails, 0)
  assert.equal(m.size, 2)
  m.reset('a')
  assert.equal(m.get('a').state, 'DEMANDING')
  assert.equal(m.size, 1)
})

test('undefined / non-string ids map to one "unknown" session; bad levels count as 0', () => {
  const m = createSessions()
  m.onFail(undefined, fail())
  assert.equal(m.get(null).fails, 1)
  assert.equal(m.get('unknown').fails, 1)
  const r = m.onPass('x', { level: 'high', score: 99 })
  assert.equal(r.accepted, false, 'non-numeric level is below level 1')
})

test('stateFor / REQUIRED_LEVEL match the renderer table', () => {
  assert.equal(stateFor({}), 'DEMANDING')
  assert.equal(stateFor({ passed: true }), 'PASSED')
  assert.equal(stateFor({ fails: 2 }), 'RETRY')
  assert.equal(stateFor({ fails: 4 }), 'ANNOYED')
  assert.equal(stateFor({ fails: 5 }), 'SULKING')
  assert.equal(stateFor({ fails: 6 }), 'RAGE_QUIT')
  assert.equal(stateFor({ fails: 6, forgiving: true }), 'FORGIVE')
  assert.deepEqual(REQUIRED_LEVEL, { IDLE: 1, DEMANDING: 1, WATCHING: 1, PASSED: 1, RETRY: 1, ANNOYED: 2, SULKING: 2, RAGE_QUIT: 3, FORGIVE: 3 })
})

// ---------- planVision: the decision main.mjs applies ----------
const item = { id: 'req-1', source: 'claude-code', kind: 'prompt', session_id: S, agent_label: 'Claude Code', created_at: 0 }

test('planVision pass → resolve allow + full contract record', () => {
  const m = createSessions()
  const p = planVision(m, item, 'pass', { ...pass(1, 88), attempts: 2, style: 'weird' })
  assert.deepEqual(p.resolve, { passed: true, level: 1, score: 88, action: 'allow' })
  assert.equal(p.releaseSession, false)
  assert.deepEqual(p.record, {
    session_id: S,
    source: 'claude-code',
    kind: 'prompt',
    agent_label: 'Claude Code',
    passed: true,
    action: 'allow',
    level: 1,
    score: 88,
    hold_ms: 1100,
    parts: { sym: 1, cen: 1, hold: 1, bow: 12 },
    attempts: 2,
    style: 'weird',
    state: 'PASSED',
    anger: 0,
    forgave: false,
  })
})

test('planVision fail → no resolve, record retry with state/anger; 6th fail → rage_quit for the whole session', () => {
  const m = createSessions()
  for (let i = 1; i <= 5; i++) {
    const p = planVision(m, item, 'fail', fail(1, 30 + i))
    assert.equal(p.resolve, null, `fail ${i} keeps waiting`)
    assert.equal(p.record.passed, false)
    assert.equal(p.record.action, 'retry')
    assert.equal(p.record.anger, i)
    assert.equal(p.record.attempts, i, 'vision:fail has no attempts → session fails')
    assert.equal(p.record.hold_ms, 400)
  }
  assert.equal(m.get(S).state, 'SULKING')
  const p = planVision(m, item, 'fail', fail(2, 55))
  assert.deepEqual(p.resolve, { passed: false, level: 2, score: 55, action: 'rage_quit' })
  assert.equal(p.releaseSession, true)
  assert.equal(p.record.action, 'rage_quit')
  assert.equal(p.record.state, 'RAGE_QUIT')
  assert.equal(p.record.anger, 6)
  assert.equal(p.record.passed, false)
})

test('planVision: pass below required level is recorded as a failed retry and does not release', () => {
  const m = createSessions()
  for (let i = 0; i < 3; i++) planVision(m, item, 'fail', fail())
  const p = planVision(m, item, 'pass', pass(1))
  assert.equal(p.resolve, null)
  assert.equal(p.accepted, false)
  assert.equal(p.record.passed, false)
  assert.equal(p.record.action, 'retry')
  assert.equal(p.record.state, 'ANNOYED')
  assert.equal(p.record.anger, 4)
})

test('planVision: forgiving pass records forgave:true', () => {
  const m = createSessions()
  for (let i = 0; i < 6; i++) planVision(m, item, 'fail', fail())
  m.demand(S)
  const p = planVision(m, item, 'pass', pass(3, 95))
  assert.deepEqual(p.resolve, { passed: true, level: 3, score: 95, action: 'allow' })
  assert.equal(p.record.forgave, true)
  assert.equal(p.record.state, 'PASSED')
  assert.equal(p.record.anger, 0)
})
