import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWaiLog, tokensFor, awardsFor, BEAUTIFUL_SCORE } from '../wai-log.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'wailog-'));
const quiet = { warn() {} };
const base = { session_id: 's1', source: 'claude_code', kind: 'prompt', action: 'allow', anger: 0, forgave: false, parts: { sym: 1, cen: 1, hold: 1, bow: 0 }, attempts: 0, state: 'PASSED', hold_ms: 1200 };

test('tokens and awards', () => {
  assert.equal(BEAUTIFUL_SCORE, 80);
  assert.equal(tokensFor({ passed: true, level: 1, score: 70 }), 10);
  assert.equal(tokensFor({ passed: true, level: 3, score: 85 }), 50);
  assert.equal(tokensFor({ passed: false, level: 3, score: 95 }), 0);
  assert.deepEqual(awardsFor({ passed: true, level: 3, score: 85, style: 'normal' }), ['beautiful', 'monk']);
  assert.deepEqual(awardsFor({ passed: false, level: 3, score: 95, style: 'weird' }), []);
  assert.deepEqual(awardsFor({ passed: true, level: 1, score: 60, style: 'weird' }), ['weird']);
  assert.deepEqual(awardsFor({ passed: true, level: 2, score: 79, style: 'normal' }), []);
});

test('record writes a full contract line', () => {
  const home = tmp();
  const log = createWaiLog({ home, sync: false, logger: quiet });
  log.record({ ...base, passed: true, level: 3, score: 85, style: 'weird', agent_label: 'x' });
  const r = JSON.parse(readFileSync(join(home, 'wais.jsonl'), 'utf8').trim());
  for (const k of ['v', 'id', 'at', 'session_id', 'source', 'kind', 'agent_label', 'passed', 'action', 'level', 'score', 'hold_ms', 'parts', 'attempts', 'style', 'state', 'anger', 'forgave', 'awards', 'tokens']) assert.ok(k in r, k);
  assert.equal(r.v, 1);
  assert.equal(r.tokens, 50);
  assert.deepEqual(r.awards, ['beautiful', 'monk', 'weird']);
  assert.match(r.id, /^[0-9a-f-]{36}$/);
});

test('stats today vs total across Bangkok midnight', () => {
  const home = tmp();
  let t = new Date('2026-10-10T16:30:00Z'); // 23:30 Bangkok Oct 10
  const log = createWaiLog({ home, sync: false, now: () => t, logger: quiet });
  log.record({ ...base, passed: true, level: 2, score: 90 });
  log.record({ ...base, passed: false, level: 1, score: 40, action: 'retry' });
  assert.deepEqual(log.stats().today, { wais: 2, passed: 1, beautiful: 1, tokens: 40 });
  t = new Date('2026-10-10T17:30:00Z'); // 00:30 Bangkok Oct 11
  assert.deepEqual(log.stats().today, { wais: 0, passed: 0, beautiful: 0, tokens: 0 });
  log.record({ ...base, passed: true, level: 1, score: 70 });
  const s = log.stats();
  assert.deepEqual(s.today, { wais: 1, passed: 1, beautiful: 0, tokens: 10 });
  assert.deepEqual(s.total, { wais: 3, passed: 2, beautiful: 1, tokens: 50 });
  assert.equal(s.best_score, 90);
});

test('reload from file skips broken lines', () => {
  const home = tmp();
  const now = () => new Date('2026-10-10T05:00:00Z');
  const a = createWaiLog({ home, sync: false, now, logger: quiet });
  a.record({ ...base, passed: true, level: 3, score: 88 });
  writeFileSync(join(home, 'wais.jsonl'), readFileSync(join(home, 'wais.jsonl'), 'utf8') + '{broken\n\n');
  const b = createWaiLog({ home, sync: false, now, logger: quiet });
  assert.deepEqual(b.stats().total, { wais: 1, passed: 1, beautiful: 1, tokens: 50 });
  assert.deepEqual(b.stats().today, b.stats().total);
  assert.equal(b.stats().best_score, 88);
});

test('sync:false never touches the network or outbox', async () => {
  const home = tmp();
  writeFileSync(join(home, 'config.json'), JSON.stringify({ web: { enabled: true, install_key: 'k' } }));
  const orig = globalThis.fetch; let calls = 0;
  globalThis.fetch = () => { calls++; throw new Error('net'); };
  try {
    const log = createWaiLog({ home, sync: false, logger: quiet });
    log.record({ ...base, passed: true, level: 1, score: 50 });
    await log.flush(); log.stop();
    assert.equal(calls, 0);
    assert.equal(existsSync(join(home, 'outbox.jsonl')), false);
  } finally { globalThis.fetch = orig; }
});

test('sync:true queues to outbox without agent_label/tokens when enabled', () => {
  const home = tmp();
  writeFileSync(join(home, 'config.json'), JSON.stringify({ web: { enabled: true, install_key: 'k' } }));
  const log = createWaiLog({ home, sync: true, logger: quiet });
  log.record({ ...base, passed: true, level: 1, score: 50, agent_label: 'secret' });
  log.stop();
  const o = readFileSync(join(home, 'outbox.jsonl'), 'utf8');
  assert.ok(!o.includes('secret') && !o.includes('tokens') && !o.includes('awards'));
  assert.equal(JSON.parse(o.trim()).level, 1);
});

test('record does not throw when folder is unwritable', () => {
  const home = tmp();
  const blocker = join(home, 'file');
  writeFileSync(blocker, 'x');
  const log = createWaiLog({ home: join(blocker, 'sub'), sync: true, logger: quiet });
  assert.doesNotThrow(() => log.record({ ...base, passed: true, level: 1, score: 50 }));
  assert.equal(log.stats().total.wais, 1);
  log.stop();
});

test('attachSticker appends a patch line, survives reload, old readers skip it', () => {
  const home = tmp();
  const log = createWaiLog({ home, sync: false, logger: quiet });
  const rec = log.record({ ...base, passed: true, level: 2, score: 77, style: 'normal' });
  assert.equal(log.attachSticker('nope', 'x.png'), false);
  assert.equal(log.attachSticker(rec.id, '../evil.png'), false);
  assert.equal(log.attachSticker(rec.id, `${rec.id}.png`), true);
  assert.equal(log.lookup(rec.id).sticker, `${rec.id}.png`);
  const lines = readFileSync(join(home, 'wais.jsonl'), 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
  assert.ok(!('at' in JSON.parse(lines[1]))); // stats loaders that need `at` ignore it
  const again = createWaiLog({ home, sync: false, logger: quiet });
  assert.equal(again.stats().total.wais, 1);
  assert.equal(again.lookup(rec.id).sticker, `${rec.id}.png`);
  assert.equal(again.lookup(rec.id).score, 77);
});

test('uploadSticker is off by default and never throws', () => {
  const home = tmp();
  const log = createWaiLog({ home, sync: false, logger: quiet });
  assert.equal(log.uploadSticker('a', '/tmp/a.png'), false);
  writeFileSync(join(home, 'config.json'), JSON.stringify({ web: { upload_stickers: true } }));
  assert.equal(log.uploadSticker('a', '/tmp/a.png'), false); // no sync instance / no recordSticker yet
});
