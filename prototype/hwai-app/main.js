"use strict";

// hwAI desktop app (Electron main process).
//
// One program that does three things:
//   1. runs the wai gate daemon on 127.0.0.1:7777 (daemon.js + gate.js)
//   2. shows the MediaPipe Lab control panel as a native window (served by the daemon)
//   3. shows the floating popup over the desktop (the agent overlay)
// plus a menu bar item to switch real/demo mode and show or hide the popup.

const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  dialog,
  ipcMain,
  nativeImage,
  screen,
  session,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { Gate } = require("./gate");
const { createDaemon, DEFAULT_PORT, HOST } = require("./daemon");

const POPUP_WIDTH = 360;
const POPUP_MIN_H = 120;
const POPUP_MAX_H = 620;
const POPUP_MARGIN = 16;
const PUSH_MS = 400;
const LOGOS_PATH = path.join(
  __dirname,
  "..",
  "..",
  "characters",
  "jason",
  "logos.json",
);
const LAB_DIR = path.join(__dirname, "lab");
const POS_FILE = () =>
  path.join(app.getPath("userData"), "popup-position.json");

const gate = new Gate({
  mode:
    process.env.WAI_BYPASS === "1" || process.env.HWAI_MODE === "demo"
      ? "demo"
      : "real",
});
const daemon = createDaemon({
  gate,
  labDir: LAB_DIR,
  logosPath: LOGOS_PATH,
  port: DEFAULT_PORT,
});

let controlWin = null;
let popupWin = null;
let tray = null;
let pushTimer = null;
let saveTimer = null;

// ---------- popup position ----------

function readPos() {
  try {
    return JSON.parse(fs.readFileSync(POS_FILE(), "utf8"));
  } catch {
    return null;
  }
}

function writePos() {
  if (!popupWin) return;
  const [x, y] = popupWin.getPosition();
  try {
    fs.writeFileSync(POS_FILE(), JSON.stringify({ x, y }));
  } catch {
    /* losing the saved spot is harmless */
  }
}

function startPosition() {
  const saved = readPos();
  const onScreen = (p) =>
    screen.getAllDisplays().some((d) => {
      const wa = d.workArea;
      return (
        p.x >= wa.x &&
        p.x < wa.x + wa.width &&
        p.y >= wa.y &&
        p.y < wa.y + wa.height
      );
    });
  if (saved && onScreen(saved)) return saved;
  const wa = screen.getPrimaryDisplay().workArea;
  return {
    x: wa.x + wa.width - POPUP_WIDTH - POPUP_MARGIN,
    y: wa.y + POPUP_MARGIN,
  };
}

// ---------- windows ----------

function createControlWindow() {
  controlWin = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 720,
    minHeight: 560,
    title: "hwAI · MediaPipe Lab",
    backgroundColor: "#161411",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  controlWin.loadURL(`http://${HOST}:${DEFAULT_PORT}/lab/`);
  controlWin.on("closed", () => {
    controlWin = null;
  });
}

function createPopup() {
  const pos = startPosition();
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
  popupWin.on("moved", () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writePos, 250);
  });
  popupWin.on("closed", () => {
    popupWin = null;
  });
}

function setMode(mode) {
  gate.setMode(mode);
  rebuildMenu();
}

function togglePopup() {
  if (popupWin) popupWin.close();
  else createPopup();
  rebuildMenu();
}

function showControl() {
  if (!controlWin) createControlWindow();
  controlWin.show();
  controlWin.focus();
}

// ---------- menu bar ----------

function rebuildMenu() {
  if (!tray) return;
  const real = gate.mode === "real";
  tray.setTitle(real ? "🙏" : "▶︎");
  tray.setToolTip(`hwAI · ${real ? "โหมดจริง" : "โหมดสาธิต"}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "เปิดแผงควบคุม", click: showControl },
      { type: "separator" },
      {
        label: "โหมดจริง (ต้องไหว้ก่อนทำงาน)",
        type: "radio",
        checked: real,
        click: () => setMode("real"),
      },
      {
        label: "โหมดสาธิต (รันทุกอย่างทันที)",
        type: "radio",
        checked: !real,
        click: () => setMode("demo"),
      },
      { type: "separator" },
      { label: popupWin ? "ซ่อนป๊อปอัพ" : "แสดงป๊อปอัพ", click: togglePopup },
      { type: "separator" },
      { label: "ออก", role: "quit" },
    ]),
  );
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  rebuildMenu();
  tray.on("click", showControl);
}

// ---------- popup data push ----------

function popupPayload() {
  const snap = gate.snapshot();
  let logos = null;
  try {
    logos = JSON.parse(fs.readFileSync(LOGOS_PATH, "utf8"));
  } catch {
    logos = null;
  }
  return {
    ok: true,
    agents: snap.agents,
    pending: snap.pendingRequests,
    mode: snap.mode,
    logos,
  };
}

function startPush() {
  let lastMode = gate.mode;
  pushTimer = setInterval(() => {
    if (gate.mode !== lastMode) {
      lastMode = gate.mode;
      rebuildMenu();
    }
    if (popupWin && !popupWin.isDestroyed())
      popupWin.webContents.send("popup:data", popupPayload());
  }, PUSH_MS);
}

ipcMain.on("popup:height", (_event, h) => {
  if (!popupWin || popupWin.isDestroyed()) return;
  const height = Math.round(
    Math.min(POPUP_MAX_H, Math.max(POPUP_MIN_H, Number(h) || POPUP_MIN_H)),
  );
  const [w, cur] = popupWin.getContentSize();
  if (cur !== height) popupWin.setContentSize(w, height);
});

ipcMain.on("popup:quit", () => togglePopup());

// ---------- lifecycle ----------

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", showControl);

  app.whenReady().then(async () => {
    // Only the control panel asks for the camera. Everything else stays denied.
    session.defaultSession.setPermissionRequestHandler(
      (wc, permission, callback) => {
        callback(permission === "media");
      },
    );

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

    createTray();
    createControlWindow();
    createPopup();
    startPush();
  });

  app.on("window-all-closed", () => {
    // Keep running in the menu bar. Quit from the menu.
  });

  app.on("before-quit", async () => {
    clearInterval(pushTimer);
    await daemon.close().catch(() => {});
  });
}
