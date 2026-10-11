// node --test vision/test/six-seven.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSixSevenTracker } from "../six-seven.js";

// hand with palm centre (cx, cy): wrist/index MCP/pinky MCP at that point, rest filler
const hand = (cx, cy) => Array.from({ length: 21 }, () => ({ x: cx, y: cy, z: 0 }));

function run(tr, ms, fn, step = 33, t0 = 0) {
  let r = null;
  for (let t = 0; t <= ms; t += step) r = tr.update(fn(t), t0 + t);
  return r;
}

const scales = (hz, amp, t) => [
  hand(0.3, 0.5 + amp * Math.sin(2 * Math.PI * hz * t / 1000)),
  hand(0.7, 0.5 - amp * Math.sin(2 * Math.PI * hz * t / 1000)),
];

test("alternating ~2 Hz for 3 s => done", () => {
  const tr = createSixSevenTracker();
  const r = run(tr, 3000, (t) => scales(2, 0.08, t));
  assert.equal(r.done, true);
  assert.equal(r.active, true);
});

test("mirrored x order still works", () => {
  const tr = createSixSevenTracker();
  const r = run(tr, 3000, (t) => scales(2, 0.08, t).reverse());
  assert.equal(r.done, true);
});

test("both hands still => never done", () => {
  const tr = createSixSevenTracker();
  const r = run(tr, 5000, () => [hand(0.3, 0.5), hand(0.7, 0.5)]);
  assert.equal(r.done, false);
  assert.equal(r.swings, 0);
});

test("jitter on still hands => not done", () => {
  const tr = createSixSevenTracker();
  let i = 0;
  const r = run(tr, 5000, () => [hand(0.3, 0.5 + ((i++ % 2) ? 0.006 : -0.006)), hand(0.7, 0.5 + ((i % 3) ? 0.005 : -0.005))]);
  assert.equal(r.done, false);
});

test("hands together (wai) bobbing => not done", () => {
  const tr = createSixSevenTracker();
  const r = run(tr, 5000, (t) => {
    const y = 0.5 + 0.03 * Math.sin(2 * Math.PI * 2 * t / 1000);
    return [hand(0.47, y), hand(0.53, y + 0.01)];
  });
  assert.equal(r.done, false);
  assert.equal(r.swings, 0);
});

test("together even with alternating motion => not done", () => {
  const tr = createSixSevenTracker();
  const r = run(tr, 5000, (t) => [
    hand(0.45, 0.5 + 0.08 * Math.sin(t / 80)), hand(0.55, 0.5 - 0.08 * Math.sin(t / 80)),
  ]);
  assert.equal(r.done, false);
});

test("one hand only => not active", () => {
  const tr = createSixSevenTracker();
  const r = run(tr, 3000, (t) => [hand(0.5, 0.5 + 0.1 * Math.sin(t / 80))]);
  assert.equal(r.active, false);
  assert.equal(r.done, false);
});

test("one hand waving, other still => not done", () => {
  const tr = createSixSevenTracker();
  const r = run(tr, 5000, (t) => [hand(0.3, 0.5 + 0.1 * Math.sin(2 * Math.PI * 2 * t / 1000)), hand(0.7, 0.5)]);
  assert.equal(r.done, false);
});

test("both hands moving in phase => not done", () => {
  const tr = createSixSevenTracker();
  const r = run(tr, 5000, (t) => {
    const y = 0.5 + 0.1 * Math.sin(2 * Math.PI * 2 * t / 1000);
    return [hand(0.3, y), hand(0.7, y)];
  });
  assert.equal(r.done, false);
});

test("hands vanish mid-way => swings reset", () => {
  const tr = createSixSevenTracker({ needSwings: 6 });
  const mid = run(tr, 1100, (t) => scales(2, 0.08, t));
  assert.ok(mid.swings > 0 && !mid.done);
  const gone = tr.update([], 1100 + 1000);
  assert.equal(gone.active, false);
  assert.equal(gone.swings, 0);
  const back = tr.update(scales(2, 0.08, 0), 2200);
  assert.equal(back.swings, 0);
});

test("amplitude below minAmp => no swings", () => {
  const tr = createSixSevenTracker();
  const r = run(tr, 5000, (t) => scales(2, 0.012, t));
  assert.equal(r.swings, 0);
  assert.equal(r.done, false);
});

test("reset clears done", () => {
  const tr = createSixSevenTracker();
  run(tr, 3000, (t) => scales(2, 0.08, t));
  tr.reset();
  const r = tr.update([hand(0.3, 0.5), hand(0.7, 0.5)], 9999);
  assert.equal(r.done, false);
  assert.equal(r.swings, 0);
});
