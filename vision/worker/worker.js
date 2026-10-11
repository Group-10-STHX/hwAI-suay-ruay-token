// Vision worker: runs in a hidden Electron window owned by the daemon (spikes/popup-hook/main.mjs).
//
//   main  -> worker   vision:control {run: true | false, requiredLevel, stickerStyle, stickers: boolean, stickerPalette?}
//                     stickerStyle: 'photo' | 'cartoon' | 'comic' | 'pixel' | 'neon' | 'kawaii' (STICKER_STYLES in sticker.js)
//                     stickerPalette (optional): neon colours {dark, hot, gold} as '#RRGGBB' (default = app tokens)
//                     sixSeven: boolean  easter egg 6-7 (scales pose). While true: no vision:pass/fail, VisionEvent gets sixSeven {swings, need}
//   worker -> main    vision:67      {done: true}  once when the 6-7 pose is completed
//   main  -> worker   vision:wai     {seq, id}  the wai id main recorded for a pass (kawaii sparkle seed)
//   worker -> main    vision:event   VisionEvent (~15 fps, contract in app/renderer/src/api/types.ts)
//   worker -> main    vision:pass    {level, score, holdMs, parts, attempts, style}  once per wai
//   worker -> main    vision:fail    {level, score, holdMs, reasons, parts}  when an attempt ends without a pass
//   worker -> main    vision:sticker {seq, png: ArrayBuffer, w, h, style, mode}  right after vision:pass (same seq in both)
//   worker -> main    vision:clip    {bytes, mime, outcome, level, score, ms}  dev only: a low quality CCTV-style clip per attempt
//   (contract: docs/wai-data-contract.md section 1)
//
// The camera is only open while main says run=true (there is at least one request waiting).
// The loop uses setTimeout, not requestAnimationFrame, because rAF does not run in hidden windows.

import { DEFAULT_TH, WaiTracker, reasonsFor } from "../wai-heuristic.js";
import { computeParts, createAttemptTracker, styleFor } from "./attempts.js";
import { createClipPlanner } from "./clip-plan.js";
import { encodeGif } from "./gif.js";
import { createSixSevenTracker } from "../six-seven.js";
import {
  STICKER_MAX_SIDE, buildSticker, faceBBox, fitSize, landmarksBBox, maskCoverage, normalizeStyle, orientMask, padFor,
  roundedRectMask,
} from "./sticker.js";

const VISION_VERSION = "1.1.0";
const BUNDLE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}/vision_bundle.mjs`;
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}/wasm`;
const MODELS = "https://storage.googleapis.com/mediapipe-models";
const SELFIE_MODEL = "image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";
const FRAME_MS = 33; // detect at ~30 fps
const EMIT_MS = 66; // send VisionEvent at ~15 fps (contract)
const HOLD_MS = 1000; // hold target from artifact.md

const bridge = window.visionWorker;
const video = document.getElementById("video");
const tracker = new WaiTracker({ ...DEFAULT_TH, holdMs: HOLD_MS });
const attemptTracker = createAttemptTracker();
const clipPlanner = createClipPlanner();
const sixSevenTracker = createSixSevenTracker(); // easter egg: runs only while main sets sixSeven=true
let sixSevenOn = false;
let sixSevenDone = false; // fired once; ignored until the flag toggles off/on

let landmarkers = null;
let wantRun = false; // what main asked for
let running = false;
let starting = false;
let requiredLevel = 1;
let timer = null;
let lastTs = 0;
let lastEmit = 0;
let stickerStyle = "photo"; // one of STICKER_STYLES (config.sticker_style via main)
let stickerPalette = null; // optional neon colours from main; null = sticker.js defaults (app tokens)
const waiIds = new Map(); // seq → wai id from main (vision:wai), used as the kawaii seed
let stickersOn = true;
let stickerSeq = 0;
let stickerBusy = false;
let segmenter = null; // lazy: loaded on the first pass; null + segmenterFailed = use the rectangle fallback
let segmenterFailed = false;
let lastPersonBox = null; // normalised pose bbox of the latest frame (fallback crop)
let lastFaceBox = null; // normalised face bbox of the latest frame (kawaii face brighten)
let mpModule = null;
let mpFileset = null;
let devRecord = false; // main turns this on only in dev (WAI_DEV_RECORD=1 or config.devRecord)

const log = (...args) => console.log("[vision]", ...args);

