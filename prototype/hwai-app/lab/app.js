// MediaPipe Lab: camera, wai detection, gate control, and agent monitor.
// Talks to the hwAI test server on the same origin (/state, /mode, /wai, /agents, /events, /settings).

import { DEFAULT_TH, WaiTracker, levelName } from "./vision.js";

const VISION_VERSION = "1.1.0";
const BUNDLE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}/vision_bundle.mjs`;
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}/wasm`;
const MODELS = "https://storage.googleapis.com/mediapipe-models";
const POLL_MS = 500;

const $ = (id) => document.getElementById(id);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const log = (message, kind = "info") => {
  const line = el(
    "div",
    `log-line ${kind}`,
    `${new Date().toLocaleTimeString("th-TH")}  ${message}`,
  );
  $("log").prepend(line);
  while ($("log").childElementCount > 80) $("log").lastElementChild.remove();
};

const api = async (method, path, body) => {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
};

// ---------- settings ----------

const th = { ...DEFAULT_TH };
const tracker = new WaiTracker(th);

function bindSettings() {
  const inputs = document.querySelectorAll("[data-th]");
  for (const input of inputs) {
    const key = input.dataset.th;
    input.value = th[key];
    input.nextElementSibling.textContent = Number(th[key]).toFixed(
      input.step.includes(".") ? 2 : 0,
    );
    input.addEventListener("input", () => {
      th[key] = Number(input.value);
      input.nextElementSibling.textContent = Number(th[key]).toFixed(
        input.step.includes(".") ? 2 : 0,
      );
      Object.assign(tracker.th, th);
    });
  }
  $("push-score").addEventListener("click", async () => {
    const res = await api("POST", "/settings", {
      passMinScore: th.passMinScore,
    });
    log(`ส่งเกณฑ์คะแนนผ่าน ${res.passMinScore} ไปที่ server แล้ว`);
  });
  $("reset-th").addEventListener("click", () => {
    Object.assign(th, DEFAULT_TH);
    for (const input of inputs) input.value = th[input.dataset.th];
    for (const input of inputs) input.dispatchEvent(new Event("input"));
    log("ค่า threshold กลับเป็นค่าเริ่มต้น");
  });
}

// ---------- gate ----------

let gateState = {
  mode: "demo",
  credits: 0,
  queued: [],
  passMinScore: DEFAULT_TH.passMinScore,
};

function renderGate() {
  const real = gateState.mode === "real";
  $("mode-real").classList.toggle("active", real);
  $("mode-demo").classList.toggle("active", !real);
  $("mode-text").textContent = real
    ? "โหมดจริง: เอเจนต์จะรันได้ก็ต่อเมื่อไหว้ผ่าน หนึ่งครั้งต่อหนึ่งเอเจนต์ ที่เหลือจะรอในคิว"
    : "โหมดสาธิต: เอเจนต์ทุกตัวรันทันที ไม่มีการเช็คการไหว้ ใช้ดูว่าแต่ละตัวทำอะไรบ้าง";
  $("credits").textContent = gateState.credits;
  $("queued").textContent = gateState.queued.length;
  $("pass-min").textContent = gateState.passMinScore;
}

async function pollState() {
  try {
    gateState = await api("GET", "/state");
    renderGate();
  } catch {
    $("mode-text").textContent = "เซิร์ฟเวอร์ไม่ตอบ: รัน server.py ก่อน";
  }
}

async function setMode(mode) {
  const res = await api("POST", "/mode", { mode });
  gateState = { ...gateState, ...res };
  renderGate();
  log(`เปลี่ยนเป็น${mode === "real" ? "โหมดจริง" : "โหมดสาธิต"}`, "ok");
}

async function sendPass(score) {
  const res = await api("POST", "/wai", { passed: true, score });
  if (res.passed) log(`ไหว้ผ่าน (คะแนน ${score}) ปลดเอเจนต์ได้ 1 ตัว`, "ok");
  else log(`ไหว้ไม่ถึงเกณฑ์ (คะแนน ${score} < ${res.passMinScore})`, "warn");
  await pollState();
}

// ---------- agents ----------

