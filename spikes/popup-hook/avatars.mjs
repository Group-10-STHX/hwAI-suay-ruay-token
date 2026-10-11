// avatars: local character packs at <home>/avatars/<name>/<mood>.png + current choice in <home>/config.json ("avatar").
// Built-in "jason" is drawn by the renderer (SVG), so it has no files here.
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { createReadStream } from 'node:fs';
import { join, sep, extname } from 'node:path';

export const MOODS = ['angry', 'sad', 'confused', 'forgive', 'default'];
export const BUILTIN = 'jason';
export const NAME_RE = /^[a-z0-9_-]{1,40}$/;
export const MAX_BYTES = 3 * 1024 * 1024;
const EXTS = ['.png', '.webp', '.jpg', '.jpeg', '.gif'];
const TYPES = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif' };
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function contentTypeFor(file) {
  return TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

export function createAvatars({ home, logger = console } = {}) {
  if (!home) throw new Error('home required');
  const dir = join(home, 'avatars');
  const configPath = join(home, 'config.json');

  const realDir = () => {
    try {
      return realpathSync(dir);
    } catch {
      return null;
    }
  };

  // Safe file check: regular file, realpath stays inside the avatars dir, allowed extension, size cap.
  function safeFile(path, root) {
    try {
      if (!EXTS.includes(extname(path).toLowerCase())) return false;
      const real = realpathSync(path);
      if (!real.startsWith(root + sep)) return false;
      const st = statSync(real);
      return st.isFile() && st.size > 0 && st.size <= MAX_BYTES;
    } catch {
      return false;
    }
  }

  // name must be a real directory directly under avatars (no symlink escape)
  function avatarDir(name, root) {
    if (typeof name !== 'string' || !NAME_RE.test(name) || name === BUILTIN || !root) return null;
    const p = join(dir, name);
    try {
      if (lstatSync(p).isSymbolicLink() && !realpathSync(p).startsWith(root + sep)) return null;
      const real = realpathSync(p);
      if (!real.startsWith(root + sep) || !statSync(real).isDirectory()) return null;
      return real;
    } catch {
      return null;
    }
  }

  function fileForMood(name, mood, root) {
    const d = avatarDir(name, root);
    if (!d) return null;
    for (const ext of EXTS) {
      const f = join(d, mood + ext);
      if (existsSync(f) && safeFile(f, root)) return f;
    }
    return null;
  }

  function moodsFor(name) {
    if (name === BUILTIN) return [];
    const root = realDir();
    if (!root) return [];
    return MOODS.filter((m) => fileForMood(name, m, root));
  }

  function list() {
    const items = [{ name: BUILTIN, label: BUILTIN, kind: 'builtin', moods: [] }];
    const root = realDir();
    if (!root) return items;
    let names = [];
    try {
      names = readdirSync(dir).sort();
    } catch {}
    for (const name of names) {
      if (!NAME_RE.test(name) || name === BUILTIN) continue;
      const moods = moodsFor(name);
      if (moods.length) items.push({ name, label: name, kind: 'user', moods });
    }
    return items;
  }

  function readConfig() {
    if (!existsSync(configPath)) return { ok: true, cfg: {} };
    try {
      const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
      if (cfg && typeof cfg === 'object' && !Array.isArray(cfg)) return { ok: true, cfg };
    } catch {}
    return { ok: false, cfg: {} };
  }

  function current() {
    const { ok, cfg } = readConfig();
    const name = ok ? cfg.avatar : undefined;
    if (typeof name === 'string' && list().some((i) => i.name === name)) return name;
    return BUILTIN;
  }

  function setCurrent(name) {
    if (!list().some((i) => i.name === name)) return false;
    const { ok, cfg } = readConfig();
    if (!ok) {
      logger.warn?.('[avatars] config.json unreadable, not overwriting');
      return false;
    }
    mkdirSync(home, { recursive: true });
    const tmp = `${configPath}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ ...cfg, avatar: name }, null, 2));
    renameSync(tmp, configPath);
    return true;
  }

  // mood fallback: requested -> default -> confused -> any available
  function resolveFile(name, mood) {
    const root = realDir();
    if (!root || !avatarDir(name, root)) return null;
    const order = [];
    if (MOODS.includes(mood)) order.push(mood);
    for (const m of ['default', 'confused', ...MOODS]) if (!order.includes(m)) order.push(m);
    for (const m of order) {
      const f = fileForMood(name, m, root);
      if (f) return f;
    }
    return null;
  }

  const api = { list, current, setCurrent, resolveFile, moodsFor };
  api.routes = (req, res) => handleAvatarRoute(req, res, { avatars: api });
  return api;
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS });
  res.end(JSON.stringify(body));
}

function readBody(req, limit = 4096) {
  return new Promise((ok) => {
    let raw = '';
    let over = false;
    req.on('data', (c) => {
      raw += c;
      if (raw.length > limit) over = true;
    });
    req.on('end', () => {
      if (over) return ok(null);
      try {
        ok(JSON.parse(raw || '{}'));
      } catch {
        ok(null);
      }
    });
    req.on('error', () => ok(null));
  });
}

const FILE_RE = /^\/wai\/avatar\/([^/]+)\/([^/]+)\.(png|webp|jpg|jpeg|gif)$/i;

// Returns true if the request was handled (async work may still be in flight).
export function handleAvatarRoute(req, res, ctx) {
  const avatars = ctx.avatars;
  let path;
  try {
    path = new URL(req.url, 'http://localhost').pathname;
  } catch {
    return false;
  }
  const isList = path === '/wai/avatars';
  const isSet = path === '/wai/avatar';
  const file = FILE_RE.exec(path);
  if (!isList && !isSet && !file && !path.startsWith('/wai/avatar/')) return false;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return true;
  }

  if (isList && req.method === 'GET') {
    sendJson(res, 200, { current: avatars.current(), items: avatars.list() });
    return true;
  }

  if (isSet && req.method === 'POST') {
    readBody(req).then((body) => {
      const name = body?.name;
      if (typeof name !== 'string' || !NAME_RE.test(name)) return sendJson(res, 400, { error: 'bad name' });
      if (!avatars.list().some((i) => i.name === name)) return sendJson(res, 404, { error: 'unknown avatar' });
      if (!avatars.setCurrent(name)) return sendJson(res, 400, { error: 'cannot save avatar' });
      sendJson(res, 200, { current: avatars.current() });
    });
    return true;
  }

  if (file && req.method === 'GET') {
    const [, name, mood] = file;
    if (!NAME_RE.test(name) || !MOODS.includes(mood.toLowerCase())) {
      sendJson(res, 400, { error: 'bad name or mood' });
      return true;
    }
    const f = avatars.resolveFile(name, mood.toLowerCase());
    if (!f) {
      sendJson(res, 404, { error: 'not found' });
      return true;
    }
    res.writeHead(200, { 'Content-Type': contentTypeFor(f), 'Cache-Control': 'no-store', ...CORS });
    const stream = createReadStream(f);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
    return true;
  }

  sendJson(res, 404, { error: 'not found' });
  return true;
}
