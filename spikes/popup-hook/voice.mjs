// voice: personalities that speak Thai lines for session states.
// Source priority per line: teammate recording -> cached Paxa mp3 -> Paxa fetch (cached) -> OS TTS (macOS `say`, Windows System.Speech) -> silent.
// Pure-ish: all I/O is injectable (fetchImpl, playImpl, now, log). Never throws from speak()/say().
// Data: <repo>/voice/{personas,lines,lines.extra}.json   Runtime dir: <home>/voice/{recordings,cache,budget.json}
// The Paxa key is read lazily from <home>/secrets.json ("paxa_api_key") or opts.apiKey, never logged or exposed.
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SAFE_ID = /^[a-z0-9_-]+$/;
export const DEFAULT_BUDGET_CHARS = 6000;
export const DEBOUNCE_MS = 1500;
export const BACKOFF_MS = 60_000;
export const PAXA_BASE = 'https://api.paxalabs.com';
export const PAXA_MODEL = 'paxa-tts-flash-v1';
const FETCH_TIMEOUT_MS = 15_000;
const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = join(HERE, '..', '..', 'voice');

export const CLOSEST_STATES = Object.freeze({
  IDLE: ['DEMANDING'],
  DEMANDING: ['RETRY', 'WATCHING'],
  WATCHING: ['DEMANDING'],
  PASSED: ['FORGIVE', 'WATCHING'],
  RETRY: ['ANNOYED', 'DEMANDING'],
  ANNOYED: ['RETRY', 'SULKING'],
  SULKING: ['ANNOYED', 'RAGE_QUIT'],
  RAGE_QUIT: ['SULKING', 'ANNOYED'],
  FORGIVE: ['PASSED', 'DEMANDING'],
});
const GENERIC_TEXT = 'ไหว้ก่อน มนุษย์';

// ---- emotions: bracket tags only for voices that read them (others ignore but still bill them) ----
// ชื่อเสียงของระบบ (macOS `say -v`): ตัวอักษร/ตัวเลข/เว้นวรรค/ขีด/วงเล็บเท่านั้น กันถูกแทรกเป็น option
const SAFE_SYSTEM_VOICE = /^[A-Za-z0-9][A-Za-z0-9 ()_-]{0,40}$/;
export const TAG_VOICES = Object.freeze(new Set(['khanomchan', 'kaprao']));
export const EMOTION_TAGS = Object.freeze(new Set([
  'neutral', 'calm', 'normal', 'plain',
  'happy', 'excited', 'cheerful', 'joyful', 'amazed', 'laughing',
  'sad', 'crying', 'sorrowful', 'gloomy', 'disappointed',
  'angry', 'shouting', 'furious', 'annoyed', 'frustrated',
  'afraid', 'scared', 'fearful', 'nervous', 'terrified', 'anxious',
]));
// "angry" | "angry:0.9" | "sad:60%" (with or without brackets) -> "[angry:0.9]" or null when invalid
export function normalizeTag(raw) {
  const m = /^\s*\[?\s*([a-z]+)\s*(?::\s*(\d+(?:\.\d+)?)\s*(%)?\s*)?\]?\s*$/i.exec(String(raw ?? ''));
  if (!m) return null;
  const name = m[1].toLowerCase();
  if (!EMOTION_TAGS.has(name)) return null;
  if (m[2] === undefined) return `[${name}]`;
  const w = Number(m[2]);
  if (m[3] ? w > 100 : w > 1) return null;
  return `[${name}:${m[2]}${m[3] || ''}]`;
}
// keep valid inline tags, drop invalid ones (onInvalid called with the dropped tag text)
export function sanitizeTags(text, onInvalid = () => {}) {
  return String(text).replace(/\[([^\]]*)\]/g, (all, inner) => {
    const t = normalizeTag(inner);
    if (!t) { onInvalid(inner); return ''; }
    return t;
  }).replace(/[ \t]{2,}/g, ' ').trim();
}
export const stripTags = (text) => String(text).replace(/\[[^\]]*\]/g, ' ').replace(/\s{2,}/g, ' ').trim();
// speed: clamp 0.5..1.5, round to 0.05; undefined when absent/invalid
export function clampSpeed(v) {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(Math.min(1.5, Math.max(0.5, n)) * 20) / 20;
}

const readJson = (p, fallback) => {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; }
};
const sha1 = (s) => createHash('sha1').update(s, 'utf8').digest('hex');
const charLen = (s) => [...String(s)].length;

