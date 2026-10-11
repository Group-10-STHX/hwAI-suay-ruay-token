// Sticker helpers: pure pixel code on RGBA Uint8ClampedArray buffers (no DOM), so node can test them.
// The worker (worker.js) does the camera/canvas/MediaPipe part and calls buildSticker() with the result.

export const STICKER_MAX_SIDE = 512;
export const OUTLINE_PX = 6;
const SHADOW_BLUR = 4;
const SHADOW_DX = 2;
const SHADOW_DY = 3;
export const STICKER_PAD = OUTLINE_PX + SHADOW_BLUR + SHADOW_DY + 1;

/** Largest size that keeps the aspect ratio and fits max on the long side (never upscales). */
export function fitSize(w, h, max = STICKER_MAX_SIDE) {
  w = Math.max(1, Math.floor(w));
  h = Math.max(1, Math.floor(h));
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Bounding box of pixels with alpha >= thresh, or null when nothing is visible. */
export function alphaBBox(rgba, w, h, thresh = 8) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3] >= thresh) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * Make the mask polarity right. A selfie mask can come out as person=high or background=high
 * depending on the model build, so compare the centre (where the person is) to the border.
 * mask: Float32Array/Uint8Array of w*h in 0..1 or 0..255. Returns Uint8Array 0..255, person high.
 */
export function orientMask(mask, w, h) {
  const out = new Uint8Array(w * h);
  let max = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] > max) max = mask[i];
  const k = max > 1.0001 ? 1 : 255;
  for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(mask[i] * k)));
  const bx = Math.max(1, Math.round(w * 0.2));
  const by = Math.max(1, Math.round(h * 0.2));
  let cs = 0, cn = 0, es = 0, en = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = out[y * w + x];
      const edge = x < bx || x >= w - bx || y < by || y >= h - by;
      if (edge) { es += v; en++; } else { cs += v; cn++; }
    }
  }
  if (cn && en && es / en > cs / cn) for (let i = 0; i < out.length; i++) out[i] = 255 - out[i];
  return out;
}

/** Fraction (0..1) of mask pixels above 127. Used to reject empty or full-frame masks. */
export function maskCoverage(mask) {
  let n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] > 127) n++;
  return mask.length ? n / mask.length : 0;
}

/** Write a person mask (Uint8, 0..255) into the alpha channel with a soft threshold. */
export function applyMask(rgba, w, h, mask) {
  for (let i = 0; i < w * h; i++) {
    const m = mask[i];
    rgba[i * 4 + 3] = m <= 80 ? 0 : m >= 176 ? 255 : Math.round(((m - 80) / 96) * 255);
  }
}

/** Remove disconnected blobs smaller than minFrac of the largest one (alpha >= 128 counts as solid). */
export function removeIslands(rgba, w, h, minFrac = 0.02, minArea = 24) {
  const n = w * h;
  const label = new Int32Array(n);
  const areas = [0];
  const stack = [];
  let next = 0;
  for (let s = 0; s < n; s++) {
    if (label[s] || rgba[s * 4 + 3] < 128) continue;
    next++;
    let area = 0;
    label[s] = next;
    stack.push(s);
    while (stack.length) {
      const p = stack.pop();
      area++;
      const x = p % w;
      const y = (p - x) / w;
      const tryPush = (q) => {
        if (!label[q] && rgba[q * 4 + 3] >= 128) { label[q] = next; stack.push(q); }
      };
      if (x > 0) tryPush(p - 1);
      if (x < w - 1) tryPush(p + 1);
      if (y > 0) tryPush(p - w);
      if (y < h - 1) tryPush(p + w);
    }
    areas.push(area);
  }
  const biggest = Math.max(0, ...areas);
  const keep = areas.map((a) => a >= Math.max(minArea, biggest * minFrac));
  let removed = 0;
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3];
    if (!a) continue;
    // soft edge pixels (not labelled) are kept only if a kept blob touches them
    let lab = label[i];
    if (!lab) {
      const x = i % w;
      const y = (i - x) / w;
      if (x > 0) lab = lab || label[i - 1];
      if (x < w - 1) lab = lab || label[i + 1];
      if (y > 0) lab = lab || label[i - w];
      if (y < h - 1) lab = lab || label[i + w];
    }
    if (!lab || !keep[lab]) { rgba[i * 4 + 3] = 0; removed++; }
  }
  return removed;
}

/** 3x3 box blur of the alpha channel (about 1px feather). In place. */
export function featherAlpha(rgba, w, h) {
  const src = new Uint8Array(w * h);
  for (let i = 0; i < src.length; i++) src[i] = rgba[i * 4 + 3];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          s += src[yy * w + xx];
          c++;
        }
      }
      rgba[(y * w + x) * 4 + 3] = Math.round(s / c);
    }
  }
}

/** Crop a rectangle out of an RGBA buffer into a new buffer padded by pad transparent pixels. */
export function cropPadded(rgba, w, h, box, pad = 0) {
  const ow = box.w + pad * 2;
  const oh = box.h + pad * 2;
  const out = new Uint8ClampedArray(ow * oh * 4);
  for (let y = 0; y < box.h; y++) {
    const sy = box.y + y;
    if (sy < 0 || sy >= h) continue;
    for (let x = 0; x < box.w; x++) {
      const sx = box.x + x;
      if (sx < 0 || sx >= w) continue;
      const s = (sy * w + sx) * 4;
      const d = ((y + pad) * ow + x + pad) * 4;
      out[d] = rgba[s]; out[d + 1] = rgba[s + 1]; out[d + 2] = rgba[s + 2]; out[d + 3] = rgba[s + 3];
    }
  }
  return { rgba: out, w: ow, h: oh };
}

