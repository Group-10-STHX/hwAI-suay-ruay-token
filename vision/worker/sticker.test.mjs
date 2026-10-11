import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fitSize, alphaBBox, orientMask, maskCoverage, applyMask, removeIslands, featherAlpha, cropPadded,
  dilateOutline, addShadow, posterize, sobelEdges, cartoonize, landmarksBBox, roundedRectMask,
  buildSticker, OUTLINE_PX, STICKER_PAD, STICKER_MAX_SIDE,
  STICKER_STYLES, STICKER_PAD_MAX, normalizeStyle, padFor, distanceField, dieCut, toRgb, neonPalette, NEON_PALETTE,
  hashSeed, mulberry32, medianCutPalette, halftone, pixelate, kawaiify, lumPercentiles, boxBlur1, faceBBox,
} from './sticker.js';

const blank = (w, h) => new Uint8ClampedArray(w * h * 4);
function rect(rgba, w, x0, y0, x1, y1, [r, g, b] = [200, 50, 50], a = 255) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 4; rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = a; }
}
const A = (rgba, w, x, y) => rgba[(y * w + x) * 4 + 3];

test('fitSize keeps ratio and never upscales', () => {
  assert.deepEqual(fitSize(640, 360, 480), { w: 480, h: 270 });
  assert.deepEqual(fitSize(100, 50, 480), { w: 100, h: 50 });
  assert.deepEqual(fitSize(300, 900, 450), { w: 150, h: 450 });
  assert.deepEqual(fitSize(0, 0, 10), { w: 1, h: 1 });
});

test('alphaBBox finds the visible rectangle, null when empty', () => {
  const w = 20, h = 10, p = blank(w, h);
  assert.equal(alphaBBox(p, w, h), null);
  rect(p, w, 5, 2, 12, 7);
  assert.deepEqual(alphaBBox(p, w, h), { x: 5, y: 2, w: 7, h: 5 });
});

test('orientMask flips an inverted mask and scales 0..1 to 0..255', () => {
  const w = 20, h = 20;
  const good = new Float32Array(w * h);
  for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) good[y * w + x] = 1;
  const o1 = orientMask(good, w, h);
  assert.equal(o1[10 * w + 10], 255);
  assert.equal(o1[0], 0);
  const inv = good.map((v) => 1 - v);
  const o2 = orientMask(inv, w, h);
  assert.equal(o2[10 * w + 10], 255);
  assert.equal(o2[0], 0);
  assert.ok(Math.abs(maskCoverage(o2) - 0.25) < 1e-9);
});

test('applyMask + removeIslands drops tiny blobs, keeps the person', () => {
  const w = 60, h = 60, p = blank(w, h), mask = new Uint8Array(w * h);
  for (let y = 10; y < 50; y++) for (let x = 10; x < 40; x++) mask[y * w + x] = 255;
  mask[2 * w + 2] = 255; mask[2 * w + 3] = 255; // speck
  applyMask(p, w, h, mask);
  const removed = removeIslands(p, w, h);
  assert.ok(removed >= 2);
  assert.equal(A(p, w, 2, 2), 0);
  assert.equal(A(p, w, 20, 20), 255);
});

test('featherAlpha softens a hard edge', () => {
  const w = 10, h = 10, p = blank(w, h);
  rect(p, w, 3, 3, 7, 7);
  featherAlpha(p, w, h);
  assert.ok(A(p, w, 3, 3) > 0 && A(p, w, 3, 3) < 255);
  assert.equal(A(p, w, 5, 5), 255);
});

test('dilateOutline adds a white ring of about the radius and keeps the picture', () => {
  const w = 40, h = 40, p = blank(w, h);
  rect(p, w, 15, 15, 25, 25, [10, 20, 30]);
  const o = dilateOutline(p, w, h, 4);
  assert.equal(A(o, w, 14, 20), 255); // 1px outside
  assert.deepEqual([...o.slice((20 * w + 12) * 4, (20 * w + 12) * 4 + 4)], [255, 255, 255, 255]); // 3px outside
  assert.equal(A(o, w, 9, 20), 0); // 6px outside is beyond radius 4
  assert.deepEqual([...o.slice((20 * w + 20) * 4, (20 * w + 20) * 4 + 4)], [10, 20, 30, 255]);
  assert.equal(A(p, w, 14, 20), 0); // input untouched
});

test('addShadow only adds alpha around, never changes opaque pixels', () => {
  const w = 30, h = 30, p = blank(w, h);
  rect(p, w, 10, 10, 18, 18, [9, 9, 9]);
  const s = addShadow(p, w, h);
  assert.equal(A(s, w, 12, 12), 255);
  assert.ok(A(s, w, 19, 20) > 0 && A(s, w, 19, 20) < 120);
  assert.equal(A(s, w, 0, 0), 0);
});

