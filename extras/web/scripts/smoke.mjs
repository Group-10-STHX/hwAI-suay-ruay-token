// End-to-end API check. Usage: npm run smoke [-- http://localhost:3000/api/v1]
// Registers a throwaway player, so run it against mock (WAI_DATA=mock) unless you mean it.
// Against a server started with WAI_BLOCK_MOCK=1 (/health mode real-only) it also runs the block-mock checks.
import { randomUUID } from 'node:crypto';

const BASE = (process.argv[2] || process.env.WAI_BASE || 'http://localhost:3000/api/v1').replace(/\/+$/, '');
let failed = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!cond) failed++; };
const get = async (p) => { const r = await fetch(BASE + p); return { status: r.status, body: await r.json() }; };
const post = async (p, body, key) => {
  const r = await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

const h = await get('/health');
ok('health', h.status === 200 && h.body.ok, `store=${h.body.store} mode=${h.body.mode} wais=${h.body.wais}`);
// Block-mock checks run automatically when the server reports real-only (start it with WAI_BLOCK_MOCK=1).
const realOnly = h.body.mode === 'real-only';
ok('health mode is valid', ['simulation', 'real-only', 'supabase'].includes(h.body.mode));
if (realOnly) {
  ok('real-only: 0 players and 0 wais at start', h.body.players === 0 && h.body.wais === 0, `players=${h.body.players} wais=${h.body.wais}`);
  ok('real-only: seeded handle nong_dot → 404', (await get('/players/nong_dot')).status === 404);
}
for (const m of ['survival', 'beauty', 'count', 'lv3', 'streak', 'shame']) {
  const r = await get(`/leaderboard?metric=${m}&period=week&limit=5`);
  ok(`leaderboard ${m}`, r.status === 200 && Array.isArray(r.body.entries) && r.body.metric === m, `total=${r.body.total}`);
}
ok('leaderboard bad metric → 400', (await get('/leaderboard?metric=nope')).status === 400);
const hof = await get('/hall-of-fame');
ok('hall-of-fame', hof.status === 200 && Array.isArray(hof.body.records) && Array.isArray(hof.body.champions), `records=${hof.body.records?.length}`);
const st = await get('/stats?period=day');
ok('stats', st.status === 200 && typeof st.body.prev?.wais === 'number');
const dist = await get('/survival/distribution');
ok('distribution', dist.status === 200 && dist.body.n === dist.body.values.length, `n=${dist.body.n} μ=${dist.body.mean} σ=${dist.body.sd}`);
const fd = await get('/feed?limit=5');
ok('feed', fd.status === 200 && fd.body.items.length <= 5);
ok('unknown player → 404', (await get('/players/__nobody__')).status === 404);

const handle = 'smoke_' + Math.random().toString(36).slice(2, 8);
const reg = await post('/players', { handle, display_name: 'Smoke ทดสอบ' });
ok('register', reg.status === 201 && /^wai_sk_[0-9a-f]{48}$/.test(reg.body.install_key || ''), handle);
const key = reg.body.install_key;
ok('register duplicate → 409', (await post('/players', { handle, display_name: 'x' })).status === 409);
const wai = { id: randomUUID(), session_id: 's_smoke', source: 'claude_code', kind: 'prompt', level: 3, score: 91, hold_ms: 1500, passed: true, action: 'allow', forgave: false, anger: 0, client_ts: new Date().toISOString() };
ok('POST /wais no auth → 401', (await post('/wais', wai)).status === 401);
const w1 = await post('/wais', wai, key);
ok('POST /wais → 201', w1.status === 201, w1.body.created_at);
const w2 = await post('/wais', wai, key);
ok('replay → 200 same created_at', w2.status === 200 && w2.body.created_at === w1.body.created_at);
ok('same id, different body → 409', (await post('/wais', { ...wai, score: 10, passed: false, action: 'retry' }, key)).status === 409);
ok('unknown field → 400', (await post('/wais', { ...wai, id: randomUUID(), agent_label: 'x' }, key)).status === 400);
ok('passed with hold < 1000 → 400', (await post('/wais', { ...wai, id: randomUUID(), hold_ms: 300 }, key)).status === 400);
const items = Array.from({ length: 9 }, (_, i) => ({ ...wai, id: randomUUID(), score: 70 + i }));
const b = await post('/wais/batch', { items: [...items, { id: 'bad' }] }, key);
ok('batch', b.status === 200 && b.body.results.filter((r) => r.status === 201).length === 9 && b.body.results[9].status === 400);
const sv = await get(`/players/${handle}/survival`);
ok('survival report', sv.status === 200 && sv.body.attempts === 10 && sv.body.eligible, `survival=${sv.body.survival}% P${sv.body.percentile} tier=${sv.body.tier?.key}`);
const pr = await get(`/players/${handle}`);
ok('profile', pr.status === 200 && pr.body.totals.attempts === 10 && pr.body.survival.handle === handle);

if (realOnly) {
  const lb = await get('/leaderboard?metric=count&period=all&limit=50');
  ok('real-only: leaderboard has only the smoke player', lb.body.total === 1 && lb.body.entries.length === 1 && lb.body.entries[0].player.handle === handle, `total=${lb.body.total}`);
  const f = await get('/feed?limit=50');
  ok('real-only: feed has only the smoke player', f.body.items.length > 0 && f.body.items.every((i) => i.player.handle === handle), `items=${f.body.items.length}`);
  const hf = await get('/hall-of-fame');
  const hfh = JSON.stringify(hf.body).match(/"handle":"[^"]*"/g) || [];
  ok('real-only: hall of fame has only the smoke player', hfh.every((x) => x === `"handle":"${handle}"`), `refs=${hfh.length}`);
  ok('real-only: seeded handle still 404 after writes', (await get('/players/nong_dot')).status === 404);
  const h2 = await get('/health');
  ok('real-only: health shows exactly 1 player', h2.body.players === 1 && h2.body.mode === 'real-only');
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
