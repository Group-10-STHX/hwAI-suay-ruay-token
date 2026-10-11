// Voice backoffice daemon module: lists every phrase, stores friends' recordings, plays them in the app.
// Mounted by main.mjs:  const admin = createVoiceAdmin({ home, linesFile, adminDir, play, now, log })
//                       if (await admin.handle(req, res, url)) return
// Routes (all on the existing 127.0.0.1 daemon):
//   GET  /admin/voice[/]               -> adminDir/index.html     GET /admin/voice/<asset> -> whitelisted static file
//   GET  /wai/voice/lines              -> { entries(+status), people, progress, personas }
//   GET  /wai/voice/recording?id=      -> audio/wav
//   POST /wai/voice/recording?id=      -> raw audio/wav body, stores recordings/<persona|_app>/<id>.wav
//   DELETE /wai/voice/recording?id=    -> removes that entry's wav (and its alias copies) only
//   POST /wai/voice/play?id=           -> play(filePath) through the app's audio path
// Security: every non-GET request must carry `X-Wai-Admin: 1`. Browsers refuse to let a foreign web page add a custom
// header without a CORS preflight, and this module never allows that header in CORS (no ACAO at all), so only the
// same-origin admin page can write. A Host check (127.0.0.1/localhost/[::1]) also blunts DNS-rebinding.
import { readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync, statSync, readSync, openSync, closeSync, createReadStream } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

export const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
export const MAX_BYTES = 4 * 1024 * 1024;
export const MAX_DURATION_MS = 20_000;
export const STATIC_FILES = Object.freeze({
  'index.html': 'text/html; charset=utf-8',
  'admin.js': 'text/javascript; charset=utf-8',
  'admin.css': 'text/css; charset=utf-8',
  'characters.json': 'application/json; charset=utf-8',
});
const APP_DIR = '_app';
const SAFE_DIR = /^[a-z0-9_-]+$/;

