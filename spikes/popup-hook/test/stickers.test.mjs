import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, utimesSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStickers, stickerFileName, isPng, STICKER_FILE_RE, STICKER_STYLES, DEFAULT_STICKER_STYLE, isStickerStyle, normalizeStickerStyle } from '../stickers.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const quiet = { warn() {} };
const png = (n = 0) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16 + n)]);
const tmp = () => mkdtempSync(join(tmpdir(), 'stk-'));

test('file names are sanitised', () => {
  assert.equal(stickerFileName('abc-123_X'), 'abc-123_X.png');
  assert.equal(stickerFileName('../../etc/passwd'), 'etcpasswd.png');
  assert.equal(stickerFileName('///'), null);
  assert.equal(stickerFileName(undefined), null);
  assert.ok(STICKER_FILE_RE.test('a-b_1.png'));
  assert.ok(!STICKER_FILE_RE.test('../a.png'));
  assert.ok(!STICKER_FILE_RE.test('a.png.exe'));
});

test('save validates png, writes atomically, leaves no tmp files', () => {
  const home = tmp();
  const s = createStickers({ home, logger: quiet });
  assert.equal(s.save('id1', Buffer.from('not a png')), null);
  assert.equal(s.save('', png()), null);
  assert.equal(s.save('id1', png()), 'id1.png');
  assert.ok(existsSync(join(home, 'stickers', 'id1.png')));
  assert.deepEqual(readdirSync(join(home, 'stickers')), ['id1.png']);
  assert.ok(isPng(png()));
  assert.ok(s.resolveFile('id1.png'));
  assert.equal(s.resolveFile('../wais.jsonl'), null);
  assert.equal(s.resolveFile('nope.png'), null);
});

test('list is newest first and prune keeps only max', () => {
  const home = tmp();
  const s = createStickers({ home, max: 3, logger: quiet });
  for (let i = 0; i < 5; i++) {
    s.save(`s${i}`, png(i));
    const t = new Date(Date.now() - (5 - i) * 10_000);
    try { utimesSync(join(home, 'stickers', `s${i}.png`), t, t); } catch { /* removed already */ }
  }
  const l = s.list(10);
  assert.equal(l.length, 3);
  assert.deepEqual(l.map((x) => x.file), ['s4.png', 's3.png', 's2.png']);
  assert.equal(s.list(2).length, 2);
  writeFileSync(join(home, 'stickers', 'readme.txt'), 'x'); // foreign file is ignored and never deleted
  s.save('s9', png());
  assert.ok(existsSync(join(home, 'stickers', 'readme.txt')));
});

test('sticker styles: whitelist matches the worker and the renderer, default photo', async () => {
  assert.equal(DEFAULT_STICKER_STYLE, 'photo');
  assert.equal(normalizeStickerStyle('neon'), 'neon');
  assert.equal(normalizeStickerStyle('Neon'), 'photo');
  assert.equal(normalizeStickerStyle(undefined), 'photo');
  assert.ok(isStickerStyle('kawaii') && !isStickerStyle('__proto__'));
  const worker = await import('../../../vision/worker/sticker.js');
  assert.deepEqual([...STICKER_STYLES], [...worker.STICKER_STYLES]);
  const types = readFileSync(fileURLToPath(new URL('../../../app/renderer/src/api/types.ts', import.meta.url)), 'utf8');
  const m = types.match(/STICKER_STYLES = \[([^\]]*)\]/);
  assert.ok(m, 'STICKER_STYLES in types.ts');
  assert.deepEqual(m[1].split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean), [...STICKER_STYLES]);
});
