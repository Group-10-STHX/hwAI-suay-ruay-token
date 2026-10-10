// Vision worker: runs in a hidden Electron window owned by the daemon (spikes/popup-hook/main.mjs).
//
//   main  -> worker   vision:control {run: true | false, requiredLevel}
//   worker -> main    vision:event   VisionEvent (~15 fps, contract in app/renderer/src/api/types.ts)
//   worker -> main    vision:pass    {level, score}  once per wai, when the hold and score are reached
//
// The camera is only open while main says run=true (there is at least one request waiting).
// The loop uses setTimeout, not requestAnimationFrame, because rAF does not run in hidden windows.

import { DEFAULT_TH, WaiTracker, reasonsFor } from "../wai-heuristic.js";

const VISION_VERSION = "1.1.0";
const BUNDLE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}/vision_bundle.mjs`;
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}/wasm`;
const MODELS = "https://storage.googleapis.com/mediapipe-models";
const FRAME_MS = 33; // detect at ~30 fps
const EMIT_MS = 66; // send VisionEvent at ~15 fps (contract)
const HOLD_MS = 1000; // hold target from artifact.md

const bridge = window.visionWorker;
const video = document.getElementById("video");
const tracker = new WaiTracker({ ...DEFAULT_TH, holdMs: HOLD_MS });

let landmarkers = null;
let wantRun = false; // what main asked for
let running = false;
let starting = false;
let requiredLevel = 1;
let timer = null;
let lastTs = 0;
let lastEmit = 0;

const log = (...args) => console.log("[vision]", ...args);

async function loadModels(delegate) {
  const mp = await import(BUNDLE);
  const fileset = await mp.FilesetResolver.forVisionTasks(WASM);
  const opts = (path) => ({
    baseOptions: { modelAssetPath: `${MODELS}/${path}`, delegate },
    runningMode: "VIDEO",
  });
  const [pose, face, hands] = await Promise.all([
    mp.PoseLandmarker.createFromOptions(fileset, {
      ...opts("pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task"),
      numPoses: 1,
    }),
    mp.FaceLandmarker.createFromOptions(fileset, {
      ...opts("face_landmarker/face_landmarker/float16/latest/face_landmarker.task"),
      numFaces: 1,
      outputFacialTransformationMatrixes: true,
    }),
    mp.HandLandmarker.createFromOptions(fileset, {
      ...opts("hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task"),
      numHands: 2,
      minHandDetectionConfidence: 0.3,
      minHandPresenceConfidence: 0.3,
      minTrackingConfidence: 0.3,
    }),
  ]);
  return { pose, face, hands };
}

async function start() {
  if (running || starting) return;
  starting = true;
  try {
    if (!landmarkers) {
      try {
        landmarkers = await loadModels("GPU");
      } catch (err) {
        log("GPU delegate failed, using CPU:", err.message);
        landmarkers = await loadModels("CPU");
      }
    }
    video.srcObject = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 360 },
      audio: false,
    });
    await video.play();
    running = true;
    lastTs = performance.now();
    log("camera on");
    loop();
  } catch (err) {
    log("camera failed:", err.name, err.message);
    bridge.emit({ isWai: false, level: 0, score: 0, holdMs: 0, reasons: ["NO_PERSON"], facePresent: false });
  } finally {
    starting = false;
    // main may have asked to stop while the camera was still opening
    if (!wantRun) stop();
  }
}

function stop() {
  clearTimeout(timer);
  timer = null;
  if (video.srcObject) {
    video.srcObject.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }
  if (running) log("camera off");
  running = false;
}

function loop() {
  if (!running) return;
  const ts = performance.now();
  const dt = ts - lastTs;
  lastTs = ts;
  if (video.readyState >= 2 && dt > 0) {
    const det = {
      pose: landmarkers.pose.detectForVideo(video, ts),
      face: landmarkers.face.detectForVideo(video, ts),
      hands: landmarkers.hands.detectForVideo(video, ts),
    };
    const result = tracker.update(det, video.videoWidth, video.videoHeight, dt);
    const facePresent = det.face.faceLandmarks.length > 0;
    const passed = result.passed && result.stable >= requiredLevel;

    if (passed) bridge.pass({ level: result.stable, score: result.score });
    if (passed || ts - lastEmit >= EMIT_MS) {
      lastEmit = ts;
      bridge.emit({
        isWai: result.stable > 0,
        level: result.stable,
        score: result.score,
        holdMs: Math.round(result.holdMs),
        reasons: reasonsFor(result, { facePresent, posePresent: det.pose.landmarks.length > 0 }, tracker.th, requiredLevel),
        facePresent,
      });
    }
  }
  timer = setTimeout(loop, FRAME_MS);
}

bridge.onControl(({ run, requiredLevel: level }) => {
  if (typeof level === "number") requiredLevel = Math.max(1, Math.min(3, level));
  wantRun = Boolean(run);
  if (wantRun) start();
  else if (!starting) stop();
});

log("worker ready");
bridge.ready();
