// Decides when to start and stop a dev clip for one wai attempt. Pure logic, no DOM, tested in clip-plan.test.mjs.
//
// A clip covers one attempt: it starts when the stable level first becomes > 0, and stops a short
// tail after the attempt resolves (pass or fail). Attempts that end without a fail event (flicker
// under the minimum length) are discarded.

export const TAIL_PASS_MS = 1000;
export const TAIL_FAIL_MS = 600;
export const MAX_CLIP_MS = 20000;

/**
 * @returns {{ step(frame, dt): object|null, cut(): object|null, recording: boolean }}
 * step frame = { stable, passed, failed, level, score }
 * actions: { action: 'start' } | { action: 'stop', outcome, level, score, ms } | { action: 'discard' }
 */
export function createClipPlanner({ tailPassMs = TAIL_PASS_MS, tailFailMs = TAIL_FAIL_MS, maxMs = MAX_CLIP_MS } = {}) {
  let rec = null;

  const stopAction = (outcome) => {
    const a = { action: "stop", outcome, level: rec.level, score: rec.score, ms: Math.round(rec.ms) };
    rec = null;
    return a;
  };

  return {
    get recording() {
      return rec !== null;
    },
    step({ stable = 0, passed = false, failed = false, level = 0, score = 0 }, dt = 0) {
      if (!rec) {
        if (stable > 0) {
          // a pass or fail flagged on the very first frame still counts
          rec = { ms: 0, outcome: passed ? "pass" : failed ? "fail" : null, wait: 0, level: stable, score };
          return { action: "start" };
        }
        return null;
      }
      rec.ms += dt;
      rec.level = Math.max(rec.level, stable, level);
      rec.score = Math.max(rec.score, score);
      if (passed) {
        rec.outcome = "pass";
        rec.wait = 0;
      } else if (failed && rec.outcome !== "pass") {
        rec.outcome = "fail";
        rec.wait = 0;
      }
      if (rec.outcome) {
        rec.wait += dt;
        const tail = rec.outcome === "pass" ? tailPassMs : tailFailMs;
        if (rec.wait >= tail) return stopAction(rec.outcome);
      } else if (stable === 0) {
        rec = null; // flicker: the attempt ended without a fail event
        return { action: "discard" };
      }
      if (rec && rec.ms >= maxMs) return stopAction(rec.outcome ?? "long");
      return null;
    },
    /** The camera is stopping: keep what exists as a cut clip, or drop it if nothing was decided. */
    cut() {
      if (!rec) return null;
      return stopAction(rec.outcome ?? "cut");
    },
  };
}

/** File name for a saved clip: sortable, safe characters only. */
export function clipFileName({ at, outcome, level, score }) {
  const d = new Date(at);
  const p = (n, w = 2) => String(n).padStart(w, "0");
  const safe = ["pass", "fail", "long", "cut"].includes(outcome) ? outcome : "clip";
  const lv = Number.isInteger(level) ? Math.max(0, Math.min(3, level)) : 0;
  const sc = Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0;
  return `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}_${safe}_L${lv}_s${sc}.webm`;
}
