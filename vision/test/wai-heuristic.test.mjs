// Synthetic unit tests for the wai heuristic.  Run:  node --test vision/test/wai-heuristic.test.mjs
//
// A synthetic person is built in body units (origin at the shoulder midpoint, 1 = shoulder width,
// v up), then projected into a 1280x720 frame with an optional camera tilt. Hands are 21-point
// MediaPipe-style hands pointing up with the thumbs pressed along the index fingers.

import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TH, WaiTracker, classify, extractFeatures, reasonsFor, levelName } from "../wai-heuristic.js";

const W = 1280;
const H = 720;
const FACE_H = 0.21; // nose tip to brow, in shoulder widths
const NOSE_V = 0.5;
const CHIN_V = NOSE_V - 1.2 * FACE_H;
const BROW_V = NOSE_V + FACE_H;
const HAIRLINE_V = NOSE_V + 1.9 * FACE_H;
const WAI_REASONS = new Set([
  "NO_PERSON",
  "FACE_HIDDEN",
  "HANDS_APART",
  "FINGERS_NOT_UP",
  "HANDS_TOO_LOW",
  "NOT_BOWING",
  "ASYMMETRIC",
  "HOLD_TOO_SHORT",
]);

/** A 21-point hand pointing up. `side` is -1 or +1; `baseV` is the wrist height; `dx` shifts it sideways. */
function hand(side, baseV, dx = 0) {
  const u = (k) => side * k + dx;
  const finger = (uBase, uTip, vBase, vTip) => [
    [uBase, vBase],
    [uBase + (uTip - uBase) / 3, vBase + (vTip - vBase) / 3],
    [uBase + (2 * (uTip - uBase)) / 3, vBase + (2 * (vTip - vBase)) / 3],
    [uTip, vTip],
  ];
  return [
    [u(0.06), baseV], // 0 wrist
    ...finger(u(0.05), u(0.0), baseV + 0.08, baseV + 0.3), // 1-4 thumb, tip at the thumb anchor
    ...finger(u(0.04), u(0.03), baseV + 0.2, baseV + 0.48), // 5-8 index
    ...finger(u(0.06), u(0.05), baseV + 0.21, baseV + 0.5), // 9-12 middle
    ...finger(u(0.08), u(0.07), baseV + 0.2, baseV + 0.47), // 13-16 ring
    ...finger(u(0.1), u(0.09), baseV + 0.18, baseV + 0.42), // 17-20 pinky
  ].map(([pu, pv]) => ({ u: pu, v: pv }));
}

/** Wrist height that puts the thumb tips at `thumbV`. */
const baseFor = (thumbV) => thumbV - 0.3;

/**
 * Build MediaPipe-like detections.
 *  thumbV      thumb-tip height (null = hands below the frame)
 *  lean        head offset along the shoulders, in shoulder widths (hands follow the head)
 *  tiltDeg     camera roll: the whole person is rotated in the image
 *  face        include face landmarks
 *  shoulders   shoulder visibility (low = sitting too close, shoulders out of frame)
 *  handModel   emit hand-model hands ("both", "one", "none")
 *  apart       extra sideways spread of each hand, in shoulder widths
 *  swPx        shoulder width in pixels
 *  ghost       add a collapsed ghost hand far to the side
 *  cyFrac      where the shoulder midpoint sits in the image, as a fraction of its height (> 1: below the frame)
 *  shoulderHalf  where the shoulder landmarks are reported, in true shoulder widths from the midline
 *              (0.5 = correct; less = the pose model pulled them inward, as it does when the arms rise)
 */