async function loadModels(delegate) {
  const mp = await import(BUNDLE);
  const fileset = await mp.FilesetResolver.forVisionTasks(WASM);
  mpModule = mp;
  mpFileset = fileset;
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

// ---------- GIF ตอนไหว้ผ่าน: เฟรมเล็กๆ ย้อนหลังประมาณ 2.7 วิ + ต่ออีก ~0.5 วิ → GIF หยาบๆ (vision/worker/gif.js) เก็บในเครื่องเท่านั้น ----------
const GIF_W = 160;
const GIF_H = 90;
const GIF_STEP_MS = 125; // 8 fps
const GIF_MAX_FRAMES = 22; // ย้อนหลัง ~2.7 วิ
const GIF_AFTER_FRAMES = 4; // หลังไหว้ผ่านอีก ~0.5 วิ
let gifCanvas = null;
let gifCtx = null;
let gifBuf = []; // Uint8ClampedArray (RGBA) ล่าสุด
let lastGifAt = 0;
let gifPending = null; // { seq, extra }

function sampleGif(ts) {
  if (!stickersOn || !video.videoWidth || ts - lastGifAt < GIF_STEP_MS) return;
  lastGifAt = ts;
  if (!gifCanvas) {
    gifCanvas = document.createElement("canvas");
    gifCanvas.width = GIF_W;
    gifCanvas.height = GIF_H;
    gifCtx = gifCanvas.getContext("2d", { willReadFrequently: true });
  }
  gifCtx.drawImage(video, 0, 0, GIF_W, GIF_H);
  gifBuf.push(gifCtx.getImageData(0, 0, GIF_W, GIF_H).data);
  if (gifBuf.length > GIF_MAX_FRAMES) gifBuf.shift();
  if (gifPending && --gifPending.extra <= 0) finishGif();
}

function startGif(seq) {
  if (!gifBuf.length || gifPending) return;
  gifPending = { seq, extra: GIF_AFTER_FRAMES };
}

function finishGif() {
  const p = gifPending;
  gifPending = null;
  if (!p || !gifBuf.length) return;
  try {
    const bytes = encodeGif(gifBuf.map((rgba) => ({ rgba })), GIF_W, GIF_H, { delayMs: GIF_STEP_MS });
    bridge.gif?.({ seq: p.seq, gif: bytes.buffer, w: GIF_W, h: GIF_H, frames: gifBuf.length });
  } catch (err) {
    log("gif failed:", err.message);
  }
}

// ---------- dev clips: low quality, CCTV look, one clip per attempt ----------
// 320x180, grayscale, ~6 fps, ~90 kbps, a timestamp bar. Stays on this machine (saved by main).
const CLIP_W = 320;
const CLIP_H = 180;
const CLIP_FPS = 6;
const CLIP_BPS = 90_000;
let clipCanvas = null;
let clipCtx = null;
let clipRecorder = null;
let clipChunks = [];

function clipMime() {
  for (const m of ["video/webm;codecs=vp8", "video/webm"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

function drawClipFrame() {
  if (!clipCanvas) {
    clipCanvas = document.createElement("canvas");
    clipCanvas.width = CLIP_W;
    clipCanvas.height = CLIP_H;
    clipCtx = clipCanvas.getContext("2d");
  }
  clipCtx.filter = "grayscale(1) contrast(1.25) brightness(0.9)";
  clipCtx.drawImage(video, 0, 0, CLIP_W, CLIP_H);
  clipCtx.filter = "none";
  clipCtx.fillStyle = "rgba(0,0,0,0.55)";
  clipCtx.fillRect(0, 0, CLIP_W, 16);
  clipCtx.fillStyle = "#e8e8e8";
  clipCtx.font = "11px monospace";
  clipCtx.fillText(`CAM1 ${new Date().toISOString().replace("T", " ").slice(0, 19)}`, 4, 12);
}

function startClip() {
  try {
    drawClipFrame();
    const mimeType = clipMime();
    clipChunks = [];
    clipRecorder = new MediaRecorder(clipCanvas.captureStream(CLIP_FPS), {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: CLIP_BPS,
    });
    clipRecorder.ondataavailable = (e) => e.data.size && clipChunks.push(e.data);
    clipRecorder.start(1000);
  } catch (err) {
    clipRecorder = null;
    log("clip recorder failed:", err.message);
  }
}

function stopClip(meta) {
  const rec = clipRecorder;
  const chunks = clipChunks; // a new clip may start (and reset clipChunks) before onstop fires
  clipRecorder = null;
  clipChunks = [];
  if (!rec || rec.state === "inactive") return;
  rec.onstop = async () => {
    if (!meta) return; // discarded
    try {
      const blob = new Blob(chunks, { type: rec.mimeType || "video/webm" });
      bridge.clip({ bytes: await blob.arrayBuffer(), mime: blob.type, ...meta });
    } catch (err) {
      log("clip save failed:", err.message);
    }
  };
  rec.stop();
}

function applyClipAction(a) {
  if (!a) return;
  if (a.action === "start") startClip();
  else if (a.action === "discard") stopClip(null);
  else if (a.action === "stop") stopClip({ outcome: a.outcome, level: a.level, score: a.score, ms: a.ms });
}

// ---------- sticker: one cut-out frame per pass, stays on this machine (main saves it) ----------
async function loadSegmenter() {
  if (segmenter || segmenterFailed || !mpModule) return segmenter;
  try {
    segmenter = await mpModule.ImageSegmenter.createFromOptions(mpFileset, {
      baseOptions: { modelAssetPath: `${MODELS}/${SELFIE_MODEL}`, delegate: "CPU" },
      runningMode: "IMAGE",
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    });
  } catch (err) {
    segmenterFailed = true;
    log("segmenter unavailable, rectangle fallback:", err.message);
  }
  return segmenter;
}

/** Person mask (Uint8 0..255) for the canvas, or null when the segmenter cannot give a sane one. */
async function segmentMask(canvas, w, h) {
  const seg = await loadSegmenter();
  if (!seg) return null;
  let result;
  try {
    result = seg.segment(canvas);
    const masks = result.confidenceMasks || [];
    // selfie model: [background, person] or a single person mask
    const m = masks.length >= 2 ? masks[1] : masks[0];
    if (!m) return null;
    const raw = m.getAsFloat32Array();
    if (raw.length !== w * h) return null;
    const mask = orientMask(raw, w, h);
    const cov = maskCoverage(mask);
    return cov > 0.03 && cov < 0.97 ? mask : null;
  } catch (err) {
    log("segment failed:", err.message);
    return null;
  } finally {
    try { result?.close?.(); } catch { /* ignore */ }
  }
}

/** The wai id main sends right after it records the pass; wait a little for it, else a seq-based seed. */
async function seedFor(seq, waitMs = 400) {
  for (let t = 0; !waiIds.has(seq) && t < waitMs; t += 25) await new Promise((ok) => setTimeout(ok, 25));
  const id = waiIds.get(seq);
  waiIds.delete(seq);
  return id || `seq-${seq}`;
}

async function captureSticker(seq, style, box, face) {
  if (stickerBusy || !video.videoWidth) return;
  stickerBusy = true;
  try {
    const maxSide = STICKER_MAX_SIDE - 2 * padFor(style);
    const { w, h } = fitSize(video.videoWidth, video.videoHeight, maxSide);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, w, h); // grab the frame right now, before any await
    const frame = ctx.getImageData(0, 0, w, h);
    let mode = "segment";
    let mask = await segmentMask(canvas, w, h);
    if (!mask) {
      mode = "box";
      const b = box || { x: 0.15, y: 0.05, w: 0.7, h: 0.9 };
      mask = roundedRectMask(w, h, { x: b.x * w, y: b.y * h, w: b.w * w, h: b.h * h }, Math.min(w, h) * 0.08);
    }
    const seed = style === "kawaii" ? await seedFor(seq) : `seq-${seq}`;
    const out = buildSticker({ rgba: frame.data, w, h, mask, style, seed, face, palette: stickerPalette });
    if (!out) return;
    const oc = document.createElement("canvas");
    oc.width = out.w;
    oc.height = out.h;
    oc.getContext("2d").putImageData(new ImageData(out.rgba, out.w, out.h), 0, 0);
    const blob = await new Promise((ok) => oc.toBlob(ok, "image/png"));
    if (!blob) return;
    bridge.sticker({ seq, png: await blob.arrayBuffer(), w: out.w, h: out.h, style, mode });
  } catch (err) {
    log("sticker failed:", err.message);
  } finally {
    stickerBusy = false;
  }
}

function stop() {
  // ไหว้ผ่านแล้วคิวว่าง main สั่งกล้องดับทันที: ส่ง GIF เท่าที่มีก่อน ไม่งั้นรอเฟรมหลังไหว้ที่ไม่มีวันมา
  if (gifPending) finishGif();
  gifBuf = [];
  clearTimeout(timer);
  timer = null;
  if (video.srcObject) {
    video.srcObject.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }
  if (running) log("camera off");
  if (devRecord) applyClipAction(clipPlanner.cut());
  running = false;
  attemptTracker.reset();
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
    // requiredLevel keeps a lower wai from using up the one pass per wai while a higher one is needed
    const result = tracker.update(det, video.videoWidth, video.videoHeight, dt, requiredLevel);
    const facePresent = det.face.faceLandmarks.length > 0;
    const passed = result.passed && result.stable >= requiredLevel;
    const reasons = reasonsFor(result, { facePresent, posePresent: det.pose.landmarks.length > 0 }, tracker.th, requiredLevel);
    const parts = computeParts(result.features, result.holdMs, { holdTarget: HOLD_MS, centerMax: tracker.th?.centerMax });

    lastPersonBox = landmarksBBox(det.pose.landmarks[0]);
    lastFaceBox = facePresent ? faceBBox(det.face.faceLandmarks[0]) : null;
    let six = null;
    if (sixSevenOn) {
      if (!sixSevenDone) {
        const st = sixSevenTracker.update(det.hands.landmarks, ts);
        six = { swings: st.swings, need: st.need };
        if (st.done) {
          sixSevenDone = true;
          sixSevenTracker.reset();
          bridge.sixSeven?.({ done: true });
        }
      } else {
        six = { swings: sixSevenTracker.need, need: sixSevenTracker.need };
      }
    }
    if (passed && !sixSevenOn) {
      attemptTracker.markPassed();
      const seq = ++stickerSeq;
      bridge.pass({
        seq,
        level: result.stable,
        score: result.score,
        holdMs: Math.round(result.holdMs),
        parts,
        attempts: attemptTracker.attempts,
        style: styleFor(parts),
      });
      if (stickersOn) {
        captureSticker(seq, stickerStyle, lastPersonBox, lastFaceBox); // async, never blocks the loop
        startGif(seq);
      }
    }
    sampleGif(ts);
    const ended = sixSevenOn ? null : attemptTracker.step({ ...result, reasons, parts }, dt);
    if (ended) bridge.fail(ended.fail);
    if (devRecord) {
      if (clipRecorder) drawClipFrame(); // keep the canvas (the recorder's source) fresh
      applyClipAction(
        clipPlanner.step({ stable: result.stable, passed, failed: Boolean(ended), level: result.stable, score: result.score }, dt),
      );
    }
    if ((passed && !sixSevenOn) || ts - lastEmit >= EMIT_MS) { // EMIT_MS 66 < 150, so sixSeven progress is always fresh
      lastEmit = ts;
      bridge.emit({
        isWai: result.stable > 0,
        level: result.stable,
        score: result.score,
        holdMs: Math.round(result.holdMs),
        reasons,
        facePresent,
        ...(six ? { sixSeven: six } : {}),
      });
    }
  }
  timer = setTimeout(loop, FRAME_MS);
}

bridge.onControl(({ run, requiredLevel: level, devRecord: rec, stickerStyle: st, stickers, stickerPalette: pal, sixSeven }) => {
  stickerStyle = normalizeStyle(st);
  stickerPalette = pal && typeof pal === "object" ? pal : null; // sticker.js validates each colour, bad ones = default
  stickersOn = stickers !== false;
  if (!stickersOn) {
    if (gifPending) finishGif(); // ไหว้ผ่านแล้วคิวว่าง stickers=false มาพร้อม run=false: ส่งเท่าที่มีก่อนล้าง
    gifBuf = [];
  }
  if (typeof level === "number") requiredLevel = Math.max(1, Math.min(3, level));
  devRecord = Boolean(rec);
  if (typeof sixSeven === "boolean" && sixSeven !== sixSevenOn) {
    sixSevenOn = sixSeven;
    sixSevenDone = false;
    sixSevenTracker.reset();
  }
  wantRun = Boolean(run);
  if (wantRun) start();
  else if (!starting) stop();
});

bridge.onWai?.(({ seq, id } = {}) => {
  if (!Number.isInteger(seq) || typeof id !== "string") return;
  waiIds.set(seq, id);
  if (waiIds.size > 16) waiIds.delete(waiIds.keys().next().value); // never grows if no sticker is taken
});

log("worker ready");
bridge.ready();
