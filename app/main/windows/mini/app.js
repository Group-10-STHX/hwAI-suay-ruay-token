// hwAI mini window: Jason, a small camera, the wai level, the gate, and the agent list.
// Talks to the daemon on the same origin (/state, /mode, /wai, /events, /settings, /prefs).

import { DEFAULT_TH, WaiTracker, levelName } from "/lab/vision.js";

const VISION_VERSION = "1.1.0";
const BUNDLE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}/vision_bundle.mjs`;
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}/wasm`;
const MODELS = "https://storage.googleapis.com/mediapipe-models";
const POLL_MS = 500;
const RING_LEN = 100.53; // 2 * PI * r, r = 16 in the ring SVG
const PASS_SHOW_MS = 2500;

// Keep in sync with ACCENTS in prefs.js.
const ACCENTS = { peach: "#ff8a65", mint: "#34b894", lilac: "#9b87f5", sky: "#4aa3ff", lemon: "#e8b520" };

const MODEL_NAMES = {
  "claude-opus-5-5": "Opus 5.5",
  "claude-sonnet-5-5": "Sonnet 5.5",
  "claude-haiku-5-5": "Haiku 5.5",
  "claude-fable-5-1": "Fable 5.1",
};

const $ = (id) => document.getElementById(id);

const api = async (method, path, body) => {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
};

const tracker = new WaiTracker(DEFAULT_TH);
let prefs = null;
let gate = { mode: "real", credits: 0, queued: [], pendingRequests: 0, passMinScore: 70, agents: [] };
let last = null; // latest detection result
let passedUntil = 0; // show the happy Jason until this time
let fails = 0; // wai attempts in a row that did not pass
let inAttempt = false;
let attemptPassed = false;

const waiting = () => gate.queued.length + gate.pendingRequests;

// ---------- window height ----------

function reportHeight() {
  const h = Math.ceil(document.getElementById("app").getBoundingClientRect().height);
  window.hwaiWin?.setHeight(h);
}
new ResizeObserver(reportHeight).observe(document.getElementById("app"));

// ---------- prefs ----------

function applyPrefs(next) {
  prefs = next;
  const root = document.documentElement;
  if (next.theme === "auto") delete root.dataset.theme;
  else root.dataset.theme = next.theme;
  root.style.setProperty("--accent", ACCENTS[next.accent] ?? ACCENTS.peach);
  tracker.th.holdMs = next.holdMs;
  $("cam-card").hidden = !next.showCamera;

  for (const group of document.querySelectorAll(".seg-group[data-pref]")) {
    for (const b of group.querySelectorAll("button")) {
      b.classList.toggle("active", b.dataset.value === next[group.dataset.pref]);
    }
  }
  for (const input of document.querySelectorAll("input.switch[data-pref]")) {
    input.checked = Boolean(next[input.dataset.pref]);
  }
  for (const b of $("swatches").querySelectorAll("button")) {
    b.classList.toggle("active", b.dataset.value === next.accent);
  }
  $("hold-input").value = next.holdMs;
  $("hold-out").textContent = `${(next.holdMs / 1000).toFixed(1)} วิ`;
}

async function savePrefs(patch) {
  try {
    applyPrefs(await api("POST", "/prefs", patch));
  } catch {
    /* the daemon is gone; the next poll shows it */
  }
}

function bindSettings() {
  for (const [key, color] of Object.entries(ACCENTS)) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.value = key;
    b.title = key;
    b.style.background = color;
    b.addEventListener("click", () => savePrefs({ accent: key }));
    $("swatches").append(b);
  }
  for (const group of document.querySelectorAll(".seg-group[data-pref]")) {
    group.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-value]");
      if (b) savePrefs({ [group.dataset.pref]: b.dataset.value });
    });
  }
  for (const input of document.querySelectorAll("input.switch[data-pref]")) {
    input.addEventListener("change", () => savePrefs({ [input.dataset.pref]: input.checked }));
  }
  $("hold-input").addEventListener("input", (e) => {
    $("hold-out").textContent = `${(Number(e.target.value) / 1000).toFixed(1)} วิ`;
  });
  $("hold-input").addEventListener("change", (e) => savePrefs({ holdMs: Number(e.target.value) }));
  $("pass-min-input").addEventListener("input", (e) => {
    $("pass-min-out").textContent = e.target.value;
  });
  $("pass-min-input").addEventListener("change", async (e) => {
    gate = { ...gate, ...(await api("POST", "/settings", { passMinScore: Number(e.target.value) })) };
    renderGate();
  });
  $("open-settings").addEventListener("click", () => showView("settings"));
  $("close-settings").addEventListener("click", () => showView("home"));
  $("sim").addEventListener("click", runSession);
  $("fake-pass").addEventListener("click", () => sendPass(90));
}

