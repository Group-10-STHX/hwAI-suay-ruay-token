import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVoiceAdmin, validateWav, MAX_BYTES, STATIC_FILES } from '../voice-admin.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const REAL_ADMIN_DIR = join(here, '..', '..', '..', 'voice', 'admin');

function wav({ rate = 24000, channels = 1, bits = 16, format = 1, samples = 2400, header = true } = {}) {
  const data = Buffer.alloc(samples * (bits / 8) * channels, 1);
  const h = Buffer.alloc(44);
  h.write(header ? 'RIFF' : 'RIFX', 0, 'latin1'); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8, 'latin1');
  h.write('fmt ', 12, 'latin1'); h.writeUInt32LE(16, 16); h.writeUInt16LE(format, 20); h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * channels * (bits / 8), 28); h.writeUInt16LE(channels * (bits / 8), 32); h.writeUInt16LE(bits, 34);
  h.write('data', 36, 'latin1'); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

const ENTRIES = [
  { id: 'copy-speech-DEMANDING', text: 'a', plainText: 'มนุษย์ ไหว้กูซะ', kind: 'speech', state: 'DEMANDING', recorder: 1 },
  { id: 'copy-speech-WATCHING', text: 'a', plainText: 'มนุษย์ ไหว้กูซะ', kind: 'speech', state: 'WATCHING', recorder: 1, dupOf: 'copy-speech-DEMANDING' },
  { id: 'p1-demanding-1', text: 'b', plainText: 'ไหว้มาเดี๋ยวนี้', kind: 'persona-line', state: 'DEMANDING', persona: 'p1', recorder: 2 },
  { id: 'p1-retry-1', text: 'c', plainText: 'ทำใหม่', kind: 'persona-line', state: 'RETRY', persona: 'p1', recorder: 2 },
];

let home, server, base, played, adminDir;
const H = { 'X-Wai-Admin': '1' };