test('posterize snaps to 5 levels', () => {
  const p = new Uint8ClampedArray([0, 60, 130, 255, 255, 190, 33, 255]);
  posterize(p, 5);
  const allowed = new Set([0, 64, 128, 191, 255]);
  for (const i of [0, 1, 2, 4, 5, 6]) assert.ok(allowed.has(p[i]), String(p[i]));
  assert.equal(p[3], 255);
});

test('sobelEdges lights up a vertical edge only', () => {
  const w = 12, h = 12, p = blank(w, h);
  rect(p, w, 0, 0, 6, 12, [0, 0, 0]);
  rect(p, w, 6, 0, 12, 12, [255, 255, 255]);
  const e = sobelEdges(p, w, h);
  assert.ok(e[5 * w + 6] > 100);
  assert.equal(e[5 * w + 1], 0);
});

test('cartoonize inks the edge, keeps alpha, uses few colours', () => {
  const w = 24, h = 24, p = blank(w, h);
  rect(p, w, 0, 0, 12, 24, [250, 220, 180]);
  rect(p, w, 12, 0, 24, 24, [30, 40, 120]);
  cartoonize(p, w, h);
  const px = (x, y) => [...p.slice((y * w + x) * 4, (y * w + x) * 4 + 3)];
  assert.deepEqual(px(12, 12), [24, 22, 30]);
  assert.equal(A(p, w, 3, 3), 255);
  const colours = new Set();
  for (let i = 0; i < w * h; i++) colours.add(`${p[i * 4]},${p[i * 4 + 1]},${p[i * 4 + 2]}`);
  assert.ok(colours.size <= 8, `colours ${colours.size}`);
});

test('landmarksBBox and roundedRectMask', () => {
  assert.equal(landmarksBBox([{ x: 0.5, y: 0.5 }]), null);
  const b = landmarksBBox([{ x: 0.4, y: 0.3, visibility: 1 }, { x: 0.6, y: 0.9, visibility: 1 }, { x: 0.5, y: 0.5, visibility: 0.9 }, { x: 0.1, y: 0.1, visibility: 0.01 }], 0.05);
  assert.ok(b.x > 0.3 && b.x < 0.4 && b.w > 0.2 && b.y + b.h <= 1);
  const m = roundedRectMask(20, 20, { x: 2, y: 2, w: 16, h: 16 }, 6);
  assert.equal(m[10 * 20 + 10], 255);
  assert.equal(m[2 * 20 + 2], 0); // rounded corner
  assert.equal(m[0], 0);
});

test('buildSticker: outline + padding, stays within max side, photo vs cartoon differ', () => {
  const w = 80, h = 60, p = blank(w, h);
  rect(p, w, 0, 0, w, h, [90, 140, 90]);
  const mask = new Uint8Array(w * h);
  for (let y = 15; y < 55; y++) for (let x = 25; x < 55; x++) mask[y * w + x] = 255;
  const before = new Uint8ClampedArray(p);
  const s = buildSticker({ rgba: p, w, h, mask, style: 'photo' });
  assert.deepEqual(p, before); // input frame untouched
  assert.equal(s.w, 30 + 2 * STICKER_PAD);
  assert.equal(s.h, 40 + 2 * STICKER_PAD);
  assert.ok(s.w <= STICKER_MAX_SIDE);
  const mid = (s.h >> 1) * s.w + (s.w >> 1);
  assert.deepEqual([...s.rgba.slice(mid * 4, mid * 4 + 4)], [90, 140, 90, 255]);
  // just outside the person: white
  const o = (STICKER_PAD - 2) * 4 + (s.h >> 1) * s.w * 4;
  assert.deepEqual([...s.rgba.slice(o, o + 4)], [255, 255, 255, 255]);
  assert.equal(s.rgba[3], 0); // far corner is transparent
  assert.ok(OUTLINE_PX >= 6);
  const c = buildSticker({ rgba: p, w, h, mask, style: 'cartoon' });
  assert.equal(c.w, s.w);
  assert.equal(buildSticker({ rgba: p, w, h, mask: new Uint8Array(w * h) }), null);
});

// ---------- more looks ----------

