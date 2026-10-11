// Offline evaluator for the wai heuristic. Node only, no dependencies.
//
//   node vision/bench/replay-recording.mjs [recording.json] [--module path] [--per-run] [--dump LABEL] [--json out.json]
//
// The recording comes from vision/playground/recorder.html (schema 1):
//   {frames:[{t, label, variant, lm:{pose:[[x,y,vis] x23]|null, hands:[{side, pts:[[x,y] x21]}], face:[[x,y] x3]|null}}]}
// where face holds landmarks 1 (nose tip), 9 (between the brows), 10 (forehead). Video was 1280x720.
// Each frame is rebuilt into MediaPipe-like results and fed to WaiTracker.update in time order.
//
// --module   heuristic module to score (default ../wai-heuristic.js); point it at an old copy for A/B runs
// --per-run  start a fresh tracker at every recording gap (>1.5 s) instead of one continuous tracker
//            (the continuous tracker is fed the real gap as dt, so its hold drains as it would live)
// --hold MS  pass hold target (default 1000, what the worker uses)
// --dump N   print the frames with ground-truth label N that the stable level got wrong, with features
// --json F   also write the numbers to F

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const W = 1280;
const H = 720;
const GAP_MS = 1500; // a pause longer than this separates two recordings
const MAX_DT = 200; // dt fed to the tracker is capped (the recorder dropped frames while saving)

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const flag = (name) => args.includes(name);
const VALUE_OPTS = new Set(["--module", "--dump", "--json", "--hold"]);
let file = `${process.env.HOME}/Downloads/wai-1791623844678.json`;
for (let i = 0; i < args.length; i++) {
  if (VALUE_OPTS.has(args[i])) i += 1;
  else if (!args[i].startsWith("--")) file = args[i];
}
const modulePath = resolve(HERE, opt("--module", "../wai-heuristic.js"));
const perRun = flag("--per-run");
const dumpLabel = opt("--dump", null);
const jsonOut = opt("--json", null);

const { DEFAULT_TH, WaiTracker, reasonsFor } = await import(pathToFileURL(modulePath).href);

// ---- rebuild MediaPipe-like results from the compact landmark dump ----
const pt = ([x, y, vis]) => ({ x, y, z: 0, visibility: vis ?? 1 });

function rebuild(lm) {
  const pose = { landmarks: [], worldLandmarks: [] };
  if (lm.pose) {
    const pl = lm.pose.map(pt);
    while (pl.length < 33) pl.push({ x: 0.5, y: 2, z: 0, visibility: 0 }); // hips and legs: below frame
    pose.landmarks.push(pl);
  }
  const hands = { landmarks: [], worldLandmarks: [], handedness: [], handednesses: [] };
  for (const h of lm.hands ?? []) {
    hands.landmarks.push(h.pts.map(([x, y]) => ({ x, y, z: 0 })));
    const cat = [{ categoryName: h.side ?? "Left", displayName: h.side ?? "Left", score: 0.9, index: 0 }];
    hands.handedness.push(cat);
    hands.handednesses.push(cat);
  }
  const face = { faceLandmarks: [], faceBlendshapes: [], facialTransformationMatrixes: [] };
  if (lm.face) {
    const fl = new Array(478);
    const [nose, brow, forehead] = lm.face;
    fl[1] = { x: nose[0], y: nose[1], z: 0 };
    fl[9] = { x: brow[0], y: brow[1], z: 0 };
    fl[10] = { x: forehead[0], y: forehead[1], z: 0 };
    face.faceLandmarks.push(fl);
  }
  return { pose, face, hands };
}

// ---- replay ----
const data = JSON.parse(readFileSync(file, "utf8"));
const frames = data.frames;
const th = { ...DEFAULT_TH, holdMs: Number(opt("--hold", 1000)) }; // the worker uses holdMs 1000

const zeros = () => [0, 0, 0, 0];
const confRaw = [zeros(), zeros(), zeros(), zeros()];
const confStable = [zeros(), zeros(), zeros(), zeros()];
const variantFP = {}; // label 0 variants: frames with stable > 0
const runs = []; // {label, variant, n, passes:[level], passAt:[s], maxStable, framesStable}
const conf = [[], [], [], []]; // confidence on frames with stable > 0, per label
const dumped = [];

