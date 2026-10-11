// Wai heuristic (Vision): pose-based features from MediaPipe results, a one-frame classifier,
// a time-window stabilizer, a pass detector that fires once per wai, and the mapping to the
// VisionEvent contract in app/renderer/src/api/types.ts.
// Pure logic, no DOM or MediaPipe imports. Used by vision/worker.
//
// How it reads a wai
//   1. Every point is rotated into a body frame: origin at the shoulder midpoint, the shoulder line
//      horizontal, one unit = shoulder width. Leaning, tilting the head, or sitting close to the
//      camera then changes nothing. Without usable shoulders the frame comes from the face.
//   2. "Palms together" comes from the hand model when it sees real hands (collapsed ghost
//      detections are dropped), with the pose wrists/index tips as the fallback. One hand that is
//      centered and vertical counts: in a wai the two hands hide each other.
//   3. The level is where the thumbs and fingertips sit on the face, measured in face units
//      (nose tip to brow): thumbs at the chin / nose / brow and fingertips at the nose / brow /
//      hairline for levels 1 / 2 / 3. That is the Thai definition and it does not depend on the
//      elbows or wrists, which open up in a high wai.
//   4. Level 3 also wants a bow: face pitch against a baseline, or the nose dropping toward the
//      shoulders. The baseline is calibrated from relaxed frames, or by calibrate().
//   5. When the hands hide the face, the face height and the nose position come from a memory
//      kept in pixels, not in shoulder widths: raising the arms pulls the pose model's shoulder
//      landmarks inward by up to a quarter, which would otherwise inflate every height. A pose
//      nose that lands on the shoulder line is anatomically impossible and is replaced by the
//      remembered upright nose. Shoulders outside the image (sitting close) hand the frame to the face.
//   6. The pass hold is leaky: it keeps counting across a short loss of the hands (the hand model
//      drops them for a few frames when they overlap the face), freezes for a grace period and
//      then drains, so one pass per wai still holds. A pass reports a level only after that level
//      itself has been stable for a vote window, never a level the hands are passing through.

export const DEFAULT_TH = Object.freeze({
  // gates, in shoulder widths
  togetherMax: 0.35, // closest matching pair between the two hands (palms, thumbs, index tips, wrists)
  lotusMax: 0.6, // same, for two mirrored upright hands that converge (open high wai)
  gapMax: 0.6, // pose fallback: wrist gap for a chest-level wai
  tipGapMax: 0.45, // pose fallback: index-tip gap (high wai: wrists open, tips still touch)
  centerMax: 0.5, // hands' horizontal offset from the nose
  oneHandCenterMax: 0.3, // a single visible hand hides the other one only if it sits on the face midline
  // fingertips above the wrists by a quarter shoulder width (half a hand): the fingers point up. A
  // hand cut off by the bottom edge of the image (resting low) shows only a short stub above its wrist.
  fingersUpMin: 0.25,
  // level anchors, in face units (nose tip to brow) above the nose tip, for levels 1 / 2 / 3
  thumbAnchors: [-1.2, 0, 1.0], // chin, nose, brow
  tipAnchors: [0, 1.0, 1.9], // nose, brow, hairline
  tooHighThumb: 3.0, // thumbs above the top of the head: hands raised, not a wai
  tooHighTip: 4.5, // same when only fingertips are known
  levelHysteresis: 0.15, // the current level keeps this much extra band on both sides
  // bow, for level 3
  bowMinDeg: 12, // face pitch change from the baseline (face matrix); can confirm or deny a bow
  neckDropMin: 0.06, // nose drop toward the shoulders (12 deg on a ~12 cm pivot); can only confirm
  bowUnknownOk: true, // no bow cue (face hidden, no baseline): accept level 3 on height alone
  // timing
  holdMs: 700, // a wai held this long counts as a pass
  passMinScore: 70, // score needed for a pass
  passMinDwellMs: 300, // the level a pass reports must itself have been stable this long (about one vote window)
  holdGraceMs: 350, // after the wai drops out, the hold freezes this long: the hand model needs a few frames to find overlapping hands again
  holdLeak: 1.0, // then it drains at this rate (ms of hold per ms): a dip costs as long as it lasts, a real pause clears it
  windowMs: 400, // vote window for the stable level
  share: 0.6, // share of the window a level needs to become stable
});

