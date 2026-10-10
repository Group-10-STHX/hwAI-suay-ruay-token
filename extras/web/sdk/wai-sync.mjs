// wai-sync — zero-dependency uploader for the WAI-NET web API (Node ≥ 18 / Electron main).
// The daemon calls record() when a wai attempt resolves; this module queues it in an on-disk
// outbox and uploads in the background. It never throws into the caller and never blocks.
//
//   import { createWaiSync } from '../../extras/web/sdk/wai-sync.mjs';
//   const sync = createWaiSync();            // reads ~/.wai/config.json
//   sync.record({ session_id, source, kind, passed, level, score, hold_ms, action, anger, forgave });
//
// CLI (for testing):  node wai-sync.mjs register <handle> <display name> [--base URL]
//                     node wai-sync.mjs demo | flush | status | disable
// See docs/INTEGRATION.md.

import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_BASE_URL = 'http://localhost:3000/api/v1';
const MAX_OUTBOX = 5000;
const BATCH = 100;

const SOURCE_ALIASES = {
  claude_code: 'claude_code', 'claude-code': 'claude_code', hook: 'claude_code', claudecode: 'claude_code',
  shell: 'shell', wrapper: 'shell', claude: 'shell', codex: 'shell', gemini: 'shell', cli: 'shell',
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
  const fetchImpl = opts.fetch || globalThis.fetch;
  const log = opts.logger || { warn: (...m) => console.warn('[wai-sync]', ...m) };
  const bypass = opts.bypass ?? process.env.WAI_BYPASS === '1';
  let timer = null, flushing = null, backoff = 1000, lastError = null, lastFlushAt = null, stopped = false;

  const config = () => (opts.config ? { web: { ...readConfig(home).web, ...opts.config } } : readConfig(home)).web;
  const enabled = () => { const c = config(); return !bypass && !!c.enabled && !!c.install_key; };

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

  async function flushOnce() {
    const c = config();
    if (!enabled()) return { sent: 0, kept: readOutbox().length };
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
    return { sent, kept: items.length };
  }

  /** Upload everything queued. Safe to call concurrently. */
  function flush() {
    flushing ??= flushOnce()
      .then((r) => {
        if (r.kept) { schedule(backoff); backoff = Math.min(60_000, backoff * 2); } else backoff = 1000;
        return r;
      })
      .catch((e) => { lastError = String(e?.message || e); schedule(backoff); return { sent: 0, kept: -1 }; })
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

  function status() {
    const c = config();
    return { enabled: enabled(), bypass, base_url: c.base_url, handle: c.handle, queued: readOutbox().length, lastError, lastFlushAt };
  }

  if (enabled() && readOutbox().length) schedule(1000); // leftovers from a previous run

  return { record, flush, register, status, stop: () => { stopped = true; clearTimeout(timer); } };
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
    else console.log('usage: wai-sync.mjs register <handle> <display name> [--base URL] | demo | flush | status | disable');
  } catch (e) {
    console.error(String(e?.message || e));
    process.exitCode = 1;
  }
  sync.stop();
}