/**
 * Solid sticker outline: every transparent pixel within radius of an opaque one becomes opaque
 * colour (default white). Returns a new buffer; the picture itself is untouched on top.
 */
export function dilateOutline(rgba, w, h, radius = OUTLINE_PX, color = [255, 255, 255]) {
  const out = new Uint8ClampedArray(rgba);
  const solid = (x, y) => rgba[(y * w + x) * 4 + 3] >= 128;
  const offsets = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) if (dx * dx + dy * dy <= radius * radius + radius * 0.5) offsets.push(dx, dy);
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!solid(x, y)) continue;
      const border = x === 0 || y === 0 || x === w - 1 || y === h - 1 || !solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1);
      if (!border) continue;
      for (let k = 0; k < offsets.length; k += 2) {
        const xx = x + offsets[k];
        const yy = y + offsets[k + 1];
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const i = (yy * w + xx) * 4;
        if (out[i + 3] < 255 && rgba[i + 3] < 128) {
          out[i] = color[0]; out[i + 1] = color[1]; out[i + 2] = color[2]; out[i + 3] = 255;
        }
      }
    }
  }
  return out;
}

/** Faint drop shadow under the existing alpha (black, offset, blurred). Returns a new buffer. */
export function addShadow(rgba, w, h, { dx = SHADOW_DX, dy = SHADOW_DY, blur = SHADOW_BLUR, opacity = 0.28 } = {}) {
  let sh = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = x - dx, sy = y - dy;
      if (sx >= 0 && sy >= 0 && sx < w && sy < h) sh[y * w + x] = rgba[(sy * w + sx) * 4 + 3] / 255;
    }
  }
  const boxPass = (src, horizontal) => {
    const dst = new Float32Array(w * h);
    const r = Math.max(1, Math.round(blur / 2));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let k = -r; k <= r; k++) {
          const xx = horizontal ? x + k : x;
          const yy = horizontal ? y : y + k;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h) s += src[yy * w + xx];
        }
        dst[y * w + x] = s / (2 * r + 1);
      }
    }
    return dst;
  };
  sh = boxPass(boxPass(sh, true), false);
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < w * h; i++) {
    const fa = rgba[i * 4 + 3] / 255;
    const sa = sh[i] * opacity;
    const oa = fa + sa * (1 - fa);
    if (oa <= 0) continue;
    // black shadow under the picture: colour = fg * fa / oa
    const k = fa / oa;
    out[i * 4] = rgba[i * 4] * k;
    out[i * 4 + 1] = rgba[i * 4 + 1] * k;
    out[i * 4 + 2] = rgba[i * 4 + 2] * k;
    out[i * 4 + 3] = Math.round(oa * 255);
  }
  return out;
}

/** Posterize RGB to `levels` levels per channel. In place. */
export function posterize(rgba, levels = 5) {
  const step = 255 / (levels - 1);
  for (let i = 0; i < rgba.length; i += 4) {
    for (let c = 0; c < 3; c++) rgba[i + c] = Math.round(Math.round(rgba[i + c] / step) * step);
  }
}

/** Cheap edge-preserving-ish smoothing: average over a (2r+1) box twice, RGB only. In place. */
export function smoothRgb(rgba, w, h, r = 2) {
  const pass = (horizontal) => {
    const src = new Uint8ClampedArray(rgba);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s0 = 0, s1 = 0, s2 = 0, c = 0;
        for (let k = -r; k <= r; k++) {
          const xx = horizontal ? x + k : x;
          const yy = horizontal ? y : y + k;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = (yy * w + xx) * 4;
          s0 += src[j]; s1 += src[j + 1]; s2 += src[j + 2]; c++;
        }
        const i = (y * w + x) * 4;
        rgba[i] = s0 / c; rgba[i + 1] = s1 / c; rgba[i + 2] = s2 / c;
      }
    }
  };
  pass(true);
  pass(false);
}

/** Sobel magnitude of luminance, Uint8Array w*h (clamped 0..255). */
export function sobelEdges(rgba, w, h) {
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  const at = (x, y) => lum[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1) + at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1);
      const gy = -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) + at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
      out[y * w + x] = Math.min(255, Math.round(Math.hypot(gx, gy) / 4));
    }
  }
  return out;
}

/** Cartoon look: smooth, posterize ~5 levels, then ink dark ~2px lines on strong edges. In place. */
export function cartoonize(rgba, w, h, { levels = 5, edgeThresh = 40, ink = [24, 22, 30] } = {}) {
  const edges = sobelEdges(rgba, w, h); // edges of the raw frame, before smoothing
  smoothRgb(rgba, w, h, 2);
  posterize(rgba, levels);
  const mark = new Uint8Array(w * h);
  for (let i = 0; i < mark.length; i++) mark[i] = edges[i] > edgeThresh ? 1 : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // 2px thick: a pixel is ink when it or its left/up neighbour is an edge
      const on = mark[y * w + x] || (x > 0 && mark[y * w + x - 1]) || (y > 0 && mark[(y - 1) * w + x]);
      if (on) {
        const i = (y * w + x) * 4;
        rgba[i] = ink[0]; rgba[i + 1] = ink[1]; rgba[i + 2] = ink[2];
      }
    }
  }
}

