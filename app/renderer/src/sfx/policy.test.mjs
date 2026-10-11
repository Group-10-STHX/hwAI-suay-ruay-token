// รัน: node --experimental-strip-types --test src/sfx/policy.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { decideSounds, initialMemory } from './policy.ts'

const snap = (o = {}) => ({ state: 'WATCHING', score: 0, level: 0, isWai: false, reasons: [], ...o })
const idle = snap({ state: 'IDLE' })

test('off และ idle ไม่มีเสียง', () => {
  assert.deepEqual(decideSounds(idle, snap(), 'off', 0).sounds, [])
  assert.deepEqual(decideSounds(snap(), idle, 'many', 0).sounds, [])
  assert.deepEqual(decideSounds(idle, idle, 'many', 0).sounds, [])
})

test('scanOn เมื่อมีคำขอใหม่', () => {
  assert.deepEqual(decideSounds(idle, snap({ state: 'DEMANDING' }), 'few', 0).sounds, ['scanOn'])
})

test('few: pass / fail / rage เท่านั้น ไม่มี tick', () => {
  const m = initialMemory
  assert.deepEqual(decideSounds(snap(), snap({ state: 'PASSED' }), 'few', 0, m).sounds, ['pass'])
  assert.deepEqual(decideSounds(snap(), snap({ state: 'RETRY' }), 'few', 0, m).sounds, ['fail'])
  assert.deepEqual(decideSounds(snap(), snap({ state: 'RAGE_QUIT' }), 'few', 0, m).sounds, ['rage'])
  assert.deepEqual(decideSounds(snap(), snap({ state: 'FORGIVE' }), 'few', 0, m).sounds, [])
  const r = decideSounds(snap({ isWai: true, score: 10 }), snap({ isWai: true, score: 40, level: 2 }), 'few', 0, m)
  assert.deepEqual(r.sounds, [])
})

test('few: scanOn ถูกจำกัด 1 วินาที', () => {
  const a = decideSounds(idle, snap(), 'few', 1000)
  assert.deepEqual(a.sounds, ['scanOn'])
  const b = decideSounds(idle, snap(), 'few', 1400, a.memory)
  assert.deepEqual(b.sounds, [])
  const c = decideSounds(idle, snap(), 'few', 2100, a.memory)
  assert.deepEqual(c.sounds, ['scanOn'])
})

test('many: tick ทุก +5, levelUp, forgive, static', () => {
  const m = initialMemory
  const held = snap({ isWai: true, score: 8, lastWatch: 0 })
  const t = decideSounds(held, snap({ isWai: true, score: 12 }), 'many', 5000, m)
  assert.ok(t.sounds.includes('tick'))
  const same = decideSounds(snap({ isWai: true, score: 11 }), snap({ isWai: true, score: 13 }), 'many', 5000, m)
  assert.ok(!same.sounds.includes('tick'))
  const lv = decideSounds(snap({ isWai: true, level: 1 }), snap({ isWai: true, level: 2 }), 'many', 5000, m)
  assert.ok(lv.sounds.includes('levelUp'))
  assert.deepEqual(decideSounds(snap(), snap({ state: 'FORGIVE' }), 'many', 0, m).sounds, ['forgive'])
  const st = decideSounds(snap({ reasons: ['HANDS_APART'] }), snap({ reasons: ['NOT_BOWING'] }), 'many', 5000, m)
  assert.ok(st.sounds.includes('static'))
})

test('many: tick ไม่เกิน 8 ต่อวินาที', () => {
  let mem = initialMemory
  let played = 0
  for (let i = 0; i < 20; i++) {
    const r = decideSounds(snap({ isWai: true, score: i * 5 }), snap({ isWai: true, score: i * 5 + 5 }), 'many', 10000 + i * 10, mem)
    mem = r.memory
    played += r.sounds.filter((s) => s === 'tick').length
  }
  assert.equal(played, 8)
})

test('many: tickQuiet ทุกวินาทีตอน WATCHING', () => {
  const a = decideSounds(snap(), snap(), 'many', 5000)
  assert.ok(a.sounds.includes('tickQuiet'))
  const b = decideSounds(snap(), snap(), 'many', 5500, a.memory)
  assert.ok(!b.sounds.includes('tickQuiet'))
  const c = decideSounds(snap(), snap(), 'many', 6100, a.memory)
  assert.ok(c.sounds.includes('tickQuiet'))
})