before(async () => {
  home = mkdtempSync(join(tmpdir(), 'vadmin-home-'));
  adminDir = mkdtempSync(join(tmpdir(), 'vadmin-ui-'));
  writeFileSync(join(adminDir, 'index.html'), '<html>idx</html>');
  writeFileSync(join(adminDir, 'admin.js'), 'x=1');
  writeFileSync(join(adminDir, 'admin.css'), 'a{}');
  writeFileSync(join(adminDir, 'secret.txt'), 'nope');
  const dataDir = mkdtempSync(join(tmpdir(), 'vadmin-data-'));
  const linesFile = join(dataDir, 'lines.all.json');
  writeFileSync(linesFile, JSON.stringify({ entries: ENTRIES }));
  writeFileSync(join(dataDir, 'personas.json'), JSON.stringify({ personas: [{ id: 'p1', name: 'ผู้คุมโหด' }] }));
  played = [];
  let modeNow = 'human';
  const admin = createVoiceAdmin({ home, linesFile, adminDir, play: (f) => { played.push(f); }, now: () => 1234, log: () => {}, getMode: () => modeNow, setMode: (m) => (modeNow = m) });
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (!(await admin.handle(req, res, url))) { res.writeHead(404); res.end('other'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); rmSync(home, { recursive: true, force: true }); });

const post = (path, body, headers = H) => fetch(base + path, { method: 'POST', headers, body });
const recFile = (...p) => join(home, 'voice', 'recordings', ...p);

test('validateWav: good, header, stereo, rate, 8-bit, too long, too big', () => {
  assert.equal(validateWav(wav()).ok, true);
  assert.equal(validateWav(wav()).durationMs, 100);
  assert.equal(validateWav(wav({ header: false })).code, 'bad_header');
  assert.equal(validateWav(wav({ channels: 2 })).code, 'not_mono');
  assert.equal(validateWav(wav({ rate: 4000 })).code, 'bad_rate');
  assert.equal(validateWav(wav({ rate: 96000 })).code, 'bad_rate');
  assert.equal(validateWav(wav({ bits: 8 })).code, 'not_16bit');
  assert.equal(validateWav(wav({ format: 3 })).code, 'not_pcm');
  assert.equal(validateWav(wav({ samples: 24000 * 21 })).code, 'too_long');
  assert.equal(validateWav(Buffer.alloc(MAX_BYTES + 1)).code, 'too_big');
  assert.equal(validateWav(Buffer.from('hello')).ok, false);
});

test('static: index, assets, whitelist, traversal', async () => {
  for (const p of ['/admin/voice', '/admin/voice/']) {
    const r = await fetch(base + p);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.equal(await r.text(), '<html>idx</html>');
  }
  const js = await fetch(base + '/admin/voice/admin.js');
  assert.match(js.headers.get('content-type'), /javascript/);
  assert.match((await fetch(base + '/admin/voice/admin.css')).headers.get('content-type'), /text\/css/);
  for (const p of ['/admin/voice/secret.txt', '/admin/voice/..%2Fsecret.txt', '/admin/voice/../index.html', '/admin/voice/%2e%2e/x', '/admin/voice/sub/admin.js']) {
    assert.equal((await fetch(base + p)).status, 404, p);
  }
  assert.equal((await fetch(base + '/something/else')).status, 404); // handle returned false -> falls through
});

test('the real admin page references only files that exist and is whitelisted', () => {
  const html = readFileSync(join(REAL_ADMIN_DIR, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^https?:/.test(u));
  assert.ok(refs.length >= 2);
  for (const r of refs) {
    if (r === '/admin/voice') continue; // ลิงก์กลับหน้าเลือกตัวละคร (ไม่ใช่ไฟล์)
    const file = r.replace(/^\/admin\/voice\//, '');
    assert.ok(existsSync(join(REAL_ADMIN_DIR, file)), r);
    assert.ok(Object.hasOwn(STATIC_FILES, file), `${r} not whitelisted`);
  }
  assert.ok(existsSync(join(REAL_ADMIN_DIR, 'characters.json')) && Object.hasOwn(STATIC_FILES, 'characters.json'));
});

test('lines: empty status from temp home, people and progress', async () => {
  const r = await fetch(base + '/wai/voice/lines');
  const j = await r.json();
  assert.equal(j.entries.length, 4);
  assert.ok(j.entries.every((e) => e.status.recorded === false));
  assert.deepEqual(j.progress, { total: 3, recorded: 0 }); // alias not counted
  assert.deepEqual(j.people[1], { total: 1, recorded: 0 });
  assert.deepEqual(j.people[2], { total: 2, recorded: 0 });
  assert.equal(j.personas[0].name, 'ผู้คุมโหด');
});

test('non-GET without X-Wai-Admin is 403 and writes nothing', async () => {
  const r = await post('/wai/voice/recording?id=p1-retry-1', wav(), {});
  assert.equal(r.status, 403);
  assert.equal(existsSync(recFile('p1', 'p1-retry-1.wav')), false);
  assert.equal((await fetch(base + '/wai/voice/recording?id=p1-retry-1', { method: 'DELETE' })).status, 403);
  assert.equal((await fetch(base + '/wai/voice/play?id=p1-retry-1', { method: 'POST' })).status, 403);
});

test('bad host header is rejected (DNS rebinding)', async () => {
  const status = await new Promise((resolve, reject) => {
    const u = new URL(base);
    const q = http.request({ host: u.hostname, port: u.port, path: '/wai/voice/lines', headers: { Host: 'evil.example:7777' } }, (res) => { res.resume(); resolve(res.statusCode); });
    q.on('error', reject); q.end();
  });
  assert.equal(status, 403);
});

test('id validation and path safety', async () => {
  const bad = ['../x', '..%2F..%2Fetc%2Fpasswd', 'p1-retry-1/../../x', 'p1-retry-1%00', 'a'.repeat(81), 'with space', ''];
  for (const id of bad) {
    const r = await post(`/wai/voice/recording?id=${id}`, wav());
    assert.equal(r.status, 400, id);
  }
  // well-formed but not in the list
  assert.equal((await post('/wai/voice/recording?id=not-in-list', wav())).status, 404);
  assert.equal((await post('/wai/voice/recording?id=P1-RETRY-1', wav())).status, 404); // exact match only
  const stray = readdirSync(home, { recursive: true });
  assert.equal(stray.filter((f) => f.endsWith('.wav')).length, 0);
});

test('bad wav bodies are rejected without writing', async () => {
  assert.equal((await post('/wai/voice/recording?id=p1-retry-1', Buffer.from('not a wav at all, definitely not'))).status, 400);
  assert.equal((await post('/wai/voice/recording?id=p1-retry-1', wav({ channels: 2 }))).status, 400);
  assert.equal((await post('/wai/voice/recording?id=p1-retry-1', wav({ samples: 24000 * 21 }))).status, 400);
  assert.equal((await post('/wai/voice/recording?id=p1-retry-1', Buffer.alloc(MAX_BYTES + 10, 0))).status, 413);
  assert.equal(existsSync(recFile('p1', 'p1-retry-1.wav')), false);
});

test('upload: atomic write under persona folder, status, stream, alias copy, play', async () => {
  const good = wav({ samples: 24000 });
  let r = await post('/wai/voice/recording?id=p1-demanding-1', good);
  assert.equal(r.status, 200);
  let j = await r.json();
  assert.equal(j.status.recorded, true);
  assert.equal(j.status.bytes, good.length);
  assert.equal(j.status.durationMs, 1000);
  assert.deepEqual(readFileSync(recFile('p1', 'p1-demanding-1.wav')), good);
  assert.deepEqual(readdirSync(recFile('p1')).filter((f) => f.endsWith('.tmp')), []);

  // app entries go to _app, and the duplicate-text alias gets the same file
  r = await post('/wai/voice/recording?id=copy-speech-DEMANDING', good);
  assert.equal(r.status, 200);
  assert.deepEqual(readFileSync(recFile('_app', 'copy-speech-DEMANDING.wav')), good);
  assert.deepEqual(readFileSync(recFile('_app', 'copy-speech-WATCHING.wav')), good);

  const lines = await (await fetch(base + '/wai/voice/lines')).json();
  assert.equal(lines.progress.recorded, 2);
  assert.equal(lines.entries.find((e) => e.id === 'copy-speech-WATCHING').status.recorded, true);
  assert.equal(lines.entries.find((e) => e.id === 'p1-retry-1').status.recorded, false);

  const got = await fetch(base + '/wai/voice/recording?id=p1-demanding-1');
  assert.equal(got.headers.get('content-type'), 'audio/wav');
  assert.deepEqual(Buffer.from(await got.arrayBuffer()), good);
  assert.equal((await fetch(base + '/wai/voice/recording?id=p1-retry-1')).status, 404);

  assert.equal((await post('/wai/voice/play?id=p1-retry-1', undefined)).status, 404);
  assert.equal((await post('/wai/voice/play?id=p1-demanding-1', undefined)).status, 200);
  assert.deepEqual(played, [recFile('p1', 'p1-demanding-1.wav')]);
});

test('delete removes only the target (and its alias copy)', async () => {
  await post('/wai/voice/recording?id=p1-retry-1', wav());
  assert.equal(existsSync(recFile('p1', 'p1-retry-1.wav')), true);
  const r = await fetch(base + '/wai/voice/recording?id=p1-demanding-1', { method: 'DELETE', headers: H });
  assert.equal(r.status, 200);
  assert.equal(existsSync(recFile('p1', 'p1-demanding-1.wav')), false);
  assert.equal(existsSync(recFile('p1', 'p1-retry-1.wav')), true); // sibling untouched
  assert.equal(existsSync(recFile('_app', 'copy-speech-DEMANDING.wav')), true); // other group untouched
  // deleting via the alias id removes the canonical + alias pair only
  assert.equal((await fetch(base + '/wai/voice/recording?id=copy-speech-WATCHING', { method: 'DELETE', headers: H })).status, 200);
  assert.equal(existsSync(recFile('_app', 'copy-speech-DEMANDING.wav')), false);
  assert.equal(existsSync(recFile('_app', 'copy-speech-WATCHING.wav')), false);
  assert.equal(existsSync(recFile('p1', 'p1-retry-1.wav')), true);
  assert.equal((await fetch(base + '/wai/voice/recording?id=..%2F..%2Fx', { method: 'DELETE', headers: H })).status, 400);
});

test('OPTIONS answers without CORS grants', async () => {
  const r = await fetch(base + '/wai/voice/recording?id=p1-retry-1', { method: 'OPTIONS' });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-origin'), null);
  assert.equal(r.headers.get('access-control-allow-headers'), null);
});

test('character pages /admin/voice/c/<id> serve the same index.html; bad ids do not', async () => {
  const ok = await fetch(base + '/admin/voice/c/p3');
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), /idx/);
  assert.equal((await fetch(base + '/admin/voice/c/p3/extra')).status, 404);
});

test('voice mode API: read, switch with header, reject bad value and missing header', async () => {
  const r0 = await (await fetch(base + '/wai/voice/mode')).json();
  assert.equal(r0.mode, 'human');
  assert.equal(r0.total, 3); // dupOf ไม่นับ
  const r1 = await (await post('/wai/voice/mode', JSON.stringify({ mode: 'siri' }))).json();
  assert.equal(r1.mode, 'siri');
  assert.equal((await post('/wai/voice/mode', JSON.stringify({ mode: 'robot' }))).status, 400);
  assert.equal((await post('/wai/voice/mode', JSON.stringify({ mode: 'human' }), {})).status, 403);
  assert.equal((await (await fetch(base + '/wai/voice/mode')).json()).mode, 'siri');
});
