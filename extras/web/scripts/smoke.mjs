// End-to-end API check. Usage: npm run smoke [-- http://localhost:3000/api/v1]
// Registers a throwaway player, so run it against mock (WAI_DATA=mock) unless you mean it.
// Against a server started with WAI_BLOCK_MOCK=1 (/health mode real-only) it also runs the block-mock checks.
import { randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';

const BASE = (process.argv[2] || process.env.WAI_BASE || 'http://localhost:3000/api/v1').replace(/\/+$/, '');
let failed = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!cond) failed++; };
const get = async (p) => { const r = await fetch(BASE + p); return { status: r.status, body: await r.json() }; };
const post = async (p, body, key) => {
  const r = await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

const raw = async (method, p, bytes, ct, key) => {
  const r = await fetch(BASE + p, { method, headers: { ...(ct ? { 'content-type': ct } : {}), ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: bytes });
  const type = r.headers.get('content-type') || '';
  return { status: r.status, type, cache: r.headers.get('cache-control') || '', body: type.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) };
};
// Minimal valid PNG (solid colour, RGBA) of w x h. Dimensions are what the server inspects.
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const b = Buffer.concat([Buffer.from(t), d]); const o = Buffer.alloc(4); o.writeUInt32BE(d.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(b)); return Buffer.concat([o, b, c]); };
const png = (w, h, shade = 0) => {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 4, shade)]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array(h).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
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