function person({
  thumbV = null,
  lean = 0,
  tiltDeg = 0,
  face = true,
  shoulders = 0.99,
  handModel = "both",
  apart = 0,
  swPx = 320,
  ghost = false,
  wristVis = 0.9,
  handsHigh = false,
  cyFrac = 0.62,
  shoulderHalf = 0.5,
} = {}) {
  const cx = W / 2;
  const cy = H * cyFrac;
  const rad = (tiltDeg * Math.PI) / 180;
  // body (u, v) -> image, rotated by the camera tilt around the shoulder midpoint
  const img = ({ u, v }) => {
    const x = u * swPx;
    const y = -v * swPx;
    return {
      x: (cx + x * Math.cos(rad) - y * Math.sin(rad)) / W,
      y: (cy + x * Math.sin(rad) + y * Math.cos(rad)) / H,
    };
  };
  const lm = (p, visibility = 0.99) => ({ ...img(p), z: 0, visibility });

  const noseU = lean;
  const pose = new Array(33).fill(null).map(() => lm({ u: 0, v: -1.5 }, 0.05));
  pose[0] = lm({ u: noseU, v: NOSE_V });
  pose[2] = lm({ u: noseU + 0.06, v: NOSE_V + 0.13 });
  pose[5] = lm({ u: noseU - 0.06, v: NOSE_V + 0.13 });
  pose[1] = pose[3] = pose[2];
  pose[4] = pose[6] = pose[5];
  pose[7] = lm({ u: noseU + 0.15, v: NOSE_V + 0.08 });
  pose[8] = lm({ u: noseU - 0.15, v: NOSE_V + 0.08 });
  pose[11] = lm({ u: shoulderHalf, v: 0 }, shoulders);
  pose[12] = lm({ u: -shoulderHalf, v: 0 }, shoulders);

  const hands = { landmarks: [], worldLandmarks: [], handedness: [], handednesses: [] };
  const addHand = (pts, name) => {
    hands.landmarks.push(pts.map((p) => ({ ...img(p), z: 0 })));
    const cat = [{ categoryName: name, displayName: name, score: 0.9, index: 0 }];
    hands.handedness.push(cat);
    hands.handednesses.push(cat);
  };

  if (thumbV == null) {
    // hands hanging below the frame
    pose[15] = lm({ u: 0.55, v: -1.6 }, 0.1);
    pose[16] = lm({ u: -0.55, v: -1.6 }, 0.1);
    for (const i of [17, 19, 21]) pose[i] = lm({ u: 0.55, v: -1.75 }, 0.1);
    for (const i of [18, 20, 22]) pose[i] = lm({ u: -0.55, v: -1.75 }, 0.1);
  } else {
    const base = baseFor(thumbV);
    const L = hand(+1, base, lean + apart);
    const R = hand(-1, base, lean - apart);
    pose[15] = lm(L[0], wristVis);
    pose[16] = lm(R[0], wristVis);
    pose[19] = lm(L[8], wristVis);
    pose[20] = lm(R[8], wristVis);
    pose[21] = lm(L[4], wristVis);
    pose[22] = lm(R[4], wristVis);
    pose[17] = lm(L[20], wristVis);
    pose[18] = lm(R[20], wristVis);
    if (handModel === "both" || handModel === "one") addHand(L, "Left");
    if (handModel === "both") addHand(R, "Right");
  }
  if (handsHigh) {
    // both hands stretched high above the head, apart
    const L = hand(+1, NOSE_V + 1.6, 0.4);
    const R = hand(-1, NOSE_V + 1.6, -0.4);
    pose[15] = lm(L[0]);
    pose[16] = lm(R[0]);
    pose[19] = lm(L[8]);
    pose[20] = lm(R[8]);
    pose[21] = lm(L[4]);
    pose[22] = lm(R[4]);
    hands.landmarks.length = 0;
    hands.handedness.length = 0;
    hands.handednesses.length = 0;
    addHand(L, "Left");
    addHand(R, "Right");
  }
  if (ghost) {
    // 21 points collapsed onto one spot off to the side (what the hand model does on clutter)
    const g = new Array(21).fill(null).map((_, i) => ({ u: -0.7 + 0.001 * i, v: -0.5 }));
    addHand(g, "Right");
  }

  const faceRes = { faceLandmarks: [], faceBlendshapes: [], facialTransformationMatrixes: [] };
  if (face) {
    const fl = new Array(478);
    fl[1] = lm({ u: noseU, v: NOSE_V });
    fl[9] = lm({ u: noseU, v: BROW_V });
    fl[10] = lm({ u: noseU, v: NOSE_V + 1.5 * FACE_H });
    faceRes.faceLandmarks.push(fl);
  }
  return { pose: { landmarks: [pose], worldLandmarks: [] }, face: faceRes, hands };
}

const level = (det) => classify(extractFeatures(det, W, H, {}, DEFAULT_TH), DEFAULT_TH);

/** Run the same detections through a tracker for `frames` frames at 30 fps. */
function run(det, frames, tracker = new WaiTracker(), requiredLevel = 1) {
  let last = null;
  const passes = [];
  for (let i = 0; i < frames; i++) {
    last = tracker.update(det, W, H, 33, requiredLevel);
    if (last.passed) passes.push(last.stable);
  }
  return { last, passes, tracker };
}

