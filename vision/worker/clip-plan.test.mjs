import test from "node:test";
import assert from "node:assert/strict";
import { clipFileName, createClipPlanner } from "./clip-plan.js";

const run = (planner, frames) => frames.map((f) => planner.step(f, f.dt ?? 33)).filter(Boolean);

test("pass: starts at the first stable frame and stops after the pass tail", () => {
  const p = createClipPlanner({ tailPassMs: 100, tailFailMs: 50 });
  const out = run(p, [
    { stable: 1 }, { stable: 1 }, { stable: 1, passed: true, score: 82 }, { stable: 1 }, { stable: 1 }, { stable: 1 }, { stable: 1 },
  ]);
  assert.equal(out[0].action, "start");
  assert.equal(out[1].action, "stop");
  assert.equal(out[1].outcome, "pass");
  assert.equal(out[1].score, 82);
});

test("fail: stops after the fail tail with the fail outcome", () => {
  const p = createClipPlanner({ tailPassMs: 100, tailFailMs: 40 });
  const out = run(p, [{ stable: 1, score: 40 }, { stable: 1, score: 55 }, { stable: 0, failed: true }, { stable: 0 }, { stable: 0 }]);
  assert.deepEqual(out.map((a) => a.action), ["start", "stop"]);
  assert.equal(out[1].outcome, "fail");
  assert.equal(out[1].score, 55);
});

test("flicker with no fail event is discarded", () => {
  const p = createClipPlanner();
  const out = run(p, [{ stable: 1 }, { stable: 0 }]);
  assert.deepEqual(out.map((a) => a.action), ["start", "discard"]);
  assert.equal(p.recording, false);
});

test("a pass is not overwritten by a later fail", () => {
  const p = createClipPlanner({ tailPassMs: 200, tailFailMs: 50 });
  const out = run(p, [{ stable: 2, passed: true }, { stable: 0, failed: true }, { stable: 0 }, { stable: 0 }, { stable: 0 }, { stable: 0 }, { stable: 0 }, { stable: 0 }]);
  assert.equal(out.at(-1).outcome, "pass");
});

test("max length ends a clip as long", () => {
  const p = createClipPlanner({ maxMs: 100 });
  const out = run(p, Array.from({ length: 5 }, () => ({ stable: 1 })));
  assert.equal(out.at(-1).action, "stop");
  assert.equal(out.at(-1).outcome, "long");
});

test("cut keeps a decided clip and names an undecided one cut", () => {
  const p = createClipPlanner();
  p.step({ stable: 1 }, 33);
  assert.equal(p.cut().outcome, "cut");
  assert.equal(p.cut(), null);
});

test("file names are sortable and safe", () => {
  const name = clipFileName({ at: new Date(2026, 9, 10, 21, 5, 9).getTime(), outcome: "pass", level: 2, score: 86.4 });
  assert.equal(name, "210509_pass_L2_s86.webm");
  assert.equal(clipFileName({ at: 0, outcome: "../../x", level: 9, score: 500 }).includes("/"), false);
});
