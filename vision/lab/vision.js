// Wai heuristics for the lab: features from MediaPipe results, a one-frame classifier,
// a majority-vote stabilizer, and a pass detector that fires once per wai.
// Pure logic, no DOM or MediaPipe imports, so it can be reused by the lab page and tests.
//
// Distances are divided by shoulder width so they do not depend on camera distance.

export const DEFAULT_TH = Object.freeze({
  gapMax: 0.55, // wrist-to-wrist distance
  centerMax: 0.5, // hands' horizontal offset from the body midline
  fingersUpMin: 0.08, // fingertips above the wrists
  tipNoseMin: -0.02, // fingertip above the nose -> level 2
  thumbBrowMin: -0.05, // thumb above the brows -> level 3 (with a bow)
  bowMinDeg: 12, // head pitch change from calibration
  neckDropMin: 0.08, // nose drop toward the shoulders, fallback when the face is hidden
  holdMs: 700, // a stable level held this long counts as a pass
  passMinScore: 70, // score needed for a pass
  window: 12, // frames in the majority vote (~0.4 s at 30 fps)
  share: 0.6, // share of the window a level needs to become stable
});

const LEVEL_NAMES = ["ไม่ไหว้", "ไหว้เพื่อน", "ไหว้ผู้ใหญ่", "ไหว้พระ"];

export const levelName = (level) => LEVEL_NAMES[level] ?? "-";

const px = (lm, W, H) => ({ x: lm.x * W, y: lm.y * H });
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * Per-frame features in shoulder-width units.
 * Returns null when there is no person, or when neither pose wrists nor two hands are visible.
 */
export function extractFeatures({ pose, face, hands }, W, H, calib) {
  const pl = pose.landmarks[0];
  if (!pl) return null;
  const hl = hands.landmarks;

  // Pose wrists drop out when the hands are together. Fall back to the hand model's wrists.
  let lWr;
  let rWr;
  if (pl[15].visibility >= 0.5 && pl[16].visibility >= 0.5) {
    lWr = px(pl[15], W, H);
    rWr = px(pl[16], W, H);
  } else if (hl.length >= 2) {
    lWr = px(hl[0][0], W, H);
    rWr = px(hl[1][0], W, H);
  } else {
    return null;
  }

  const lSh = px(pl[11], W, H);
  const rSh = px(pl[12], W, H);
  const sw = dist(lSh, rSh);
  const shMid = mid(lSh, rSh);
  const wrMid = mid(lWr, rWr);

  const tips = hl.length
    ? hl.flatMap((h) => [px(h[8], W, H), px(h[12], W, H)])
    : [px(pl[19], W, H), px(pl[20], W, H)];
  const thumbs = hl.length
    ? hl.map((h) => px(h[4], W, H))
    : [px(pl[21], W, H), px(pl[22], W, H)];

  const fl = face.faceLandmarks[0];
  const nose = fl ? px(fl[1], W, H) : px(pl[0], W, H);
  const browY = fl
    ? px(fl[9], W, H).y
    : (px(pl[2], W, H).y + px(pl[5], W, H).y) / 2 - 0.1 * sw;
  const m = face.facialTransformationMatrixes?.[0];
  const pitch = m ? (Math.atan2(m.data[6], m.data[10]) * 180) / Math.PI : null;
  const tipY = Math.min(...tips.map((t) => t.y));

  return {
    sw,
    gap: dist(lWr, rWr) / sw,
    center: Math.abs(wrMid.x - shMid.x) / sw,
    leanX: (nose.x - shMid.x) / sw,
    fingersUp: ((lWr.y + rWr.y) / 2 - tipY) / sw,
    tipNose: (nose.y - tipY) / sw,
    thumbBrow: (browY - Math.min(...thumbs.map((t) => t.y))) / sw,
    neck: (shMid.y - nose.y) / sw,
    pitch,
    bow:
      pitch != null && calib.pitch != null
        ? Math.abs(pitch - calib.pitch)
        : null,
    neckDrop: calib.neck != null ? calib.neck - (shMid.y - nose.y) / sw : null,
    handCount: hl.length,
    noseY: nose.y,
    browY,
    lWr,
    rWr,
  };
}