test("levels follow the thumbs: chin, nose, brow", () => {
  assert.equal(level(person({ thumbV: CHIN_V })), 1);
  assert.equal(level(person({ thumbV: NOSE_V })), 2);
  assert.equal(level(person({ thumbV: BROW_V })), 3);
  assert.equal(levelName(3), "ไหว้พระ");
});

test("fingertips at the nose still count as level 1 (thumbs at the chin)", () => {
  const det = person({ thumbV: CHIN_V });
  const F = extractFeatures(det, W, H, {}, DEFAULT_TH);
  assert.ok(Math.abs(F.tipRel) < 0.3, `tips near the nose, got ${F.tipRel}`);
  assert.equal(classify(F, DEFAULT_TH), 1);
});

test("leaning left or right does not change the level", () => {
  for (const lean of [-0.3, -0.15, 0.15, 0.3]) {
    assert.equal(level(person({ thumbV: CHIN_V, lean })), 1, `lean ${lean} level 1`);
    assert.equal(level(person({ thumbV: NOSE_V, lean })), 2, `lean ${lean} level 2`);
    assert.equal(level(person({ thumbV: BROW_V, lean })), 3, `lean ${lean} level 3`);
  }
});

test("a tilted camera or body does not change the level", () => {
  for (const tiltDeg of [-25, -10, 10, 25]) {
    assert.equal(level(person({ thumbV: CHIN_V, tiltDeg })), 1, `tilt ${tiltDeg} level 1`);
    assert.equal(level(person({ thumbV: BROW_V, tiltDeg })), 3, `tilt ${tiltDeg} level 3`);
    assert.equal(level(person({ thumbV: BROW_V, tiltDeg, lean: 0.2 })), 3, `tilt ${tiltDeg} + lean`);
  }
});

test("sitting close: shoulders out of frame, the face carries the body frame", () => {
  const det = person({ thumbV: NOSE_V, shoulders: 0.1, swPx: 700 });
  const F = extractFeatures(det, W, H, {}, DEFAULT_TH);
  assert.equal(F.source, "face");
  assert.equal(classify(F, DEFAULT_TH), 2);
});

test("hands below the frame: level 0 with HANDS_TOO_LOW, not NO_PERSON", () => {
  const det = person({ thumbV: null });
  const { last } = run(det, 20);
  assert.equal(last.stable, 0);
  const reasons = reasonsFor(last, { facePresent: true, posePresent: true }, DEFAULT_TH, 1);
  assert.deepEqual(reasons, ["HANDS_TOO_LOW"]);
});

test("nobody in frame: NO_PERSON", () => {
  const det = { pose: { landmarks: [] }, face: { faceLandmarks: [] }, hands: { landmarks: [] } };
  const { last } = run(det, 5);
  assert.equal(last.stable, 0);
  assert.deepEqual(reasonsFor(last, { facePresent: false, posePresent: false }, DEFAULT_TH, 1), ["NO_PERSON"]);
});

test("level 3 with the face hidden by the hands still reads 3 and does not report FACE_HIDDEN", () => {
  const det = person({ thumbV: BROW_V, face: false });
  const { last } = run(det, 30);
  assert.equal(last.stable, 3);
  const reasons = reasonsFor(last, { facePresent: false, posePresent: true }, DEFAULT_TH, 3);
  assert.ok(!reasons.includes("FACE_HIDDEN"), `got ${reasons}`);
});

test("face memory: after seeing the face, a hidden face keeps the same level", () => {
  const tracker = new WaiTracker();
  run(person({ thumbV: NOSE_V }), 30, tracker);
  const { last } = run(person({ thumbV: NOSE_V, face: false }), 30, tracker);
  assert.equal(last.stable, 2);
});

test("one visible hand in front of the face counts, one hand off to the side does not", () => {
  assert.equal(level(person({ thumbV: NOSE_V, handModel: "one", wristVis: 0.2 })), 2);
  // a lone hand 0.5 shoulder widths off the midline with the other hand hanging down
  const det = person({ thumbV: NOSE_V, handModel: "one", wristVis: 0.2 });
  det.hands.landmarks[0] = det.hands.landmarks[0].map((p) => ({ ...p, x: p.x + (0.5 * 320) / W }));
  assert.equal(level(det), 0);
});

