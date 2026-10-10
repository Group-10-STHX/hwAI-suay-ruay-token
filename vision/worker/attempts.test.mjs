import test from "node:test";
import assert from "node:assert/strict";
import { computeParts, createAttemptTracker, styleFor } from "./attempts.js";

const P = { sym: 1, cen: 1, hold: 0.5, bow: null };
const fr = (stable, extra = {}) => ({ stable, score: 50, holdMs: 0, reasons: [], parts: P, ...extra });

test("pass ends the attempt without a fail", () => {
  const t = createAttemptTracker();
  for (let i = 0; i < 20; i++) t.step(fr(1), 33);
  t.markPassed();
  assert.equal(t.step(fr(0), 33), null);
  assert.equal(t.attempts, 0);
});

test("short flicker under 300 ms is not a fail", () => {
  const t = createAttemptTracker();
  for (let i = 0; i < 5; i++) t.step(fr(1), 33); // 165 ms
  assert.equal(t.step(fr(0), 33), null);
  assert.equal(t.attempts, 0);
});

test("long attempt without pass emits one fail with peak values", () => {
  const t = createAttemptTracker();
  t.step(fr(1, { score: 40, holdMs: 100 }), 100);
  t.step(fr(2, { score: 70, holdMs: 600, reasons: ["A"] }), 100);
  t.step(fr(1, { score: 55, holdMs: 200, reasons: ["B"] }), 200);
  const r = t.step(fr(0), 33);
  assert.deepEqual(r.fail, { level: 2, score: 70, holdMs: 600, reasons: ["B"], parts: P });
  assert.equal(t.step(fr(0), 33), null);
  assert.equal(t.attempts, 1);
});

test("attempts increments and resets on stop", () => {
  const t = createAttemptTracker();
  for (let n = 0; n < 2; n++) {
    t.step(fr(1), 400);
    t.step(fr(0), 33);
  }
  assert.equal(t.attempts, 2);
  t.reset();
  assert.equal(t.attempts, 0);
});

test("parts are clamped and read defensively", () => {
  const F = { sw: 100, lWr: { y: 0 }, rWr: { y: 300 }, center: 2, bow: 14.04 };
  assert.deepEqual(computeParts(F, 5000), { sym: 0, cen: 0, hold: 1, bow: 14 });
  assert.deepEqual(computeParts(null, -5), { sym: 1, cen: 1, hold: 0, bow: null });
  const ok = computeParts({ sw: 100, lWr: { y: 10 }, rWr: { y: 20 }, center: 0.1 }, 500);
  assert.equal(ok.sym, 0.9);
  assert.equal(ok.cen, 0.8);
  assert.equal(ok.hold, 0.5);
});

test("style rule", () => {
  assert.equal(styleFor({ sym: 0.49, cen: 1 }), "weird");
  assert.equal(styleFor({ sym: 1, cen: 0.39 }), "weird");
  assert.equal(styleFor({ sym: 0.5, cen: 0.4 }), "normal");
});

test("computeParts uses the detector's own symmetry when present", () => {
  const parts = computeParts({ sym: 0.3, center: 0.1 }, 500, { holdTarget: 1000, centerMax: 0.5 });
  assert.equal(parts.sym, 0.3);
  assert.equal(styleFor(parts), "weird");
});

