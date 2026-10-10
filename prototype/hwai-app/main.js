"use strict";

// hwAI desktop app (Electron main process).
//
//   daemon   wai gate on 127.0.0.1:7777 (daemon.js + gate.js)
//   mini     the small main window: Jason, camera, level, gate, agents, settings
//   popup    Jason floating over the desktop, one per agent
//   lab      the full MediaPipe Lab (opened on demand)
//   chat     claude.ai / chatgpt.com windows whose send is held until a wai passes
//   tray     menu bar item: mode, windows, quit

const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  dialog,
  ipcMain,
  nativeImage,
  nativeTheme,
  screen,
  session,
  shell,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { Gate } = require("./gate");
const { createDaemon, DEFAULT_PORT, HOST } = require("./daemon");
const { ACCENTS, DEFAULT_PREFS, sanitizePrefs } = require("./prefs");

const BASE_URL = `http://${HOST}:${DEFAULT_PORT}`;
const LOGOS_PATH = path.join(__dirname, "..", "..", "characters", "jason", "logos.json");
const PUSH_MS = 400;
const MARGIN = 16;

const POPUP_WIDTH = 360;
const POPUP_MIN_H = 120;
const POPUP_MAX_H = 640;

const MINI_WIDTH = 340;
const MINI_MIN_H = 260;
const MINI_MAX_H = 760;

const userFile = (name) => path.join(app.getPath("userData"), name);

// ---------- prefs ----------

let prefs = { ...DEFAULT_PREFS };

function loadPrefs() {
  try {
    prefs = sanitizePrefs(JSON.parse(fs.readFileSync(userFile("prefs.json"), "utf8")));
  } catch {
    prefs = { ...DEFAULT_PREFS };
  }
}

function setPrefs(patch) {
  prefs = sanitizePrefs(patch, prefs);
  try {
    fs.writeFileSync(userFile("prefs.json"), JSON.stringify(prefs, null, 2));
  } catch {
    /* keep the in-memory prefs even if the file cannot be written */
  }
  applyPrefs();
  return prefs;
}

function applyPrefs() {
  nativeTheme.themeSource = prefs.theme === "auto" ? "system" : prefs.theme;
  if (miniWin && !miniWin.isDestroyed()) miniWin.setAlwaysOnTop(prefs.alwaysOnTop, "floating");
  pushPopup();
}

// ---------- gate and daemon ----------

const gate = new Gate({
  mode: process.env.WAI_BYPASS === "1" || process.env.HWAI_MODE === "demo" ? "demo" : "real",
});

const daemon = createDaemon({
  gate,
  labDir: path.join(__dirname, "lab"),
  miniDir: path.join(__dirname, "mini"),
  logosPath: LOGOS_PATH,
  prefs: { get: () => prefs, set: setPrefs },
  port: DEFAULT_PORT,
});

let miniWin = null;
let labWin = null;
let popupWin = null;
let tray = null;
let pushTimer = null;

// ---------- window positions ----------

function readPos(name) {
  try {
    return JSON.parse(fs.readFileSync(userFile(name), "utf8"));
  } catch {
    return null;
  }
}

function rememberPos(win, name) {
  let timer = null;
  win.on("moved", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (win.isDestroyed()) return;
      const [x, y] = win.getPosition();
      try {
        fs.writeFileSync(userFile(name), JSON.stringify({ x, y }));
      } catch {
        /* losing a saved spot is harmless */
      }
    }, 250);
  });
}

function onScreen(p) {
  return screen.getAllDisplays().some(({ workArea: wa }) => {
    return p.x >= wa.x && p.x < wa.x + wa.width && p.y >= wa.y && p.y < wa.y + wa.height;
  });
}

function placeOr(name, fallback) {
  const saved = readPos(name);
  return saved && onScreen(saved) ? saved : fallback();
}

// ---------- mini window ----------

