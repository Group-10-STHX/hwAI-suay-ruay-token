// node --test sdk/wai-sync.test.mjs — mock fetch, temp WAI_HOME, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createWaiSync } from './wai-sync.mjs';

const KEY = 'wai_sk_' + 'a'.repeat(48);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40)]);

function setup(config = {}, handler) {
  const home = mkdtempSync(join(tmpdir(), 'wai-sync-'));
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method, headers: init.headers, body: init.body });
    const r = handler ? handler(String(url), init, calls) : { status: 200, body: {} };
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status, headers: { 'content-type': 'application/json' } });
  };
  const sync = createWaiSync({
    home, fetch, bypass: false, logger: { warn() {} },
    config: { enabled: true, install_key: KEY, base_url: 'http://x/api/v1', handle: 'me', ...config },
  });
  const file = (name, bytes) => { const p = join(home, name); writeFileSync(p, bytes); return p; };
  return { home, calls, sync, file, done: () => { sync.stop(); rmSync(home, { recursive: true, force: true }); } };
}
const wai = (id) => ({ id, session_id: 's', source: 'claude_code', kind: 'prompt', passed: true, level: 3, score: 90, hold_ms: 1500, action: 'allow' });
const batchOk = (url, init) => url.endsWith('/wais/batch')
  ? { status: 200, body: { results: JSON.parse(init.body).items.map((i) => ({ id: i.id, status: 201 })) } }
  : { status: 200, body: { sticker_url: '/api/v1/stickers/x.png?v=1' } };

test('recordSticker is a no-op unless web.upload_stickers === true', () => {
  const t = setup({ upload_stickers: false });
  assert.equal(t.sync.recordSticker({ id: randomUUID(), path: t.file('a.png', PNG) }), false);
  assert.equal(existsSync(join(t.home, 'stickers-outbox.jsonl')), false);
  t.done();
});

test('recordSticker is a no-op under bypass and with bad input', () => {
  const home = mkdtempSync(join(tmpdir(), 'wai-sync-'));
  const s = createWaiSync({ home, bypass: true, config: { enabled: true, install_key: KEY, upload_stickers: true } });
  assert.equal(s.recordSticker({ id: randomUUID(), path: '/x.png' }), false);
  s.stop();
  const t = setup({ upload_stickers: true });
  assert.equal(t.sync.recordSticker({ id: 'nope', path: '/x.png' }), false);
  assert.equal(t.sync.recordSticker(), false);
  t.done();
});

test('queue stores only the path, uploads after the wai batch, sends PNG bytes with auth', async () => {
  const t = setup({ upload_stickers: true }, batchOk);
  const id = randomUUID();
  const p = t.file('s.png', PNG);
  assert.equal(t.sync.record(wai(id)), true);
  assert.equal(t.sync.recordSticker({ id, path: p }), true);
  const q = readFileSync(join(t.home, 'stickers-outbox.jsonl'), 'utf8');
  assert.ok(q.includes(p) && q.length < 400, 'only a path is queued');
  assert.equal(t.sync.status().stickers_queued, 1);
  const r = await t.sync.flush();
  assert.equal(r.stickers_sent, 1);
  const urls = t.calls.map((c) => c.url);
  assert.ok(urls[0].endsWith('/wais/batch'));
  assert.ok(urls[1].endsWith(`/wais/${id}/sticker`));
  assert.equal(t.calls[1].method, 'POST');
  assert.equal(t.calls[1].headers['content-type'], 'image/png');
  assert.equal(t.calls[1].headers.authorization, `Bearer ${KEY}`);
  assert.equal(t.sync.status().stickers_queued, 0);
  t.done();
});

test('sticker waits while its wai is still unsent (network down), then goes', async () => {
  let down = true;
  const t = setup({ upload_stickers: true }, (url, init) => { if (down) throw new Error('offline'); return batchOk(url, init); });
  const id = randomUUID();
  t.sync.record(wai(id));
  t.sync.recordSticker({ id, path: t.file('s.png', PNG) });
  await t.sync.flush();
  assert.equal(t.sync.status().stickers_queued, 1);
  assert.equal(t.calls.filter((c) => c.url.endsWith('/sticker')).length, 0);
  down = false;
  const r = await t.sync.flush();
  assert.equal(r.stickers_sent, 1);
  t.done();
});

test('404 (wai unknown) is retried a bounded number of times, then dropped', async () => {
  const t = setup({ upload_stickers: true }, (url) => (url.endsWith('/sticker') ? { status: 404, body: { error: { code: 'not_found' } } } : { status: 200, body: { results: [] } }));
  t.sync.recordSticker({ id: randomUUID(), path: t.file('s.png', PNG) });
  for (let i = 0; i < 7; i++) { await t.sync.flush(); assert.equal(t.sync.status().stickers_queued, 1, `kept after try ${i + 1}`); }
  await t.sync.flush();
  assert.equal(t.sync.status().stickers_queued, 0);
  t.done();
});

