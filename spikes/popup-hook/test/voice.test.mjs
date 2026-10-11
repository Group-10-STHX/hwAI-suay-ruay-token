import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createVoice } from '../voice.mjs';

const FAKE_KEY = 'fake-key-do-not-leak-123';
const MP3 = Buffer.alloc(64, 7);
const sha1 = (s) => createHash('sha1').update(s).digest('hex');

function mkRes(status, body = MP3) {
  return { status, ok: status >= 200 && status < 300, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length) };
}
function setup({ status = 200, budgetChars, t0 = 1_000_000, fetchImpl } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'voice-test-'));
  const calls = [];
  const plays = [];
  const logs = [];
  const clock = { t: t0 };
  const f = fetchImpl || (async (url, init) => { calls.push({ url, init }); return mkRes(status); });
  const wrapped = fetchImpl ? async (u, i) => { calls.push({ url: u, init: i }); return fetchImpl(u, i); } : f;
  const voice = createVoice({
    home, apiKey: FAKE_KEY, fetchImpl: wrapped, budgetChars,
    now: () => clock.t, log: (s) => logs.push(s), random: () => 0,
    playImpl: (spec) => {
      const h = { spec, cancelled: false, cancel() { h.cancelled = true; }, done: new Promise(() => {}) };
      plays.push(h);
      return h;
    },
  });
  return { home, voice, calls, plays, logs, clock };
}

test('source priority: recording > cache > paxa > say > silent', async () => {
  const s = setup();
  const rec = join(s.home, 'voice', 'recordings', 'p1');
  mkdirSync(rec, { recursive: true });
  writeFileSync(join(rec, 'p1-demanding-1.wav'), 'RIFF');
  let r = await s.voice.speak({ state: 'DEMANDING', persona: 'p1' });
  assert.equal(r.source, 'recording');
  assert.equal(s.calls.length, 0);
  assert.equal(s.plays.at(-1).spec.kind, 'file');
  // no recording for p1 PASSED -> paxa
  s.clock.t += 5000;
  r = await s.voice.speak({ state: 'PASSED', persona: 'p1' });
  assert.equal(r.source, 'paxa');
  assert.equal(s.calls.length, 1);
  assert.equal(JSON.parse(s.calls[0].init.body).voice, 'thongek');
  // same again after debounce -> cache
  s.clock.t += 5000;
  r = await s.voice.speak({ state: 'PASSED', persona: 'p1' });
  assert.equal(r.source, 'cache');
  assert.equal(s.calls.length, 1);
});

test('cache file lives at cache/<voice>/<sha1(text)>.mp3', async () => {
  const s = setup();
  const r = await s.voice.say('ทดสอบ', { persona: 'p2' });
  assert.equal(r.source, 'paxa');
  assert.ok(existsSync(join(s.home, 'voice', 'cache', 'nomyen', `${sha1('ทดสอบ')}.mp3`)));
  assert.equal(s.calls[0].init.headers.Authorization, `Bearer ${FAKE_KEY}`);
});

test('budget cap stops fetching and falls back to say', async () => {
  const s = setup({ budgetChars: 10 });
  let r = await s.voice.say('ทดสอบ', { persona: 'p2' }); // 5 chars
  assert.equal(r.source, 'paxa');
  r = await s.voice.say('ข้อความที่ยาวกว่างบ', { persona: 'p2' }); // > remaining 5
  assert.equal(r.source, 'say');
  assert.equal(s.calls.length, 1);
  const b = JSON.parse(readFileSync(join(s.home, 'voice', 'budget.json'), 'utf8'));
  assert.equal(b.used, 5);
  assert.equal(s.voice.status().budget.remaining, 5);
});

test('401 disables Paxa for the session', async () => {
  const s = setup({ status: 401 });
  let r = await s.voice.say('หนึ่ง', { persona: 'p2' });
  assert.equal(r.source, 'say');
  r = await s.voice.say('สอง', { persona: 'p2' });
  assert.equal(r.source, 'say');
  assert.equal(s.calls.length, 1);
  assert.equal(s.voice.status().paxa.enabled, false);
  assert.equal(readJsonOrNull(join(s.home, 'voice', 'budget.json')), null); // not charged
});
function readJsonOrNull(p) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } }

test('429 backs off for 60s then retries', async () => {
  const s = setup({ status: 429 });
  await s.voice.say('หนึ่ง', { persona: 'p2' });
  s.clock.t += 30_000;
  const r = await s.voice.say('สอง', { persona: 'p2' });
  assert.equal(r.source, 'say');
  assert.equal(s.calls.length, 1);
  s.clock.t += 31_000;
  await s.voice.say('สาม', { persona: 'p2' });
  assert.equal(s.calls.length, 2);
});

test('5xx and network errors back off too', async () => {
  const s = setup({ fetchImpl: async () => { throw new Error('boom'); } });
  const r = await s.voice.say('หนึ่ง', { persona: 'p2' });
  assert.equal(r.source, 'say');
  await s.voice.say('สอง', { persona: 'p2' });
  assert.equal(s.calls.length, 1);
  const s2 = setup({ status: 503 });
  await s2.voice.say('หนึ่ง', { persona: 'p2' });
  await s2.voice.say('สอง', { persona: 'p2' });
  assert.equal(s2.calls.length, 1);
});

test('say fallback passes persona rate; silent when playImpl yields nothing', async () => {
  const s = setup({ status: 500 });
  await s.voice.say('ทดสอบ', { persona: 'p3' });
  const spec = s.plays.at(-1).spec;
  assert.deepEqual([spec.kind, spec.voice, spec.rate], ['say', 'Kanya', 140]);
  const home = mkdtempSync(join(tmpdir(), 'voice-test-'));
  const v = createVoice({ home, apiKey: FAKE_KEY, fetchImpl: async () => mkRes(500), playImpl: () => null });
  const r = await v.say('ทดสอบ', { persona: 'p3' });
  assert.equal(r.ok, false);
  assert.equal(r.source, 'silent');
  const v2 = createVoice({ home, apiKey: FAKE_KEY, fetchImpl: async () => mkRes(500), playImpl: () => { throw new Error('x'); } });
  assert.equal((await v2.say('ทดสอบ', { persona: 'p3' })).source, 'silent');
});

test('one at a time: new speak cancels previous playback', async () => {
  const s = setup();
  await s.voice.say('หนึ่ง', { persona: 'p2' });
  await s.voice.say('สอง', { persona: 'p2' });
  assert.equal(s.plays[0].cancelled, true);
  assert.equal(s.plays[1].cancelled, false);
  s.voice.setMuted(true);
  assert.equal(s.plays[1].cancelled, true);
  assert.equal((await s.voice.say('สาม', { persona: 'p2' })).skipped, 'muted');
});

test('a stale in-flight synth does not play over a newer utterance', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  let n = 0;
  const s = setup({ fetchImpl: async () => { if (n++ === 0) await gate; return mkRes(200); } });
  const first = s.voice.say('ช้า', { persona: 'p2' });
  const second = await s.voice.say('เร็ว', { persona: 'p2' });
  release();
  const r1 = await first;
  assert.equal(second.ok, true);
  assert.equal(r1.skipped, 'superseded');
  assert.equal(s.plays.length, 1);
});

test('debounce identical state within 1.5s', async () => {
  const s = setup();
  const a = await s.voice.speak({ state: 'RETRY', persona: 'p1' });
  assert.equal(a.ok, true);
  s.clock.t += 1000;
  assert.equal((await s.voice.speak({ state: 'RETRY', persona: 'p1' })).skipped, 'debounce');
  s.clock.t += 600;
  assert.equal((await s.voice.speak({ state: 'RETRY', persona: 'p1' })).ok, true);
});