test("pose fallback: no hand-model hands, visible pose wrists", () => {
  assert.equal(level(person({ thumbV: CHIN_V, handModel: "none" })), 1);
  assert.equal(level(person({ thumbV: BROW_V, handModel: "none" })), 3);
});

test("hands apart are not a wai; a mirrored open high wai is", () => {
  assert.equal(level(person({ thumbV: NOSE_V, apart: 0.45 })), 0);
  const F = extractFeatures(person({ thumbV: NOSE_V, apart: 0.45 }), W, H, {}, DEFAULT_TH);
  assert.equal(F.together, false);
  // lotus: palms parted by ~0.4, mirrored, pointing up, thumbs converging
  assert.equal(level(person({ thumbV: BROW_V, apart: 0.2 })), 3);
});

test("hands stretched above the head are not a wai", () => {
  assert.equal(level(person({ handsHigh: true })), 0);
});

test("a collapsed ghost hand is ignored", () => {
  const det = person({ thumbV: null, ghost: true });
  const F = extractFeatures(det, W, H, {}, DEFAULT_TH);
  assert.equal(F.realHands, 0);
  assert.equal(F.handsSeen, false);
  assert.equal(level(person({ thumbV: CHIN_V, ghost: true })), 1);
});

test("hysteresis: a level at the boundary does not flicker", () => {
  // thumbs halfway between the nose and the brow sit right on the 2/3 boundary
  const det = person({ thumbV: NOSE_V + 0.5 * FACE_H });
  const tracker = new WaiTracker();
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    const r = tracker.update(det, W, H, 33);
    if (i > 15) seen.add(r.stable);
  }
  assert.equal(seen.size, 1, `stable level changed: ${[...seen]}`);
});

test("pass fires once per wai, after the hold, and only at the required level", () => {
  const th = { ...DEFAULT_TH, holdMs: 500 };
  const tracker = new WaiTracker(th);
  // level 1 wai while level 2 is required: no pass, tracker stays armed
  let { passes } = run(person({ thumbV: CHIN_V }), 40, tracker, 2);
  assert.deepEqual(passes, []);
  // raise to level 2: passes once, then holds without passing again
  ({ passes } = run(person({ thumbV: NOSE_V }), 60, tracker, 2));
  assert.deepEqual(passes, [2]);
  ({ passes } = run(person({ thumbV: NOSE_V }), 60, tracker, 2));
  assert.deepEqual(passes, []);
  // hands down long enough for the leaky hold to drain (grace + hold target): a new wai, a new pass
  run(person({ thumbV: null }), 45, tracker, 2);
  assert.equal(tracker.holdMs, 0);
  ({ passes } = run(person({ thumbV: NOSE_V }), 60, tracker, 2));
  assert.deepEqual(passes, [2]);
});

test("VisionEvent contract: level 0-3, score 0-100, holdMs, reasons from the fixed set", () => {
  const tracker = new WaiTracker({ ...DEFAULT_TH, holdMs: 1000 });
  for (const det of [person({ thumbV: null }), person({ thumbV: CHIN_V }), person({ thumbV: BROW_V, face: false })]) {
    for (let i = 0; i < 20; i++) {
      const r = tracker.update(det, W, H, 33, 1);
      const reasons = reasonsFor(r, { facePresent: det.face.faceLandmarks.length > 0, posePresent: true }, tracker.th, 1);
      assert.ok([0, 1, 2, 3].includes(r.stable));
      assert.ok(r.score >= 0 && r.score <= 100);
      assert.ok(Number.isFinite(r.holdMs) && r.holdMs >= 0);
      assert.ok(r.confidence >= 0 && r.confidence <= 1);
      for (const code of reasons) assert.ok(WAI_REASONS.has(code), `unknown reason ${code}`);
    }
  }
  const { last } = run(person({ thumbV: CHIN_V }), 60, tracker);
  assert.ok(last.score >= 70, `a clean held wai should score high, got ${last.score}`);
  assert.deepEqual(reasonsFor(last, { facePresent: true, posePresent: true }, tracker.th, 1), []);
});

test("bow: a visible face with no pitch change denies level 3; a bowed face confirms it", () => {
  const upright = person({ thumbV: BROW_V });
  const flat = { data: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] };
  upright.face.facialTransformationMatrixes = [flat];
  const tracker = new WaiTracker();
  tracker.update(upright, W, H, 33);
  tracker.calibrate();
  assert.equal(run(upright, 30, tracker).last.stable, 2, "thumbs at the brow without a bow is level 2");
  const a = (25 * Math.PI) / 180;
  const bowedFace = person({ thumbV: BROW_V });
  bowedFace.face.facialTransformationMatrixes = [
    { data: [1, 0, 0, 0, 0, Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1] },
  ];
  assert.equal(run(bowedFace, 30, tracker).last.stable, 3);
});