const LEVEL_NAMES = ["ไม่ไหว้", "ไหว้เพื่อน", "ไหว้ผู้ใหญ่", "ไหว้พระ"];

export const levelName = (level) => LEVEL_NAMES[level] ?? "-";

// Anthropometric constants (adult proportions, in shoulder widths)
const FACE_H = 0.21; // nose tip to brow
const EYE_NOSE = 0.13; // eye line to nose tip
const NECK_UPRIGHT = 0.5; // nose above the shoulder line, head upright
const HEAD_MIN_V = 0.15; // the nose never comes closer to the shoulder line than this (half a head), even chin on chest
// Detection sanity
const SHOULDER_VIS_MIN = 0.3;
const POSE_VIS_MIN = 0.3; // pose wrists below this are usually hallucinated hanging arms
const HAND_MIN_SIZE = 0.12; // a hand whose 21 points span less than this is a ghost detection
const HAND_MAX_SIZE = 2.5;
const MIRROR_TOL = 0.35; // two hands count as mirrored about the face midline within this

const px = (lm, W, H) => ({ x: lm.x * W, y: lm.y * H });
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const bdist = (a, b) => Math.hypot(a.u - b.u, a.v - b.v);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const vis = (lm) => lm?.visibility ?? 1;
const inFrame = (lm) => lm.x >= 0 && lm.x <= 1 && lm.y >= 0 && lm.y <= 1; // normalized coordinates outside 0..1 are extrapolations
const wrap180 = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180;

/** Piecewise-linear map of x through the anchor points xs -> ys, clamped at both ends. */
function interp(x, xs, ys) {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) return ys[i - 1] + ((ys[i] - ys[i - 1]) * (x - xs[i - 1])) / (xs[i] - xs[i - 1]);
  }
  return ys[ys.length - 1];
}

/**
 * Body frame: `to(p)` maps an image point to {u, v} with u along the shoulders and v up the body,
 * both in units of `unit` pixels. `source` says what defined it.
 */
function makeFrame(origin, ex, unit, source) {
  let ey = { x: -ex.y, y: ex.x };
  if (ey.y < 0) ey = { x: -ey.x, y: -ey.y }; // ey points down the body (image y grows downward)
  return {
    origin,
    unit,
    source,
    to: (p) => {
      const dx = p.x - origin.x;
      const dy = p.y - origin.y;
      return { u: (dx * ex.x + dy * ex.y) / unit, v: -(dx * ey.x + dy * ey.y) / unit };
    },
  };
}

function bodyFrame(pl, fl, W, H) {
  // Shoulders carry the frame only when both are seen inside the image: a person sitting close
  // has them extrapolated below the frame, where their width and tilt are guesses.
  if (pl && vis(pl[11]) >= SHOULDER_VIS_MIN && vis(pl[12]) >= SHOULDER_VIS_MIN && inFrame(pl[11]) && inFrame(pl[12])) {
    const L = px(pl[11], W, H);
    const R = px(pl[12], W, H);
    const sw = dist(L, R);
    if (sw >= 0.05 * W) return makeFrame(mid(L, R), { x: (L.x - R.x) / sw, y: (L.y - R.y) / sw }, sw, "shoulders");
  }
  // No shoulders (sitting very close, or only the face in view): hang the frame on the head.
  const head = (nose, top, ratio, source) => {
    const d = dist(nose, top);
    if (d < 2) return null;
    const unit = d / ratio;
    const up = { x: (top.x - nose.x) / d, y: (top.y - nose.y) / d };
    const origin = { x: nose.x - up.x * NECK_UPRIGHT * unit, y: nose.y - up.y * NECK_UPRIGHT * unit };
    return makeFrame(origin, { x: -up.y, y: up.x }, unit, source);
  };
  if (fl?.[1] && fl[9]) return head(px(fl[1], W, H), px(fl[9], W, H), FACE_H, "face");
  if (pl && vis(pl[0]) >= 0.5 && vis(pl[2]) >= 0.5 && vis(pl[5]) >= 0.5) {
    return head(px(pl[0], W, H), mid(px(pl[2], W, H), px(pl[5], W, H)), EYE_NOSE, "head");
  }
  return null;
}

