// Pure computation over a Snapshot. Every store (mock, Supabase) feeds the same engine,
// so the API shapes are identical no matter where the rows come from.
import type {
  Action, Champion, Distribution, FeedItem, HallOfFame, HofRecord, Kind, Leaderboard, Level, Metric,
  Period, PlayerProfile, PlayerRef, Source, Stats, StatsBlock, SurvivalReport, Unit, WaiRef,
} from './types';
import { METRICS, PERIODS } from './types';
import { BKK, DAY, bkkDay, dayStr, iso, isoOrNull, isoWeek, startOf } from './time';
import { BEAUTIFUL_SCORE, MIN_ATTEMPTS, MIN_ATTEMPTS_WINDOW, meanSd, percentileOf, survivalOf, tierOf } from './survival';
import { ApiError } from './errors';

export interface PlayerRow {
  id: string;
  handle: string;
  display_name: string;
  avatar_hue: number;
  created_at: number;
}

export interface WaiRow {
  id: string;
  p: number; // index into snapshot.players
  session_id: string;
  source: Source;
  kind: Kind;
  level: Level;
  score: number;
  hold_ms: number;
  passed: boolean;
  action: Action;
  forgave: boolean;
  anger: number;
  t: number; // server created_at (ms) — windows use this
  client_ts: number | null;
}

export interface Snapshot {
  version: number;
  players: PlayerRow[];
  byHandle: Map<string, number>;
  wais: WaiRow[]; // sorted by t ascending
  byPlayer: WaiRow[][];
  cache: Map<string, { v: number; val: unknown }>;
}

export function emptySnapshot(): Snapshot {
  return { version: 0, players: [], byHandle: new Map(), wais: [], byPlayer: [], cache: new Map() };
}

export function addPlayer(s: Snapshot, p: PlayerRow): number {
  const i = s.players.push(p) - 1;
  s.byHandle.set(p.handle, i);
  s.byPlayer.push([]);
  s.version++;
  return i;
}

/** Rows must arrive in time order (callers sort first). */
export function addWai(s: Snapshot, w: WaiRow) {
  s.wais.push(w);
  s.byPlayer[w.p].push(w);
  s.version++;
}

const UNIT: Record<Metric, Unit> = {
  survival: 'percent', beauty: 'score', count: 'wais', lv3: 'wais', streak: 'days', shame: 'rage_quits',
};

function memo<T>(s: Snapshot, key: string, fn: () => T): T {
  const hit = s.cache.get(key);
  if (hit && hit.v === s.version) return hit.val as T;
  const val = fn();
  s.cache.set(key, { v: s.version, val });
  return val;
}