let lastAgents = [];

function renderAgents(agents) {
  lastAgents = agents;
  const list = $("agents");
  list.replaceChildren();
  if (!agents.length) {
    list.append(el("li", "empty", "ยังไม่มีเอเจนต์"));
    return;
  }
  for (const a of agents) {
    const row = el("li", `agent ${a.kind} ${a.state}`);
    row.append(
      el("span", "badge", a.kind === "main" ? "หลัก" : "sub"),
      el("span", "model", a.model),
      el("span", "label", a.label || ""),
      el(
        "span",
        "state",
        a.state === "queued"
          ? "รอไหว้"
          : a.state === "running"
            ? "ทำงาน"
            : "เสร็จ",
      ),
    );
    list.append(row);
  }
}

async function pollAgents() {
  try {
    const res = await api("GET", "/agents");
    renderAgents(res.agents);
  } catch {
    /* the gate poll already reports server problems */
  }
}

const SESSION = [
  ["main", "main", "claude-opus-5-5", "ตอบผู้ใช้ · เพิ่มโหมดปรับ threshold"],
  ["s1", "sub", "claude-haiku-5-5", "Explore · หาไฟล์ใน vision/"],
  ["s2", "sub", "claude-sonnet-5-5", "general-purpose · แก้ recorder.html"],
  ["s3", "sub", "claude-haiku-5-5", "Explore · อ่าน CAPTURE_PLAN.md"],
];

let simRunning = false;

async function runSession() {
  if (simRunning) return;
  simRunning = true;
  $("sim").disabled = true;
  log("เริ่มจำลองเซสชัน: 1 เอเจนต์หลัก + 3 sub-agent");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const post = (ev) => api("POST", "/events", ev);
  await post({ type: "reset" });
  await post({
    type: "start",
    id: "main",
    kind: "main",
    model: SESSION[0][2],
    label: SESSION[0][3],
  });
  await sleep(800);
  for (const [id, kind, model, label] of SESSION.slice(1)) {
    await post({ type: "start", id, parent_id: "main", kind, model, label });
    await sleep(700);
  }
  await sleep(2500);
  await post({ type: "stop", id: "s1" });
  await sleep(1500);
  await post({ type: "stop", id: "s3" });
  await sleep(2500);
  await post({ type: "stop", id: "s2" });
  await sleep(1000);
  await post({ type: "stop", id: "main" });
  log("จำลองเซสชันเสร็จแล้ว");
  simRunning = false;
  $("sim").disabled = false;
}

// ---------- camera and MediaPipe ----------

const video = $("video");
const canvas = $("overlay");
const ctx = canvas.getContext("2d");
let landmarkers = null;
let drawUtils = null;
let mp = null;
let lastTs = performance.now();
let fps = 0;

async function startCamera() {
  $("cam-start").disabled = true;
  log("กำลังโหลดโมเดล MediaPipe (ครั้งแรกอาจใช้เวลาสักครู่)");
  const vision = await import(BUNDLE);
  mp = vision;
  const {
    FilesetResolver,
    PoseLandmarker,
    FaceLandmarker,
    HandLandmarker,
    DrawingUtils,
  } = vision;
  const fileset = await FilesetResolver.forVisionTasks(WASM);
  const base = { delegate: "GPU" };
  const opts = (path) => ({
    baseOptions: { modelAssetPath: `${MODELS}/${path}`, ...base },
    runningMode: "VIDEO",
  });
  const [pose, face, hands] = await Promise.all([
    PoseLandmarker.createFromOptions(fileset, {
      ...opts(
        "pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task",
      ),
      numPoses: 1,
    }),
    FaceLandmarker.createFromOptions(fileset, {
      ...opts(
        "face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
      ),
      numFaces: 1,
      outputFacialTransformationMatrixes: true,
    }),
    HandLandmarker.createFromOptions(fileset, {
      ...opts(
        "hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
      ),
      numHands: 2,
      minHandDetectionConfidence: 0.3,
      minHandPresenceConfidence: 0.3,
      minTrackingConfidence: 0.3,
    }),
  ]);
  landmarkers = { pose, face, hands };
  drawUtils = new DrawingUtils(ctx);
  video.srcObject = await navigator.mediaDevices.getUserMedia({
    video: { width: 1280, height: 720 },
    audio: false,
  });
  await video.play();
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  $("cam-stop").disabled = false;
  $("calib").disabled = false;
  log("กล้องพร้อมแล้ว กด C ตอนยืนตรงเพื่อตั้งศูนย์", "ok");
  requestAnimationFrame(frame);
}