test('missing file is skipped silently; oversized file is never sent; 415 drops', async () => {
  const t = setup({ upload_stickers: true }, (url) => (url.endsWith('/sticker') ? { status: 415, body: {} } : { status: 200, body: { results: [] } }));
  t.sync.recordSticker({ id: randomUUID(), path: join(t.home, 'gone.png') });
  t.sync.recordSticker({ id: randomUUID(), path: t.file('big.png', Buffer.concat([PNG, Buffer.alloc(401 * 1024)])) });
  t.sync.recordSticker({ id: randomUUID(), path: t.file('bad.png', PNG) });
  await t.sync.flush();
  assert.equal(t.calls.filter((c) => c.url.endsWith('/sticker')).length, 1);
  assert.equal(t.sync.status().stickers_queued, 0);
  t.done();
});

test('429 keeps the queue and stops', async () => {
  const t = setup({ upload_stickers: true }, (url) => (url.endsWith('/sticker') ? { status: 429, body: {} } : { status: 200, body: { results: [] } }));
  t.sync.recordSticker({ id: randomUUID(), path: t.file('a.png', PNG) });
  t.sync.recordSticker({ id: randomUUID(), path: t.file('b.png', PNG) });
  await t.sync.flush();
  assert.equal(t.calls.filter((c) => c.url.endsWith('/sticker')).length, 1);
  assert.equal(t.sync.status().stickers_queued, 2);
  t.done();
});

test('turning upload_stickers off forgets the queue', async () => {
  const t = setup({ upload_stickers: true }, batchOk);
  t.sync.recordSticker({ id: randomUUID(), path: t.file('a.png', PNG) });
  const off = createWaiSync({ home: t.home, fetch: async () => new Response('{}'), bypass: false, config: { enabled: true, install_key: KEY, upload_stickers: false } });
  await off.flush();
  assert.equal(off.status().stickers_queued, 0);
  off.stop();
  t.done();
});

test('setAvatar sends the right mime and handles reset, bad file, never throws', async () => {
  const t = setup({}, () => ({ status: 200, body: { avatar_url: '/api/v1/avatars/x?v=1' } }));
  const r = await t.sync.setAvatar(t.file('f.jpg', JPG));
  assert.equal(r.ok, true);
  assert.equal(t.calls[0].method, 'PUT');
  assert.equal(t.calls[0].headers['content-type'], 'image/jpeg');
  assert.ok(t.calls[0].url.endsWith('/players/me/avatar'));
  assert.equal((await t.sync.setAvatar(null)).ok, true);
  assert.equal(t.calls[1].method, 'DELETE');
  assert.equal((await t.sync.setAvatar(t.file('t.txt', 'hello'))).ok, false);
  assert.equal((await t.sync.setAvatar(join(t.home, 'nope.png'))).ok, false);
  assert.equal((await t.sync.setAvatar(t.file('big.jpg', Buffer.concat([JPG, Buffer.alloc(251 * 1024)])))).ok, false);
  assert.equal(t.calls.length, 2);
  t.done();
});

test('setAvatarSource, purgeStickers and backfill', async () => {
  const known = randomUUID(), unknown = randomUUID();
  const t = setup({ upload_stickers: true }, (url) => {
    if (url.includes(unknown)) return { status: 404, body: {} };
    return { status: 200, body: { deleted: 3, sticker_url: 'u' } };
  });
  assert.equal((await t.sync.setAvatarSource('sticker')).ok, true);
  assert.deepEqual(JSON.parse(t.calls[0].body), { avatar_source: 'sticker' });
  assert.equal((await t.sync.setAvatarSource('bogus')).ok, false);
  assert.equal((await t.sync.purgeStickers()).deleted, 3);
  const dir = join(t.home, 'stk');
  mkdirSync(dir);
  writeFileSync(join(dir, `${known}.png`), PNG);
  writeFileSync(join(dir, `${unknown}.png`), PNG);
  writeFileSync(join(dir, 'notes.txt'), 'x');
  const r = await t.sync.backfillStickers(dir);
  assert.deepEqual({ u: r.uploaded, s: r.skipped, f: r.failed, n: r.files }, { u: 1, s: 1, f: 0, n: 2 });
  t.done();
});

test('status reports stickers_queued and upload_stickers', () => {
  const t = setup({ upload_stickers: true });
  const s = t.sync.status();
  assert.equal(s.upload_stickers, true);
  assert.equal(s.stickers_queued, 0);
  t.done();
});