/** Parse + validate a WAV buffer: RIFF/WAVE, PCM 16-bit mono 8-48 kHz, <=4 MB, <=20 s. */
export function validateWav(buf) {
  const bad = (code, error) => ({ ok: false, code, error });
  if (!Buffer.isBuffer(buf) || buf.length < 44) return bad('too_small', 'not a WAV file');
  if (buf.length > MAX_BYTES) return bad('too_big', 'file too large');
  if (buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WAVE') return bad('bad_header', 'missing RIFF/WAVE header');
  let fmt = null;
  let data = null;
  for (let p = 12; p + 8 <= buf.length;) {
    const tag = buf.toString('latin1', p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    const body = p + 8;
    if (tag === 'fmt ') {
      if (size < 16 || body + 16 > buf.length) return bad('bad_fmt', 'bad fmt chunk');
      fmt = { format: buf.readUInt16LE(body), channels: buf.readUInt16LE(body + 2), rate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    } else if (tag === 'data') {
      data = { size: Math.min(size, buf.length - body) };
      break;
    }
    p = body + size + (size & 1);
  }
  if (!fmt) return bad('no_fmt', 'missing fmt chunk');
  if (fmt.format !== 1) return bad('not_pcm', 'only PCM WAV is accepted');
  if (fmt.bits !== 16) return bad('not_16bit', 'only 16-bit WAV is accepted');
  if (fmt.channels !== 1) return bad('not_mono', 'only mono WAV is accepted');
  if (fmt.rate < 8000 || fmt.rate > 48000) return bad('bad_rate', 'sample rate must be 8000..48000');
  if (!data || data.size < 2) return bad('no_data', 'missing audio data');
  const durationMs = Math.round((data.size / (fmt.rate * 2)) * 1000);
  if (durationMs > MAX_DURATION_MS) return bad('too_long', 'recording longer than 20 s');
  return { ok: true, sampleRate: fmt.rate, durationMs };
}

function readJson(file, fallback) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; }
}

export function createVoiceAdmin({ home, linesFile, adminDir, play = null, now = Date.now, log = () => {}, getMode = null, setMode = null } = {}) {
  if (!home || !linesFile) throw new Error('createVoiceAdmin: home and linesFile are required');
  const recRoot = join(home, 'voice', 'recordings');

  const loadEntries = () => {
    const raw = readJson(linesFile, {});
    const list = Array.isArray(raw) ? raw : raw.entries || [];
    return list.filter((e) => e && ID_RE.test(e.id || '') && typeof e.plainText === 'string'
      && (e.persona === undefined || SAFE_DIR.test(e.persona)));
  };
  const loadPersonas = () => {
    const p = readJson(join(dirname(linesFile), 'personas.json'), { personas: [] }).personas || [];
    return p.filter((x) => x && SAFE_DIR.test(x.id || '')).map((x) => ({ id: x.id, name: x.name || x.id }));
  };

  const fileFor = (e) => join(recRoot, e.persona || APP_DIR, `${e.id}.wav`);
  /** entry + every entry that shares its recording (aliases get a copy of the file) */
  const groupOf = (entries, e) => {
    const canonId = e.dupOf || e.id;
    return entries.filter((x) => x.id === canonId || x.dupOf === canonId);
  };

  function statusOf(e) {
    const file = fileFor(e);
    try {
      const st = statSync(file);
      if (!st.isFile()) throw new Error('not file');
      let durationMs = null;
      try {
        const fd = openSync(file, 'r');
        const head = Buffer.alloc(44);
        const n = readSync(fd, head, 0, 44, 0);
        closeSync(fd);
        const rate = n >= 44 ? head.readUInt32LE(24) : 0; // canonical 44-byte header written by the admin page
        if (rate >= 8000 && rate <= 48000) durationMs = Math.round((Math.max(0, st.size - 44) / (rate * 2)) * 1000);
      } catch { /* leave null */ }
      return { recorded: true, bytes: st.size, at: new Date(st.mtimeMs).toISOString(), durationMs };
    } catch {
      return { recorded: false, bytes: 0, at: null, durationMs: null };
    }
  }

  function snapshot() {
    const entries = loadEntries().map((e) => ({ ...e, status: statusOf(e) }));
    const people = { 1: { total: 0, recorded: 0 }, 2: { total: 0, recorded: 0 }, 3: { total: 0, recorded: 0 }, 4: { total: 0, recorded: 0 } };
    const progress = { total: 0, recorded: 0 };
    for (const e of entries) {
      if (e.dupOf) continue; // aliases are not extra work
      progress.total++;
      if (e.status.recorded) progress.recorded++;
      const p = people[e.recorder];
      if (p) { p.total++; if (e.status.recorded) p.recorded++; }
    }
    return { entries, people, progress, personas: loadPersonas(), serverTime: now() };
  }

  // ---- http helpers (no CORS headers on purpose) ----
  const json = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(body));
  };
  const hostOk = (req) => {
    const h = String(req.headers?.host || '');
    if (!h) return true;
    const name = h.startsWith('[') ? h.slice(0, h.indexOf(']') + 1) : h.split(':')[0];
    return name === '127.0.0.1' || name === 'localhost' || name === '[::1]';
  };
  const readBody = (req, max) => new Promise((resolve, reject) => {
    const declared = Number(req.headers?.['content-length']);
    if (declared > max) return reject(Object.assign(new Error('too big'), { code: 'too_big' }));
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > max) { chunks.length = 0; reject(Object.assign(new Error('too big'), { code: 'too_big' })); req.removeAllListeners('data'); req.resume(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

  const atomicWrite = (file, buf) => {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    try {
      writeFileSync(tmp, buf);
      renameSync(tmp, file);
    } catch (e) {
      try { unlinkSync(tmp); } catch { /* ignore */ }
      throw e;
    }
  };

  const lookup = (url) => {
    const id = url.searchParams.get('id') || '';
    if (!ID_RE.test(id)) return { error: [400, { error: 'bad id', code: 'bad_id' }] };
    const entries = loadEntries();
    const entry = entries.find((e) => e.id === id); // exact match only
    if (!entry) return { error: [404, { error: 'unknown id', code: 'unknown_id' }] };
    return { entries, entry };
  };

  async function handle(req, res, url) {
    if (typeof url === 'string') url = new URL(url, 'http://127.0.0.1');
    const path = url.pathname;
    const method = String(req.method || 'GET').toUpperCase();
    const isStatic = path === '/admin/voice' || path.startsWith('/admin/voice/');
    const isApi = path.startsWith('/wai/voice/') && ['/wai/voice/lines', '/wai/voice/recording', '/wai/voice/play', '/wai/voice/mode'].includes(path);
    if (!isStatic && !isApi) return false;

    if (!hostOk(req)) { json(res, 403, { error: 'bad host', code: 'bad_host' }); return true; }
    if (method === 'OPTIONS') {
      // same-origin page needs no CORS; answer so probes do not hang, without allowing X-Wai-Admin cross-origin
      res.writeHead(204, { Allow: 'GET, POST, DELETE, OPTIONS' });
      res.end();
      return true;
    }

    if (isStatic) {
      if (method !== 'GET' && method !== 'HEAD') { json(res, 405, { error: 'method not allowed' }); return true; }
      let name;
      if (path === '/admin/voice' || path === '/admin/voice/' || /^\/admin\/voice\/c\/[A-Za-z0-9_-]{1,40}\/?$/.test(path)) name = 'index.html'; // หน้าแยกตามตัวละคร
      else name = path.slice('/admin/voice/'.length);
      if (!Object.hasOwn(STATIC_FILES, name) || !adminDir) { json(res, 404, { error: 'not found' }); return true; }
      try {
        const body = readFileSync(join(adminDir, name));
        res.writeHead(200, { 'Content-Type': STATIC_FILES[name], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        res.end(method === 'HEAD' ? undefined : body);
      } catch {
        json(res, 404, { error: 'not found' });
      }
      return true;
    }

    // writes need the custom header
    if (method !== 'GET' && method !== 'HEAD' && req.headers?.['x-wai-admin'] !== '1') {
      json(res, 403, { error: 'missing X-Wai-Admin header', code: 'forbidden' });
      return true;
    }

    try {
      if (path === '/wai/voice/lines' && method === 'GET') { json(res, 200, snapshot()); return true; }

      // โหมดเสียงทั้งแอป: 'human' (เสียงคนจริงที่อัดไว้) | 'siri' (เสียงระบบ) · อ่านได้พร้อมจำนวนที่อัดแล้ว
      if (path === '/wai/voice/mode') {
        if (typeof getMode !== 'function') { json(res, 501, { error: 'mode not available', code: 'no_mode' }); return true; }
        if (method === 'POST') {
          let body = {};
          try { body = JSON.parse((await readBody(req, 1024)).toString('utf8') || '{}'); } catch { /* ว่างเปล่า = อ่านอย่างเดียว */ }
          if (body.mode !== 'siri' && body.mode !== 'human') { json(res, 400, { error: 'mode must be siri|human', code: 'bad_mode' }); return true; }
          if (typeof setMode === 'function') setMode(body.mode);
          log(`voice-admin: mode -> ${getMode()}`);
        } else if (method !== 'GET') { json(res, 405, { error: 'method not allowed' }); return true; }
        const entries = loadEntries().filter((e) => !e.dupOf);
        const recorded = entries.filter((e) => statusOf(e).recorded).length;
        json(res, 200, { mode: getMode(), recorded, total: entries.length });
        return true;
      }

      if (path === '/wai/voice/recording') {
        const found = lookup(url);
        if (found.error) { json(res, ...found.error); return true; }
        const { entries, entry } = found;
        if (method === 'GET') {
          const file = fileFor(entry);
          if (!statusOf(entry).recorded) { json(res, 404, { error: 'not recorded', code: 'not_recorded' }); return true; }
          const size = statSync(file).size;
          res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
          createReadStream(file).pipe(res);
          return true;
        }
        if (method === 'POST') {
          let body;
          try { body = await readBody(req, MAX_BYTES); } catch (e) {
            json(res, 413, { error: 'file too large', code: 'too_big' });
            return true;
          }
          const v = validateWav(body);
          if (!v.ok) { json(res, v.code === 'too_big' ? 413 : 400, { error: v.error, code: v.code }); return true; }
          for (const e of groupOf(entries, entry)) atomicWrite(fileFor(e), body);
          log(`voice-admin: recorded ${entry.id} (${body.length} bytes, ${v.durationMs} ms)`);
          json(res, 200, { ok: true, id: entry.id, status: statusOf(entry), durationMs: v.durationMs });
          return true;
        }
        if (method === 'DELETE') {
          let removed = 0;
          for (const e of groupOf(entries, entry)) {
            try { unlinkSync(fileFor(e)); removed++; } catch { /* already absent */ }
          }
          log(`voice-admin: deleted ${entry.id} (${removed} file)`);
          json(res, 200, { ok: true, id: entry.id, removed, status: statusOf(entry) });
          return true;
        }
        json(res, 405, { error: 'method not allowed' });
        return true;
      }

      if (path === '/wai/voice/play' && method === 'POST') {
        const found = lookup(url);
        if (found.error) { json(res, ...found.error); return true; }
        if (!statusOf(found.entry).recorded) { json(res, 404, { error: 'not recorded', code: 'not_recorded' }); return true; }
        if (typeof play !== 'function') { json(res, 501, { error: 'playback not available', code: 'no_player' }); return true; }
        await play(fileFor(found.entry));
        json(res, 200, { ok: true, id: found.entry.id });
        return true;
      }

      json(res, 405, { error: 'method not allowed' });
      return true;
    } catch (e) {
      log(`voice-admin: error ${e?.code || e?.message || 'unknown'}`);
      json(res, 500, { error: 'internal error', code: 'internal' });
      return true;
    }
  }

  return { handle, snapshot, validateWav, pathFor: (id) => { const e = loadEntries().find((x) => x.id === id); return e ? fileFor(e) : null; } };
}
