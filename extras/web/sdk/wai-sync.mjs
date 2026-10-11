// wai-sync — zero-dependency uploader for the WAI-NET web API (Node ≥ 18 / Electron main).
// The daemon calls record() when a wai attempt resolves; this module queues it in an on-disk
// outbox and uploads in the background. It never throws into the caller and never blocks.
//
//   import { createWaiSync } from '../../extras/web/sdk/wai-sync.mjs';
//   const sync = createWaiSync();            // reads ~/.wai/config.json
//   sync.record({ session_id, source, kind, passed, level, score, hold_ms, action, anger, forgave });
//
//   sync.recordSticker({ id, path });        // opt-in: web.upload_stickers === true; uploads AFTER the wai is accepted
//   await sync.setAvatar('/path/face.jpg');  // or setAvatar(null) to reset
//
// CLI (for testing):  node wai-sync.mjs register <handle> <display name> [--base URL]
//                     node wai-sync.mjs demo | flush | status | disable
//                     node wai-sync.mjs stickers on|off [--purge] | sticker <waiId> <file>
//                     node wai-sync.mjs avatar <file.png|jpg|webp> | avatar --reset | avatar --source generated|photo|sticker|auto
//                     node wai-sync.mjs backfill-stickers <dir>
// See docs/INTEGRATION.md.

import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export const DEFAULT_BASE_URL = 'http://localhost:3000/api/v1';
const MAX_OUTBOX = 5000;
const BATCH = 100;
export const MAX_STICKER_BYTES = 400 * 1024;
export const MAX_AVATAR_BYTES = 250 * 1024;
const MAX_STICKER_QUEUE = 500;
const MAX_STICKER_TRIES = 8;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AVATAR_SOURCES = ['auto', 'generated', 'photo', 'sticker'];

