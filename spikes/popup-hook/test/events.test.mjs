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