/** Normalised bbox {x,y,w,h} (0..1) of pose landmarks, with margin; null if not enough points. */
export function landmarksBBox(landmarks, margin = 0.08, minVis = 0.3) {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0, n = 0;
  for (const p of landmarks || []) {
    if (!p || (p.visibility != null && p.visibility < minVis)) continue;
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    n++;
  }
  if (n < 3) return null;
  x0 = Math.max(0, x0 - margin); y0 = Math.max(0, y0 - margin * 1.6);
  x1 = Math.min(1, x1 + margin); y1 = Math.min(1, y1 + margin);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Normalised bbox {x,y,w,h} of face landmarks (no visibility filter: face points carry none); null if < 3 points. */
export function faceBBox(landmarks) {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0, n = 0;
  for (const p of landmarks || []) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    n++;
  }
  if (n < 3 || x1 <= x0 || y1 <= y0) return null;
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(1, x1); y1 = Math.min(1, y1);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Mask (Uint8 0/255) of a rounded rectangle for the fallback crop. box in pixels. */
export function roundedRectMask(w, h, box, radius) {
  const m = new Uint8Array(w * h);
  const r = Math.max(0, Math.min(radius, box.w / 2, box.h / 2));
  for (let y = Math.max(0, Math.floor(box.y)); y < Math.min(h, Math.ceil(box.y + box.h)); y++) {
    for (let x = Math.max(0, Math.floor(box.x)); x < Math.min(w, Math.ceil(box.x + box.w)); x++) {
      const cx = x + 0.5 < box.x + r ? box.x + r : x + 0.5 > box.x + box.w - r ? box.x + box.w - r : x + 0.5;
      const cy = y + 0.5 < box.y + r ? box.y + r : y + 0.5 > box.y + box.h - r ? box.y + box.h - r : y + 0.5;
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r + 0.25) m[y * w + x] = 255;
    }
  }
  return m;
}


// ---------- more looks: comic / pixel / neon / kawaii ----------
// Same rules as above: RGBA Uint8ClampedArray in, new or in-place buffer out, no DOM, no randomness
// (kawaii sparkles use a seeded PRNG so the same seed always gives the same stars).

/** Every style the worker accepts. Order = order in the home page select. Default 'photo'. */
export const STICKER_STYLES = Object.freeze(['photo', 'cartoon', 'comic', 'pixel', 'neon', 'kawaii']);
export const normalizeStyle = (s) => (STICKER_STYLES.includes(s) ? s : 'photo');

// transparent margin per style: outline/border + glow or shadow + sparkles must fit inside it
const STYLE_PAD = { photo: STICKER_PAD, cartoon: STICKER_PAD, comic: 18, pixel: 24, neon: 24, kawaii: 30 };
export const STICKER_PAD_MAX = Math.max(...Object.values(STYLE_PAD));
/** Padding for a style. The worker fits the frame to STICKER_MAX_SIDE - 2 * padFor(style). */
export const padFor = (style) => STYLE_PAD[normalizeStyle(style)];

/** Neon defaults mirror app tokens bg / hud / blessed (app/renderer/src/theme/tokens.ts). Callers may pass others. */
export const NEON_PALETTE = Object.freeze({ dark: [10, 10, 12], hot: [255, 42, 42], gold: [255, 213, 74] });
/** Kawaii hairline + sparkle colours (pastel pink, butter, sky). */
export const KAWAII_PALETTE = Object.freeze({ line: [255, 150, 190], stars: [[255, 196, 64], [255, 128, 178], [96, 184, 255]] });
const COMIC_INK = [16, 14, 20];
const PIXEL_INK = [26, 20, 38];

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lum = (rgba, i) => 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];

/** '#RRGGBB' | [r,g,b] → [r,g,b], or fallback when it is neither. */
export function toRgb(c, fallback) {
  if (Array.isArray(c) && c.length >= 3 && c.slice(0, 3).every((v) => Number.isFinite(v))) return c.slice(0, 3).map((v) => Math.max(0, Math.min(255, Math.round(v))));
  if (typeof c === 'string' && /^#?[0-9a-f]{6}$/i.test(c)) {
    const n = parseInt(c.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return fallback;
}

/** Neon palette from a partial {dark, hot, gold} (hex or rgb), missing keys = NEON_PALETTE. */
export function neonPalette(p) {
  return { dark: toRgb(p?.dark, NEON_PALETTE.dark), hot: toRgb(p?.hot, NEON_PALETTE.hot), gold: toRgb(p?.gold, NEON_PALETTE.gold) };
}

/** Saturation / contrast / lift toward white / warm shift on RGB. In place. */
export function adjustColor(rgba, { sat = 1, contrast = 1, lift = 0, warm = 0 } = {}) {
  for (let i = 0; i < rgba.length; i += 4) {
    const l = lum(rgba, i);
    for (let c = 0; c < 3; c++) {
      let v = l + (rgba[i + c] - l) * sat;
      v = (v - 128) * contrast + 128;
      v += (255 - v) * lift;
      if (c === 0) v += warm;
      else if (c === 2) v -= warm * 0.8;
      rgba[i + c] = v;
    }
  }
}

/** Luminance values at fractions qs (0..1) over visible pixels (alpha >= 128); null when almost nothing is visible. */
export function lumPercentiles(rgba, qs) {
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 3] >= 128) { hist[Math.round(lum(rgba, i))]++; n++; }
  if (n < 16) return null;
  return qs.map((q) => {
    let acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * q) return v; }
    return 255;
  });
}

