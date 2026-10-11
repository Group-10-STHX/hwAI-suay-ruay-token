import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const require = createRequire(import.meta.url);
const L = require('../logic.js');
const here = new URL('..', import.meta.url);

test('source/label from hostname', () => {
  assert.deepEqual(L.siteFromHostname('claude.ai'), { key: 'claude', source: 'claude-web', label: 'Claude (เว็บ)' });
  assert.equal(L.siteFromHostname('chatgpt.com').source, 'chatgpt');
  assert.equal(L.siteFromHostname('chat.openai.com').source, 'chatgpt');
  assert.equal(L.siteFromHostname('gemini.google.com').source, 'gemini-web');
  assert.equal(L.siteFromHostname('www.claude.ai').key, 'claude');
  assert.equal(L.siteFromHostname('notclaude.ai'), null);
  assert.equal(L.siteFromHostname('example.com'), null);
});

test('session input normalization', () => {
  assert.equal(L.sessionInput('Claude.AI', '/chat/ABC/'), 'claude.ai/chat/abc');
  assert.equal(L.sessionInput('claude.ai', '/chat/abc?x=1#y'), 'claude.ai/chat/abc');
  assert.equal(L.sessionInput('chatgpt.com', ''), 'chatgpt.com/');
  assert.equal(L.sessionInput('chatgpt.com', '/'), 'chatgpt.com/');
});

test('short hash is stable and does not leak input', async () => {
  const a = await L.shortHash('claude.ai/chat/abc', webcrypto.subtle);
  const b = await L.shortHash('claude.ai/chat/abc', webcrypto.subtle);
  const c = await L.shortHash('claude.ai/chat/abd', webcrypto.subtle);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^web-[0-9a-f]{12}$/);
});

test('wait loop decisions', () => {
  const d = (o) => L.decideWaitStep({ elapsedMs: 0, ...o }).next;
  assert.equal(d({ status: 200 }), 'allow');
  assert.equal(d({ status: 202 }), 'poll');
  assert.equal(d({ status: 404 }), 'release');
  assert.equal(d({ status: 500 }), 'release');
  assert.equal(d({ error: 'network' }), 'release');
  assert.equal(d({ error: 'timeout' }), 'poll');
  assert.equal(L.decideWaitStep({ status: 202, elapsedMs: L.CAP_MS }).reason, 'cap');
  assert.equal(L.decideWaitStep({ status: 202, elapsedMs: L.CAP_MS - 1 }).next, 'poll');
  assert.equal(L.decideWaitStep({ error: 'timeout', elapsedMs: 10, capMs: 5 }).next, 'release');
});

test('badge text per mode', () => {
  assert.equal(L.badgeText(false), 'ไหว้กูซะก่อนส่ง…');
  assert.equal(L.badgeText(true), 'กำลังบันทึกการใช้ AI…');
  assert.equal(L.badgeText(undefined), 'กำลังบันทึกการใช้ AI…');
});

test('manifest is minimal MV3', () => {
  const m = JSON.parse(readFileSync(new URL('manifest.json', here), 'utf8'));
  assert.equal(m.manifest_version, 3);
  assert.deepEqual(m.permissions, ['storage']);
  assert.deepEqual([...m.host_permissions].sort(), [
    'http://127.0.0.1:7777/*',
    'https://chat.openai.com/*',
    'https://chatgpt.com/*',
    'https://claude.ai/*',
    'https://gemini.google.com/*',
  ]);
  assert.equal(m.background.service_worker, 'background.js');
  assert.deepEqual(m.content_scripts[0].js, ['logic.js', 'content.js']);
  for (const f of ['background.js', 'content.js', 'logic.js', 'popup.html', 'popup.js'])
    assert.ok(readFileSync(new URL(f, here)).length > 0, f);
});

test('source files do not reference page text sending', () => {
  const c = readFileSync(new URL('content.js', here), 'utf8');
  assert.ok(!/innerText|innerHTML/.test(c));
});
