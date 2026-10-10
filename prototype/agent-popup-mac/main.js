// Floating agent popup for macOS (Electron main process).
// Polls the local popup server (prototype/agent-popup/server.py) and pushes the agent list
// to the renderer over IPC, so the renderer never has to call localhost itself (no CORS).
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const SERVER = process.env.HWAI_POPUP_SERVER || 'http://127.0.0.1:7777';
const POLL_MS = 400;
const WIDTH = 360;
const MIN_H = 120;
const MAX_H = 620;
const MARGIN = 16;

let win = null;
let logos = null;
let posFile = null;
let saveTimer = null;

function readPos() {
  try { return JSON.parse(fs.readFileSync(posFile, 'utf8')); } catch { return null; }
}

function writePos() {
  if (!win) return;
  const [x, y] = win.getPosition();
  try { fs.writeFileSync(posFile, JSON.stringify({ x, y })); } catch { /* keep running */ }
}

// Start at the top-right of the display the cursor is on, or the last place the user dragged it to.
function initialPosition(height) {
  const saved = readPos();
  const displays = screen.getAllDisplays();
  if (saved && displays.some((d) => saved.x >= d.workArea.x && saved.x < d.workArea.x + d.workArea.width &&
                                    saved.y >= d.workArea.y && saved.y < d.workArea.y + d.workArea.height)) {
    return saved;
  }
  const wa = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  return { x: wa.x + wa.width - WIDTH - MARGIN, y: wa.y + MARGIN, height };
}

function createWindow() {
  const start = initialPosition(200);
  win = new BrowserWindow({
    width: WIDTH,
    height: 200,
    x: start.x,
    y: start.y,
    frame: false,
    transparent: true,
    hasShadow: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, 'index.html'));

  win.on('moved', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writePos, 250);
  });
  win.on('closed', () => { win = null; });
}

async function loadLogos() {
  if (logos) return;
  try {
    logos = await (await fetch(`${SERVER}/logos.json`)).json();
  } catch {
    logos = null;
  }
}

async function poll() {
  if (!win) return;
  await loadLogos();
  let payload;
  try {
    const res = await fetch(`${SERVER}/agents`, { cache: 'no-store' });
    payload = { ok: true, agents: (await res.json()).agents, logos };
  } catch {
    payload = { ok: false, agents: [], logos };
  }
  win.webContents.send('popup:data', payload);
}

ipcMain.on('popup:height', (_event, h) => {
  if (!win) return;
  const height = Math.round(Math.min(MAX_H, Math.max(MIN_H, Number(h) || MIN_H)));
  const [w, cur] = win.getContentSize();
  if (cur !== height) win.setContentSize(w, height);
});

ipcMain.on('popup:quit', () => app.quit());

app.whenReady().then(() => {
  posFile = path.join(app.getPath('userData'), 'popup-position.json');
  createWindow();
  setInterval(poll, POLL_MS);
});

app.on('window-all-closed', () => app.quit());