/** Separable box blur (radius r, two passes ≈ soft) of a single-channel Float32Array. Returns a new array. */
export function boxBlur1(src, w, h, r) {
  let a = src;
  for (let pass = 0; pass < 2; pass++) {
    for (const horizontal of [true, false]) {
      const out = new Float32Array(w * h);
      const n = horizontal ? w : h, m = horizontal ? h : w;
      for (let j = 0; j < m; j++) {
        const at = (k) => (horizontal ? a[j * w + k] : a[k * w + j]);
        let s = 0, c = 0;
        for (let k = 0; k <= Math.min(r, n - 1); k++) { s += at(k); c++; }
        for (let k = 0; k < n; k++) {
          out[horizontal ? j * w + k : k * w + j] = s / c;
          const add = k + r + 1, sub = k - r;
          if (add < n) { s += at(add); c++; }
          if (sub >= 0) { s -= at(sub); c--; }
        }
      }
      a = out;
    }
  }
  return a;
}

/** FNV-1a hash of any value's string form → uint32 (seed for mulberry32). */
export function hashSeed(seed) {
  let h = 0x811c9dc5;
  const s = String(seed ?? '');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Deterministic PRNG in [0,1). */
export function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Exact Euclidean distance (px) from each pixel to the nearest pixel where solid[i] is truthy (0 on them).
 * Felzenszwalb-Huttenlocher, O(w*h). solid: any array-like of w*h. Returns Float32Array.
 */
export function distanceField(solid, w, h) {
  const INF = 1e20;
  const n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n), z = new Float64Array(n + 1);
  const v = new Int32Array(n);
  const grid = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) grid[i] = solid[i] ? 0 : INF;
  const pass1d = (len) => {
    let k = 0;
    v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
  };
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    pass1d(h);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    pass1d(w);
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x];
  }
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = Math.sqrt(grid[i]);
  return out;
}

/** Uint8Array w*h, 1 where alpha >= thresh. */
export function solidOf(rgba, w, h, thresh = 128) {
  const s = new Uint8Array(w * h);
  for (let i = 0; i < s.length; i++) s[i] = rgba[i * 4 + 3] >= thresh ? 1 : 0;
  return s;
}

/**
 * Anti-aliased die-cut shape around the subject: grown by `radius`, and with `close` > 0 the concave gaps
 * (between arms and head, say) narrower than about 2*close are filled, so the border reads as one round sticker.
 * Returns { cov: Float32Array 0..1, edge: distance inward from the shape edge (negative outside), dist: distance to the subject }.
 */
export function dieCut(solid, w, h, radius, close = 0) {
  const dist = distanceField(solid, w, h);
  const cov = new Float32Array(w * h);
  const edge = new Float32Array(w * h);
  if (close <= 0) {
    for (let i = 0; i < cov.length; i++) { edge[i] = radius - dist[i]; cov[i] = clamp01(edge[i] + 0.5); }
    return { cov, edge, dist };
  }
  const outside = new Uint8Array(w * h);
  for (let i = 0; i < outside.length; i++) outside[i] = dist[i] > radius + close ? 1 : 0;
  const dOut = distanceField(outside, w, h);
  for (let i = 0; i < cov.length; i++) {
    // inside the grown shape: distance to its outside minus close; outside it: fall back to the plain offset
    edge[i] = outside[i] ? radius - dist[i] : dOut[i] - close;
    cov[i] = clamp01(edge[i] + 0.5);
  }
  return { cov, edge, dist };
}

/** Straight-alpha "source over" of one colour with coverage a (0..1) onto out at byte index i. */
function over(out, i, r, g, b, a) {
  if (a <= 0) return;
  if (a >= 1) { out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = 255; return; }
  const da = out[i + 3] / 255;
  const k = da * (1 - a);
  const oa = a + k;
  out[i] = (r * a + out[i] * k) / oa;
  out[i + 1] = (g * a + out[i + 1] * k) / oa;
  out[i + 2] = (b * a + out[i + 2] * k) / oa;
  out[i + 3] = oa * 255;
}

/** Put the (feathered) subject on top of whatever is already in out. */
function subjectOver(out, rgba) {
  for (let i = 0; i < rgba.length; i += 4) over(out, i, rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3] / 255);
}

// ----- comic -----

/**
 * Halftone shading: dots on a rotated grid, bigger where `shade` (0..1 per pixel) is darker. The base is
 * lifted toward white so the dots do the shading, like a printed comic. In place on RGB.
 */
export function halftone(rgba, w, h, shade, { cell = 5, angle = Math.PI / 4, start = 0.22, dot = 0.4, lift = 0.22 } = {}) {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const i = p * 4;
      const u = (x * ca + y * sa) / cell;
      const v = (-x * sa + y * ca) / cell;
      const du = (u - Math.floor(u) - 0.5) * cell;
      const dv = (v - Math.floor(v) - 0.5) * cell;
      const t = clamp01((shade[p] - start) / (1 - start));
      const r = cell * 0.72 * Math.sqrt(t); // 0.707*cell = dots touch
      const cov = t > 0 ? clamp01(r - Math.hypot(du, dv) + 0.5) : 0;
      for (let c = 0; c < 3; c++) {
        const base = rgba[i + c] + (255 - rgba[i + c]) * lift;
        rgba[i + c] = base + (rgba[i + c] * dot - base) * cov;
      }
    }
  }
}