// PowerShell scripts are constants: the file path / text arrive via environment variables, never interpolated.
const PS_PLAY = '$ErrorActionPreference="Stop"; Add-Type -AssemblyName presentationCore; $p=New-Object System.Windows.Media.MediaPlayer; $p.Open([uri]$env:WAI_PLAY_FILE); $i=0; while(-not $p.NaturalDuration.HasTimeSpan -and $i -lt 100){Start-Sleep -Milliseconds 50; $i++}; $p.Play(); $ms=3000; if($p.NaturalDuration.HasTimeSpan){$ms=[int]$p.NaturalDuration.TimeSpan.TotalMilliseconds+300}; Start-Sleep -Milliseconds $ms; $p.Close()';
const psSpeak = (rate) => `$ErrorActionPreference="Stop"; Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Rate=${rate}; $s.Speak($env:WAI_SPEAK_TEXT)`;
const PS_ARGS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command'];
const LINUX_PLAYERS = [
  ['ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet']],
  ['mpg123', ['-q']],
  ['paplay', []],
];

/** Is `name` an executable on PATH? (no shell) */
export function hasCommand(name, { platform = process.platform, env = process.env } = {}) {
  const win = platform === 'win32';
  const exts = win ? ['.exe'] : [''];
  for (const dir of (env.PATH ?? env.Path ?? '').split(win ? ';' : ':')) {
    if (!dir) continue;
    for (const ext of exts) if (existsSync(join(dir, name + ext))) return true;
  }
  return false;
}

/**
 * Pure planner: which command plays `spec` on `platform`?
 * Returns { cmd, args, env? } or null (silent). Exported for tests.
 */
export function planPlayback(spec, { platform = process.platform, has = (n) => hasCommand(n, { platform }) } = {}) {
  if (!spec) return null;
  if (platform === 'darwin') {
    if (spec.kind === 'file') return { cmd: 'afplay', args: [spec.path] };
    if (spec.kind === 'say') {
      const text = String(spec.text).replace(/^-+/, '');
      return { cmd: 'say', args: ['-v', spec.voice || 'Kanya', '-r', String(Math.round(spec.rate || 170)), text] };
    }
    return null;
  }
  if (platform === 'win32') {
    if (spec.kind === 'file') return { cmd: 'powershell.exe', args: [...PS_ARGS, PS_PLAY], env: { WAI_PLAY_FILE: String(spec.path) } };
    if (spec.kind === 'say') {
      // SAPI rate is -10..10; map `say` words-per-minute (170 = normal) onto it
      const rate = Math.max(-10, Math.min(10, Math.round(((spec.rate || 170) - 170) / 20)));
      return { cmd: 'powershell.exe', args: [...PS_ARGS, psSpeak(rate)], env: { WAI_SPEAK_TEXT: String(spec.text) } };
    }
    return null;
  }
  // linux & others: files only, first available player; no TTS fallback
  if (spec.kind === 'file') {
    for (const [cmd, pre] of LINUX_PLAYERS) if (has(cmd)) return { cmd, args: [...pre, spec.path] };
  }
  return null;
}

// Default playback: execFile (never a shell). Returns {cancel, done} or null when unsupported.
export function defaultPlayImpl(spec) {
  const plan = planPlayback(spec);
  if (!plan) return null;
  let child;
  const done = new Promise((resolve) => {
    const opts = { windowsHide: true };
    if (plan.env) opts.env = { ...process.env, ...plan.env };
    child = execFile(plan.cmd, plan.args, opts, (err) => resolve({ ok: !err }));
    child.on('error', () => resolve({ ok: false }));
  });
  return { cancel: () => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, done };
}