/**
 * Per-frame features in the body frame. `calib` may carry a bow baseline (pitch, neck) and the
 * face memory that WaiTracker keeps for frames where hands hide the face: faceHpx and
 * noseOffPxU/V in pixels (preferred, they survive the shoulder landmarks moving when the arms
 * rise) or the older faceH / noseOffU / noseOffV in shoulder widths.
 * Returns null when there is no person. A person whose hands are not visible gets handsSeen=false.
 */
export function extractFeatures({ pose, face, hands }, W, H, calib = {}, th = DEFAULT_TH) {
  const pl = pose?.landmarks?.[0] ?? null;
  const fl = face?.faceLandmarks?.[0] ?? null;
  const hl = hands?.landmarks ?? [];
  const frame = bodyFrame(pl, fl, W, H);
  if (!frame) return null;
  const P = (lm) => frame.to(px(lm, W, H));

  // ---- head: nose tip and face height, from the face when it is visible, else pose + memory ----
  const faceNose = fl?.[1] ? P(fl[1]) : null;
  const poseNose = pl && vis(pl[0]) >= SHOULDER_VIS_MIN ? P(pl[0]) : null;
  const memFaceH = calib.faceHpx != null ? Math.max(0.1, calib.faceHpx / frame.unit) : (calib.faceH ?? FACE_H);
  const memOffU = calib.noseOffPxU != null ? calib.noseOffPxU / frame.unit : (calib.noseOffU ?? 0);
  const memOffV = calib.noseOffPxV != null ? calib.noseOffPxV / frame.unit : (calib.noseOffV ?? 0);
  // The remembered upright nose is only meaningful in a shoulder frame; a head frame puts the nose there by construction.
  const uprightNose = { u: 0, v: frame.source === "shoulders" && calib.neck != null ? calib.neck : NECK_UPRIGHT };
  let nose;
  let faceH;
  let headSource;
  if (faceNose) {
    nose = faceNose;
    faceH = fl[9] ? Math.max(0.1, P(fl[9]).v - nose.v) : memFaceH;
    headSource = "face";
  } else if (poseNose) {
    nose = { u: poseNose.u + memOffU, v: poseNose.v + memOffV };
    faceH = memFaceH;
    headSource = "pose";
    if (frame.source === "shoulders" && nose.v < HEAD_MIN_V) {
      // The pose model lost the head under the hands and parked the nose on the shoulder line.
      nose = uprightNose;
      headSource = "memory";
    }
  } else {
    nose = uprightNose;
    faceH = memFaceH;
    headSource = "none";
  }
  const faceHMeasured = faceNose && fl[9] && frame.source === "shoulders" ? faceH : null;
  const faceHpx = faceNose && fl[9] ? faceH * frame.unit : null;
  const noseOff = faceNose && poseNose ? { u: faceNose.u - poseNose.u, v: faceNose.v - poseNose.v } : null;
  const noseOffPx = noseOff ? { u: noseOff.u * frame.unit, v: noseOff.v * frame.unit } : null;
  const m = face?.facialTransformationMatrixes?.[0];
  const pitch = m ? wrap180((Math.atan2(m.data[6], m.data[10]) * 180) / Math.PI) : null;
  const neck = frame.source === "shoulders" && headSource !== "none" ? nose.v : null;

  // ---- hands from the hand model, ghosts removed ----
  const real = [];
  for (const h of hl) {
    if (!h || h.length < 21) continue;
    const pts = h.map(P);
    const wrist = pts[0];
    let size = 0;
    for (const p of pts) size = Math.max(size, bdist(p, wrist));
    if (size < HAND_MIN_SIZE || size > HAND_MAX_SIZE || Math.abs(wrist.u) > 3 || Math.abs(wrist.v) > 3) continue;
    const palm = {
      u: (pts[0].u + pts[5].u + pts[9].u + pts[13].u + pts[17].u) / 5,
      v: (pts[0].v + pts[5].v + pts[9].v + pts[13].v + pts[17].v) / 5,
    };
    const dir = { u: pts[9].u - wrist.u, v: pts[9].v - wrist.v };
    const len = Math.hypot(dir.u, dir.v) || 1;
    real.push({
      wrist,
      palm,
      thumb: pts[4],
      index: pts[8],
      tipTop: Math.max(pts[8].v, pts[12].v, pts[16].v, pts[20].v),
      upCos: dir.v / len,
      size,
    });
  }
  real.sort((a, b) => b.size - a.size);

  // ---- palms-together evidence ----
  let evidence = "none";
  let handsSeen = false;
  let together = false;
  let gap = null;
  let center = null;
  let fingersUp = null;
  let sym = null;
  let tipTop = null;
  let thumbTop = null;
  const wristsOk = pl && vis(pl[15]) >= POSE_VIS_MIN && vis(pl[16]) >= POSE_VIS_MIN;
  if (real.length >= 2) {
    const [a, b] = real;
    const wristGap = bdist(a.wrist, b.wrist);
    gap = Math.min(bdist(a.palm, b.palm), bdist(a.thumb, b.thumb), bdist(a.index, b.index), wristGap);
    center = Math.abs((a.palm.u + b.palm.u) / 2 - nose.u);
    sym = clamp01(1 - Math.abs(a.wrist.v - b.wrist.v) / 0.3);
    // Open high wai: the palms part like a lotus bud, but the hands stay mirrored about the face
    // midline, point up, and converge toward the thumbs or fingertips.
    const mirrored = center < MIRROR_TOL && Math.abs(a.wrist.v - b.wrist.v) < MIRROR_TOL;
    const converging = Math.min(bdist(a.thumb, b.thumb), bdist(a.index, b.index)) <= wristGap + 0.05;
    together = gap < th.togetherMax || (gap < th.lotusMax && mirrored && a.upCos > 0.5 && b.upCos > 0.5 && converging);
    fingersUp = (a.tipTop - a.wrist.v + (b.tipTop - b.wrist.v)) / 2;
    tipTop = Math.max(a.tipTop, b.tipTop);
    thumbTop = Math.max(a.thumb.v, b.thumb.v);
    evidence = "hands2";
    handsSeen = true;
  } else if (real.length === 1) {
    // One hand: either it hides the other one (then it sits on the face midline), or the pose sees
    // the other wrist mirrored across the midline (open high wai). A confidently seen wrist far
    // away means the person is doing something else with that hand.
    const a = real[0];
    const palmOff = Math.abs(a.palm.u - nose.u);
    let other = null;
    if (wristsOk) {
      const w15 = P(pl[15]);
      const w16 = P(pl[16]);
      other =
        bdist(w15, a.wrist) > bdist(w16, a.wrist)
          ? { p: w15, vis: vis(pl[15]) }
          : { p: w16, vis: vis(pl[16]) };
    }
    const otherGap = other ? bdist(other.p, a.wrist) : null;
    const mirrored =
      other != null &&
      otherGap < 1.1 &&
      Math.abs(other.p.u + a.wrist.u - 2 * nose.u) < MIRROR_TOL &&
      Math.abs(other.p.v - a.wrist.v) < MIRROR_TOL;
    const farAway = other != null && !mirrored && other.vis >= 0.5 && otherGap > 1.0;
    gap = otherGap ?? 0;
    center = mirrored ? Math.abs((other.p.u + a.wrist.u) / 2 - nose.u) : palmOff;
    together = a.upCos > 0.3 && !farAway && (palmOff < th.oneHandCenterMax || mirrored);
    fingersUp = a.tipTop - a.wrist.v;
    sym = mirrored ? clamp01(1 - Math.abs(other.p.v - a.wrist.v) / 0.3) : null;
    tipTop = a.tipTop;
    thumbTop = a.thumb.v;
    evidence = "hands1";
    handsSeen = true;
  } else if (wristsOk) {
    const w15 = P(pl[15]);
    const w16 = P(pl[16]);
    const i19 = P(pl[19]);
    const i20 = P(pl[20]);
    const wristGap = bdist(w15, w16);
    const tipGap = bdist(i19, i20);
    gap = Math.min(wristGap, tipGap);
    together = wristGap < th.gapMax || tipGap < th.tipGapMax;
    center = Math.abs((i19.u + i20.u) / 2 - nose.u);
    fingersUp = (i19.v + i20.v) / 2 - (w15.v + w16.v) / 2;
    sym = clamp01(1 - Math.abs(w15.v - w16.v) / 0.3);
    tipTop = Math.max(i19.v, i20.v);
    if (vis(pl[21]) >= POSE_VIS_MIN && vis(pl[22]) >= POSE_VIS_MIN) thumbTop = Math.max(P(pl[21]).v, P(pl[22]).v);
    evidence = "pose";
    handsSeen = true;
  }

  // ---- height on the face, in face units above the nose tip ----
  const tipRel = tipTop != null ? (tipTop - nose.v) / faceH : null;
  const thumbRel = thumbTop != null ? (thumbTop - nose.v) / faceH : null;
  const tipLevel = tipRel != null ? interp(tipRel, th.tipAnchors, [1, 2, 3]) : null;
  const thumbLevel = thumbRel != null ? interp(thumbRel, th.thumbAnchors, [1, 2, 3]) : null;
  const heightLevel =
    tipLevel != null && thumbLevel != null ? (tipLevel + thumbLevel) / 2 : (tipLevel ?? thumbLevel);
  const tooHigh =
    (thumbRel != null && thumbRel > th.tooHighThumb) ||
    (thumbRel == null && tipRel != null && tipRel > th.tooHighTip);

  return {
    source: frame.source,
    headSource,
    unit: frame.unit,
    nose,
    faceH,
    faceHMeasured,
    faceHpx,
    noseOff,
    noseOffPx,
    lean: nose.u,
    pitch,
    neck,
    bow: pitch != null && calib.pitch != null ? Math.abs(wrap180(pitch - calib.pitch)) : null,
    neckDrop: neck != null && calib.neck != null ? calib.neck - neck : null,
    handCount: hl.length,
    realHands: real.length,
    evidence,
    handsSeen,
    together,
    gap,
    center,
    fingersUp,
    sym,
    tipRel,
    thumbRel,
    heightLevel,
    tooHigh,
  };
}