/** Comic colouring: warm + saturated flat fills, halftone shading, black ink on strong edges. In place. */
export function comicize(rgba, w, h, { ink = COMIC_INK, edgeThresh = 44, cell = 5 } = {}) {
  const edges = sobelEdges(rgba, w, h);
  smoothRgb(rgba, w, h, 2);
  adjustColor(rgba, { sat: 1.35, contrast: 1.08, warm: 10 });
  // dots go where a pixel is darker than its surroundings (folds, under the chin) plus the darkest tones of the
  // subject (hair), so darker skin or a bright shirt next to the face does not bury the face in dots
  const [lo, hi] = lumPercentiles(rgba, [0.04, 0.8]) ?? [0, 255];
  const span = Math.max(40, hi - lo);
  const L = new Float32Array(w * h);
  for (let p = 0; p < L.length; p++) L[p] = lum(rgba, p * 4);
  const local = boxBlur1(L, w, h, 9);
  const shade = new Float32Array(w * h);
  for (let p = 0; p < shade.length; p++) {
    const global = clamp01((hi - L[p]) / span);
    shade[p] = clamp01(Math.max((local[p] - L[p]) / 46 + 0.02, global - 0.4) * 1.25);
  }
  posterize(rgba, 6);
  halftone(rgba, w, h, shade, { cell, start: 0.12 });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const on = edges[p] > edgeThresh || (x > 0 && edges[p - 1] > edgeThresh) || (y > 0 && edges[p - w] > edgeThresh);
      if (on) { const i = p * 4; rgba[i] = ink[0]; rgba[i + 1] = ink[1]; rgba[i + 2] = ink[2]; }
    }
  }
}

function comicFrame({ rgba, w, h }, { ink = COMIC_INK, inkPx = 3.5, borderPx = 9 } = {}) {
  const solid = solidOf(rgba, w, h);
  const inkRing = dieCut(solid, w, h, inkPx, 0);
  const white = dieCut(solid, w, h, borderPx, 3);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    over(out, p * 4, 255, 255, 255, white.cov[p]);
    over(out, p * 4, ink[0], ink[1], ink[2], inkRing.cov[p]);
  }
  subjectOver(out, rgba);
  return addShadow(out, w, h, { opacity: 0.3 });
}

// ----- pixel -----

/** Median-cut palette (deterministic) of at most n colours from a flat [r,g,b, r,g,b, ...] list. */
export function medianCutPalette(rgb, n) {
  const count = rgb.length / 3;
  if (!count) return [];
  let boxes = [Array.from({ length: count }, (_, k) => k)];
  const range = (box) => {
    const lo = [255, 255, 255], hi = [0, 0, 0];
    for (const k of box) for (let c = 0; c < 3; c++) { const v = rgb[k * 3 + c]; if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; }
    const r = [hi[0] - lo[0], (hi[1] - lo[1]) * 1.1, (hi[2] - lo[2]) * 0.9]; // green matters a bit more
    const ch = r[0] >= r[1] && r[0] >= r[2] ? 0 : r[1] >= r[2] ? 1 : 2;
    return { ch, size: Math.max(r[0], r[1], r[2]) };
  };
  while (boxes.length < n) {
    let best = -1, bestScore = 0, bestCh = 0;
    boxes.forEach((box, bi) => {
      if (box.length < 2) return;
      const { ch, size } = range(box);
      const score = size * Math.sqrt(box.length);
      if (score > bestScore) { bestScore = score; best = bi; bestCh = ch; }
    });
    if (best < 0) break;
    const box = boxes[best].slice().sort((a, b) => rgb[a * 3 + bestCh] - rgb[b * 3 + bestCh] || a - b);
    const mid = box.length >> 1;
    boxes = [...boxes.slice(0, best), box.slice(0, mid), box.slice(mid), ...boxes.slice(best + 1)];
  }
  return boxes.map((box) => {
    const s = [0, 0, 0];
    for (const k of box) for (let c = 0; c < 3; c++) s[c] += rgb[k * 3 + c];
    return s.map((v) => Math.round(v / box.length));
  });
}

function nearest(pal, r, g, b) {
  let best = 0, bd = Infinity;
  for (let k = 0; k < pal.length; k++) {
    const dr = pal[k][0] - r, dg = pal[k][1] - g, db = pal[k][2] - b;
    const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
    if (d < bd) { bd = d; best = k; }
  }
  return pal[best];
}

/**
 * Retro portrait: box-downscale the subject to ~target px on the long side, quantize to `colors` colours,
 * add a 1 art-pixel dark outline + 1 art-pixel white border + hard shadow, then nearest-neighbour upscale.
 * rgba already has the person in alpha; box = alphaBBox. Returns {rgba, w, h, k} (k = art pixel size).
 */