function stopCamera() {
  landmarkers = null;
  video.srcObject?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  $("cam-start").disabled = false;
  $("cam-stop").disabled = true;
  $("calib").disabled = true;
  showReadout(null);
  log("ปิดกล้องแล้ว");
}

function drawSkeleton(p, h) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const lm of p.landmarks) {
    drawUtils.drawConnectors(lm, mp.PoseLandmarker.POSE_CONNECTIONS, {
      color: "#ffffff88",
      lineWidth: 2,
    });
    drawUtils.drawLandmarks(lm, { color: "#fff", radius: 2 });
  }
  for (const lm of h.landmarks) {
    drawUtils.drawConnectors(lm, mp.HandLandmarker.HAND_CONNECTIONS, {
      color: "#3cf",
      lineWidth: 2,
    });
    drawUtils.drawLandmarks(lm, { color: "#3cf", radius: 2 });
  }
}

function showReadout(result) {
  const stable = result ? result.stable : 0;
  $("level").textContent = result ? `${stable} · ${levelName(stable)}` : "-";
  $("score").textContent = result ? result.score : "-";
  $("hold").textContent = result
    ? `${(result.holdMs / 1000).toFixed(1)} s`
    : "-";
  $("raw").textContent = result ? result.raw : "-";
  $("reason").textContent = result
    ? (result.reason ?? "")
    : "เปิดกล้องเพื่อเริ่ม";
  $("fps").textContent = fps ? fps.toFixed(0) : "-";
  const pass = $("pass");
  pass.textContent =
    result && result.stable > 0 && result.holdMs >= th.holdMs
      ? "ค้างท่า"
      : "ยังไม่ผ่าน";
  pass.className = `pill ${pass.textContent === "ค้างท่า" ? "ok" : ""}`;
}

function frame(ts) {
  if (!landmarkers) return;
  const dt = ts - lastTs;
  lastTs = ts;
  fps = dt > 0 ? fps * 0.9 + (1000 / dt) * 0.1 : fps;
  if (video.readyState >= 2) {
    const detections = {
      pose: landmarkers.pose.detectForVideo(video, ts),
      face: landmarkers.face.detectForVideo(video, ts),
      hands: landmarkers.hands.detectForVideo(video, ts),
    };
    const result = tracker.update(detections, canvas.width, canvas.height, dt);
    drawSkeleton(detections.pose, detections.hands);
    showReadout(result);
    if (result.passed) sendPass(result.score);
  }
  requestAnimationFrame(frame);
}

// ---------- wiring ----------

function bindControls() {
  $("mode-real").addEventListener("click", () => setMode("real"));
  $("mode-demo").addEventListener("click", () => setMode("demo"));
  $("cam-start").addEventListener("click", () =>
    startCamera().catch((err) =>
      log(`เปิดกล้องไม่ได้: ${err.message}`, "warn"),
    ),
  );
  $("cam-stop").addEventListener("click", stopCamera);
  $("calib").addEventListener("click", () => {
    tracker.calibrate();
    log("ตั้งศูนย์ท่าตรงแล้ว");
  });
  $("fake-pass").addEventListener("click", () => sendPass(90));
  $("sim").addEventListener("click", runSession);
  $("clear").addEventListener("click", async () => {
    await api("POST", "/events", { type: "reset" });
    log("ล้างเอเจนต์ทั้งหมดแล้ว");
  });
}

bindSettings();
bindControls();
renderGate();
renderAgents([]);
showReadout(null);
pollState();
pollAgents();
setInterval(pollState, POLL_MS);
setInterval(pollAgents, POLL_MS);
log("พร้อมแล้ว เลือกโหมดแล้วเปิดกล้อง");
