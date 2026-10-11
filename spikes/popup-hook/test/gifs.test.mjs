import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGifs, gifFileName, isGif } from '../gifs.mjs';

const tiny = () => Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(10, 1), Buffer.from([0x3b])]);

test('gifs: filename sanitised, only GIF89a with trailer accepted', () => {
  assert.equal(gifFileName('../../etc/passwd'), 'etcpasswd.gif');
  assert.equal(gifFileName(''), null);
  assert.equal(isGif(tiny()), true);
  assert.equal(isGif(Buffer.from('not a gif at all!!')), false);
});

test('gifs: save, has, resolveFile, prune oldest', async () => {
  const home = mkdtempSync(join(tmpdir(), 'gifs-'));
  const g = createGifs({ home, max: 2 });
  assert.equal(g.save('a', Buffer.from('nope')), null);
  assert.equal(g.save('a', tiny()), 'a.gif');
  await new Promise((r) => setTimeout(r, 15));
  g.save('b', tiny());
  await new Promise((r) => setTimeout(r, 15));
  g.save('c', tiny());
  assert.deepEqual(readdirSync(g.dir).sort(), ['b.gif', 'c.gif']);
  assert.equal(g.has('c'), true);
  assert.equal(g.has('a'), false);
  assert.equal(g.resolveFile('../x.gif'), null);
  assert.ok(g.resolveFile('b.gif'));
});