// ---- robustness: sitting close, leaning, a hand in front of the face, model failures ----

/** Rotate the hand-model hand `idx` by `deg` about its wrist, in pixel space. */
function rotateHand(det, idx, deg) {
  const pts = det.hands.landmarks[idx];
  const w = pts[0];
  const a = (deg * Math.PI) / 180;
  det.hands.landmarks[idx] = pts.map((p) => {
    const dx = (p.x - w.x) * W;
    const dy = (p.y - w.y) * H;
    return { x: w.x + (dx * Math.cos(a) - dy * Math.sin(a)) / W, y: w.y + (dx * Math.sin(a) + dy * Math.cos(a)) / H, z: 0 };
  });
}

/** A person whose hands are not seen at all: no hand-model hands, pose wrists invisible. */
const handsGone = (opts = {}) => person({ ...opts, handModel: "none", wristVis: 0.1 });

test("sitting close: shoulders extrapolated below the image hand the frame to the face, leaning included", () => {
  const close = { cyFrac: 1.08, swPx: 600 }; // shoulder midpoint 8% below the bottom edge, still reported with high visibility
  const F = extractFeatures(person({ thumbV: NOSE_V, ...close }), W, H, {}, DEFAULT_TH);
  assert.equal(F.source, "face");
  assert.equal(classify(F, DEFAULT_TH), 2);
  for (const lean of [-0.2, 0.2]) {
    assert.equal(level(person({ thumbV: BROW_V, ...close, lean })), 3, `lean ${lean} level 3`);
    assert.equal(level(person({ thumbV: CHIN_V, ...close, lean })), 1, `lean ${lean} level 1`);
  }
});

test("face hidden while the raised arms pull the shoulder landmarks inward: the level holds", () => {
  // thumbs a third of the way from the nose to the brow, fingertips just above the brow: level 2
  const tracker = new WaiTracker();
  run(handsGone(), 30, tracker); // relaxed frames: the face is remembered in pixels
  assert.ok(tracker.memory.faceHpx > 0);
  const det = person({ thumbV: NOSE_V + 0.3 * FACE_H, face: false, shoulderHalf: 0.375 }); // shoulders 25% narrower
  assert.equal(run(det, 30, tracker).last.stable, 2);
  // the same frames measured against a face height remembered in shoulder widths read a level too high
  const sw = extractFeatures(det, W, H, { faceH: FACE_H }, DEFAULT_TH);
  assert.equal(classify(sw, DEFAULT_TH), 3);
});

test("a pose nose parked on the shoulder line is replaced by the remembered upright nose", () => {
  const tracker = new WaiTracker();
  run(handsGone(), 30, tracker); // learns the upright neck
  const det = person({ thumbV: 0.1, face: false }); // thumbs just above the shoulder line: hands at the chest
  const pl = det.pose.landmarks[0];
  pl[0] = { x: (pl[11].x + pl[12].x) / 2, y: (pl[11].y + pl[12].y) / 2 - (0.03 * 320) / H, z: 0, visibility: 0.99 };
  const F = extractFeatures(det, W, H, tracker.calibration, DEFAULT_TH);
  assert.equal(F.headSource, "memory");
  assert.equal(run(det, 30, tracker).last.stable, 1, "hands at the chest are level 1 at most");
});

test("a hand cut off by the bottom edge of the image is not a wai", () => {
  // a resting hand whose wrist is below the frame: the model squeezes 21 points into the stub that shows
  const det = person({ thumbV: null });
  const stub = hand(+1, -0.9, -0.06).map((p) => ({ u: p.u, v: -0.9 + (p.v + 0.9) * 0.3 }));
  const cx = W / 2;
  const cy = H * 0.62;
  det.hands.landmarks.push(stub.map((p) => ({ x: (cx + p.u * 320) / W, y: (cy - p.v * 320) / H, z: 0 })));
  const F = extractFeatures(det, W, H, {}, DEFAULT_TH);
  assert.equal(F.realHands, 1);
  assert.ok(F.fingersUp < DEFAULT_TH.fingersUpMin, `stub fingersUp ${F.fingersUp}`);
  assert.equal(classify(F, DEFAULT_TH), 0);
});