function createMini({ auto = false } = {}) {
  const wa = screen.getPrimaryDisplay().workArea;
  const pos = placeOr("mini-position.json", () => ({
    x: wa.x + wa.width - MINI_WIDTH - MARGIN,
    y: wa.y + wa.height - 560 - MARGIN,
  }));
  miniWin = new BrowserWindow({
    width: MINI_WIDTH,
    height: 520,
    x: pos.x,
    y: pos.y,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: "hwAI",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 14, y: 14 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#1f1a17" : "#fdf6ee",
    alwaysOnTop: prefs.alwaysOnTop,
    webPreferences: {
      preload: path.join(__dirname, "mini", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (prefs.alwaysOnTop) miniWin.setAlwaysOnTop(true, "floating");
  miniWin.loadURL(`${BASE_URL}/mini/${auto ? "?auto=1" : ""}`);
  rememberPos(miniWin, "mini-position.json");
  forwardConsole(miniWin, "mini");

  // Links inside the mini window: the lab opens as an app window, anything else in the browser.
  miniWin.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`${BASE_URL}/lab/`)) {
      openLab();
    } else if (/^https?:\/\//.test(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  miniWin.on("closed", () => {
    miniWin = null;
    if (waiOpen) waiDismissed = true;
    waiOpen = false;
  });
}

function showMini() {
  if (!miniWin) createMini();
  miniWin.show();
  miniWin.focus();
}

ipcMain.on("mini:height", (event, h) => {
  if (!miniWin || miniWin.isDestroyed() || event.sender !== miniWin.webContents) return;
  const height = Math.round(Math.min(MINI_MAX_H, Math.max(MINI_MIN_H, Number(h) || MINI_MIN_H)));
  const [w, cur] = miniWin.getContentSize();
  if (cur === height) return;
  miniWin.setContentSize(w, height, false);
  // Keep the whole window on screen when it grows (it starts near the bottom-right corner).
  const b = miniWin.getBounds();
  const wa = screen.getDisplayMatching(b).workArea;
  const y = Math.max(wa.y, Math.min(b.y, wa.y + wa.height - b.height - MARGIN));
  if (y !== b.y) miniWin.setPosition(b.x, y, false);
});

// ---------- lab window ----------

function openLab() {
  if (labWin && !labWin.isDestroyed()) {
    labWin.show();
    labWin.focus();
    return;
  }
  labWin = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 720,
    minHeight: 560,
    title: "hwAI · MediaPipe Lab",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  labWin.loadURL(`${BASE_URL}/lab/`);
  forwardConsole(labWin, "lab");
  labWin.on("closed", () => {
    labWin = null;
  });
}

// ---------- the wai window: open the camera while work is waiting ----------

let waiOpen = false; // the mini window is showing because work is waiting
let waiDismissed = false; // the user closed it; wait until the demand clears
let waiHideAfter = false; // it was hidden before, so hide it again afterwards

function openForWai() {
  waiOpen = true;
  if (!miniWin) {
    waiHideAfter = true;
    createMini({ auto: true });
    return;
  }
  waiHideAfter = !miniWin.isVisible();
  miniWin.showInactive();
  miniWin.webContents.executeJavaScript("window.hwaiStartCamera?.({ byWai: true })").catch(() => {});
}

function closeForWai() {
  waiOpen = false;
  if (!miniWin || miniWin.isDestroyed()) return;
  miniWin.webContents.executeJavaScript("window.hwaiStopCamera?.({ onlyIfByWai: true })").catch(() => {});
  if (waiHideAfter) miniWin.hide();
}

function syncWaiWindow(snap) {
  const needWai = snap.mode === "real" && (snap.pendingRequests > 0 || snap.queued.length > 0);
  if (!needWai) {
    waiDismissed = false;
    if (waiOpen) closeForWai();
    return;
  }
  if (!waiOpen && !waiDismissed) openForWai();
}

// ---------- popup ----------

function createPopup() {
  const wa = screen.getPrimaryDisplay().workArea;
  const pos = placeOr("popup-position.json", () => ({
    x: wa.x + wa.width - POPUP_WIDTH - MARGIN,
    y: wa.y + MARGIN,
  }));
  popupWin = new BrowserWindow({
    width: POPUP_WIDTH,
    height: 200,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "popup", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  popupWin.setAlwaysOnTop(true, "floating");
  popupWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  popupWin.loadFile(path.join(__dirname, "popup", "index.html"));
  rememberPos(popupWin, "popup-position.json");
  popupWin.on("closed", () => {
    popupWin = null;
  });
}

function togglePopup() {
  if (popupWin) popupWin.close();
  else createPopup();
  rebuildMenu();
}

let logosCache = null;
function logos() {
  if (logosCache) return logosCache;
  try {
    logosCache = JSON.parse(fs.readFileSync(LOGOS_PATH, "utf8"));
  } catch {
    logosCache = null;
  }
  return logosCache;
}

function pushPopup() {
  if (!popupWin || popupWin.isDestroyed()) return;
  const snap = gate.snapshot();
  popupWin.webContents.send("popup:data", {
    ok: true,
    agents: snap.agents,
    pending: snap.pendingRequests,
    mode: snap.mode,
    logos: logos(),
    prefs: { ...prefs, accentColor: ACCENTS[prefs.accent] },
  });
}

ipcMain.on("popup:height", (event, h) => {
  if (!popupWin || popupWin.isDestroyed() || event.sender !== popupWin.webContents) return;
  const height = Math.round(Math.min(POPUP_MAX_H, Math.max(POPUP_MIN_H, Number(h) || POPUP_MIN_H)));
  const [w, cur] = popupWin.getContentSize();
  if (cur !== height) popupWin.setContentSize(w, height);
});

ipcMain.on("popup:quit", () => togglePopup());

// ---------- chat windows ----------

const CHAT_SITES = { claude: "https://claude.ai/", chatgpt: "https://chatgpt.com/" };
const chatWins = new Map();

// Same engine as this Electron build, minus the "Electron" token, so the sites' sign-in works.
const chatUserAgent = () =>
  `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;

function openChat(key) {
  const existing = chatWins.get(key);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return;
  }
  const win = new BrowserWindow({
    width: 1100,
    height: 820,
    title: `hwAI · ${key === "claude" ? "Claude" : "ChatGPT"}`,
    webPreferences: {
      preload: path.join(__dirname, "chat", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setUserAgent(chatUserAgent());
  win.loadURL(CHAT_SITES[key]);
  win.on("closed", () => chatWins.delete(key));
  chatWins.set(key, win);
}

// The chat preload asks here before it replays a send. Resolves 'allow' only after a passed wai.
ipcMain.handle("gate:wait", async (_event, label) => {
  const req = gate.request({ kind: "prompt", session_id: "chat", label });
  for (let i = 0; i < 6; i++) {
    if ((await gate.waitFor(req.id, 55000)) === "allow") return "allow";
  }
  return "timeout";
});

// ---------- menu bar ----------

function setMode(mode) {
  gate.setMode(mode);
  rebuildMenu();
}

function rebuildMenu() {
  if (!tray) return;
  const real = gate.mode === "real";
  tray.setTitle(real ? "🙏" : "▶︎");
  tray.setToolTip(`hwAI · ${real ? "โหมดจริง" : "โหมดสาธิต"}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "เปิด hwAI mini", click: showMini },
      { label: "เปิดหน้าละเอียด (Lab)", click: openLab },
      { type: "separator" },
      { label: "เปิดแชต Claude (ผ่านด่านไหว้)", click: () => openChat("claude") },
      { label: "เปิดแชต ChatGPT (ผ่านด่านไหว้)", click: () => openChat("chatgpt") },
      { type: "separator" },
      { label: "โหมดจริง (ต้องไหว้ก่อนทำงาน)", type: "radio", checked: real, click: () => setMode("real") },
      { label: "โหมดสาธิต (รันทุกอย่างทันที)", type: "radio", checked: !real, click: () => setMode("demo") },
      { type: "separator" },
      { label: popupWin ? "ซ่อนป๊อปอัพ" : "แสดงป๊อปอัพ", click: togglePopup },
      { type: "separator" },
      { label: "ออก", role: "quit" },
    ]),
  );
}

