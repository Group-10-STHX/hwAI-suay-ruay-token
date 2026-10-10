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
} = {}) {
  const cx = W / 2;
  const cy = H * 0.62;
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
  pose[11] = lm({ u: 0.5, v: 0 }, shoulders);
  pose[12] = lm({ u: -0.5, v: 0 }, shoulders);

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
  // hands down and up again: a new wai, a new pass
  run(person({ thumbV: null }), 20, tracker, 2);
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