test('line choice avoids immediate repeat and falls back to closest state', async () => {
  const s = setup();
  const ids = [];
  for (let i = 0; i < 4; i++) {
    s.clock.t += 5000;
    ids.push((await s.voice.speak({ state: 'DEMANDING', persona: 'p1' })).lineId);
  }
  for (let i = 1; i < ids.length; i++) assert.notEqual(ids[i], ids[i - 1]);
  // p3 has no WATCHING line -> closest state DEMANDING
  s.clock.t += 5000;
  const r = await s.voice.speak({ state: 'WATCHING', persona: 'p3' });
  assert.equal(r.state, 'DEMANDING');
  // p5 has no PASSED? it does in extra; p5 WATCHING falls to DEMANDING; p1 IDLE -> DEMANDING
  s.clock.t += 5000;
  assert.equal((await s.voice.speak({ state: 'IDLE', persona: 'p1' })).ok, true);
  // unknown state -> default/generic text
  s.clock.t += 5000;
  const g = await s.voice.speak({ state: 'WEIRD', persona: 'p1' });
  assert.ok(g.text.length > 0);
});

test('path safety: persona and lineId validated', async () => {
  const s = setup();
  const evil = await s.voice.speak({ state: 'RETRY', persona: '../../etc' });
  assert.equal(evil.ok, false);
  assert.equal(s.voice.setPersona('../x'), false);
  assert.equal(s.voice.setPersona('p2'), true);
  assert.equal(s.voice.getPersona(), 'p2');
  // traversal lineId must not resolve to a recording outside the folder
  mkdirSync(join(s.home, 'voice', 'recordings', 'p1'), { recursive: true });
  writeFileSync(join(s.home, 'voice', 'secret.wav'), 'x');
  const r = await s.voice.speak({ state: 'RETRY', persona: 'p1', lineId: '../../secret' });
  assert.notEqual(r.source, 'recording');
  assert.equal(s.plays.some((p) => String(p.spec.path || '').includes('secret')), false);
});

test('key never appears in logs, status or list', async () => {
  const s = setup({ fetchImpl: async () => { throw new Error(`failed with ${FAKE_KEY}`); } });
  await s.voice.say('ทดสอบ', { persona: 'p2' });
  await s.voice.speak({ state: 'RETRY', persona: 'p1' });
  const s2 = setup({ status: 401 });
  await s2.voice.say('ทดสอบ', { persona: 'p2' });
  for (const x of [s, s2]) {
    const blob = JSON.stringify([x.logs, x.voice.status(), x.voice.list()]);
    assert.equal(blob.includes(FAKE_KEY), false);
  }
  assert.ok(s.logs.length > 0);
});

test('list(), prewarm() uses cache and respects budget', async () => {
  const s = setup({ budgetChars: 100 });
  const l = s.voice.list();
  assert.equal(l.length, 10);
  assert.equal(l.find((p) => p.id === 'p1').voice, 'thongek');
  const r = await s.voice.prewarm(['p2']);
  assert.ok(r.fetched >= 1 && r.fetched <= 5);
  assert.ok(s.voice.status().budget.used <= 100);
  const before = s.calls.length;
  const r2 = await s.voice.prewarm(['p2']);
  assert.equal(r2.fetched, 0);
  assert.equal(s.calls.length, before);
});

// ---- emotions ----
import { normalizeTag, sanitizeTags, stripTags, clampSpeed, TAG_VOICES } from '../voice.mjs';
const body = (s, i = 0) => JSON.parse(s.calls[i].init.body);

test('personas p7/p8 exist, tag voices only', () => {
  const s = setup();
  const l = s.voice.list();
  const p7 = l.find((p) => p.id === 'p7'), p8 = l.find((p) => p.id === 'p8');
  assert.equal(p7.voice, 'kaprao'); assert.equal(p8.voice, 'khanomchan');
  assert.equal(p7.supportsTags, true); assert.equal(p8.supportsTags, true);
  assert.equal(l.find((p) => p.id === 'p1').supportsTags, false);
  assert.ok(p7.example && p7.name === 'ผู้คุมคลั่ง' && p8.name === 'สายมีม');
  assert.deepEqual([...TAG_VOICES].sort(), ['kaprao', 'khanomchan']);
});

