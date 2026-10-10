// Mock store: ~60 days of seeded history plus a live simulation that "catches up" on every read
// (no timers, so it also works on serverless). Writes from a real daemon land here too, which makes
// `npm run dev` a complete local backend for integration testing.
import { randomUUID } from 'node:crypto';
import type { PlayerRow, Snapshot, WaiRow } from '../engine';
import { addPlayer, addWai, emptySnapshot } from '../engine';
import { ApiError } from '../errors';
import { DAY, bkkDay, iso, startOf } from '../time';
import type { Kind, Level, Source, WaiSubmission } from '../types';
import { sameWai } from '../validate';
import { hashKey, newInstallKey } from './keys';
import type { InsertResult, Store } from './types';

const PEOPLE: [string, string][] = [
  ['nong_dot', 'น้องดอท'], ['phi_tee', 'พี่ตี๋'], ['somchai_dev', 'สมชาย.dev'], ['ploy_codes', 'พลอยโค้ด'],
  ['ajarn_k', 'อาจารย์เค'], ['mai_mee_bug', 'ไม่มีบั๊ก'], ['nam_wan', 'น้ำหวาน'], ['tonkla', 'ต้นกล้า'],
  ['beam_sudo', 'บีม sudo'], ['jinny_js', 'จินนี่ JS'], ['oat_rust', 'โอ๊ต rust'], ['fah_ui', 'ฟ้า UI'],
  ['big_deploy', 'บิ๊ก deploy'], ['mook_ml', 'มุก ML'], ['pond_404', 'ปอนด์ 404'], ['kaew_git', 'แก้ว git'],
  ['ton_tensor', 'ต้น tensor'], ['praew_qa', 'แพรว QA'], ['golf_k8s', 'กอล์ฟ k8s'], ['nut_null', 'นัท null'],
  ['mild_css', 'มายด์ CSS'], ['arm_api', 'อาร์ม API'], ['fern_figma', 'เฟิร์น figma'], ['bank_ops', 'แบงค์ ops'],
  ['ice_infra', 'ไอซ์ infra'], ['view_vim', 'วิว vim'], ['jay_jest', 'เจ jest'], ['pim_py', 'พิม py'],
  ['khao_hook', 'ข้าว hook'], ['tae_tmux', 'เต้ tmux'], ['bow_wai_suay', 'โบว์ไหว้สวย'], ['nick_nix', 'นิค nix'],
  ['ploen_prompt', 'เพลิน prompt'], ['max_merge', 'แม็กซ์ merge'], ['yo_yaml', 'โย yaml'], ['lukpla', 'ลูกปลา'],
  ['monk_mode', 'โหมดพระ'], ['angry_ajarn', 'อาจารย์ขี้งอน'],
];
const SOURCES: Source[] = ['claude_code', 'claude_code', 'claude_code', 'shell', 'extension'];
const DAYS = 63;

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Sim { skill: number; devotion: number; activity: number; dayProb: number; anger: number; day: number; session: string }

