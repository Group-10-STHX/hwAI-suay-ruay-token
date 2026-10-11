import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCardNumber, createEvents, REDO_LINES, TRIBUTE_AMOUNT } from '../events.mjs';

const seq = (...v) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]; };

test('disabled: never fires', () => {
  const e = createEvents({ rng: () => 0, enabled: false });
  assert.equal(e.onAttempt('a', 'pass').type, 'none');
});

test('redo: only on pass, once per request, expires', () => {
  let t = 1000;
  const e = createEvents({ rng: seq(0.9, 0.01), now: () => t, tributeP: 0, redoP: 0.5, redoMs: 4000 });
  assert.equal(e.onAttempt('a', 'fail').type, 'none'); // fail ไม่เกิด redo
  const r = e.onAttempt('a', 'pass');
  assert.equal(r.type, 'redo');
  assert.ok(REDO_LINES.includes(r.event.text));
  assert.equal(e.active().kind, 'redo');
  assert.equal(e.onAttempt('a', 'pass').type, 'none'); // ใบเดิมไม่เกิดซ้ำ
  t += 4001;
  assert.equal(e.active(), null);
});

test('tribute: blocks every attempt until paid; pay returns the request id', () => {
  const e = createEvents({ rng: () => 0, tributeP: 1, redoP: 0 });
  const r = e.onAttempt('a', 'fail');
  assert.equal(r.type, 'tribute');
  assert.equal(r.event.amount, TRIBUTE_AMOUNT);
  assert.equal(e.blocking(), true);
  assert.equal(e.onAttempt('a', 'pass').type, 'tribute'); // ไหว้สวยก็ไม่ผ่าน
  assert.equal(e.pay(), 'a');
  assert.equal(e.blocking(), false);
  assert.equal(e.onAttempt('a', 'pass').type, 'none'); // จ่ายแล้วไม่เรียกซ้ำใบเดิม
  assert.equal(e.pay(), null);
});

test('tribute times out into normal flow', () => {
  let t = 0;
  const e = createEvents({ rng: () => 0, now: () => t, tributeP: 1, tributeMs: 1000 });
  e.onAttempt('a', 'pass');
  t = 1500;
  assert.equal(e.blocking(), false);
});

test('card number mock rules', () => {
  assert.equal(checkCardNumber('').ok, false);
  assert.equal(checkCardNumber('1234').ok, false);
  assert.equal(checkCardNumber('1111 1111 1111 1111').ok, false);
  assert.equal(checkCardNumber('1234-5678-9012-3456').ok, true);
  assert.equal(checkCardNumber('1'.repeat(25)).ok, false);
});

test('modes: always fires on every request (once each), off never, setMode off clears the active event', () => {
  const e = createEvents({ rng: () => 0.999, modes: { redo: 'always', tribute: 'off' } });
  assert.equal(e.onAttempt('a', 'pass').type, 'redo');
  assert.equal(e.onAttempt('b', 'pass').type, 'redo'); // ทุกคำขอ
  assert.equal(e.onAttempt('b', 'pass').type, 'none'); // แต่ครั้งเดียวต่อคำขอ
  e.setMode('tribute', 'always');
  assert.equal(e.onAttempt('c', 'fail').type, 'tribute');
  assert.equal(e.blocking(), true);
  e.setMode('tribute', 'off');
  assert.equal(e.blocking(), false);
  assert.equal(e.setMode('nope', 'off'), false);
  assert.equal(e.setMode('redo', 'sometimes'), false);
  assert.deepEqual(e.getModes(), { redo: 'always', tribute: 'off', chant: 'always', sixseven: 'random' });
});

test('sixseven: random fires only on score 67, always fires once per request, blocks like tribute, finish clears', () => {
  const e = createEvents({ rng: () => 0.999, tributeP: 0, redoP: 0 });
  assert.equal(e.maybeSixSeven('a', 66), false);
  assert.equal(e.maybeSixSeven('a', 67.4), true);
  assert.equal(e.active().kind, 'sixseven');
  assert.equal(e.blocking(), true);
  assert.equal(e.onAttempt('a', 'pass').type, 'tribute'); // บล็อกการไหว้ปกติ (ผู้เรียกต้องไม่ส่งเข้า state machine)
  assert.equal(e.finishSixSeven(), 'a');
  assert.equal(e.blocking(), false);
  assert.equal(e.maybeSixSeven('a', 67), false); // ใบเดิมไม่เกิดซ้ำ
  e.setMode('sixseven', 'always');
  assert.equal(e.maybeSixSeven('b', 10), true);
  e.setMode('sixseven', 'off');
  assert.equal(e.active(), null); // ปิดแล้ว event ที่ค้างอยู่หายด้วย
  assert.equal(e.maybeSixSeven('c', 67), false);
});