test('tag voice: emotion field becomes leading tag, weight kept', async () => {
  const s = setup();
  const r = await s.voice.speak({ persona: 'p7', lineId: 'p7-annoyed-1' });
  assert.equal(r.source, 'paxa');
  assert.equal(body(s).text, '[furious:0.8] กูบอกกี่รอบแล้ววะ');
  assert.equal(body(s).voice, 'kaprao');
  assert.equal(r.text, 'กูบอกกี่รอบแล้ววะ'); // plain
});

test('emotionText inline tags are sent for tag voices; speed sent', async () => {
  const s = setup();
  await s.voice.speak({ persona: 'p8', lineId: 'p8-retry-1' });
  assert.equal(body(s).text, '[laughing] ฮ่า ๆ ไม่ใช่ [excited] ไหว้ใหม่');
  s.clock.t += 5000;
  await s.voice.speak({ persona: 'p8', lineId: 'p8-passed-1' });
  assert.equal(body(s, 1).speed, 1.1);
});

test('non-tag voice never gets tags or speed', async () => {
  const s = setup();
  await s.voice.say('[angry] ไหว้ใหม่', { persona: 'p1' });
  assert.equal(body(s).text, 'ไหว้ใหม่');
  assert.equal('speed' in body(s), false);
});

test('invalid tag dropped and logged once', async () => {
  const s = setup();
  await s.voice.say('[laughs] ไหว้ [angry] ใหม่', { persona: 'p7' });
  assert.equal(body(s).text, 'ไหว้ [angry] ใหม่');
  s.clock.t += 5000;
  await s.voice.say('[laughs] อีกที', { persona: 'p7' });
  assert.equal(s.logs.filter((x) => x.includes('invalid emotion tag')).length, 1);
});

test('helpers: normalize, weight, strip, speed clamp', () => {
  assert.equal(normalizeTag('ANGRY'), '[angry]');
  assert.equal(normalizeTag('sad:0.6'), '[sad:0.6]');
  assert.equal(normalizeTag('sad:60%'), '[sad:60%]');
  assert.equal(normalizeTag('sad:2'), null);
  assert.equal(normalizeTag('laughs'), null);
  assert.equal(sanitizeTags('[Angry:0.9] a [xx] b'), '[angry:0.9] a b');
  assert.equal(stripTags('[angry] ไหว้ [sad:0.6] ใหม่'), 'ไหว้ ใหม่');
  assert.equal(clampSpeed(0.1), 0.5);
  assert.equal(clampSpeed(9), 1.5);
  assert.equal(clampSpeed(1.12), 1.1);
  assert.equal(clampSpeed(1.13), 1.15);
  assert.equal(clampSpeed('x'), undefined);
});

test('fallback say and recordings use plain text; cache key differs by tags and speed', async () => {
  const s = setup({ status: 500 });
  const r = await s.voice.speak({ persona: 'p8', lineId: 'p8-retry-1' });
  assert.equal(r.source, 'say');
  assert.equal(s.plays.at(-1).spec.text, 'ฮ่า ๆ ไม่ใช่ ไหว้ใหม่');
  const a = setup(), b = setup(), c = setup();
  await a.voice.say('[angry] ไหว้', { persona: 'p7' });
  await b.voice.say('[sad] ไหว้', { persona: 'p7' });
  await c.voice.say('[angry] ไหว้', { persona: 'p7' });
  const files = (x) => x.plays.at(-1).spec.path;
  assert.notEqual(files(a), files(b));
  assert.equal(files(a), join(a.home, 'voice', 'cache', 'kaprao', `${sha1('[angry] ไหว้')}.mp3`));
  assert.notEqual(files(a), undefined);
});

test('engine:system persona (p4 Siri-style) never calls Paxa and prewarm skips it', async () => {
  const s = setup();
  const r = await s.voice.say('ทดสอบ', { persona: 'p4' });
  assert.equal(r.source, 'say');
  assert.equal(s.calls.length, 0);
  const spec = s.plays.at(-1).spec;
  assert.deepEqual([spec.kind, spec.voice], ['say', 'Kanya']);
  const w = await s.voice.prewarm(['p4']);
  assert.equal(s.calls.length, 0);
  assert.equal(w.fetched, 0);
  assert.equal(s.voice.list().find((p) => p.id === 'p4').engine, 'system');
});