/** 160x120 frame: green wall, head (light, shaded) on a blue torso. mask = head circle + torso rect. */
function personFixture() {
  const w = 160, h = 120, p = blank(w, h), mask = new Uint8Array(w * h);
  rect(p, w, 0, 0, w, h, [90, 140, 90]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const head = (x - 80) ** 2 + (y - 40) ** 2 <= 22 * 22;
      const torso = x >= 40 && x < 120 && y >= 60;
      if (head) { const k = 1 - (x - 58) / 80; p[i] = 230 * k; p[i + 1] = 180 * k; p[i + 2] = 140 * k; if (y < 28) { p[i] = 50; p[i + 1] = 35; p[i + 2] = 30; } }
      else if (torso) { const k = 0.5 + (120 - x) / 160; p[i] = 40 * k; p[i + 1] = 120 * k; p[i + 2] = 170 * k; }
      if (head || torso) mask[y * w + x] = 255;
    }
  }
  return { rgba: p, w, h, mask };
}
/** 80x60 flat frame with a 30x40 rectangle person at x 25..55, y 15..55 (as in the photo test). */
function rectFixture() {
  const w = 80, h = 60, p = blank(w, h);
  rect(p, w, 0, 0, w, h, [90, 140, 90]);
  rect(p, w, 25, 15, 55, 55, [200, 160, 120]);
  const mask = new Uint8Array(w * h);
  for (let y = 15; y < 55; y++) for (let x = 25; x < 55; x++) mask[y * w + x] = 255;
  return { rgba: p, w, h, mask };
}
const px4 = (s, x, y) => [...s.rgba.slice((y * s.w + x) * 4, (y * s.w + x) * 4 + 4)];

test('style list, normalizeStyle and padFor', () => {
  assert.deepEqual([...STICKER_STYLES], ['photo', 'cartoon', 'comic', 'pixel', 'neon', 'kawaii']);
  assert.equal(normalizeStyle('kawaii'), 'kawaii');
  assert.equal(normalizeStyle('KAWAII'), 'photo');
  assert.equal(normalizeStyle(undefined), 'photo');
  assert.equal(padFor('photo'), STICKER_PAD);
  assert.equal(padFor('nope'), STICKER_PAD);
  for (const s of STICKER_STYLES) assert.ok(padFor(s) >= STICKER_PAD && padFor(s) <= STICKER_PAD_MAX, s);
});

test('distanceField is exact Euclidean, dieCut close fills a narrow notch', () => {
  const w = 20, h = 20, solid = new Uint8Array(w * h);
  solid[5 * w + 5] = 1;
  const d = distanceField(solid, w, h);
  assert.equal(d[5 * w + 5], 0);
  assert.ok(Math.abs(d[9 * w + 8] - 5) < 1e-6); // (3,4) away
  assert.ok(Math.abs(d[5 * w + 15] - 10) < 1e-6);
  // U shape: two bars 10px apart joined at the bottom; the gap centre is 5px from both bars
  const W = 40, H = 40, u = new Uint8Array(W * H);
  for (let y = 5; y < 35; y++) for (let x = 0; x < W; x++) if ((x >= 10 && x < 14) || (x >= 24 && x < 28) || (y >= 31 && x >= 10 && x < 28)) u[y * W + x] = 1;
  const g = 10 * W + 19;
  assert.equal(dieCut(u, W, H, 2, 0).cov[g], 0);
  assert.equal(dieCut(u, W, H, 2, 6).cov[g], 1);
  assert.equal(dieCut(u, W, H, 2, 6).cov[0], 0);
});

test('helpers: toRgb, neonPalette, seeds, median cut, percentiles, blur', () => {
  assert.deepEqual(toRgb('#FF2A2A'), [255, 42, 42]);
  assert.deepEqual(toRgb('ffd54a'), [255, 213, 74]);
  assert.deepEqual(toRgb([300, -4, 12.4]), [255, 0, 12]);
  assert.deepEqual(toRgb('red', [1, 2, 3]), [1, 2, 3]);
  assert.deepEqual(neonPalette({ hot: '#0000FF' }), { dark: NEON_PALETTE.dark, hot: [0, 0, 255], gold: NEON_PALETTE.gold });
  assert.equal(hashSeed('wai-1'), hashSeed('wai-1'));
  assert.notEqual(hashSeed('wai-1'), hashSeed('wai-2'));
  const a = mulberry32(7), b = mulberry32(7);
  for (let i = 0; i < 5; i++) { const v = a(); assert.equal(v, b()); assert.ok(v >= 0 && v < 1); }
  const pal = medianCutPalette([0, 0, 0, 0, 0, 0, 255, 255, 255, 250, 250, 250, 255, 0, 0], 3);
  assert.equal(pal.length, 3);
  assert.ok(pal.some((c) => c[0] === 0 && c[1] === 0) && pal.some((c) => c[0] === 255 && c[1] === 0));
  assert.ok(medianCutPalette([], 4).length === 0);
  const q = new Uint8ClampedArray(4 * 100);
  for (let i = 0; i < 100; i++) { q[i * 4] = q[i * 4 + 1] = q[i * 4 + 2] = i * 2; q[i * 4 + 3] = 255; }
  const [p10, p90] = lumPercentiles(q, [0.1, 0.9]);
  assert.ok(p10 >= 16 && p10 <= 20 && p90 >= 176 && p90 <= 180);
  assert.equal(lumPercentiles(blank(2, 2), [0.5]), null);
  const f = new Float32Array(25).fill(4);
  assert.ok(boxBlur1(f, 5, 5, 2).every((v) => Math.abs(v - 4) < 1e-5));
});