/** Mime type from magic bytes (png | jpeg | webp), or null. */
export function sniffImage(b) {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

const SOURCE_ALIASES = {
  claude_code: 'claude_code', 'claude-code': 'claude_code', hook: 'claude_code', claudecode: 'claude_code',
  codex: 'codex', shell: 'shell', wrapper: 'shell', claude: 'shell', gemini: 'shell', cli: 'shell',
  extension: 'extension', browser: 'extension', chatgpt: 'extension', 'claude.ai': 'extension', web: 'extension',
};

export function waiHome() {
  return process.env.WAI_HOME || join(homedir(), '.wai');
}

export function readConfig(home = waiHome()) {
  try {
    const all = JSON.parse(readFileSync(join(home, 'config.json'), 'utf8'));
    return { all, web: { enabled: false, base_url: DEFAULT_BASE_URL, handle: '', install_key: '', ...(all.web || {}) } };
  } catch {
    return { all: {}, web: { enabled: false, base_url: DEFAULT_BASE_URL, handle: '', install_key: '' } };
  }
}

export function writeWebConfig(patch, home = waiHome()) {
  const { all, web } = readConfig(home);
  mkdirSync(home, { recursive: true });
  const next = { ...all, web: { ...web, ...patch } };
  const tmp = join(home, 'config.json.tmp');
  writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  renameSync(tmp, join(home, 'config.json'));
  return next.web;
}

/** Opaque, stable session id: never upload a raw id that might contain a path or project name. */
export const hashSession = (id) => 's_' + createHash('sha256').update(String(id)).digest('hex').slice(0, 16);

/**
 * Map one resolved attempt to the exact POST /wais body. Only whitelisted fields survive —
 * agent_label, prompt text and anything else are dropped here, and the server rejects unknown fields anyway.
 */
export function toSubmission(a, now = new Date()) {
  const passed = !!a.passed;
  const level = Math.max(0, Math.min(3, Math.round(Number(a.level) || 0)));
  return {
    id: a.id || randomUUID(),
    session_id: hashSession(a.session_id ?? 'unknown'),
    source: SOURCE_ALIASES[String(a.source || '').toLowerCase()] || 'claude_code',
    kind: a.kind === 'subagent' ? 'subagent' : 'prompt',
    level,
    score: Math.max(0, Math.min(100, Math.round(Number(a.score) || 0))),
    hold_ms: Math.max(0, Math.min(60000, Math.round(Number(a.hold_ms ?? a.holdMs) || 0))),
    passed,
    action: passed ? 'allow' : (['retry', 'deny', 'rage_quit'].includes(a.action) ? a.action : 'retry'),
    forgave: !!a.forgave && passed && level === 3,
    anger: Math.max(0, Math.min(6, Math.round(Number(a.anger) || 0))),
    client_ts: (a.at ? new Date(a.at) : now).toISOString(),
  };
}

export function createWaiSync(opts = {}) {
  const home = opts.home || waiHome();
  const outbox = join(home, 'outbox.jsonl');
  const stickerBox = join(home, 'stickers-outbox.jsonl');
  const fetchImpl = opts.fetch || globalThis.fetch;
  const log = opts.logger || { warn: (...m) => console.warn('[wai-sync]', ...m) };
  const bypass = opts.bypass ?? process.env.WAI_BYPASS === '1';
  let timer = null, flushing = null, backoff = 1000, lastError = null, lastFlushAt = null, stopped = false;

  const config = () => (opts.config ? { web: { ...readConfig(home).web, ...opts.config } } : readConfig(home)).web;
  const enabled = () => { const c = config(); return !bypass && !!c.enabled && !!c.install_key; };
  /** Stickers need the explicit opt-in on top of `enabled`. */
  const stickersOn = () => enabled() && config().upload_stickers === true;
  const api = (path) => config().base_url.replace(/\/+$/, '') + path;
  const auth = () => ({ authorization: `Bearer ${config().install_key}` });

  function readOutbox() {
    if (!existsSync(outbox)) return [];
    return readFileSync(outbox, 'utf8').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
  }
  function writeOutbox(items) {
    mkdirSync(home, { recursive: true });
    const tmp = outbox + '.tmp';
    writeFileSync(tmp, items.map((i) => JSON.stringify(i)).join('\n') + (items.length ? '\n' : ''));
    renameSync(tmp, outbox);
  }

  function readJsonl(file) {
    if (!existsSync(file)) return [];
    return readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
  }
  function writeJsonl(file, items) {
    mkdirSync(home, { recursive: true });
    const tmp = file + '.tmp';
    writeFileSync(tmp, items.map((i) => JSON.stringify(i)).join('\n') + (items.length ? '\n' : ''));
    renameSync(tmp, file);
  }
  const readStickers = () => readJsonl(stickerBox);
  const writeStickers = (items) => writeJsonl(stickerBox, items);

  function schedule(ms) {
    if (stopped || timer) return;
    timer = setTimeout(() => { timer = null; flush().catch(() => {}); }, ms);
    timer.unref?.();
  }

  /** Queue one resolved attempt. Synchronous, never throws, no-op when disabled or bypassed. */
  function record(attempt) {
    try {
      if (!enabled()) return false;
      mkdirSync(home, { recursive: true });
      appendFileSync(outbox, JSON.stringify(toSubmission(attempt)) + '\n');
      schedule(250);
      return true;
    } catch (e) {
      log.warn('record failed', e?.message || e);
      return false;
    }
  }

  /** Queue a sticker PNG (by file path, never bytes) for the wai `id`. No-op unless web.upload_stickers === true. */
  function recordSticker({ id, path } = {}) {
    try {
      if (!stickersOn()) return false;
      if (typeof id !== 'string' || !UUID.test(id) || typeof path !== 'string' || !path) return false;
      const items = readStickers().filter((i) => i.id !== id.toLowerCase());
      items.push({ id: id.toLowerCase(), path: resolve(path), tries: 0 });
      writeStickers(items.slice(-MAX_STICKER_QUEUE));
      schedule(500);
      return true;
    } catch (e) {
      log.warn('recordSticker failed', e?.message || e);
      return false;
    }
  }

  /** Read a file as an upload body, or { skip } when it is gone / empty / too big. */
  function readImage(path, max) {
    try {
      const st = statSync(path);
      if (!st.isFile() || st.size < 1) return { skip: 'empty' };
      if (st.size > max) return { skip: `too large (${st.size} > ${max})` };
      return { bytes: readFileSync(path) };
    } catch {
      return { skip: 'missing' };
    }
  }

  async function putImage(method, path, bytes, mime) {
    return fetchImpl(api(path), {
      method, headers: { ...auth(), ...(mime ? { 'content-type': mime } : {}) }, body: bytes, signal: AbortSignal.timeout(15_000),
    });
  }

  /** Upload one sticker file now. Returns { ok, status, sticker_url?, error? } and never throws. */
  async function uploadSticker(id, path) {
    try {
      if (!enabled()) return { ok: false, status: 0, error: 'disabled' };
      const img = readImage(path, MAX_STICKER_BYTES);
      if (img.skip) return { ok: false, status: 0, error: img.skip };
      const res = await putImage('POST', `/wais/${String(id).toLowerCase()}/sticker`, img.bytes, 'image/png');
      const body = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, sticker_url: body.sticker_url, error: body?.error?.message };
    } catch (e) {
      return { ok: false, status: 0, error: `network: ${e?.message || e}` };
    }
  }

  /** Upload queued stickers whose wai is no longer waiting in the wai outbox. */
  async function flushStickers() {
    let items = readStickers();
    if (!items.length) return { sent: 0, kept: 0 };
    if (!stickersOn()) { writeStickers([]); return { sent: 0, kept: 0 }; } // opted out: forget the queue
    const pendingWais = new Set(readOutbox().map((w) => w.id));
    const keep = [];
    let sent = 0, stop = false;
    for (const it of items) {
      if (stop || pendingWais.has(it.id)) { keep.push(it); continue; } // wai must be accepted first
      const img = readImage(it.path, MAX_STICKER_BYTES);
      if (img.skip) { if (img.skip !== 'missing') log.warn('sticker skipped', it.id, img.skip); continue; }
      const r = await uploadSticker(it.id, it.path);
      if (r.ok) { sent++; continue; }
      if (r.status === 404) { // wai not on the server (yet): bounded retries
        if (it.tries + 1 < MAX_STICKER_TRIES) keep.push({ ...it, tries: it.tries + 1 });
        continue;
      }
      if (r.status === 0 || r.status === 401 || r.status === 429 || r.status >= 500) { lastError = `sticker: ${r.status || r.error}`; keep.push(it); stop = true; continue; }
      log.warn('dropping sticker', it.id, r.status, r.error); // 400/413/415: will never succeed
    }
    writeStickers(keep);
    return { sent, kept: keep.length };
  }

  async function flushOnce() {
    const c = config();
    if (!enabled()) return { sent: 0, kept: readOutbox().length, stickers_sent: 0, stickers_kept: readStickers().length };
    let items = readOutbox();
    if (items.length > MAX_OUTBOX) items = items.slice(-MAX_OUTBOX);
    let sent = 0;
    while (items.length) {
      const batch = items.slice(0, BATCH);
      let res;
      try {
        res = await fetchImpl(c.base_url.replace(/\/+$/, '') + '/wais/batch', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${c.install_key}` },
          body: JSON.stringify({ items: batch }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch (e) {
        lastError = `network: ${e?.message || e}`;
        break; // keep everything, retry later
      }
      if (res.status === 401) { lastError = '401 unauthorized — re-register (install key unknown to this server)'; break; }
      if (res.status === 429 || res.status >= 500) { lastError = `HTTP ${res.status}`; break; }
      if (!res.ok) { // 4xx on the whole batch: drop it, it will never succeed
        lastError = `HTTP ${res.status} ${await res.text().catch(() => '')}`.slice(0, 300);
        log.warn('dropping batch', lastError);
        items = items.slice(batch.length);
        continue;
      }
      const { results = [] } = await res.json();
      for (const r of results) if (r.status === 400 || r.status === 409) log.warn('rejected', r.id, r.error?.message);
      items = items.slice(batch.length);
      sent += batch.length;
      lastError = null;
    }
    writeOutbox(items);
    lastFlushAt = new Date().toISOString();
    const st = await flushStickers();
    return { sent, kept: items.length, stickers_sent: st.sent, stickers_kept: st.kept };
  }

  /** Upload everything queued. Safe to call concurrently. */
  function flush() {
    flushing ??= flushOnce()
      .then((r) => {
        if (r.kept || r.stickers_kept) { schedule(backoff); backoff = Math.min(60_000, backoff * 2); } else backoff = 1000;
        return r;
      })
      .catch((e) => { lastError = String(e?.message || e); schedule(backoff); return { sent: 0, kept: -1, stickers_sent: 0, stickers_kept: -1 }; })
      .finally(() => { flushing = null; });
    return flushing;
  }

  /** Register a handle and store the install key (shown once by the server). Enables uploads. */
  async function register(handle, display_name, base_url = config().base_url) {
    const res = await fetchImpl(base_url.replace(/\/+$/, '') + '/players', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ handle, display_name }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`${res.status} ${body?.error?.code}: ${body?.error?.message}`);
    writeWebConfig({ enabled: true, base_url, handle: body.player.handle, install_key: body.install_key }, home);
    return body.player;
  }

  /** Set the profile photo (png|jpg|webp ≤ 250 KB), or reset it with null. Never throws. */
  async function setAvatar(path) {
    try {
      if (!enabled()) return { ok: false, status: 0, error: 'disabled' };
      if (path === null || path === undefined) {
        const res = await putImage('DELETE', '/players/me/avatar');
        return { ok: res.ok, status: res.status, ...(await res.json().catch(() => ({}))) };
      }
      const img = readImage(resolve(String(path)), MAX_AVATAR_BYTES);
      if (img.skip) return { ok: false, status: 0, error: img.skip };
      const mime = sniffImage(img.bytes);
      if (!mime) return { ok: false, status: 0, error: 'not a png, jpeg or webp file' };
      const res = await putImage('PUT', '/players/me/avatar', img.bytes, mime);
      return { ok: res.ok, status: res.status, ...(await res.json().catch(() => ({}))) };
    } catch (e) {
      return { ok: false, status: 0, error: `network: ${e?.message || e}` };
    }
  }

  /** Choose which picture shows: generated | photo | sticker | auto. */
  async function setAvatarSource(source) {
    try {
      if (!enabled()) return { ok: false, status: 0, error: 'disabled' };
      if (!AVATAR_SOURCES.includes(source)) return { ok: false, status: 0, error: `source must be ${AVATAR_SOURCES.join('|')}` };
      const res = await fetchImpl(api('/players/me/profile'), {
        method: 'PUT', headers: { ...auth(), 'content-type': 'application/json' }, body: JSON.stringify({ avatar_source: source }), signal: AbortSignal.timeout(10_000),
      });
      return { ok: res.ok, status: res.status, ...(await res.json().catch(() => ({}))) };
    } catch (e) {
      return { ok: false, status: 0, error: `network: ${e?.message || e}` };
    }
  }

  /** Privacy: delete every sticker of this player on the server and empty the local queue. */
  async function purgeStickers() {
    writeStickers([]);
    try {
      if (!enabled()) return { ok: false, status: 0, error: 'disabled' };
      const res = await putImage('DELETE', '/players/me/stickers');
      return { ok: res.ok, status: res.status, ...(await res.json().catch(() => ({}))) };
    } catch (e) {
      return { ok: false, status: 0, error: `network: ${e?.message || e}` };
    }
  }

  /** Upload <dir>/<waiId>.png for every wai id the server knows (404 = skip). Needs web.upload_stickers. */
  async function backfillStickers(dir) {
    const out = { uploaded: 0, skipped: 0, failed: 0, files: 0 };
    if (!stickersOn()) return { ...out, error: 'web.upload_stickers is not true' };
    let names = [];
    try { names = readdirSync(dir).filter((n) => /\.png$/i.test(n) && UUID.test(n.slice(0, -4))); } catch (e) { return { ...out, error: String(e?.message || e) }; }
    out.files = names.length;
    for (const n of names) {
      const r = await uploadSticker(n.slice(0, -4), join(dir, n));
      if (r.ok) out.uploaded++;
      else if (r.status === 404 || r.status === 0 && r.error && !r.error.startsWith('network')) out.skipped++;
      else { out.failed++; if (r.status === 0 || r.status === 401 || r.status === 429) { out.error = r.error || `HTTP ${r.status}`; break; } }
    }
    return out;
  }

  function status() {
    const c = config();
    return {
      enabled: enabled(), bypass, base_url: c.base_url, handle: c.handle, queued: readOutbox().length,
      upload_stickers: c.upload_stickers === true, stickers_queued: readStickers().length, lastError, lastFlushAt,
    };
  }

  if (enabled() && (readOutbox().length || readStickers().length)) schedule(1000); // leftovers from a previous run

  return {
    record, recordSticker, flush, register, status, setAvatar, setAvatarSource, uploadSticker, purgeStickers, backfillStickers,
    stop: () => { stopped = true; clearTimeout(timer); },
  };
}

// ---------- CLI ----------
if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ...rest] = process.argv.slice(2);
  const bi = rest.indexOf('--base');
  const base = bi >= 0 ? rest.splice(bi, 2)[1] : undefined;
  const sync = createWaiSync({ bypass: false });
  const out = (x) => console.log(JSON.stringify(x, null, 2));
  try {
    if (cmd === 'register') {
      const [handle, ...name] = rest;
      out(await sync.register(handle, name.join(' ') || handle, base || readConfig().web.base_url));
      console.log('saved to', join(waiHome(), 'config.json'));
    } else if (cmd === 'demo') {
      const passed = Math.random() < 0.7;
      sync.record({ session_id: 'demo', source: 'claude_code', kind: 'prompt', passed, level: passed ? 3 : 1, score: passed ? 70 + Math.floor(Math.random() * 30) : 40, hold_ms: 1600, action: passed ? 'allow' : 'retry', anger: passed ? 0 : 1 });
      out(await sync.flush());
    } else if (cmd === 'flush') out(await sync.flush());
    else if (cmd === 'status') out(sync.status());
    else if (cmd === 'disable') out(writeWebConfig({ enabled: false }));
    else if (cmd === 'stickers') {
      const [mode] = rest;
      if (mode !== 'on' && mode !== 'off') throw new Error('usage: stickers on|off [--purge]');
      out(writeWebConfig({ upload_stickers: mode === 'on' }));
      if (mode === 'off') {
        const purged = rest.includes('--purge') ? await sync.purgeStickers() : (await sync.flush(), null); // flush empties the queue
        if (purged) out(purged);
      }
    } else if (cmd === 'sticker') {
      const [id, file] = rest;
      if (!id || !file) throw new Error('usage: sticker <waiId> <file.png>');
      const r = await sync.uploadSticker(id, file);
      out(r);
      if (!r.ok) process.exitCode = 1;
    } else if (cmd === 'avatar') {
      const si = rest.indexOf('--source');
      const r = rest.includes('--reset') ? await sync.setAvatar(null)
        : si >= 0 ? await sync.setAvatarSource(rest[si + 1])
        : rest[0] ? await sync.setAvatar(rest[0]) : { ok: false, error: 'usage: avatar <file> | --reset | --source generated|photo|sticker|auto' };
      out(r);
      if (!r.ok) process.exitCode = 1;
    } else if (cmd === 'backfill-stickers') {
      const dir = rest[0] || join(homedir(), '.waikusa', 'stickers');
      const r = await sync.backfillStickers(dir);
      out(r);
      if (r.error) process.exitCode = 1;
    } else console.log('usage: wai-sync.mjs register <handle> <display name> [--base URL] | demo | flush | status | disable | stickers on|off [--purge] | sticker <waiId> <file> | avatar <file>|--reset|--source <s> | backfill-stickers [dir]');
  } catch (e) {
    console.error(String(e?.message || e));
    process.exitCode = 1;
  }
  sync.stop();
}
