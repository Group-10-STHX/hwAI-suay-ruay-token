import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeGif, palette332, quantize } from './gif.js';

// ตัวถอด LZW ไว้ตรวจว่าที่เข้ารหัสไปถอดกลับได้ตรงเป๊ะ
function decodeFrames(buf) {
  let p = 6;
  const w = buf[p] | (buf[p + 1] << 8), h = buf[p + 2] | (buf[p + 3] << 8);
  p += 7 + 768;
  const frames = [];
  while (buf[p] !== 0x3b) {
    if (buf[p] === 0x21) { // extension
      p += 2;
      while (buf[p] !== 0) p += buf[p] + 1;
      p += 1;
      continue;
    }
    assert.equal(buf[p], 0x2c);
    p += 10; // descriptor
    const min = buf[p++];
    const bytes = [];
    while (buf[p] !== 0) { for (let i = 0; i < buf[p]; i++) bytes.push(buf[p + 1 + i]); p += buf[p] + 1; }
    p += 1;
    // decode
    const clear = 1 << min, eoi = clear + 1;
    let size = min + 1, next = eoi + 1, dict = [], prev = null, cur = 0, nb = 0, bi = 0;
    const reset = () => { dict = []; for (let i = 0; i < clear; i++) dict[i] = [i]; size = min + 1; next = eoi + 1; prev = null; };
    reset();
    const out = [];
    for (;;) {
      while (nb < size) { cur |= (bytes[bi++] ?? 0) << nb; nb += 8; }
      const code = cur & ((1 << size) - 1);
      cur >>>= size; nb -= size;
      if (code === clear) { reset(); continue; }
      if (code === eoi) break;
      let entry;
      if (code < next && dict[code]) entry = dict[code];
      else entry = [...prev, prev[0]];
      out.push(...entry);
      if (prev) { dict[next++] = [...prev, entry[0]]; if (next === (1 << size) && size < 12) size++; }
      prev = entry;
    }
    frames.push(Uint8Array.from(out));
  }
  return { w, h, frames };
}

test('gif: header, size, frame count, trailer', () => {
  const w = 8, h = 6;
  const f = (v) => ({ rgba: new Uint8ClampedArray(w * h * 4).fill(v) });
  const gif = encodeGif([f(10), f(200), f(90)], w, h);
  assert.equal(String.fromCharCode(...gif.slice(0, 6)), 'GIF89a');
  assert.equal(gif.at(-1), 0x3b);
  const d = decodeFrames(gif);
  assert.deepEqual([d.w, d.h, d.frames.length], [w, h, 3]);
});

test('gif: LZW round-trips exactly (noise, long runs, dictionary overflow)', () => {
  const w = 160, h = 90;
  const noise = new Uint8ClampedArray(w * h * 4);
  let s = 12345;
  for (let i = 0; i < noise.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; noise[i] = (s >> 16) & 255; }
  const flat = new Uint8ClampedArray(w * h * 4).fill(255);
  const gif = encodeGif([{ rgba: noise }, { rgba: flat }], w, h);
  const d = decodeFrames(gif);
  assert.deepEqual(d.frames[0], quantize(noise, w, h));
  assert.deepEqual(d.frames[1], quantize(flat, w, h));
});

test('gif: palette is 256 x RGB and bad input throws', () => {
  assert.equal(palette332().length, 768);
  assert.throws(() => encodeGif([], 4, 4));
});