export function pixelate(rgba, w, h, box, { target = 64, colors = 13, ink = PIXEL_INK, maxSide = STICKER_MAX_SIDE } = {}) {
  const P = 3; // art pixels around: outline, border, shadow
  const long = Math.max(box.w, box.h);
  let k = Math.max(2, Math.min(8, Math.round(long / target)));
  while (k > 1 && (Math.ceil(long / k) + 2 * P) * k > maxSide) k--;
  const sw = Math.ceil(box.w / k), sh = Math.ceil(box.h / k);
  const W = sw + 2 * P, H = sh + 2 * P;
  const small = new Uint8ClampedArray(W * H * 4);
  const state = new Uint8Array(W * H); // 0 empty, 1 subject, 2 ink, 3 white, 4 shadow
  for (let sy = 0; sy < sh; sy++) {
    for (let sx = 0; sx < sw; sx++) {
      let sa = 0, sr = 0, sg = 0, sb = 0, n = 0;
      for (let yy = 0; yy < k; yy++) {
        const y = box.y + sy * k + yy;
        if (y >= h || y >= box.y + box.h) break;
        for (let xx = 0; xx < k; xx++) {
          const x = box.x + sx * k + xx;
          if (x >= w || x >= box.x + box.w) break;
          const i = (y * w + x) * 4;
          const a = rgba[i + 3];
          sa += a; sr += rgba[i] * a; sg += rgba[i + 1] * a; sb += rgba[i + 2] * a; n++;
        }
      }
      if (!n || sa / n < 128) continue;
      const p = (sy + P) * W + sx + P;
      small[p * 4] = sr / sa; small[p * 4 + 1] = sg / sa; small[p * 4 + 2] = sb / sa; small[p * 4 + 3] = 255;
      state[p] = 1;
    }
  }
  adjustColor(small, { sat: 1.25, contrast: 1.1 });
  const list = [];
  for (let p = 0; p < W * H; p++) if (state[p] === 1) list.push(small[p * 4], small[p * 4 + 1], small[p * 4 + 2]);
  const pal = medianCutPalette(list, colors);
  for (let p = 0; p < W * H; p++) {
    if (state[p] !== 1) continue;
    const c = nearest(pal, small[p * 4], small[p * 4 + 1], small[p * 4 + 2]);
    small[p * 4] = c[0]; small[p * 4 + 1] = c[1]; small[p * 4 + 2] = c[2];
  }
  const grow = (from, to, diag) => {
    const add = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (state[y * W + x]) continue;
        let hit = false;
        for (let dy = -1; dy <= 1 && !hit; dy++) {
          for (let dx = -1; dx <= 1 && !hit; dx++) {
            if ((!dx && !dy) || (!diag && dx && dy)) continue;
            const xx = x + dx, yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < W && yy < H && state[yy * W + xx] && state[yy * W + xx] <= from) hit = true;
          }
        }
        if (hit) add.push(y * W + x);
      }
    }
    for (const p of add) state[p] = to;
  };
  grow(1, 2, false); // dark outline: 4-neighbour, chunky
  grow(2, 3, true); // white border: 8-neighbour, rounder corners
  const shadowAt = [];
  for (let y = 1; y < H; y++) for (let x = 1; x < W; x++) if (!state[y * W + x] && state[(y - 1) * W + x - 1]) shadowAt.push(y * W + x);
  for (const p of shadowAt) state[p] = 4;
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    if (state[p] === 2) { small[i] = ink[0]; small[i + 1] = ink[1]; small[i + 2] = ink[2]; small[i + 3] = 255; }
    else if (state[p] === 3) { small[i] = 255; small[i + 1] = 255; small[i + 2] = 255; small[i + 3] = 255; }
    else if (state[p] === 4) { small[i] = 0; small[i + 1] = 0; small[i + 2] = 0; small[i + 3] = 77; }
  }
  const ow = W * k, oh = H * k;
  const out = new Uint8ClampedArray(ow * oh * 4);
  for (let y = 0; y < oh; y++) {
    const srow = ((y / k) | 0) * W;
    for (let x = 0; x < ow; x++) {
      const s = (srow + ((x / k) | 0)) * 4;
      const d = (y * ow + x) * 4;
      out[d] = small[s]; out[d + 1] = small[s + 1]; out[d + 2] = small[s + 2]; out[d + 3] = small[s + 3];
    }
  }
  return { rgba: out, w: ow, h: oh, k };
}

// ----- neon -----

function ramp(stops, t) {
  for (let s = 1; s < stops.length; s++) {
    if (t <= stops[s][0]) {
      const [t0, c0] = stops[s - 1], [t1, c1] = stops[s];
      const f = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
    }
  }
  return stops[stops.length - 1][1];
}

/**
 * Dark duotone (dark → hot, gold only in the brightest highlights) with a contrast stretch over the visible
 * subject and faint CRT scanlines. Colours come from `pal` ({dark, hot, gold} rgb). In place on RGB.
 */