function showView(name) {
  $("home").hidden = name !== "home";
  $("settings").hidden = name !== "settings";
}

// ---------- gate ----------

async function poll() {
  try {
    gate = await api("GET", "/state");
    renderGate();
  } catch {
    setMood("neutral", "ติดต่อ hwAI ไม่ได้");
  }
}

function renderGate() {
  const real = gate.mode === "real";
  $("mode-real").classList.toggle("active", real);
  $("mode-demo").classList.toggle("active", !real);
  $("credits").textContent = gate.credits;
  $("queued").textContent = waiting();
  $("pass-min").textContent = gate.passMinScore;
  tracker.th.passMinScore = gate.passMinScore;
  if (document.activeElement !== $("pass-min-input")) {
    $("pass-min-input").value = gate.passMinScore;
    $("pass-min-out").textContent = gate.passMinScore;
  }
  renderAgents(gate.agents ?? []);
  renderMood();
}

async function setMode(mode) {
  gate = { ...gate, ...(await api("POST", "/mode", { mode })) };
  renderGate();
}

async function sendPass(score) {
  const res = await api("POST", "/wai", { passed: true, score });
  gate = { ...gate, ...res };
  renderGate();
}

function renderAgents(agents) {
  const list = $("agents");
  list.replaceChildren();
  if (!agents.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "ยังไม่มีเอเจนต์";
    list.append(li);
    return;
  }
  for (const a of agents.slice(-8)) {
    const li = document.createElement("li");
    li.className = `agent ${a.kind} ${a.state}`;
    const parts = [
      ["dot", ""],
      ["name", MODEL_NAMES[a.model] ?? a.model],
      ["label", a.label || ""],
      ["state", a.state === "queued" ? "รอไหว้" : a.state === "running" ? "ทำงาน" : "เสร็จ"],
    ];
    for (const [cls, text] of parts) {
      const span = document.createElement("span");
      span.className = cls;
      span.textContent = text;
      li.append(span);
    }
    list.append(li);
  }
}

// ---------- Jason's mood ----------

let mood = "";

function setMood(next, say) {
  if (next !== mood) {
    mood = next;
    $("mascot").src = `/assets/jason/line/jason-line-${next}.svg`;
  }
  if ($("say").textContent !== say) $("say").textContent = say;
}

function renderMood() {
  const n = waiting();
  if (performance.now() < passedUntil) return setMood("passed", "รับไหว้แล้ว เชิญทำงานต่อ ✨");
  if (gate.mode === "demo") return setMood("neutral", "โหมดสาธิต ปล่อยผ่านหมดเลย");
  if (n === 0) return setMood("neutral", "วันนี้มาไหว้กันนะ");
  if (!camera.on) return setMood("demanding", "ไหว้กูซะก่อนนะ · เปิดกล้องก่อน");
  if (last && last.stable > 0) {
    if (last.holdMs >= tracker.th.holdMs && last.score < tracker.th.passMinScore) {
      return setMood("retry", `ไหว้ใหม่ ยังไม่สวย (${last.score})`);
    }
    return setMood("watching", "ค้างไว้อีกนิด…");
  }
  if (fails >= 3) return setMood("annoyed", "ไหว้ให้สวยกว่านี้หน่อยนะ");
  setMood("demanding", n > 1 ? `ไหว้กูซะก่อนนะ (รอ ${n})` : "ไหว้กูซะก่อนนะ");
}