// ---------- helpers ----------

function forwardConsole(win, tag) {
  win.webContents.on("console-message", (_e, level, message) => {
    if (level >= 2) console.log(`[${tag}] ${message}`); // warnings and errors only
  });
}

function startPush() {
  let lastMode = gate.mode;
  pushTimer = setInterval(() => {
    if (gate.mode !== lastMode) {
      lastMode = gate.mode;
      rebuildMenu();
    }
    syncWaiWindow(gate.snapshot());
    pushPopup();
  }, PUSH_MS);
}

// ---------- lifecycle ----------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showMini);

  app.whenReady().then(async () => {
    loadPrefs();
    nativeTheme.themeSource = prefs.theme === "auto" ? "system" : prefs.theme;

    // Only camera access is ever granted (the mini window and the lab use it).
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === "media");
    });

    try {
      await daemon.listen();
    } catch (err) {
      const message =
        err.code === "EADDRINUSE"
          ? `พอร์ต ${DEFAULT_PORT} ถูกใช้อยู่ ปิดโปรแกรมที่ใช้พอร์ตนี้ก่อน แล้วเปิด hwAI ใหม่`
          : `เปิด daemon ไม่ได้: ${err.message}`;
      dialog.showErrorBox("hwAI", message);
      app.quit();
      return;
    }

    tray = new Tray(nativeImage.createEmpty());
    tray.on("click", showMini);
    rebuildMenu();
    createMini();
    createPopup();
    startPush();
  });

  app.on("window-all-closed", () => {
    // Keep running in the menu bar. Quit from the menu.
  });

  app.on("activate", showMini);

  app.on("before-quit", async () => {
    clearInterval(pushTimer);
    await daemon.close().catch(() => {});
  });
}