test('halftone: dots only where shaded, base lifted toward white', () => {
  const w = 30, h = 30, p = blank(w, h);
  rect(p, w, 0, 0, w, h, [120, 120, 120]);
  const shade = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 15; x < w; x++) shade[y * w + x] = 0.7;
  halftone(p, w, h, shade, { cell: 5 });
  const vals = (x0, x1) => { const s = new Set(); for (let y = 0; y < h; y++) for (let x = x0; x < x1; x++) s.add(p[(y * w + x) * 4]); return s; };
  const left = vals(0, 15), right = vals(16, 30);
  assert.equal(left.size, 1); // unshaded: one flat lifted colour
  assert.ok([...left][0] > 120);
  assert.ok(Math.min(...right) < 70 && Math.max(...right) > 120); // dots and gaps
});

test('new styles: valid, deterministic, input untouched, transparent corners, differ from photo', () => {
  const f = personFixture();
  const before = new Uint8ClampedArray(f.rgba);
  const photo = buildSticker({ ...f, style: 'photo' });
  for (const style of ['comic', 'pixel', 'neon', 'kawaii']) {
    const s1 = buildSticker({ ...f, style, seed: 'wai-x' });
    const s2 = buildSticker({ ...f, style, seed: 'wai-x' });
    assert.ok(s1 && s1.w <= STICKER_MAX_SIDE && s1.h <= STICKER_MAX_SIDE, style);
    assert.equal(s1.rgba.length, s1.w * s1.h * 4, style);
    assert.deepEqual(s1.rgba, s2.rgba, `${style} deterministic`);
    assert.equal(s1.rgba[3], 0, `${style} corner`);
    assert.ok(s1.w !== photo.w || s1.h !== photo.h || s1.rgba.some((v, i) => v !== photo.rgba[i]), `${style} differs`);
    assert.equal(buildSticker({ ...f, mask: new Uint8Array(f.w * f.h), style }), null);
  }
  assert.deepEqual(f.rgba, before);
  assert.deepEqual(buildSticker({ ...f, style: 'bogus' }), photo); // unknown style = photo
});

test('comic: black ink ring, then the white sticker border', () => {
  const f = rectFixture();
  const s = buildSticker({ ...f, style: 'comic' });
  const pad = padFor('comic');
  assert.equal(s.w, 30 + 2 * pad);
  const y = s.h >> 1;
  const ink = px4(s, pad - 2, y);
  assert.ok(ink[3] === 255 && Math.max(ink[0], ink[1], ink[2]) < 40, `ink ${ink}`);
  assert.deepEqual(px4(s, pad - 6, y), [255, 255, 255, 255]);
  assert.ok(px4(s, 1, y)[3] < 90); // beyond the border: only a faint shadow at most
});

test('pixel: few colours, crisp k x k blocks, dark outline then white border', () => {
  const f = personFixture();
  const s = buildSticker({ ...f, style: 'pixel' });
  const box = alphaBBox(f.rgba.map((v, i) => (i % 4 === 3 ? f.mask[i >> 2] : v)), f.w, f.h, 128);
  const k = Math.max(2, Math.round(Math.max(box.w, box.h) / 64));
  assert.equal(s.w % k, 0);
  assert.equal(s.h % k, 0);
  const colours = new Set();
  for (let i = 0; i < s.w * s.h; i++) {
    const a = s.rgba[i * 4 + 3];
    assert.ok(a === 0 || a === 255 || a === 77, `alpha ${a}`);
    if (a === 255) colours.add(`${s.rgba[i * 4]},${s.rgba[i * 4 + 1]},${s.rgba[i * 4 + 2]}`);
  }
  assert.ok(colours.size >= 4 && colours.size <= 16, `colours ${colours.size}`);
  for (let by = 0; by < s.h; by += k) for (let bx = 0; bx < s.w; bx += k) {
    const ref = px4(s, bx, by).join();
    assert.equal(px4(s, bx + k - 1, by + k - 1).join(), ref);
  }
  // walk in from the left on a torso row: transparent → white → dark outline → picture
  const y = s.h - 4 * k - 1;
  let x = 0;
  while (px4(s, x, y)[3] === 0) x++;
  assert.deepEqual(px4(s, x, y), [255, 255, 255, 255]);
  const o = px4(s, x + k, y);
  assert.ok(Math.max(o[0], o[1], o[2]) < 60, `outline ${o}`);
  // a huge subject still fits
  const big = pixelate(new Uint8ClampedArray(500 * 300 * 4).fill(255), 500, 300, { x: 0, y: 0, w: 500, h: 300 });
  assert.ok(big.w <= STICKER_MAX_SIDE && big.h <= STICKER_MAX_SIDE);
});