/**
 * Did the head bow? The face pitch decides when the face is visible. The nose dropping toward the
 * shoulders can only confirm a bow: raised elbows lift the shoulder landmarks, so a missing drop
 * proves nothing. null when nothing is known.
 */
function bowed(F, th) {
  const neckSaysYes = F.neckDrop != null && F.neckDrop > th.neckDropMin;
  if (F.bow != null) return F.bow > th.bowMinDeg || neckSaysYes;
  return neckSaysYes ? true : null;
}

/**
 * One-frame classifier. Returns 0-3. `prevLevel` (optional) is the level currently held, which
 * gets a wider band so the level does not flicker at a boundary.
 */
export function classify(F, th, prevLevel = 0) {
  if (!F || !F.handsSeen || !F.together || F.tooHigh) return 0;
  if (!(F.fingersUp > th.fingersUpMin) || !(F.center < th.centerMax)) return 0;
  const hy = th.levelHysteresis ?? 0;
  let b12 = 1.5;
  let b23 = 2.5;
  if (prevLevel === 1) b12 += hy;
  if (prevLevel === 2) {
    b12 -= hy;
    b23 += hy;
  }
  if (prevLevel === 3) b23 -= hy;
  const h = F.heightLevel ?? 1;
  let level = h >= b23 ? 3 : h >= b12 ? 2 : 1;
  if (level === 3) {
    const b = bowed(F, th);
    if (b === false || (b === null && !th.bowUnknownOk)) level = 2;
  }
  return level;
}