test("a hand in front of the face: a wai hand hiding the other counts, a hand over the mouth or a face-palm does not", () => {
  // one upright hand on the midline with the face hidden behind it, after the face was seen
  const tracker = new WaiTracker();
  run(handsGone(), 30, tracker);
  assert.equal(run(person({ thumbV: NOSE_V, face: false, handModel: "one", wristVis: 0.2 }), 30, tracker).last.stable, 2);
  // a hand lying across the mouth: fingers horizontal
  const flat = person({ thumbV: NOSE_V, handModel: "one", wristVis: 0.2 });
  rotateHand(flat, 0, 90);
  assert.equal(level(flat), 0);
  // a face-palm: an upright hand on the face while the other wrist is confidently seen hanging at the hip
  const palm = person({ thumbV: NOSE_V, handModel: "one", wristVis: 0.9 });
  const pl = palm.pose.landmarks[0];
  pl[16] = { x: (W / 2 - 0.45 * 320) / W, y: (H * 0.62 + 0.8 * 320) / H, z: 0, visibility: 0.9 };
  assert.equal(level(palm), 0);
});

test("leaky hold: a brief loss of the hands keeps the hold, the wai passes once, a real pause re-arms it", () => {
  const th = { ...DEFAULT_TH, holdMs: 1000 };
  const tracker = new WaiTracker(th);
  const up = person({ thumbV: BROW_V, face: false });
  const gone = handsGone({ face: false });
  let passes = run(up, 18, tracker, 3).passes; // ~0.6 s up
  assert.deepEqual(passes, []);
  const before = tracker.holdMs;
  passes = run(gone, 8, tracker, 3).passes; // hands lost for ~0.26 s, inside the grace
  assert.deepEqual(passes, []);
  assert.ok(tracker.holdMs >= before, `the hold must not reset in a brief dip (${tracker.holdMs} < ${before})`);
  passes = run(up, 25, tracker, 3).passes;
  assert.deepEqual(passes, [3], "the two halves add up to one pass");
  assert.deepEqual(run(up, 30, tracker, 3).passes, [], "no second pass while the wai goes on");
  // hands away for 2 s: the hold drains to zero and the pass is re-armed
  run(gone, 60, tracker, 3);
  assert.equal(tracker.holdMs, 0);
  assert.equal(tracker.passedLevel, 0);
  assert.deepEqual(run(up, 45, tracker, 3).passes, [3]);
});

test("leaky hold never passes on its own: a short wai followed by nothing drains without a pass", () => {
  const tracker = new WaiTracker({ ...DEFAULT_TH, holdMs: 1000 });
  const passes = [...run(person({ thumbV: BROW_V }), 15, tracker).passes, ...run(handsGone(), 60, tracker).passes];
  assert.deepEqual(passes, []);
  assert.equal(tracker.holdMs, 0);
});

test("a pass waits until the reported level itself has been held, not a level the hands just reached", () => {
  const th = { ...DEFAULT_TH, holdMs: 1000 };
  const tracker = new WaiTracker(th);
  run(person({ thumbV: BROW_V }), 20, tracker, 1); // ~0.6 s of hold at level 3
  const { passes, last } = run(person({ thumbV: CHIN_V }), 14, tracker, 1); // the hands sink to level 1
  assert.equal(last.stable, 1);
  assert.ok(tracker.holdMs >= th.holdMs, `hold ${tracker.holdMs}`);
  assert.deepEqual(passes, [], "the hold is over the target but level 1 has not been held yet");
  assert.deepEqual(run(person({ thumbV: CHIN_V }), 8, tracker, 1).passes, [1], "held at level 1 for a vote window: now it passes there");
});

test("confidence: 0..1, two clean hands beat the pose fallback, and no hands means certainly no wai", () => {
  const two = run(person({ thumbV: BROW_V }), 30).last;
  const poseOnly = run(person({ thumbV: BROW_V, handModel: "none" }), 30).last;
  const none = run(person({ thumbV: null }), 30).last;
  for (const r of [two, poseOnly, none]) assert.ok(r.confidence >= 0 && r.confidence <= 1, `confidence ${r.confidence}`);
  assert.equal(two.stable, 3);
  assert.ok(two.confidence > poseOnly.confidence, `${two.confidence} > ${poseOnly.confidence}`);
  assert.equal(none.stable, 0);
  assert.ok(none.confidence >= 0.9);
});