export function createVoice({
  home,
  fetchImpl = globalThis.fetch,
  playImpl = defaultPlayImpl,
  now = Date.now,
  log = () => {},
  budgetChars = DEFAULT_BUDGET_CHARS,
  apiKey = null,
  dataDir = DEFAULT_DATA_DIR,
  baseUrl = PAXA_BASE,
  random = Math.random,
} = {}) {
  if (!home) throw new Error('createVoice: home is required');
  const root = join(home, 'voice');
  const recDir = join(root, 'recordings');
  const cacheDir = join(root, 'cache');
  const budgetFile = join(root, 'budget.json');

  const personas = (readJson(join(dataDir, 'personas.json'), { personas: [] }).personas || [])
    .filter((p) => p && SAFE_ID.test(p.id || '') && SAFE_ID.test(p.voice || ''));
  const personaById = new Map(personas.map((p) => [p.id, p]));
  const lines = [
    ...(readJson(join(dataDir, 'lines.json'), { lines: [] }).lines || []),
    ...(readJson(join(dataDir, 'lines.extra.json'), { lines: [] }).lines || []),
  ].filter((l) => l && typeof l.text === 'string' && l.text && personaById.has(l.persona));
  const defaults = readJson(join(dataDir, 'lines.extra.json'), {}).defaults || {};

  let current = personas[0]?.id || null;
  let muted = false;
  let seq = 0;
  let playing = null; // {cancel, done}
  let lastSpeak = { key: '', at: -Infinity };
  const lastLineByKey = new Map();
  const inflight = new Map();
  let paxaDisabled = null; // reason string
  let backoffUntil = 0;
  let keyMemo;
  let lastResult = null;

  // ---- logging: every string is scrubbed of the key ----
  const getKey = () => {
    if (keyMemo !== undefined) return keyMemo;
    let k = apiKey;
    if (!k) {
      const s = readJson(join(home, 'secrets.json'), {});
      k = typeof s.paxa_api_key === 'string' ? s.paxa_api_key : null;
    }
    keyMemo = k && k.length ? k : null;
    return keyMemo;
  };
  const scrub = (s) => {
    let out = String(s);
    const k = keyMemo ?? apiKey;
    if (k) out = out.split(k).join('***');
    return out;
  };
  const note = (msg) => { try { log(scrub(`[voice] ${msg}`)); } catch { /* logger must not break us */ } };

  // ---- budget ----
  const readBudget = () => {
    const b = readJson(budgetFile, {});
    return { used: Number.isFinite(b.used) ? b.used : 0 };
  };
  const budgetState = () => {
    const { used } = readBudget();
    return { used, cap: budgetChars, remaining: Math.max(0, budgetChars - used) };
  };
  const charge = (n) => {
    try {
      mkdirSync(root, { recursive: true });
      const used = readBudget().used + n;
      const tmp = `${budgetFile}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify({ used, cap: budgetChars, updated: new Date(now()).toISOString() }), { mode: 0o600 });
      renameSync(tmp, budgetFile);
    } catch (e) { note(`budget write failed: ${e.code || 'error'}`); }
  };

  // ---- Paxa ----
  const paxaAllowed = (len) => {
    if (paxaDisabled) return false;
    if (now() < backoffUntil) return false;
    if (!getKey()) return false;
    if (typeof fetchImpl !== 'function') return false;
    if (budgetState().remaining < len) { note('budget exhausted, skipping Paxa'); return false; }
    return true;
  };

  async function synthesize(text, voice, file, speed) {
    const len = charLen(text);
    if (!paxaAllowed(len)) return false;
    const ikey = `${voice}:${speed ?? ''}:${sha1(text)}`;
    if (inflight.has(ikey)) return inflight.get(ikey);
    const p = (async () => {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetchImpl(`${baseUrl}/v1/tts`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${getKey()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voice, model: PAXA_MODEL, ...(speed !== undefined && speed !== 1 ? { speed } : {}) }),
          signal: ac.signal,
        });
        const status = res.status;
        if (status === 401 || status === 402) { paxaDisabled = `http_${status}`; note(`Paxa disabled for session (HTTP ${status})`); return false; }
        if (status === 429 || status >= 500) { backoffUntil = now() + BACKOFF_MS; note(`Paxa backoff 60s (HTTP ${status})`); return false; }
        if (!res.ok) { note(`Paxa rejected request (HTTP ${status})`); return false; }
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 16) { note('Paxa returned empty audio'); return false; }
        mkdirSync(dirname(file), { recursive: true });
        const tmp = `${file}.${process.pid}.tmp`;
        writeFileSync(tmp, buf);
        renameSync(tmp, file);
        charge(len);
        note(`synthesized ${len} chars (${voice})`);
        return true;
      } catch (e) {
        backoffUntil = now() + BACKOFF_MS;
        note(`Paxa network error, backoff 60s (${e?.name || 'error'})`);
        return false;
      } finally {
        clearTimeout(timer);
        inflight.delete(ikey);
      }
    })();
    inflight.set(ikey, p);
    return p;
  }

  // ---- line selection ----
  const linesFor = (persona, state) => lines.filter((l) => l.persona === persona && l.state === state);
  function pickLine(persona, state) {
    const tryStates = [state, ...(CLOSEST_STATES[state] || [])];
    for (const st of tryStates) {
      const c = linesFor(persona, st);
      if (!c.length) continue;
      const lk = `${persona}:${st}`;
      const last = lastLineByKey.get(lk);
      const pool = c.length > 1 ? c.filter((l) => l.id !== last) : c;
      const line = pool[Math.floor(random() * pool.length) % pool.length];
      lastLineByKey.set(lk, line.id);
      return { id: line.id, line, state: st };
    }
    return { id: null, line: { text: defaults[state] || GENERIC_TEXT }, state };
  }

  // ---- resolve & play ----
  const recordingPath = (persona, lineId) => {
    if (!SAFE_ID.test(persona || '') || !SAFE_ID.test(lineId || '')) return null;
    for (const ext of ['wav', 'mp3']) {
      const p = join(recDir, persona, `${lineId}.${ext}`);
      if (existsSync(p)) return p;
    }
    return null;
  };
  const cachePath = (voice, text, speed) =>
    join(cacheDir, voice, `${sha1(speed === undefined || speed === 1 ? text : `${text}\n@speed=${speed}`)}.mp3`);
  const warned = new Set();
  // final synthesized text/speed for a line; tags only reach TAG_VOICES. plain is for recordings and `say`.
  function buildSpeech(persona, l) {
    const base = typeof l.emotionText === 'string' && l.emotionText ? l.emotionText : l.text;
    const plain = stripTags(l.text);
    const speed = clampSpeed(l.speed ?? persona.speed);
    if (!TAG_VOICES.has(persona.voice)) return { plain, synth: plain, speed: undefined };
    const onInvalid = (t) => {
      if (warned.has(t)) return;
      warned.add(t);
      note(`dropped invalid emotion tag [${String(t).slice(0, 20)}]`);
    };
    let body = sanitizeTags(base, onInvalid);
    if (l.emotion && !(typeof l.emotionText === 'string' && l.emotionText)) {
      const tag = normalizeTag(l.emotion);
      if (tag) body = `${tag} ${body}`; else onInvalid(l.emotion);
    }
    return { plain, synth: body || plain, speed };
  }

  function startPlay(spec) {
    let h = null;
    try { h = playImpl(spec); } catch (e) { note(`play failed: ${e?.code || 'error'}`); }
    if (!h || typeof h !== 'object') return null;
    playing = h;
    Promise.resolve(h.done).catch(() => {}).finally(() => { if (playing === h) playing = null; });
    return h;
  }
  function stopPlaying() {
    const h = playing;
    playing = null;
    if (h && typeof h.cancel === 'function') { try { h.cancel(); } catch { /* ignore */ } }
  }

  async function resolveAndPlay({ persona, lineId, line, state, useRecording }, mySeq) {
    const p = personaById.get(persona);
    const { plain: text, synth, speed } = buildSpeech(p, line);
    if (useRecording && lineId) {
      const rec = recordingPath(persona, lineId);
      if (rec) {
        if (mySeq !== seq) return { ok: false, skipped: 'superseded' };
        startPlay({ kind: 'file', path: rec });
        return { ok: true, source: 'recording', persona, lineId, state, text };
      }
    }
    // engine:'system' = บุคลิกที่ตั้งใจใช้เสียงของระบบ (เช่น หุ่นเย็นชา แบบ Siri) ไม่ผ่าน Paxa เลย
    const systemOnly = p.engine === 'system';
    const file = cachePath(p.voice, synth, speed);
    let source = null;
    if (!systemOnly) {
      if (existsSync(file)) source = 'cache';
      else if (await synthesize(synth, p.voice, file, speed)) source = 'paxa';
    }
    if (mySeq !== seq) return { ok: false, skipped: 'superseded' };
    if (source) {
      const h = startPlay({ kind: 'file', path: file });
      if (h) return { ok: true, source, persona, lineId, state, text };
    }
    const h = startPlay({ kind: 'say', text, voice: SAFE_SYSTEM_VOICE.test(p.systemVoice || '') ? p.systemVoice : 'Kanya', rate: p.rate || 170 });
    if (h) return { ok: true, source: 'say', persona, lineId, state, text };
    return { ok: false, source: 'silent', persona, lineId, state, text };
  }

  async function run(fn) {
    try {
      const r = await fn();
      lastResult = r;
      return r;
    } catch (e) {
      note(`error: ${e?.code || e?.name || 'error'}`);
      return { ok: false, error: 'internal' };
    }
  }

  function speak({ state, persona, lineId } = {}) {
    return run(async () => {
      const pid = persona ?? current;
      if (!SAFE_ID.test(pid || '') || !personaById.has(pid)) return { ok: false, error: 'bad persona' };
      if (muted) return { ok: false, skipped: 'muted' };
      const st = String(state || 'IDLE');
      const key = `${pid}:${st}:${lineId || ''}`;
      const t = now();
      if (key === lastSpeak.key && t - lastSpeak.at < DEBOUNCE_MS) return { ok: false, skipped: 'debounce' };
      lastSpeak = { key, at: t };
      let pick;
      if (lineId && SAFE_ID.test(lineId)) {
        const l = lines.find((x) => x.persona === pid && x.id === lineId);
        pick = l ? { id: l.id, line: l, state: l.state } : pickLine(pid, st);
      } else pick = pickLine(pid, st);
      const mySeq = ++seq;
      stopPlaying();
      return resolveAndPlay({ persona: pid, lineId: pick.id, line: pick.line, state: pick.state, useRecording: true }, mySeq);
    });
  }

  function say(text, { persona } = {}) {
    return run(async () => {
      const pid = persona ?? current;
      if (!SAFE_ID.test(pid || '') || !personaById.has(pid)) return { ok: false, error: 'bad persona' };
      if (muted) return { ok: false, skipped: 'muted' };
      const clean = String(text ?? '').trim();
      if (!clean || charLen(clean) > 200) return { ok: false, error: 'bad text' };
      const mySeq = ++seq;
      stopPlaying();
      return resolveAndPlay({ persona: pid, lineId: null, line: { text: clean, emotionText: clean }, state: null, useRecording: false }, mySeq);
    });
  }

  async function prewarm(personaIds) {
    const ids = (personaIds && personaIds.length ? personaIds : personas.map((p) => p.id)).filter((id) => personaById.has(id) && personaById.get(id).engine !== 'system');
    const out = { fetched: 0, cached: 0, recorded: 0, skipped: 0 };
    try {
      for (const id of ids) {
        const voice = personaById.get(id).voice;
        for (const l of lines.filter((x) => x.persona === id)) {
          if (recordingPath(id, l.id)) { out.recorded++; continue; }
          const { synth, speed } = buildSpeech(personaById.get(id), l);
          const file = cachePath(voice, synth, speed);
          if (existsSync(file)) { out.cached++; continue; }
          if (await synthesize(synth, voice, file, speed)) out.fetched++; else out.skipped++;
        }
      }
    } catch (e) { note(`prewarm error: ${e?.name || 'error'}`); }
    return out;
  }

  function list() {
    return personas.map((p) => ({
      id: p.id, name: p.name, description: p.description, voice: p.voice, engine: p.engine === 'system' ? 'system' : 'paxa',
      supportsTags: TAG_VOICES.has(p.voice),
      example: lines.find((l) => l.persona === p.id)?.text || defaults.DEMANDING || GENERIC_TEXT,
      lines: lines.filter((l) => l.persona === p.id).length,
      recorded: lines.filter((l) => l.persona === p.id && recordingPath(p.id, l.id)).length,
      current: p.id === current,
    }));
  }
  function setPersona(id) {
    if (!SAFE_ID.test(id || '') || !personaById.has(id)) return false;
    current = id;
    return true;
  }
  const getPersona = () => current;
  function setMuted(m) {
    muted = !!m;
    if (muted) { seq++; stopPlaying(); }
    return muted;
  }
  function status() {
    return {
      persona: current,
      muted,
      speaking: !!playing,
      paxa: {
        hasKey: !!getKey(),
        enabled: !paxaDisabled,
        disabledReason: paxaDisabled,
        backoffUntil: backoffUntil > now() ? backoffUntil : 0,
      },
      budget: budgetState(),
      last: lastResult && { ok: lastResult.ok, source: lastResult.source || null, lineId: lastResult.lineId || null },
    };
  }

  return { speak, say, prewarm, list, setPersona, getPersona, setMuted, status };
}