test("mode 'siri': recordings and Paxa are skipped, everything goes to system voice; 'human' restores them", async () => {
  const s = setup();
  const rec = join(s.home, 'voice', 'recordings', 'p1');
  mkdirSync(rec, { recursive: true });
  writeFileSync(join(rec, 'p1-demanding-1.wav'), 'RIFF');
  assert.equal(s.voice.getMode(), 'human');
  assert.equal((await s.voice.speak({ state: 'DEMANDING', persona: 'p1' })).source, 'recording');
  assert.equal(s.voice.setMode('siri'), 'siri');
  s.clock.t += 5000;
  const r = await s.voice.speak({ state: 'DEMANDING', persona: 'p1' });
  assert.equal(r.source, 'say');
  assert.equal(s.calls.length, 0);
  assert.equal(s.voice.status().mode, 'siri');
  assert.equal(s.voice.setMode('nope'), 'siri'); // ค่าแปลก = ไม่เปลี่ยน
  s.voice.setMode('human');
  s.clock.t += 5000;
  assert.equal((await s.voice.speak({ state: 'DEMANDING', persona: 'p1' })).source, 'recording');
});

test('narrate: plays parts one after another, reports start/end, blocks other speech, gain passed on', async () => {
  const home = mkdtempSync(join(tmpdir(), 'voice-test-'));
  const order = [];
  const specs = [];
  const v = createVoice({
    home, apiKey: null, fetchImpl: async () => mkRes(500), now: () => 1, log: () => {}, random: () => 0,
    playImpl: (spec) => {
      specs.push(spec);
      let resolve;
      const done = new Promise((r) => { resolve = r; });
      setTimeout(() => resolve({ ok: true }), 5);
      return { cancel: () => resolve({ ok: false }), done };
    },
  });
  const p = v.narrate(['หนึ่ง', 'สอง', 'สาม'], { persona: 'p4', gain: 2.5, onPart: (i, ev) => order.push(`${i}:${ev}`) });
  await new Promise((r) => setTimeout(r, 1));
  assert.equal((await v.say('แทรก', { persona: 'p4' })).skipped, 'narrating');
  assert.equal((await v.speak({ state: 'DEMANDING' })).skipped, 'narrating');
  const r = await p;
  assert.deepEqual(order, ['0:start', '0:end', '1:start', '1:end', '2:start', '2:end']);
  assert.equal(r.played, 3);
  assert.ok(specs.every((s) => s.gain === 2.5));
  assert.equal((await v.say('หลังจบ', { persona: 'p4' })).ok, true);
});

function narrateSetup() {
  const home = mkdtempSync(join(tmpdir(), 'voice-test-'));
  const calls = [];
  const voice = createVoice({
    home, apiKey: FAKE_KEY, now: () => 1, log: () => {}, random: () => 0,
    fetchImpl: async (u, i) => { calls.push({ url: u, init: i }); return mkRes(200); },
    playImpl: () => ({ cancel() {}, done: Promise.resolve({ ok: true }) }),
  });
  return { voice, calls };
}

test('narrate: tag voice gets emotion tags + speed in the Paxa request, plain voices get tags stripped', async () => {
  const s = narrateSetup();
  await s.voice.narrate([{ text: '[shouting] Six! Seven!', speed: 1.15 }, '[bogus] Six Seven'], { persona: 'p8', gain: 2 });
  const bodies = s.calls.map((c) => JSON.parse(c.init.body));
  assert.equal(bodies[0].voice, 'khanomchan');
  assert.equal(bodies[0].text, '[shouting] Six! Seven!');
  assert.equal(bodies[0].speed, 1.15);
  assert.equal(bodies[1].text, 'Six Seven'); // แท็กที่ไม่รู้จักถูกตัดทิ้ง
  const s2 = narrateSetup();
  await s2.voice.narrate(['[shouting] Six Seven'], { persona: 'p2' }); // ไม่ใช่เสียงอ่านแท็ก
  assert.equal(JSON.parse(s2.calls[0].init.body).text, 'Six Seven');
});