test('neon: duotone from the palette param, dark plate, red tube, glow fading out', () => {
  const f = personFixture();
  const s = buildSticker({ ...f, style: 'neon' });
  let redish = 0, n = 0;
  for (let i = 0; i < s.w * s.h; i++) {
    if (s.rgba[i * 4 + 3] < 255) continue;
    n++;
    if (s.rgba[i * 4] + 4 >= s.rgba[i * 4 + 2]) redish++; // the dark (#0A0A0C) is a hair bluer than red
  }
  assert.ok(redish / n > 0.97, `red share ${redish / n}`);
  const blue = buildSticker({ ...f, style: 'neon', palette: { hot: '#2050FF', gold: '#A0FFFF' } });
  let bluish = 0, m = 0;
  for (let i = 0; i < blue.w * blue.h; i++) {
    if (blue.rgba[i * 4 + 3] < 255) continue;
    m++;
    if (blue.rgba[i * 4 + 2] >= blue.rgba[i * 4]) bluish++;
  }
  assert.ok(bluish / m > 0.97, `blue share ${bluish / m}`);
  const r = rectFixture();
  const t = buildSticker({ ...r, style: 'neon' });
  const pad = padFor('neon'), y = t.h >> 1;
  const plate = px4(t, pad - 4, y);
  assert.ok(plate[3] === 255 && Math.max(plate[0], plate[1], plate[2]) < 30, `plate ${plate}`);
  const tube = px4(t, pad - 7, y);
  assert.ok(tube[3] === 255 && tube[0] > 200 && tube[1] < 200, `tube ${tube}`);
  const g1 = px4(t, pad - 12, y)[3], g2 = px4(t, pad - 18, y)[3];
  assert.ok(g1 > g2 && g2 > 0 && g1 < 255, `glow ${g1} ${g2}`);
  assert.equal(t.rgba[3], 0);
});

test('kawaii: white die-cut border, seeded sparkles, face brighten', () => {
  const r = rectFixture();
  const a = buildSticker({ ...r, style: 'kawaii', seed: 'wai-a' });
  const pad = padFor('kawaii'), y = a.h >> 1;
  assert.deepEqual(px4(a, pad - 6, y), [255, 255, 255, 255]);
  const others = ['wai-b', 'wai-c', 'wai-d'].map((seed) => buildSticker({ ...r, style: 'kawaii', seed }));
  assert.ok(others.some((o) => o.rgba.some((v, i) => v !== a.rgba[i])), 'different seed, different sparkles');
  assert.deepEqual(buildSticker({ ...r, style: 'kawaii', seed: 'wai-a' }).rgba, a.rgba);
  // face brighten: same grey frame, with and without a face box
  const w = 40, h = 40, g1 = blank(w, h);
  rect(g1, w, 0, 0, w, h, [100, 100, 100]);
  const g2 = new Uint8ClampedArray(g1);
  kawaiify(g1, w, h);
  kawaiify(g2, w, h, { face: { x: 10, y: 10, w: 20, h: 20 } });
  const c = (20 * w + 20) * 4;
  assert.ok(g2[c] > g1[c], 'face centre brighter');
  assert.equal(g2[0], g1[0]); // outside the face untouched
});

test('faceBBox: normalised box of face points, null when too few', () => {
  assert.equal(faceBBox([{ x: 0.5, y: 0.5 }]), null);
  assert.equal(faceBBox(null), null);
  const b = faceBBox([{ x: 0.4, y: 0.2, visibility: 0 }, { x: 0.6, y: 0.5 }, { x: 0.5, y: 0.3 }, { x: NaN, y: 1 }]);
  assert.ok(Math.abs(b.x - 0.4) < 1e-9 && Math.abs(b.w - 0.2) < 1e-9 && Math.abs(b.y - 0.2) < 1e-9 && Math.abs(b.h - 0.3) < 1e-9);
});