export function neonize(rgba, w, h, pal = NEON_PALETTE, { scanEvery = 3, scanDim = 0.84 } = {}) {
  smoothRgb(rgba, w, h, 1);
  // tone map = half linear stretch, half histogram equalisation over the visible subject (uses the whole ramp)
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 3] >= 128) { hist[Math.round(lum(rgba, i))]++; n++; }
  const [lo, hi] = lumPercentiles(rgba, [0.03, 0.98]) ?? [0, 255];
  const tone = new Float32Array(256);
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    const lin = clamp01((v - lo) / Math.max(24, hi - lo));
    tone[v] = n ? 0.5 * lin + 0.5 * (acc / n) : v / 255;
  }
  const { dark, hot, gold } = pal;
  const mid = [dark[0] + (hot[0] - dark[0]) * 0.42, dark[1] + (hot[1] - dark[1]) * 0.42, dark[2] + (hot[2] - dark[2]) * 0.42];
  const stops = [[0, dark], [0.12, dark], [0.48, mid], [0.82, hot], [1, gold]];
  for (let y = 0; y < h; y++) {
    const dim = scanEvery > 1 && y % scanEvery === scanEvery - 1 ? scanDim : 1;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const t = tone[Math.round(lum(rgba, i))];
      const c = ramp(stops, t);
      rgba[i] = c[0] * dim; rgba[i + 1] = c[1] * dim; rgba[i + 2] = c[2] * dim;
    }
  }
}

function neonFrame({ rgba, w, h }, pal, { platePx = 6, tubePx = 2.6, glowPx = 5, glow = 0.6, glowMax = 16 } = {}) {
  const solid = solidOf(rgba, w, h);
  const { dist } = dieCut(solid, w, h, platePx, 0);
  const { dark, hot, gold } = pal;
  const outer = platePx + tubePx;
  const core = [hot[0] + (255 - hot[0]) * 0.55, hot[1] + (255 - hot[1]) * 0.55, hot[2] + (255 - hot[2]) * 0.55];
  const out = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    const d = dist[p];
    if (d > outer - 0.5 && d < outer + glowMax) {
      const fade = clamp01((outer + glowMax - d) / 4); // soft stop at the padding edge
      over(out, i, hot[0], hot[1], hot[2], glow * Math.exp(-(d - outer + 0.5) / glowPx) * fade);
    }
    over(out, i, hot[0], hot[1], hot[2], clamp01(outer + 0.5 - d)); // tube
    const mid = platePx + tubePx / 2;
    over(out, i, core[0], core[1], core[2], clamp01(0.9 - Math.abs(d - mid)) * 0.9); // hot white core of the tube
    over(out, i, dark[0], dark[1], dark[2], clamp01(platePx + 0.5 - d)); // black vinyl plate
    if (d > 0.5 && d < 2.6) over(out, i, gold[0], gold[1], gold[2], clamp01(d - 0.6) * clamp01(2.6 - d) * 0.9); // thin gold rim around the person
  }
  subjectOver(out, rgba);
  return out;
}

// ----- kawaii -----

/** Pixel rect of a normalised face box {x,y,w,h} (0..1 of the frame), or null. */
function faceRect(face, w, h) {
  if (!face || ![face.x, face.y, face.w, face.h].every(Number.isFinite) || face.w <= 0 || face.h <= 0) return null;
  return { x: face.x * w, y: face.y * h, w: face.w * w, h: face.h * h };
}

/**
 * Soft pastel look: blur a little, posterize lightness only (hue kept), saturate, then mix toward white.
 * face (pixel rect, optional) gets a gentle brighten with a soft oval falloff. In place on RGB.
 */
export function kawaiify(rgba, w, h, { face = null, levels = 5, floor = 0.34, sat = 1.35, milk = 0.1, shadowTint = [8, -4, 30], brighten = 0.12, line = [128, 82, 98], edgeThresh = 46 } = {}) {
  const edges = sobelEdges(rgba, w, h);
  smoothRgb(rgba, w, h, 3);
  for (let i = 0; i < rgba.length; i += 4) {
    const l = lum(rgba, i);
    // lightness: posterize to a few soft steps, lift the darks (floor) and tint them lilac, a splash of milk on top
    const lq = Math.round((l / 255) * (levels - 1)) / (levels - 1);
    const target = (floor + (1 - floor) * lq) * 255;
    for (let c = 0; c < 3; c++) {
      const v = target + (rgba[i + c] - l) * sat + shadowTint[c] * (1 - lq);
      rgba[i + c] = v + (255 - v) * milk;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      // soft cocoa line instead of black ink: full on the edge, half on the pixel right/below (≈1.5px)
      const k = edges[p] > edgeThresh ? 0.78 : (x > 0 && edges[p - 1] > edgeThresh) || (y > 0 && edges[p - w] > edgeThresh) ? 0.4 : 0;
      if (!k) continue;
      const i = p * 4;
      for (let c = 0; c < 3; c++) rgba[i + c] = rgba[i + c] + (line[c] - rgba[i + c]) * k;
    }
  }
  if (!face) return;
  const cx = face.x + face.w / 2, cy = face.y + face.h / 2;
  const rx = face.w * 0.62, ry = face.h * 0.66;
  const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(h, Math.ceil(cy + ry));
  const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(w, Math.ceil(cx + rx));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const q = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      if (q >= 1) continue;
      const t = (1 - q) * (1 - q) * brighten;
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) rgba[i + c] = rgba[i + c] + (255 - rgba[i + c]) * t;
    }
  }
}