// ---- stickers and avatars ----
const reg2 = await post('/players', { handle: 'smoke2_' + Math.random().toString(36).slice(2, 7), display_name: 'Smoke Two' });
const key2 = reg2.body.install_key;
const S = `/wais/${wai.id}/sticker`;
const png1 = png(8, 8, 10), png2 = png(8, 8, 200);
ok('sticker no auth → 401', (await raw('POST', S, png1, 'image/png')).status === 401);
ok('sticker bad key → 401', (await raw('POST', S, png1, 'image/png', 'wai_sk_' + '0'.repeat(48))).status === 401);
ok('sticker wrong content-type → 415', (await raw('POST', S, png1, 'text/plain', key)).status === 415);
ok('sticker not a PNG → 415', (await raw('POST', S, Buffer.from('definitely not a png, just text'), 'image/png', key)).status === 415);
ok('sticker JPEG labelled png → 415', (await raw('POST', S, Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.alloc(64)]), 'image/png', key)).status === 415);
ok('sticker > 400 KB → 413', (await raw('POST', S, Buffer.concat([png1, Buffer.alloc(401 * 1024)]), 'image/png', key)).status === 413);
ok('sticker 2000x2000 → 400', (await raw('POST', S, png(2000, 2000), 'image/png', key)).status === 400);
ok('sticker unknown wai → 404', (await raw('POST', `/wais/${randomUUID()}/sticker`, png1, 'image/png', key)).status === 404);
ok('sticker for another player’s wai → 404', (await raw('POST', S, png1, 'image/png', key2)).status === 404);
const st1 = await raw('POST', S, png1, 'image/png', key);
ok('sticker happy path → 200 sticker_url', st1.status === 200 && /^\/api\/v1\/stickers\/[0-9a-f-]{36}\.png/.test(st1.body.sticker_url || ''), st1.body.sticker_url);
const g1 = await raw('GET', `/stickers/${wai.id}.png`);
ok('GET sticker public: png, cache-control max-age=3600', g1.status === 200 && g1.type === 'image/png' && /max-age=3600/.test(g1.cache) && g1.body.equals(png1), g1.cache);
const st2 = await raw('POST', S, png2, 'image/png', key);
const g2 = await raw('GET', `/stickers/${wai.id}.png`);
ok('sticker replace is idempotent and replaces', st2.status === 200 && g2.body.equals(png2) && st2.body.sticker_url !== st1.body.sticker_url);
let pr2 = await get(`/players/${handle}`);
ok('profile lists the sticker; avatar defaults to sticker', pr2.body.stickers?.length === 1 && pr2.body.stickers[0].wai_id === wai.id && pr2.body.player.avatar_kind === 'sticker' && !!pr2.body.player.avatar_url, `kind=${pr2.body.player.avatar_kind}`);
ok('profile best wai carries sticker_url', pr2.body.best?.sticker_url === pr2.body.stickers[0].url);
const lbS = await get('/leaderboard?metric=count&period=all&limit=100');
const mine = lbS.body.entries.find((e) => e.player.handle === handle);
ok('leaderboard entry has sticker_url + avatar_url', !!mine?.sticker_url && mine.player.avatar_kind === 'sticker');
ok('POST /wais with a sticker field is still a 400', (await post('/wais', { ...wai, id: randomUUID(), sticker: 'x' }, key)).status === 400);
// avatar
ok('avatar no auth → 401', (await raw('PUT', '/players/me/avatar', png1, 'image/png')).status === 401);
ok('avatar wrong type → 415', (await raw('PUT', '/players/me/avatar', png1, 'image/gif', key)).status === 415);
ok('avatar bytes ≠ content-type → 415', (await raw('PUT', '/players/me/avatar', png1, 'image/jpeg', key)).status === 415);
ok('avatar > 250 KB → 413', (await raw('PUT', '/players/me/avatar', Buffer.concat([png1, Buffer.alloc(251 * 1024)]), 'image/png', key)).status === 413);
const av = await raw('PUT', '/players/me/avatar', png(16, 16, 90), 'image/png', key);
ok('avatar PNG → 200 avatar_url kind photo', av.status === 200 && /\/avatars\//.test(av.body.avatar_url || '') && av.body.avatar_kind === 'photo');
const ga = await raw('GET', `/avatars/${reg.body.player.id}`);
ok('GET avatar public', ga.status === 200 && ga.type === 'image/png' && /max-age=3600/.test(ga.cache));
ok('avatar_source photo beats sticker', (await get(`/players/${handle}`)).body.player.avatar_kind === 'photo');
ok('profile unknown field → 400', (await raw('PUT', '/players/me/profile', JSON.stringify({ avatar_source: 'sticker', x: 1 }), 'application/json', key)).status === 400);
ok('profile bad source → 400', (await raw('PUT', '/players/me/profile', JSON.stringify({ avatar_source: 'nope' }), 'application/json', key)).status === 400);
const ps = await raw('PUT', '/players/me/profile', JSON.stringify({ avatar_source: 'sticker' }), 'application/json', key);
ok('avatar_source sticker → kind sticker', ps.status === 200 && ps.body.player.avatar_kind === 'sticker');
const dv = await raw('DELETE', '/players/me/avatar', undefined, undefined, key);
ok('DELETE avatar → generated, photo gone', dv.status === 200 && dv.body.avatar_url === null && (await raw('GET', `/avatars/${reg.body.player.id}`)).status === 404);
// privacy
ok('DELETE sticker no auth → 401', (await raw('DELETE', S)).status === 401);
const ds = await raw('DELETE', S, undefined, undefined, key);
ok('DELETE sticker → deleted, GET 404', ds.status === 200 && ds.body.deleted === true && (await raw('GET', `/stickers/${wai.id}.png`)).status === 404);
await raw('POST', S, png1, 'image/png', key);
await raw('POST', `/wais/${items[0].id}/sticker`, png2, 'image/png', key);
const da = await raw('DELETE', '/players/me/stickers', undefined, undefined, key);
ok('DELETE all my stickers', da.status === 200 && da.body.deleted === 2 && (await get(`/players/${handle}`)).body.stickers.length === 0, `deleted=${da.body.deleted}`);
ok('after delete the avatar falls back to generated', (await get(`/players/${handle}`)).body.player.avatar_kind === 'generated');

if (!realOnly) {
  const big = await get('/leaderboard?metric=count&period=all&limit=100');
  const sim = big.body.entries.find((e) => e.sticker_url?.endsWith('.svg'));
  ok('simulation: simulated players have cartoon stickers', !!sim && sim.best?.sticker_simulated !== undefined, sim?.sticker_url);
  if (sim) {
    const gs = await raw('GET', sim.sticker_url.replace('/api/v1', ''));
    ok('simulated sticker is an SVG, not a photo', gs.status === 200 && gs.type.includes('svg'));
  }
  ok('simulated players keep generated avatars', big.body.entries.filter((e) => e.player.handle !== handle).every((e) => e.player.avatar_kind === 'generated' && e.player.avatar_url === null));
}

if (realOnly) {
  const everything = JSON.stringify([(await get('/leaderboard?metric=count&period=all&limit=100')).body, (await get('/hall-of-fame')).body, (await get('/feed?limit=50')).body]);
  ok('real-only: no simulated stickers anywhere', !/\.svg|"sticker_simulated":true/.test(everything));
}

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
  ok('real-only: health shows exactly 2 players (smoke + smoke2)', h2.body.players === 2 && h2.body.mode === 'real-only');
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