export class WaiTracker {
  constructor(th = DEFAULT_TH) {
    this.th = { ...DEFAULT_TH, ...th };
    this.manual = { pitch: null, neck: null }; // from calibrate()
    this.auto = { pitch: null, neck: null }; // learned from relaxed frames
    // face geometry for when hands hide it: pixels (robust to the shoulder landmarks moving) and the older shoulder-width copies
    this.memory = { faceHpx: null, noseOffPxU: null, noseOffPxV: null, faceH: null, noseOffU: null, noseOffV: null };
    this.calib = { pitch: null, neck: null };
    this.ema = {};
    this.last = {};
    this.history = []; // [{level, age}]
    this.stable = 0;
    this.share = 0; // share of the vote window held by the stable level
    this.holdMs = 0;
    this.dipMs = 0; // how long the wai has been gone while the hold is still alive
    this.dwell = [0, 0, 0, 0]; // hold time spent at each stable level in the current wai
    this.formSum = 0; // form integrated over the hold (ms), formSum / holdMs = the mean form
    this.passedLevel = 0; // level already passed in the current wai, 0 = not yet
  }

  /** Take the current head pose as the upright baseline for the bow. */
  calibrate() {
    this.manual = { pitch: this.last.pitch ?? null, neck: this.last.neck ?? null };
  }