function lower(s: Snapshot, x: number): number {
  if (x === -Infinity) return 0;
  if (x === Infinity) return s.wais.length;
  let lo = 0, hi = s.wais.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (s.wais[mid].t < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const isBeautiful = (r: WaiRow) => r.passed && r.score >= BEAUTIFUL_SCORE;

/** Is wai a more beautiful than wai b. */
function better(a: WaiRow, b: WaiRow | null): boolean {
  return !b || a.score > b.score || (a.score === b.score && (a.level > b.level || (a.level === b.level && a.t < b.t)));
}

const ref = (p: PlayerRow): PlayerRef => ({ id: p.id, handle: p.handle, display_name: p.display_name, avatar_hue: p.avatar_hue });
const waiRef = (r: WaiRow | null): WaiRef | null =>
  r ? { id: r.id, level: r.level, score: r.score, hold_ms: r.hold_ms, created_at: iso(r.t), sticker_url: null } : null;
const round1 = (x: number) => Math.round(x * 10) / 10;

interface Agg {
  p: number;
  attempts: number;
  count: number;
  beautiful: number;
  sum: number;
  lv3: number;
  rage: number;
  deny: number;
  forg: number;
  best: WaiRow | null;
  first: number;
  survival: number;
  streak: number;
  bestStreak: number;
  value: number;
  rank: number;
}

function aggregate(s: Snapshot, from: number, to: number): Map<number, Agg> {
  const m = new Map<number, Agg>();
  for (let i = lower(s, from), end = lower(s, to); i < end; i++) {
    const r = s.wais[i];
    let a = m.get(r.p);
    if (!a) {
      a = { p: r.p, attempts: 0, count: 0, beautiful: 0, sum: 0, lv3: 0, rage: 0, deny: 0, forg: 0, best: null,
        first: Infinity, survival: 0, streak: 0, bestStreak: 0, value: 0, rank: 0 };
      m.set(r.p, a);
    }
    a.attempts++;
    if (r.passed) {
      a.count++;
      a.sum += r.score;
      if (r.level === 3) a.lv3++;
      if (r.score >= BEAUTIFUL_SCORE) a.beautiful++;
      if (better(r, a.best)) a.best = r;
      if (r.t < a.first) a.first = r.t;
    }
    if (r.forgave) a.forg++;
    if (r.action === 'rage_quit') a.rage++;
    if (r.action === 'deny') a.deny++;
  }
  m.forEach((a) => { a.survival = survivalOf(a); });
  return m;
}

const avg = (a: Agg) => (a.count ? a.sum / a.count : 0);

interface Streak { current: number; best: number; bestEnd: number }

function streaks(s: Snapshot, now: number): Streak[] {
  const today = bkkDay(now);
  return memo(s, `streaks|${today}`, () =>
    s.byPlayer.map((list) => {
      let best = 0, bestEnd = 0, run = 0, last = -2;
      for (const r of list) {
        if (!r.passed) continue;
        const d = bkkDay(r.t);
        if (d === last) continue;
        run = d === last + 1 ? run + 1 : 1;
        last = d;
        if (run > best) { best = run; bestEnd = d; }
      }
      return { current: last >= today - 1 ? run : 0, best, bestEnd };
    }));
}

function comparator(metric: Metric) {
  const key: Record<Metric, (a: Agg) => number> = {
    survival: (a) => a.survival,
    beauty: (a) => (a.best ? a.best.score : 0),
    count: (a) => a.count,
    lv3: (a) => a.lv3,
    streak: (a) => a.streak,
    shame: (a) => a.rage,
  };
  const tie: Record<Metric, (a: Agg, b: Agg) => number> = {
    survival: (a, b) => b.beautiful - a.beautiful || b.attempts - a.attempts,
    beauty: (a, b) => b.best!.level - a.best!.level || a.best!.t - b.best!.t,
    count: (a, b) => avg(b) - avg(a) || a.first - b.first,
    lv3: (a, b) => avg(b) - avg(a),
    streak: (a, b) => b.bestStreak - a.bestStreak,
    shame: (a, b) => b.deny - a.deny,
  };
  const k = key[metric], t = tie[metric];
  return { key: k, cmp: (a: Agg, b: Agg) => k(b) - k(a) || t(a, b) };
}

function ranked(s: Snapshot, metric: Metric, from: number, to: number, now: number): Agg[] {
  return memo(s, `rank|${metric}|${from}|${to}|${metric === 'streak' ? bkkDay(now) : ''}`, () => {
    let list: Agg[] = [];
    if (metric === 'streak') {
      const st = streaks(s, now);
      aggregate(s, -Infinity, to).forEach((a) => {
        a.streak = st[a.p].current;
        a.bestStreak = st[a.p].best;
        list.push(a);
      });
    } else {
      aggregate(s, from, to).forEach((a) => list.push(a));
    }
    if (metric === 'survival') {
      const min = from === -Infinity ? MIN_ATTEMPTS : MIN_ATTEMPTS_WINDOW;
      list = list.filter((a) => a.attempts >= min);
    }
    const c = comparator(metric);
    list = list.filter((a) => c.key(a) > 0).sort(c.cmp);
    list.forEach((a, i) => {
      a.rank = i > 0 && c.cmp(list[i - 1], a) === 0 ? list[i - 1].rank : i + 1;
      a.value = c.key(a);
    });
    return list;
  });
}

// ---------- public queries ----------

export interface LeaderboardQuery { metric?: string | null; period?: string | null; limit?: number | string | null; offset?: number | string | null }

export function parseLeaderboardQuery(q: LeaderboardQuery) {
  const metric = (q.metric || 'survival') as Metric;
  const period = (q.period || 'week') as Period;
  if (!METRICS.includes(metric)) throw new ApiError(400, 'invalid_param', `metric must be one of ${METRICS.join(', ')}`, 'metric');
  if (!PERIODS.includes(period)) throw new ApiError(400, 'invalid_param', `period must be one of ${PERIODS.join(', ')}`, 'period');
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
  const offset = Math.max(0, Number(q.offset) || 0);
  return { metric, period, limit, offset };
}

export function leaderboard(s: Snapshot, query: LeaderboardQuery, now: number): Leaderboard {
  const q = parseLeaderboardQuery(query);
  const period: Period = q.metric === 'streak' ? 'all' : q.period;
  const from = startOf(period, now);
  const list = ranked(s, q.metric, from, Infinity, now);
  let prev: Map<number, number> | null = null;
  if (period !== 'all') {
    prev = new Map();
    for (const a of ranked(s, q.metric, startOf(period, from - 1), from, now)) prev.set(a.p, a.rank);
  }
  return {
    metric: q.metric,
    period: q.period,
    range: { from: isoOrNull(from), to: iso(now) },
    generated_at: iso(now),
    total: list.length,
    entries: list.slice(q.offset, q.offset + q.limit).map((a) => {
      const pr = prev?.get(a.p);
      return {
        rank: a.rank,
        player: ref(s.players[a.p]),
        value: a.value,
        unit: UNIT[q.metric],
        delta_rank: pr ? pr - a.rank : null,
        best: waiRef(a.best),
        stats: { attempts: a.attempts, count: a.count, beautiful: a.beautiful, avg_score: round1(avg(a)), lv3: a.lv3 },
      };
    }),
  };
}

export function distribution(s: Snapshot): Distribution {
  return memo(s, 'dist', () => {
    const values: { handle: string; display_name: string; survival: number }[] = [];
    aggregate(s, -Infinity, Infinity).forEach((a) => {
      if (a.attempts >= MIN_ATTEMPTS) {
        const p = s.players[a.p];
        values.push({ handle: p.handle, display_name: p.display_name, survival: a.survival });
      }
    });
    values.sort((a, b) => a.survival - b.survival);
    const { mean, sd } = meanSd(values.map((v) => v.survival));
    return { n: values.length, mean, sd, min_attempts: MIN_ATTEMPTS, values };
  });
}

function findPlayer(s: Snapshot, handle: string): number {
  const pi = s.byHandle.get(handle);
  if (pi === undefined) throw new ApiError(404, 'not_found', `no player @${handle}`);
  return pi;
}

export function survivalReport(s: Snapshot, handle: string): SurvivalReport {
  const pi = findPlayer(s, handle);
  return memo(s, `surv|${pi}`, () => {
    const a = aggregate(s, -Infinity, Infinity).get(pi);
    const dist = distribution(s);
    const attempts = a?.attempts ?? 0;
    const survival = a ? a.survival : 0;
    const eligible = attempts >= MIN_ATTEMPTS;
    const values = dist.values.map((v) => v.survival);
    let rank: number | null = null;
    if (eligible) rank = 1 + values.filter((v) => v > survival).length;
    return {
      handle,
      beautiful_threshold: BEAUTIFUL_SCORE,
      attempts,
      passed: a?.count ?? 0,
      beautiful: a?.beautiful ?? 0,
      beauty_rate: attempts ? Math.round(((a?.beautiful ?? 0) / attempts) * 1000) / 1000 : 0,
      lv3: a?.lv3 ?? 0,
      rage_quits: a?.rage ?? 0,
      survival,
      tier: tierOf(survival),
      eligible,
      attempts_needed: Math.max(0, MIN_ATTEMPTS - attempts),
      percentile: eligible ? percentileOf(survival, values) : null,
      z: eligible && dist.sd > 0 ? Math.round(((survival - dist.mean) / dist.sd) * 100) / 100 : null,
      rank,
      out_of: dist.n,
      distribution: dist,
    };
  });
}

export function hallOfFame(s: Snapshot, weeksQ: number | string | null | undefined, now: number): HallOfFame {
  const weeks = Math.min(52, Math.max(1, Number(weeksQ) || 12));
  return memo(s, `hof|${weeks}|${bkkDay(now)}`, () => {
    let best: WaiRow | null = null, hold: WaiRow | null = null, perfect: WaiRow | null = null;
    const dayCount = new Map<string, { p: number; n: number; t: number }>();
    const per = s.players.map(() => ({ lv3: [] as number[], forg: [] as number[], rage: [] as number[] }));
    for (const r of s.wais) {
      const c = per[r.p];
      if (r.passed) {
        if (better(r, best)) best = r;
        if (!hold || r.hold_ms > hold.hold_ms) hold = r;
        if (r.score === 100 && !perfect) perfect = r;
        if (r.level === 3) c.lv3.push(r.t);
        const k = `${r.p}:${bkkDay(r.t)}`;
        let dc = dayCount.get(k);
        if (!dc) dayCount.set(k, (dc = { p: r.p, n: 0, t: 0 }));
        dc.n++;
        dc.t = r.t;
      }
      if (r.forgave) c.forg.push(r.t);
      if (r.action === 'rage_quit') c.rage.push(r.t);
    }
    const topCount = (field: 'lv3' | 'forg' | 'rage') => {
      let win: { p: number; n: number; t: number } | null = null;
      per.forEach((c, p) => {
        const n = c[field].length, t = c[field][n - 1];
        if (n && (!win || n > win.n || (n === win.n && t < win.t))) win = { p, n, t };
      });
      return win as { p: number; n: number; t: number } | null;
    };
    let mostDay: { p: number; n: number; t: number } | null = null;
    dayCount.forEach((d) => { if (!mostDay || d.n > mostDay.n || (d.n === mostDay.n && d.t < mostDay.t)) mostDay = d; });
    let ls: { p: number; n: number; d: number } | null = null;
    streaks(s, now).forEach((st, p) => {
      if (st.best && (!ls || st.best > ls.n || (st.best === ls.n && st.bestEnd < ls.d))) ls = { p, n: st.best, d: st.bestEnd };
    });

    const rec = (key: string, title: string, value: number, unit: Unit, p: number, t: number | null, wai: WaiRow | null): HofRecord =>
      ({ key, title, value, unit, player: ref(s.players[p]), achieved_at: t === null ? null : iso(t), wai: waiRef(wai) });
    const records: HofRecord[] = [];
    const dist = distribution(s);
    const top = dist.values[dist.values.length - 1], bottom = dist.values[0];
    if (top) records.push(rec('last_human', 'มนุษย์คนสุดท้ายที่ AI ไว้ชีวิต', top.survival, 'percent', s.byHandle.get(top.handle)!, null, null));
    const b = best as WaiRow | null, h = hold as WaiRow | null, pf = perfect as WaiRow | null;
    const md = mostDay as { p: number; n: number; t: number } | null, st = ls as { p: number; n: number; d: number } | null;
    if (b) records.push(rec('best_score', 'ไหว้งามที่สุดตลอดกาล', b.score, 'score', b.p, b.t, b));
    if (h) records.push(rec('longest_hold', 'ค้างนานที่สุด', h.hold_ms, 'ms', h.p, h.t, h));
    if (md) records.push(rec('most_in_day', 'ขยันที่สุดในวันเดียว', md.n, 'wais', md.p, md.t, null));
    if (st) records.push(rec('longest_streak', 'ไหว้ติดต่อกันนานสุด', st.n, 'days', st.p, Math.min(now, st.d * DAY - BKK + DAY - 1), null));
    let w = topCount('lv3');
    if (w) records.push(rec('lv3_master', 'เซียนไหว้พระ', w.n, 'wais', w.p, w.t, null));
    if ((w = topCount('forg'))) records.push(rec('most_forgiven', 'งอนแล้วง้อเก่งสุด', w.n, 'wais', w.p, w.t, null));
    if (pf) records.push(rec('perfect_100', 'ไหว้ 100 คะแนนเต็มคนแรก', 100, 'score', pf.p, pf.t, pf));
    if ((w = topCount('rage'))) records.push(rec('most_rage', 'ขี้งอนแห่งปี (Shame)', w.n, 'rage_quits', w.p, w.t, null));
    if (bottom && bottom !== top) records.push(rec('first_target', 'เป้าหมายแรกของ AI (Shame)', bottom.survival, 'percent', s.byHandle.get(bottom.handle)!, null, null));

    const champions: Champion[] = [];
    const wk = startOf('week', now);
    for (let i = 0; i < weeks; i++) {
      const from = wk - i * 7 * DAY, to = i === 0 ? Infinity : from + 7 * DAY;
      const t1 = ranked(s, 'beauty', from, to, now)[0];
      if (!t1 || !t1.best) continue;
      champions.push({
        week: isoWeek(from + DAY), from: iso(from), to: iso(Math.min(to, now)), provisional: i === 0,
        player: ref(s.players[t1.p]), score: t1.best.score, level: t1.best.level,
      });
    }
    return { generated_at: iso(now), records, champions };
  });
}

export function stats(s: Snapshot, periodQ: string | null | undefined, now: number): Stats {
  const period = (periodQ || 'day') as Period;
  if (period === 'all' || !PERIODS.includes(period)) throw new ApiError(400, 'invalid_param', 'period must be day, week or month', 'period');
  const from = startOf(period, now), pFrom = startOf(period, from - 1);
  const sum = (a: number, b: number): StatsBlock => {
    let wais = 0, passed = 0, beautiful = 0, total = 0, lv3 = 0, rage = 0;
    const active = new Set<number>();
    for (let i = lower(s, a), e = lower(s, b); i < e; i++) {
      const r = s.wais[i];
      wais++;
      active.add(r.p);
      if (r.passed) {
        passed++;
        total += r.score;
        if (r.level === 3) lv3++;
        if (r.score >= BEAUTIFUL_SCORE) beautiful++;
      }
      if (r.action === 'rage_quit') rage++;
    }
    return { wais, passed, beautiful, avg_score: passed ? round1(total / passed) : 0, lv3, rage_quits: rage, active_players: active.size };
  };
  // prev = same elapsed time in the previous window, so a half-day isn't compared with a full one
  return { period, ...sum(from, Infinity), prev: sum(pFrom, pFrom + (now - from)) };
}

export function feedItem(s: Snapshot, r: WaiRow): FeedItem {
  return {
    id: r.id, player: ref(s.players[r.p]), level: r.level, score: r.score, hold_ms: r.hold_ms, passed: r.passed,
    beautiful: isBeautiful(r), action: r.action, forgave: r.forgave, source: r.source, kind: r.kind, created_at: iso(r.t),
  };
}

export function feed(s: Snapshot, q: { limit?: number | string | null; before?: string | null; after?: string | null }) {
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
  const end = q.before ? lower(s, Date.parse(q.before)) : s.wais.length;
  const stop = q.after ? lower(s, Date.parse(q.after) + 1) : 0;
  const items: FeedItem[] = [];
  for (let i = end - 1; i >= stop && items.length < limit; i--) items.push(feedItem(s, s.wais[i]));
  return { items };
}

export function profile(s: Snapshot, handle: string, now: number): PlayerProfile {
  const pi = findPlayer(s, handle);
  return memo(s, `player|${pi}|${bkkDay(now)}`, () => {
    const list = s.byPlayer[pi];
    const t = { attempts: 0, passed: 0, beautiful: 0, sum: 0, lv3: 0, rage: 0, forg: 0 };
    let best: WaiRow | null = null;
    const levels: [number, number, number, number] = [0, 0, 0, 0];
    const today = bkkDay(now), daily = new Array<number>(14).fill(0);
    for (const r of list) {
      t.attempts++;
      levels[r.level]++; // all attempts: Lv0 can never pass
      if (r.passed) {
        t.passed++;
        t.sum += r.score;
        if (r.level === 3) t.lv3++;
        if (r.score >= BEAUTIFUL_SCORE) t.beautiful++;
        if (better(r, best)) best = r;
        const k = today - bkkDay(r.t);
        if (k >= 0 && k < 14) daily[13 - k]++;
      }
      if (r.action === 'rage_quit') t.rage++;
      if (r.forgave) t.forg++;
    }
    const st = streaks(s, now)[pi];
    const b = best as WaiRow | null;
    const badges: string[] = [];
    if (t.lv3 >= 50) badges.push('lv3_master');
    if (st.best >= 30) badges.push('streak_30');
    else if (st.best >= 7) badges.push('streak_7');
    if (b && b.score === 100) badges.push('perfect');
    if (t.passed >= 100) badges.push('hundred');
    if (t.forg >= 1) badges.push('rage_survivor');
    if (t.passed >= 50 && t.rage === 0) badges.push('never_angry');
    const rankIn = (metric: Metric, period: Period) =>
      ranked(s, metric, startOf(period, now), Infinity, now).find((a) => a.p === pi)?.rank ?? null;
    const p = s.players[pi];
    return {
      player: { ...ref(p), created_at: iso(p.created_at) },
      totals: {
        attempts: t.attempts, passed: t.passed, beautiful: t.beautiful,
        pass_rate: t.attempts ? Math.round((t.passed / t.attempts) * 1000) / 1000 : 0,
        avg_score: t.passed ? round1(t.sum / t.passed) : 0, lv3: t.lv3, rage_quits: t.rage, forgives: t.forg,
      },
      best: waiRef(b),
      streak: { current: st.current, best: st.best },
      levels,
      daily: daily.map((n, k) => ({ day: dayStr(today - 13 + k), passed: n })),
      badges,
      ranks: { survival_all: rankIn('survival', 'all'), beauty_week: rankIn('beauty', 'week'), count_week: rankIn('count', 'week') },
      survival: survivalReport(s, handle),
    };
  });
}