export function createMemoryStore(seed = 7777): Store {
  const rnd = mulberry32(seed);
  const normal = (m: number, sd: number) => m + sd * Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const uuid = () => {
    let h = '';
    for (let i = 0; i < 4; i++) h += ((rnd() * 4294967296) >>> 0).toString(16).padStart(8, '0');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
  };

  const snap: Snapshot = emptySnapshot();
  const sims: (Sim | null)[] = []; // null = a real registered player (never simulated)
  const keys = new Map<string, number>(); // sha256(key) → player index
  const submitted = new Map<string, { w: WaiSubmission; at: number }>();
  const now0 = Date.now(), today0 = startOf('day', now0);

  PEOPLE.forEach(([handle, display_name]) => {
    const monk = handle === 'monk_mode', angry = handle === 'angry_ajarn';
    const joined = monk || angry ? 1 : Math.floor(rnd() * rnd() * DAYS);
    addPlayer(snap, { id: uuid(), handle, display_name, avatar_hue: Math.floor(rnd() * 360), created_at: today0 - (DAYS - joined) * DAY });
    sims.push({
      skill: monk ? 82 : angry ? 50 : Math.min(84, Math.max(56, normal(70, 6))),
      devotion: monk ? 0.9 : rnd() * 0.7,
      activity: monk || angry ? 5 : 0.6 + rnd() ** 2 * 8,
      dayProb: 0.35 + rnd() * 0.6,
      anger: 0, day: -1, session: '',
    });
  });

  // One attempt, following the daemon's anger state machine (artifact.md · State machine).
  function attempt(p: number, t: number, kind: Kind, source: Source): WaiRow {
    const P = sims[p]!, d = bkkDay(t);
    if (P.day !== d) { P.day = d; P.anger = 0; P.session = 'cc-' + uuid().slice(0, 8); }
    const w = [0.04, (1 - P.devotion) * 0.55, 0.35, P.devotion * 0.6 + 0.05];
    let r = rnd() * (w[0] + w[1] + w[2] + w[3]), level = 0;
    while (level < 3 && (r -= w[level]) > 0) level++;
    if (P.anger >= 6 && rnd() < 0.6) level = 3; // begging for forgiveness
    let score = Math.round(normal(P.skill + level * 3, 10));
    if (score >= 99 && rnd() > 0.04) score = 93 + Math.floor(rnd() * 6); // a perfect 100 stays rare
    score = Math.max(0, Math.min(100, level === 0 ? Math.min(score, 30) : score));
    const hold = level === 0 ? Math.round(rnd() * 900) : Math.round(700 + rnd() * 2300);
    const raged = P.anger >= 6;
    const passed = level >= 1 && hold >= 1000 && score >= 60 && (P.anger < 3 || level >= 2) && (!raged || level === 3);
    let action: WaiRow['action'] = 'allow', anger = P.anger;
    if (passed) P.anger = 0;
    else if (raged) action = 'deny';
    else {
      P.anger = anger = P.anger + 1;
      action = P.anger <= 4 ? 'retry' : P.anger === 5 ? 'deny' : 'rage_quit';
    }
    return {
      id: uuid(), p, session_id: P.session, source, kind, level: level as Level, score, hold_ms: hold, passed,
      action, forgave: passed && raged, anger, t, client_ts: t,
    };
  }

  function request(p: number, t: number, out: WaiRow[]) {
    const kind: Kind = rnd() < 0.35 ? 'subagent' : 'prompt', source = SOURCES[Math.floor(rnd() * SOURCES.length)];
    for (let k = 0; k < 10; k++) {
      const row = attempt(p, t, kind, source);
      out.push(row);
      if (row.passed || (row.action === 'rage_quit' && rnd() < 0.5)) return;
      t += 12_000 + rnd() * 30_000;
    }
  }

  // ---- seed history ----
  const gen: WaiRow[] = [];
  for (let d = DAYS; d >= 0; d--) {
    const dayStart = today0 - d * DAY;
    snap.players.forEach((pl, p) => {
      const P = sims[p]!;
      if (dayStart < pl.created_at || rnd() > P.dayProb) return;
      const n = Math.max(0, Math.round(normal(P.activity, P.activity / 2)));
      const times = Array.from({ length: n }, () => dayStart + (8 + rnd() * 15.5) * 3_600_000).sort((a, b) => a - b);
      for (const t of times) if (t < now0 - 60_000) request(p, t, gen);
    });
  }
  gen.filter((r) => r.t < now0).sort((a, b) => a.t - b.t).forEach((r) => addWai(snap, r));

  // ---- live simulation: one attempt every 2–5 s of wall time, generated lazily ----
  const weights = sims.map((s) => s!.activity), wsum = weights.reduce((a, b) => a + b, 0);
  let next = now0 + 2000;
  function catchUp(now: number) {
    if (now - next > 10 * 60_000) next = now - 10 * 60_000; // idle for long: don't replay hours
    while (next <= now) {
      let x = rnd() * wsum, p = 0;
      while ((x -= weights[p]) > 0 && p < weights.length - 1) p++;
      addWai(snap, attempt(p, next, rnd() < 0.35 ? 'subagent' : 'prompt', SOURCES[Math.floor(rnd() * SOURCES.length)]));
      next += 2000 + rnd() * 3000;
    }
  }

  return {
    kind: 'mock',
    async snapshot() {
      catchUp(Date.now());
      return snap;
    },
    async register(handle, display_name) {
      if (snap.byHandle.has(handle)) throw new ApiError(409, 'handle_taken', `@${handle} is taken`, 'handle');
      const player: PlayerRow = { id: randomUUID(), handle, display_name, avatar_hue: Math.floor(Math.random() * 360), created_at: Date.now() };
      const p = addPlayer(snap, player);
      sims.push(null);
      const install_key = newInstallKey();
      keys.set(hashKey(install_key), p);
      return { player, install_key };
    },
    async authenticate(key) {
      const p = keys.get(hashKey(key));
      if (p === undefined) throw new ApiError(401, 'unauthorized', 'unknown install key');
      return snap.players[p];
    },
    async updatePlayer(id, patch) {
      const p = snap.players.findIndex((x) => x.id === id);
      if (p < 0) throw new ApiError(404, 'not_found', 'player not found');
      Object.assign(snap.players[p], patch);
      snap.version++;
      return snap.players[p];
    },
    async insertWais(player, items) {
      const now = Date.now();
      catchUp(now); // keeps rows sorted: simulated rows are all ≤ now
      const p = snap.byHandle.get(player.handle)!;
      return items.map((w): InsertResult => {
        const prev = submitted.get(w.id);
        if (prev) {
          return sameWai(prev.w, w)
            ? { id: w.id, status: 200, created_at: iso(prev.at) }
            : { id: w.id, status: 409, error: { code: 'duplicate', message: 'same id with a different body' } };
        }
        submitted.set(w.id, { w, at: now });
        addWai(snap, { ...w, p, t: now, client_ts: Date.parse(w.client_ts) });
        return { id: w.id, status: 201, created_at: iso(now) };
      });
    },
  };
}