/** 4-point sparkle (concave star) with 4x4 supersampling, or a round dot when `dot`. Composited over out. */
function drawSparkle(out, w, h, cx, cy, r, color, dot = false) {
  const y0 = Math.max(0, Math.floor(cy - r - 1)), y1 = Math.min(h, Math.ceil(cy + r + 1));
  const x0 = Math.max(0, Math.floor(cx - r - 1)), x1 = Math.min(w, Math.ceil(cx + r + 1));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      let hit = 0;
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const u = Math.abs(x + (sx + 0.5) / 4 - cx) / r;
          const v = Math.abs(y + (sy + 0.5) / 4 - cy) / r;
          if (dot ? u * u + v * v <= 1 : Math.sqrt(u) + Math.sqrt(v) <= 1) hit++;
        }
      }
      if (hit) over(out, (y * w + x) * 4, color[0], color[1], color[2], hit / 16);
    }
  }
}

/**
 * Sparkle positions just outside the die-cut border, from a seeded PRNG (same seed → same stars).
 * Returns [{x, y, r, dot, color}] (3 stars + 3 dots when there is room), favouring the upper part.
 */
export function sparklePlan(cut, w, h, seed, { borderPx = 12, stars = KAWAII_PALETTE.stars } = {}) {
  const rnd = mulberry32(hashSeed(seed));
  const cand = [];
  for (let y = 4; y < h - 4; y++) {
    for (let x = 4; x < w - 4; x++) {
      const p = y * w + x;
      const d = cut.dist[p];
      if (cut.edge[p] < -3 && d >= borderPx + 5 && d <= borderPx + 13 && y < h * 0.72) cand.push(p);
    }
  }
  const plan = [];
  const want = [13, 10, 7.5, 3, 2.5, 2];
  for (let s = 0; s < want.length && cand.length; s++) {
    for (let tries = 0; tries < 40; tries++) {
      const p = cand[Math.floor(rnd() * cand.length)];
      const x = p % w, y = (p - x) / w, r = want[s];
      if (x - r < 1 || y - r < 1 || x + r > w - 2 || y + r > h - 2) continue;
      if (plan.some((q) => Math.hypot(q.x - x, q.y - y) < (s < 3 ? 34 : 16) + q.r)) continue;
      plan.push({ x: x + 0.5, y: y + 0.5, r, dot: s >= 3, color: stars[(s + Math.floor(rnd() * stars.length)) % stars.length] });
      break;
    }
  }
  return plan;
}

function kawaiiFrame({ rgba, w, h }, { seed = '', borderPx = 12, closePx = 10, linePx = 1.6, palette = KAWAII_PALETTE } = {}) {
  const solid = solidOf(rgba, w, h);
  const cut = dieCut(solid, w, h, borderPx, closePx);
  const line = toRgb(palette.line, KAWAII_PALETTE.line);
  const stars = Array.isArray(palette.stars) && palette.stars.length ? palette.stars.map((c) => toRgb(c, KAWAII_PALETTE.stars[0])) : KAWAII_PALETTE.stars;
  let out = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    over(out, p * 4, line[0], line[1], line[2], clamp01(cut.edge[p] + linePx + 0.5)); // pastel hairline just outside
    over(out, p * 4, 255, 255, 255, cut.cov[p]);
  }
  subjectOver(out, rgba);
  out = addShadow(out, w, h, { dx: 0, dy: 3, blur: 6, opacity: 0.2 });
  for (const s of sparklePlan(cut, w, h, seed, { borderPx, stars })) drawSparkle(out, w, h, s.x, s.y, s.r, s.color, s.dot);
  return out;
}

/**
 * Whole pipeline on buffers. rgba: the frame (already fitted to <= STICKER_MAX_SIDE - 2*padFor(style)),
 * mask: Uint8Array w*h person=255. Returns {rgba, w, h} (RGBA, transparent background) or null.
 * style: one of STICKER_STYLES (unknown = 'photo'). Optional: seed (kawaii sparkles; use the wai id),
 * face {x,y,w,h} normalised 0..1 of the frame (kawaii brightens it), palette {dark,hot,gold} (neon colours).
 */
export function buildSticker({ rgba, w, h, mask, style = 'photo', seed = '', face = null, palette = null }) {
  style = normalizeStyle(style);
  const px = new Uint8ClampedArray(rgba); // never touch the caller's frame
  if (style === 'cartoon') cartoonize(px, w, h);
  applyMask(px, w, h, mask);
  removeIslands(px, w, h);
  const box = alphaBBox(px, w, h, 128);
  if (!box) return null;
  if (style === 'pixel') {
    const { rgba: out, w: ow, h: oh } = pixelate(px, w, h, box);
    return { rgba: out, w: ow, h: oh };
  }
  // colour work on the full frame (before the crop) so blurs never pull in the transparent padding
  if (style === 'comic') comicize(px, w, h);
  else if (style === 'neon') neonize(px, w, h, neonPalette(palette));
  else if (style === 'kawaii') kawaiify(px, w, h, { face: faceRect(face, w, h) });
  const crop = cropPadded(px, w, h, box, padFor(style));
  featherAlpha(crop.rgba, crop.w, crop.h);
  if (style === 'comic') return { rgba: comicFrame(crop), w: crop.w, h: crop.h };
  if (style === 'neon') return { rgba: neonFrame(crop, neonPalette(palette)), w: crop.w, h: crop.h };
  if (style === 'kawaii') return { rgba: kawaiiFrame(crop, { seed }), w: crop.w, h: crop.h };
  const outlined = dilateOutline(crop.rgba, crop.w, crop.h, OUTLINE_PX);
  const shadowed = addShadow(outlined, crop.w, crop.h);
  return { rgba: shadowed, w: crop.w, h: crop.h };
}