  get calibration() {
    return {
      pitch: this.manual.pitch ?? this.auto.pitch,
      neck: this.manual.neck ?? this.auto.neck,
      ...this.memory,
    };
  }

  smooth(key, value, a = 0.4) {
    if (value == null) return (this.ema[key] = null);
    const prev = this.ema[key];
    this.ema[key] = prev == null ? value : prev + a * (value - prev);
    return this.ema[key];
  }

  smoothFeatures(raw, calib) {
    const handKeys = ["heightLevel", "center", "fingersUp", "sym", "gap"];
    if (!raw) {
      for (const k of handKeys) this.ema[k] = null;
      return null;
    }
    const F = { ...raw };
    F.neck = this.smooth("neck", raw.neck);
    F.pitch = this.smooth("pitch", raw.pitch);
    if (raw.handsSeen) for (const k of handKeys) F[k] = this.smooth(k, raw[k], 0.5);
    else for (const k of handKeys) this.ema[k] = null;
    F.bow = F.pitch != null && calib.pitch != null ? Math.abs(wrap180(F.pitch - calib.pitch)) : null;
    F.neckDrop = F.neck != null && calib.neck != null ? calib.neck - F.neck : null;
    return F;
  }

  /** Face memory and the upright baseline, learned while the person is not waiing. */
  learn(raw, rawLevel) {
    if (!raw) return;
    const ema = (prev, v, a) => (prev == null ? v : prev + a * (v - prev));
    // Face geometry is remembered only while the hands are away from the face: hands on the face
    // bend the face mesh, and a bow stretches the projected nose-to-brow distance.
    const faceClear = rawLevel === 0 && (!raw.handsSeen || raw.tipRel == null || raw.tipRel < -1.5);
    if (faceClear) {
      if (raw.faceHpx != null) this.memory.faceHpx = ema(this.memory.faceHpx, raw.faceHpx, 0.3);
      if (raw.faceHMeasured != null) this.memory.faceH = ema(this.memory.faceH, raw.faceHMeasured, 0.3);
      if (raw.noseOffPx) {
        this.memory.noseOffPxU = ema(this.memory.noseOffPxU, raw.noseOffPx.u, 0.3);
        this.memory.noseOffPxV = ema(this.memory.noseOffPxV, raw.noseOffPx.v, 0.3);
        this.memory.noseOffU = ema(this.memory.noseOffU, raw.noseOff.u, 0.3);
        this.memory.noseOffV = ema(this.memory.noseOffV, raw.noseOff.v, 0.3);
      }
    }
    // Upright posture: no hands in view, no wai. The neck is longest when upright, so the baseline
    // follows rises quickly and drops very slowly (a shrug or a bow should not pull it down).
    if (rawLevel !== 0 || raw.handsSeen || raw.source !== "shoulders") return;
    if (raw.neck != null) this.auto.neck = ema(this.auto.neck, raw.neck, raw.neck > (this.auto.neck ?? -Infinity) ? 0.1 : 0.005);
    if (raw.pitch != null) this.auto.pitch = ema(this.auto.pitch, raw.pitch, 0.05);
  }