function celebrate() {
  passedUntil = performance.now() + PASS_SHOW_MS;
  const ring = $("mascot-ring");
  ring.classList.remove("pop");
  void ring.offsetWidth; // restart the animation
  ring.classList.add("pop");
  renderMood();
}

// ---------- camera ----------

const video = $("video");
const canvas = $("overlay");
const ctx = canvas.getContext("2d");
const camera = { on: false, starting: false, byWai: false, cancel: false };
let mp = null;
let landmarkers = null;
let drawUtils = null;
let lastTs = 0;

async function loadModels() {
  if (landmarkers) return;
  mp = await import(BUNDLE);
  const fileset = await mp.FilesetResolver.forVisionTasks(WASM);
  const opts = (path) => ({
    baseOptions: { modelAssetPath: `${MODELS}/${path}`, delegate: "GPU" },
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
  landmarkers = { pose, face, hands };
  drawUtils = new mp.DrawingUtils(ctx);
}

async function startCamera({ byWai = false } = {}) {
  if (camera.on || camera.starting) return;
  camera.starting = true;
  camera.byWai = byWai;
  camera.cancel = false;
  $("cam-start").disabled = true;
  $("hint").textContent = "กำลังโหลดโมเดล… ครั้งแรกอาจนานหน่อย";
  try {
    await loadModels();
    video.srcObject = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 360 },
      audio: false,
    });
    await video.play();
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    camera.on = true;
    if (camera.cancel) {
      // The wai was no longer needed while the camera was still starting.
      camera.cancel = false;
      stopCamera();
      return;
    }
    $("cam-off").hidden = true;
    $("level-chip").hidden = false;
    $("ring").hidden = false;
    $("calib").disabled = false;
    $("cam-stop").disabled = false;
    $("hint").textContent = "พนมมือให้ชิดกันแล้วค้างไว้นะ";
    lastTs = performance.now();
    requestAnimationFrame(frame);
  } catch (err) {
    $("hint").textContent =
      err.name === "NotAllowedError"
        ? "ยังไม่ได้สิทธิ์กล้อง: System Settings > Privacy & Security > Camera"
        : `เปิดกล้องไม่ได้: ${err.message}`;
    $("cam-start").disabled = false;
  } finally {
    camera.starting = false;
    camera.cancel = false;
    renderMood();
  }
}

function stopCamera({ onlyIfByWai = false } = {}) {
  if (camera.starting && (!onlyIfByWai || camera.byWai)) camera.cancel = true;
  if (!camera.on) return;
  if (onlyIfByWai && !camera.byWai) return;
  video.srcObject?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
  camera.on = false;
  camera.byWai = false;
  last = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  $("cam-off").hidden = false;
  $("cam-start").disabled = false;
  $("level-chip").hidden = true;
  $("ring").hidden = true;
  $("calib").disabled = true;
  $("cam-stop").disabled = true;
  renderMeter(null);
  renderMood();
}

// The desktop app calls these when work starts or stops waiting for a wai.
window.hwaiStartCamera = startCamera;
window.hwaiStopCamera = stopCamera;

function accent() {
  return getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#ff8a65";
}

function draw(det) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const color = accent();
  for (const lm of det.pose.landmarks) {
    drawUtils.drawConnectors(lm, mp.PoseLandmarker.POSE_CONNECTIONS, { color: "#ffffff66", lineWidth: 2 });
  }
  for (const lm of det.hands.landmarks) {
    drawUtils.drawConnectors(lm, mp.HandLandmarker.HAND_CONNECTIONS, { color, lineWidth: 3 });
    drawUtils.drawLandmarks(lm, { color: "#fff", radius: 2 });
  }
}

