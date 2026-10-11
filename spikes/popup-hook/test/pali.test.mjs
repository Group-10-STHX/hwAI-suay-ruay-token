import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chantText, estimateDurationMs, extractEdit, loadDict, toChant } from '../pali.mjs';

const DICT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'voice', 'pali', 'js-pali-master.json');

test('dict loads the vendored paliscript map', () => {
  const d = loadDict(DICT);
  assert.ok(d.size >= 130);
  assert.equal(d.get('const').th, 'อัจจุตะ');
  assert.equal(loadDict('/nope/x.json').size, 0);
});

test('extractEdit: JS-like files only, Edit/Write/MultiEdit shapes', () => {
  assert.deepEqual(extractEdit({ tool_input: { file_path: '/a/b/foo.js', new_string: 'let x = 1' } }), { file: 'foo.js', code: 'let x = 1' });
  assert.equal(extractEdit({ tool_input: { file_path: '/a/b.py', new_string: 'x' } }), null);
  assert.equal(extractEdit({ tool_input: { file_path: '/a/b.ts', content: 'const a = 2' } }).code, 'const a = 2');
  assert.equal(extractEdit({ tool_input: { file_path: '/a/b.tsx', edits: [{ new_string: 'a' }, { new_string: 'b' }] } }).code, 'a\nb');
  assert.equal(extractEdit({ tool_input: { file_path: '/a/b.js', new_string: '   ' } }), null);
  assert.equal(extractEdit({}), null);
});

test('toChant: keywords become Pali, identifiers stay, comments skipped, limits hold', () => {
  const d = loadDict(DICT);
  const lines = toChant('// hi\nconst total = a + b;\nreturn total', d);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].words[0].th, 'อัจจุตะ');
  assert.ok(lines[0].words[0].rom);
  assert.equal(lines[0].words.find((w) => w.src === 'total').th, 'total');
  const many = toChant(Array.from({ length: 20 }, (_, i) => `let v${i} = ${i}`).join('\n'), d);
  assert.equal(many.length, 5);
  assert.ok(many.every((l) => l.words.length <= 12));
});

test('chantText bounded, duration scales with words', () => {
  const d = loadDict(DICT);
  const lines = toChant('function f(a) { return a }', d);
  assert.ok(chantText(lines).length > 0);
  assert.ok(chantText(lines, 10).length <= 10);
  assert.ok(estimateDurationMs(lines) > 1200);
});