  stabilize(raw, dt) {
    for (const h of this.history) h.age += dt;
    this.history.push({ level: raw, age: 0 });
    this.history = this.history.filter((h) => h.age <= this.th.windowMs);
    if (this.history.length < 3) return this.stable;
    const counts = [0, 0, 0, 0];
    for (const h of this.history) counts[h.level] += 1;
    const best = counts.indexOf(Math.max(...counts));
    if (counts[best] / this.history.length >= this.th.share) this.stable = best;
    this.share = counts[this.stable] / this.history.length;
    return this.stable;
  }

  /**
   * Leaky hold. While a wai is stable the hold and the dwell at that level grow. When it drops
   * out, the hold (capped at the target, so a long hold does not buy a long memory) freezes for
   * holdGraceMs and then drains at holdLeak; the wai is over, and the pass re-armed, once it
   * reaches zero. A dip shorter than the grace costs nothing, a hands-down pause clears everything.
   */
  hold(dt, form) {
    const th = this.th;
    if (this.stable > 0) {
      this.dipMs = 0;
      this.holdMs += dt;
      this.dwell[this.stable] += dt;
      this.formSum += form * dt;
      return;
    }
    if (this.holdMs <= 0) {
      this.dipMs = 0;
      this.dwell = [0, 0, 0, 0];
      this.formSum = 0;
      this.passedLevel = 0;
      return;
    }
    const scale = (k) => {
      this.dwell = this.dwell.map((d) => d * k);
      this.formSum *= k;
      this.holdMs *= k;
    };
    if (this.dipMs === 0 && this.holdMs > th.holdMs) scale(th.holdMs / this.holdMs);
    this.dipMs += dt;
    if (this.dipMs <= th.holdGraceMs) return;
    const next = Math.max(0, this.holdMs - th.holdLeak * dt);
    scale(next / this.holdMs);
    if (next === 0) {
      this.holdMs = 0;
      this.dwell = [0, 0, 0, 0];
      this.formSum = 0;
      this.passedLevel = 0;
    }
  }

  /**
   * 0..1: how sure the detector is of the stable level it reports. Two hands seen beat one hand
   * beat the pose fallback; a unanimous vote window, a height squarely inside the level band and a
   * visible face add certainty. For level 0 it is the certainty that there is no wai.
   */
  confidence(F) {
    if (!F) return 1; // nobody there: certainly no wai
    if (this.stable === 0) return clamp01(this.share) * (F.handsSeen && F.together ? 0.6 : 1);
    const evidence = { hands2: 1, hands1: 0.75, pose: 0.5 }[F.evidence] ?? 0;
    const head = { face: 1, pose: 0.8, memory: 0.5, none: 0.5 }[F.headSource] ?? 0.5;
    const h = F.heightLevel ?? this.stable;
    // distance from the nearest level boundary (1.5 / 2.5), 0 at the boundary, 1 half a level away
    const margin = this.stable === 3 && h >= 3 ? 1 : clamp01(Math.min(Math.abs(h - 1.5), Math.abs(h - 2.5)) / 0.5);
    const vote = clamp01((this.share - this.th.share) / (1 - this.th.share));
    return Math.round(100 * evidence * (0.45 * vote + 0.3 * margin + 0.25 * head)) / 100;
  }

  /** 0..0.75: the form part of the score, symmetric hands, centered on the face, squarely inside the level band. */
  form(F, level) {
    if (!level || !F || !F.handsSeen) return 0;
    const sym = F.sym == null ? 0.7 : clamp01(F.sym);
    const cen = clamp01(1 - (F.center ?? 0) / this.th.centerMax);
    const off = Math.abs((F.heightLevel ?? level) - level);
    const fit = level === 3 && F.heightLevel >= 3 ? 1 : clamp01(1 - Math.max(0, off - 0.25) / 0.35);
    return 0.35 * sym + 0.25 * cen + 0.15 * fit;
  }

