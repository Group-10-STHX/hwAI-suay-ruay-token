import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createAvatars, handleAvatarRoute, MAX_BYTES } from '../avatars.mjs';

const PNG = Buffer.from('89504e470d0a1a0a0000', 'hex');
const quiet = { warn() {} };

function setup() {
  const home = mkdtempSync(join(tmpdir(), 'avatars-'));
  const put = (name, file, data = PNG) => {
    mkdirSync(join(home, 'avatars', name), { recursive: true });
    writeFileSync(join(home, 'avatars', name, file), data);
  };
  return { home, put, av: () => createAvatars({ home, logger: quiet }) };
}

test('list: builtin first, valid names only, partial moods', () => {
  const { put, av } = setup();
  put('bob', 'angry.png');
  put('bob', 'confused.png');
  put('Bad Name', 'angry.png');
  put('empty', 'readme.txt');
  put('jason', 'angry.png');
  const items = av().list();
  assert.deepEqual(items.map((i) => i.name), ['jason', 'bob']);
  assert.equal(items[0].kind, 'builtin');
  assert.deepEqual(items[1].moods, ['angry', 'confused']);
});

test('resolveFile fallbacks: mood -> default -> confused -> any', () => {
  const { put, av } = setup();
  put('r', 'default.png');
  put('b', 'confused.png');
  put('c', 'sad.png');
  const a = av();
  assert.match(a.resolveFile('r', 'angry'), /r\/default\.png$/);
  assert.match(a.resolveFile('b', 'angry'), /b\/confused\.png$/);
  assert.match(a.resolveFile('c', 'angry'), /c\/sad\.png$/);
  assert.equal(a.resolveFile('c', 'sad').endsWith('c/sad.png'), true);
  assert.equal(a.resolveFile('nope', 'sad'), null);
  assert.equal(a.resolveFile('jason', 'sad'), null);
});

test('safe paths: traversal, symlink escape, size cap, bad extension', () => {
  const { home, put, av } = setup();
  put('big', 'angry.png', Buffer.alloc(MAX_BYTES + 1));
  put('ext', 'angry.svg', Buffer.from('<svg/>'));
  const outside = mkdtempSync(join(tmpdir(), 'outside-'));
  writeFileSync(join(outside, 'secret.png'), PNG);
  mkdirSync(join(home, 'avatars', 'sl'), { recursive: true });
  symlinkSync(join(outside, 'secret.png'), join(home, 'avatars', 'sl', 'angry.png'));
  symlinkSync(outside, join(home, 'avatars', 'linkdir'));
  const a = av();
  assert.equal(a.resolveFile('big', 'angry'), null);
  assert.equal(a.resolveFile('ext', 'angry'), null);
  assert.equal(a.resolveFile('sl', 'angry'), null);
  assert.equal(a.resolveFile('linkdir', 'secret'), null);
  assert.equal(a.resolveFile('../x', 'angry'), null);
  assert.equal(a.resolveFile('bob', '../../etc/passwd'), null);
  assert.deepEqual(a.list().map((i) => i.name), ['jason']);
});

test('current persists, merges config, does not clobber on parse error', () => {
  const { home, put, av } = setup();
  put('bob', 'angry.png');
  writeFileSync(join(home, 'config.json'), JSON.stringify({ onboarded: true }));
  const a = av();
  assert.equal(a.current(), 'jason');
  assert.equal(a.setCurrent('nope'), false);
  assert.equal(a.setCurrent('bob'), true);
  assert.deepEqual(JSON.parse(readFileSync(join(home, 'config.json'), 'utf8')), { onboarded: true, avatar: 'bob' });
  assert.equal(av().current(), 'bob');
  writeFileSync(join(home, 'config.json'), '{broken');
  assert.equal(a.setCurrent('jason'), false);
  assert.equal(readFileSync(join(home, 'config.json'), 'utf8'), '{broken');
  assert.equal(a.current(), 'jason');
});

test('current falls back to jason when avatar was removed', () => {
  const { home, av } = setup();
  writeFileSync(join(home, 'config.json'), JSON.stringify({ avatar: 'gone' }));
  assert.equal(av().current(), 'jason');
});

async function withServer(a, fn) {
  const server = createServer((req, res) => {
    if (!handleAvatarRoute(req, res, { avatars: a })) {
      res.writeHead(418);
      res.end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

test('routes', async () => {
  const { put, av } = setup();
  put('bob', 'angry.png');
  put('bob', 'confused.png');
  const a = av();
  await withServer(a, async (base) => {
    let r = await fetch(`${base}/wai/avatars`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('access-control-allow-origin'), '*');
    let j = await r.json();
    assert.equal(j.current, 'jason');
    assert.deepEqual(j.items.map((i) => i.name), ['jason', 'bob']);

    r = await fetch(`${base}/wai/avatar`, { method: 'POST', body: JSON.stringify({ name: 'bob' }) });
    assert.deepEqual(await r.json(), { current: 'bob' });
    r = await fetch(`${base}/wai/avatar`, { method: 'POST', body: JSON.stringify({ name: 'zzz' }) });
    assert.equal(r.status, 404);
    r = await fetch(`${base}/wai/avatar`, { method: 'POST', body: JSON.stringify({ name: '../x' }) });
    assert.equal(r.status, 400);
    r = await fetch(`${base}/wai/avatar`, { method: 'POST', body: '{nope' });
    assert.equal(r.status, 400);

    r = await fetch(`${base}/wai/avatar/bob/sad.png`); // falls back to confused.png
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'image/png');
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(r.headers.get('access-control-allow-origin'), '*');
    assert.deepEqual(Buffer.from(await r.arrayBuffer()), PNG);
    r = await fetch(`${base}/wai/avatar/bob/evil.png`);
    assert.equal(r.status, 400);
    r = await fetch(`${base}/wai/avatar/nobody/sad.png`);
    assert.equal(r.status, 404);
    r = await fetch(`${base}/wai/avatar/jason/sad.png`);
    assert.equal(r.status, 404);
    r = await fetch(`${base}/wai/queue`);
    assert.equal(r.status, 418);
    r = await fetch(`${base}/wai/avatars`, { method: 'OPTIONS' });
    assert.equal(r.status, 204);
  });
});