let tracker = new WaiTracker(th);
let run = null;
let prevT = null;
for (const fr of frames) {
  const gap = prevT == null ? Infinity : fr.t - prevT;
  const key = `${fr.label}:${fr.variant}`;
  if (gap > GAP_MS || !run || run.key !== key) {
    if (gap > GAP_MS && perRun) tracker = new WaiTracker(th);
    run = { key, label: fr.label, variant: fr.variant, n: 0, passes: [], passAt: [], maxStable: 0, stablePos: 0, maxHold: 0, t0: fr.t };
    runs.push(run);
  }
  // Dropped frames inside a recording are capped; a pause between recordings is fed as it was,
  // so a continuous tracker's hold and pass arming drain exactly as they would have live.
  const dt = prevT == null ? 33 : gap > GAP_MS ? gap : Math.min(MAX_DT, Math.max(1, gap));
  prevT = fr.t;

  const det = rebuild(fr.lm);
  const res = tracker.update(det, W, H, dt);
  const facePresent = det.face.faceLandmarks.length > 0;
  const posePresent = det.pose.landmarks.length > 0;
  const reasons = reasonsFor(res, { facePresent, posePresent }, tracker.th, Math.max(1, fr.label));

  confRaw[fr.label][res.raw] += 1;
  confStable[fr.label][res.stable] += 1;
  if (res.stable > 0 && typeof res.confidence === "number") conf[fr.label].push(res.confidence);
  run.n += 1;
  run.maxStable = Math.max(run.maxStable, res.stable);
  run.maxHold = Math.max(run.maxHold, res.holdMs);
  if (res.stable > 0) run.stablePos += 1;
  if (res.passed) {
    run.passes.push(res.stable);
    run.passAt.push(((fr.t - run.t0) / 1000).toFixed(1));
  }
  if (fr.label === 0) {
    variantFP[fr.variant] = variantFP[fr.variant] ?? { n: 0, fp: 0 };
    variantFP[fr.variant].n += 1;
    if (res.stable > 0) variantFP[fr.variant].fp += 1;
  }
  if (dumpLabel != null && fr.label === Number(dumpLabel) && res.stable !== fr.label) {
    dumped.push({ t: fr.t, raw: res.raw, stable: res.stable, reasons, F: res.features });
  }
}

// ---- report ----
const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1).padStart(5) + "%" : "    -");
function printConf(name, conf) {
  console.log(`\n${name}: rows = ground truth, cols = predicted`);
  console.log("      " + [0, 1, 2, 3].map((c) => String(c).padStart(5)).join("") + "   recall");
  for (let l = 0; l < 4; l++) {
    const n = conf[l].reduce((a, b) => a + b, 0);
    console.log(
      `  ${l}  ` + conf[l].map((v) => String(v).padStart(5)).join("") + `   ${pct(conf[l][l], n)}  (n=${n})`,
    );
  }
  const total = conf.flat().reduce((a, b) => a + b, 0);
  const correct = conf.reduce((s, row, i) => s + row[i], 0);
  const waiTrue = conf.slice(1).flat().reduce((a, b) => a + b, 0);
  const waiHit = conf.slice(1).reduce((s, row) => s + row.slice(1).reduce((a, b) => a + b, 0), 0);
  const fp = conf[0].slice(1).reduce((a, b) => a + b, 0);
  console.log(
    `  accuracy ${pct(correct, total)}   wai-vs-not recall ${pct(waiHit, waiTrue)}   false wai on label 0 ${pct(fp, conf[0].reduce((a, b) => a + b, 0))}`,
  );
  return { accuracy: correct / total, recall: conf.map((row, i) => row[i] / (row.reduce((a, b) => a + b, 0) || 1)), waiRecall: waiHit / waiTrue, fpRate: fp / conf[0].reduce((a, b) => a + b, 0) };
}

console.log(`recording: ${file}`);
console.log(`module: ${modulePath}${perRun ? "  (fresh tracker per run)" : "  (one continuous tracker)"}`);
console.log(`frames: ${frames.length}`);
const rawStats = printConf("RAW level (per frame)", confRaw);
const stableStats = printConf("STABLE level (after smoothing)", confStable);

console.log("\nlabel-0 variants: frames where stable > 0");
for (const [v, s] of Object.entries(variantFP)) console.log(`  ${v.padEnd(11)} ${String(s.fp).padStart(4)} / ${s.n}`);

const meanConf = conf.map((a) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : "-"));
console.log(`\nmean confidence on stable>0 frames, per label: 0=${meanConf[0]} 1=${meanConf[1]} 2=${meanConf[2]} 3=${meanConf[3]}`);

console.log("\nruns: ground truth -> max stable, share of frames with stable>0, longest hold, pass events (level @ seconds into the run)");
for (const r of runs) {
  const passes = r.passes.map((p, i) => `${p}@${r.passAt[i]}s`).join(",");
  console.log(
    `  ${r.key.padEnd(14)} n=${String(r.n).padStart(4)}  maxStable=${r.maxStable}  stable>0 ${pct(r.stablePos, r.n)}  maxHold=${String(Math.round(r.maxHold)).padStart(5)}ms  passes=[${passes}]`,
  );
}

if (dumped.length) {
  console.log(`\nmisclassified frames with label ${dumpLabel} (${dumped.length}):`);
  const show = (F) => {
    if (!F) return "F=null";
    const keys = ["source", "handsSeen", "together", "fingersUp", "center", "heightLevel", "tipRel", "thumbRel", "neck", "neckDrop", "sym", "gap", "tipNose", "thumbBrow"];
    return keys
      .filter((k) => F[k] !== undefined)
      .map((k) => `${k}=${typeof F[k] === "number" ? F[k].toFixed(2) : F[k]}`)
      .join(" ");
  };
  for (const d of dumped) console.log(`  t=${d.t} raw=${d.raw} stable=${d.stable} [${d.reasons.join(",")}] ${show(d.F)}`);
}

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ module: modulePath, perRun, confRaw, confStable, rawStats, stableStats, variantFP, runs }, null, 2));
  console.log(`\nwrote ${jsonOut}`);
}