  /** 0-100: the form on this frame plus how long the wai has been held. */
  score(F, level) {
    if (!level || !F || !F.handsSeen) return 0;
    return Math.round(100 * (this.form(F, level) + 0.25 * clamp01(this.holdMs / 1000)));
  }

  /**
   * 0-100: the score a pass is judged on, the form averaged over the whole hold plus the hold
   * term. The hands are often already dropping on the frame where the hold crosses the target, so
   * that frame's own form says little about the wai that was held.
   */
  passScore() {
    if (this.holdMs <= 0) return 0;
    return Math.round(100 * (this.formSum / this.holdMs + 0.25 * clamp01(this.holdMs / 1000)));
  }

  /**
   * Feed one frame. `detections` = {pose, face, hands}, `W`/`H` = video size, `dt` = ms since the
   * last frame, `requiredLevel` (optional) = the level a pass needs right now.
   * Returns the readout plus `passed`, true only on the frame where a wai passes (once per wai).
   */
  update(detections, W, H, dt, requiredLevel = 1) {
    const calib = this.calibration;
    this.calib = calib;
    const raw = extractFeatures(detections, W, H, calib, this.th);
    if (raw) this.last = { pitch: raw.pitch, neck: raw.neck };
    const F = this.smoothFeatures(raw, calib);
    const rawLevel = classify(F, this.th, this.stable);
    this.learn(raw, rawLevel);
    this.stabilize(rawLevel, dt);
    // Hold time runs while a wai of any level is stable; the stabilizer already makes each level
    // dwell, so moving between levels does not reset it, and a brief loss of the hands only pauses it.
    this.hold(dt, this.form(F, this.stable));

    const score = this.score(F, this.stable);
    const minDwell = Math.min(this.th.passMinDwellMs ?? 0, this.th.holdMs);
    let passed = false;
    if (
      this.stable > 0 &&
      this.passedLevel === 0 &&
      this.stable >= requiredLevel &&
      this.holdMs >= this.th.holdMs &&
      this.dwell[this.stable] >= minDwell &&
      this.passScore() >= this.th.passMinScore
    ) {
      this.passedLevel = this.stable;
      passed = true;
    }
    return {
      raw: rawLevel,
      stable: this.stable,
      holdMs: this.holdMs,
      score,
      passed,
      confidence: this.confidence(F),
      features: F,
      reason: raw ? (raw.handsSeen ? null : "มองไม่เห็นมือ") : "ไม่เจอคน",
    };
  }
}

/**
 * Why the current frame is not a passing wai, as WaiReason codes from the renderer contract.
 * `result` is what WaiTracker.update returned; `seen` says what the landmarkers found.
 */
export function reasonsFor(result, { facePresent, posePresent }, th, requiredLevel = 1) {
  const F = result.features;
  if (!F) return posePresent || facePresent ? ["HANDS_TOO_LOW"] : ["NO_PERSON"];
  const out = [];
  // Hands cover the face in a high wai by design, so a missing face only matters when there are
  // no hands in view either (turned away, covered) or the head cannot be placed at all.
  if (!facePresent && (!F.handsSeen || F.headSource === "none")) out.push("FACE_HIDDEN");
  if (!F.handsSeen) {
    out.push("HANDS_TOO_LOW");
    return out;
  }
  if (!F.together) out.push("HANDS_APART");
  if (!(F.fingersUp > th.fingersUpMin)) out.push("FINGERS_NOT_UP");
  if (F.tooHigh) out.push("HANDS_APART");
  if (result.stable > 0 && result.stable < requiredLevel) out.push("HANDS_TOO_LOW");
  if (requiredLevel >= 3 && result.stable < 3 && (F.heightLevel ?? 0) >= 2.5 && bowed(F, th) === false) out.push("NOT_BOWING");
  if (F.sym != null && F.sym < 0.4) out.push("ASYMMETRIC");
  if (result.stable > 0 && result.holdMs < th.holdMs) out.push("HOLD_TOO_SHORT");
  return [...new Set(out)];
}