function renderMeter(r) {
  const stable = r ? r.stable : 0;
  for (const span of $("levels").children) {
    const lv = Number(span.dataset.level);
    span.classList.toggle("now", Boolean(r) && lv === stable);
    span.classList.toggle("reached", Boolean(r) && lv > 0 && lv < stable);
  }
  $("level-chip").textContent = r ? `ระดับ ${stable} · ${levelName(stable)}` : "-";
  const score = r ? r.score : 0;
  $("score").textContent = score;
  $("ring-fg").style.strokeDashoffset = String(RING_LEN * (1 - score / 100));
  const fill = r ? Math.min(1, r.holdMs / tracker.th.holdMs) : 0;
  $("hold-bar").style.width = `${fill * 100}%`;
  $("hold-bar").classList.toggle("full", fill >= 1);
  if (!r) return;
  $("hint").textContent = r.reason
    ? "ถอยออกมาให้เห็นไหล่และมือทั้งสองข้างนะ"
    : stable === 0
      ? "พนมมือให้ชิดกันแล้วยกขึ้นนะ"
      : fill < 1
        ? `ค้างไว้… ${(r.holdMs / 1000).toFixed(1)} / ${(tracker.th.holdMs / 1000).toFixed(1)} วิ`
        : r.score >= tracker.th.passMinScore
          ? "สวยมาก!"
          : `ยังไม่ถึงเกณฑ์ (${r.score}/${tracker.th.passMinScore}) จัดมือให้ตรงกลางและเสมอกันนะ`;
}

function frame(ts) {
  if (!camera.on) return;
  const dt = ts - lastTs;
  lastTs = ts;
  if (video.readyState >= 2 && dt > 0) {
    const det = {
      pose: landmarkers.pose.detectForVideo(video, ts),
      face: landmarkers.face.detectForVideo(video, ts),
      hands: landmarkers.hands.detectForVideo(video, ts),
    };
    const r = tracker.update(det, canvas.width, canvas.height, dt);
    last = r;
    draw(det);
    renderMeter(r);
    trackAttempt(r);
    renderMood();
  }
  requestAnimationFrame(frame);
}

// One attempt = from a stable wai until the hands drop. A pass only counts while work is waiting,
// so nobody can stock up passes ahead of time.
function trackAttempt(r) {
  if (r.stable > 0) inAttempt = true;
  if (r.passed) {
    attemptPassed = true;
    fails = 0;
    celebrate();
    if (gate.mode === "real" && waiting() > 0) sendPass(r.score);
  }
  if (r.stable === 0 && inAttempt) {
    if (!attemptPassed) fails += 1;
    inAttempt = false;
    attemptPassed = false;
  }
}

// ---------- test session ----------

let simRunning = false;

async function runSession() {
  if (simRunning) return;
  simRunning = true;
  $("sim").disabled = true;
  showView("home");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const post = (ev) => api("POST", "/events", ev);
  try {
    await post({ type: "reset" });
    await post({ type: "start", id: "main", kind: "main", model: "claude-opus-5-5", label: "ตอบผู้ใช้" });
    await sleep(700);
    const subs = [
      ["s1", "claude-haiku-5-5", "Explore · หาไฟล์"],
      ["s2", "claude-sonnet-5-5", "general-purpose · แก้โค้ด"],
    ];
    for (const [id, model, label] of subs) {
      await post({ type: "start", id, parent_id: "main", kind: "sub", model, label });
      await sleep(600);
    }
    await sleep(4000);
    for (const id of ["s1", "s2", "main"]) {
      await post({ type: "stop", id });
      await sleep(900);
    }
  } finally {
    simRunning = false;
    $("sim").disabled = false;
  }
}

// ---------- start ----------

$("mode-real").addEventListener("click", () => setMode("real"));
$("mode-demo").addEventListener("click", () => setMode("demo"));
$("cam-start").addEventListener("click", () => startCamera());
$("cam-stop").addEventListener("click", () => stopCamera());
$("calib").addEventListener("click", () => tracker.calibrate());
addEventListener("keydown", (e) => {
  if ((e.key === "c" || e.key === "C") && camera.on) tracker.calibrate();
});

bindSettings();
renderMeter(null);
api("GET", "/prefs")
  .then(applyPrefs)
  .catch(() => {});
poll();
setInterval(poll, POLL_MS);

if (new URLSearchParams(location.search).get("auto") === "1") startCamera({ byWai: true });
if (location.hash === "#settings") showView("settings");