/** One-frame classifier. Returns 0-3. */
export function classify(F, th) {
  if (!F) return 0;
  if (
    !(
      F.gap < th.gapMax &&
      F.center < th.centerMax &&
      F.fingersUp > th.fingersUpMin
    )
  )
    return 0;
  let level = F.tipNose > th.tipNoseMin ? 2 : 1;
  const bowed =
    F.bow != null
      ? F.bow > th.bowMinDeg
      : F.neckDrop != null
        ? F.neckDrop > th.neckDropMin
        : true;
  if (F.thumbBrow > th.thumbBrowMin && bowed) level = 3;
  return level;
}

export class WaiTracker {
  constructor(th = DEFAULT_TH) {
    this.th = { ...DEFAULT_TH, ...th };
    this.ema = {};
    this.calib = { pitch: null, neck: null };
    this.last = {};
    this.history = [];
    this.stable = 0;
    this.holdMs = 0;
    this.armed = true;
  }

  calibrate() {
    this.calib = {
      pitch: this.last.pitch ?? null,
      neck: this.last.neck ?? null,
    };
  }

  smooth(key, value, a = 0.4) {
    if (value == null) return (this.ema[key] = null);
    const prev = this.ema[key];
    this.ema[key] = prev == null ? value : prev + a * (value - prev);
    return this.ema[key];
  }

  smoothFeatures(raw) {
    if (!raw) return null;
    const F = { ...raw };
    for (const key of [
      "gap",
      "center",
      "fingersUp",
      "tipNose",
      "thumbBrow",
      "neck",
      "pitch",
    ]) {
      F[key] = this.smooth(key, raw[key]);
    }
    F.bow =
      F.pitch != null && this.calib.pitch != null
        ? Math.abs(F.pitch - this.calib.pitch)
        : null;
    F.neckDrop = this.calib.neck != null ? this.calib.neck - F.neck : null;
    return F;
  }

  stabilize(raw) {
    this.history.push(raw);
    if (this.history.length > this.th.window) this.history.shift();
    if (this.history.length < this.th.window) return this.stable;
    const counts = [0, 0, 0, 0];
    for (const v of this.history) counts[v] += 1;
    const best = counts.indexOf(Math.max(...counts));
    if (counts[best] / this.th.window >= this.th.share) this.stable = best;
    return this.stable;
  }

  score(F, level) {
    if (!level || !F) return 0;
    const sym = clamp01(1 - Math.abs(F.lWr.y - F.rWr.y) / (0.3 * F.sw));
    const cen = clamp01(1 - F.center / this.th.centerMax);
    const hold = clamp01(this.holdMs / 1000);
    return Math.round(100 * (0.4 * sym + 0.3 * cen + 0.3 * hold));
  }

  /**
   * Feed one frame. `detections` = {pose, face, hands}, `W`/`H` = video size, `dt` = ms since last frame.
   * Returns the readout plus `passed`, which is true only on the frame where a wai passes.
   */
  update(detections, W, H, dt) {
    const raw = extractFeatures(detections, W, H, this.calib);
    if (raw) {
      this.last = { pitch: raw.pitch, neck: raw.neck };
    }
    const F = this.smoothFeatures(raw);
    const rawLevel = classify(F, this.th);
    const prevStable = this.stable;
    this.stabilize(rawLevel);
    // Hold time counts only while the same non-zero level stays stable.
    const sameLevel = this.stable === prevStable && this.stable > 0;
    this.holdMs = sameLevel ? this.holdMs + dt : 0;

    const score = this.score(F, this.stable);
    let passed = false;
    if (this.stable === 0) {
      this.armed = true;
    } else if (
      this.armed &&
      this.holdMs >= this.th.holdMs &&
      score >= this.th.passMinScore
    ) {
      this.armed = false;
      passed = true;
    }
    return {
      raw: rawLevel,
      stable: this.stable,
      holdMs: this.holdMs,
      score,
      passed,
      features: F,
      reason: raw ? null : "ไม่เจอคนหรือมองไม่เห็นข้อมือ",
    };
  }
}
