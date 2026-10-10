// Pure helpers for pass/fail payloads. No camera or DOM, so they can be unit tested with node:test.

export const MIN_FAIL_MS = 300; // an attempt must stay at stable > 0 this long to count as a fail
export const WEIRD_SYM = 0.5;
export const WEIRD_CEN = 0.4;

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** parts: sym/cen/hold in 0..1, bow in degrees or null. Reads features defensively. */
export function computeParts(features, holdMs, { holdTarget = 1000, centerMax = 0.5 } = {}) {
  const F = features && typeof features === "object" ? features : {};
  const sw = num(F.sw);
  const ly = num(F.lWr?.y);
  const ry = num(F.rWr?.y);
  let dy = num(F.wristDy); // optional future field, shoulder-width units
  if (dy == null && ly != null && ry != null && sw != null && sw > 0) dy = Math.abs(ly - ry) / sw;
  const center = num(F.center);
  const hold = num(holdMs) ?? 0;
  const bow = num(F.bow);
  // The pose-based detector reports symmetry directly (0..1); older feature sets only have wrists.
  const symDirect = num(F.sym);
  return {
    sym: symDirect != null ? clamp01(symDirect) : dy == null ? 1 : clamp01(1 - dy),
    cen: center == null ? 1 : clamp01(1 - center / centerMax),
    hold: clamp01(hold / holdTarget),
    bow: bow == null ? null : Math.round(bow * 10) / 10,
  };
}

export function styleFor(parts) {
  return parts.sym < WEIRD_SYM || parts.cen < WEIRD_CEN ? "weird" : "normal";
}

/**
 * Tracks wai attempts. step() is called every frame with the tracker result and the time step.
 * It returns {fail} when an attempt just ended without a pass. A pass ends the attempt silently.
 * attempts counts failed attempts since the last reset().
 */
export function createAttemptTracker({ minMs = MIN_FAIL_MS } = {}) {
  let attempts = 0;
  let cur = null;

  const fresh = () => ({ ms: 0, level: 0, score: 0, holdMs: 0, reasons: [], parts: null, passed: false });

  return {
    get attempts() {
      return attempts;
    },
    reset() {
      attempts = 0;
      cur = null;
    },
    /** call when a pass is sent */
    markPassed() {
      if (cur) cur.passed = true;
    },
    step({ stable = 0, score = 0, holdMs = 0, reasons = [], parts = null }, dt = 0) {
      if (stable > 0) {
        if (!cur) cur = fresh();
        cur.ms += dt;
        cur.level = Math.max(cur.level, stable);
        cur.score = Math.max(cur.score, score);
        cur.holdMs = Math.max(cur.holdMs, holdMs);
        cur.reasons = reasons;
        if (parts) cur.parts = parts;
        return null;
      }
      if (!cur) return null;
      const a = cur;
      cur = null;
      if (a.passed || a.ms < minMs) return null;
      attempts += 1;
      return {
        fail: {
          level: a.level,
          score: a.score,
          holdMs: Math.round(a.holdMs),
          reasons: a.reasons,
          parts: a.parts ?? { sym: 1, cen: 1, hold: 0, bow: null },
        },
      };
    },
  };
}
