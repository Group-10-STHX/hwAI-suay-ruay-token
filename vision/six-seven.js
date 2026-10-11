// "6-7" easter egg: both hands held out, moving up/down alternately like weighing scales.
// Pure module (no DOM). Input = array of hands, each hand = 21 MediaPipe landmarks {x,y} normalised 0..1.
//
//   const t = createSixSevenTracker();
//   t.update(det.hands.landmarks, performance.now()) -> { active, swings, need, done }
//
// Hand centre = mean of wrist(0), index MCP(5), pinky MCP(17). Left/right is by x order (mirror safe).
// d = yLeft - yRight. State flips when d passes +-hyst (hysteresis = minAmp / 2); each flip = one swing.
// Counted only when: hands are apart (>= minSep in x) AND both hands moved >= minAmp (peak to peak y) in the window.
// So a wai (hands together), still hands, or a single waving hand never count.

const PALM = [0, 5, 17];

function center(h) {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const i of PALM) {
    const p = h?.[i];
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) { x += p.x; y += p.y; n++; }
  }
  return n ? { x: x / n, y: y / n } : null;
}

export function createSixSevenTracker({
  needSwings = 4,
  windowMs = 3500,
  minAmp = 0.035,
  minSep = 0.12,
  lostMs = 800,
} = {}) {
  const hyst = minAmp / 2;
  let samples = []; // {t, yl, yr}
  let flips = []; // timestamps of counted swings
  let state = 0; // +1 / -1 / 0 (side of d)
  let lastTwoAt = -Infinity;
  let done = false;

  function reset() {
    samples = [];
    flips = [];
    state = 0;
    lastTwoAt = -Infinity;
    done = false;
  }

  function range(key) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of samples) { if (s[key] < lo) lo = s[key]; if (s[key] > hi) hi = s[key]; }
    return hi - lo;
  }

  function out(active) {
    return { active, swings: Math.min(flips.length, needSwings), need: needSwings, done };
  }

  function update(hands, nowMs) {
    const cs = (Array.isArray(hands) ? hands : []).map(center).filter(Boolean);
    if (cs.length !== 2) {
      if (nowMs - lastTwoAt > lostMs) {
        reset();
      }
      return out(false);
    }
    lastTwoAt = nowMs;
    if (done) return out(true);
    cs.sort((a, b) => a.x - b.x);
    const [l, r] = cs;
    if (r.x - l.x < minSep) {
      // together (wai) or overlapping: nothing counts
      samples = [];
      flips = [];
      state = 0;
      return out(true);
    }
    samples.push({ t: nowMs, yl: l.y, yr: r.y });
    while (samples.length && nowMs - samples[0].t > windowMs) samples.shift();
    while (flips.length && nowMs - flips[0] > windowMs) flips.shift();

    const d = l.y - r.y;
    const next = d > hyst ? 1 : d < -hyst ? -1 : state;
    if (next !== state) {
      if (state !== 0 && range("yl") >= minAmp && range("yr") >= minAmp) flips.push(nowMs);
      state = next;
    }
    if (flips.length >= needSwings) done = true;
    return out(true);
  }

  return { update, reset, get need() { return needSwings; } };
}
