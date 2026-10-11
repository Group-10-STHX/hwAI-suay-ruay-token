#!/usr/bin/env node
// Sticker look preview: draws synthetic people doing a wai (procedural shapes only: no photos, no network),
// runs every style in vision/worker/sticker.js and writes docs/variants/stickers/*.png + index.html.
//
//   node scripts/sticker-preview.mjs            → open docs/variants/stickers/index.html
//
// If ~/.waikusa/stickers/*.png exists (a real sticker from this machine), the newest one is re-styled as an extra
// subject. Its renders go to ~/.waikusa/sticker-preview/ (never into the repo); the gallery only links to them.
// WAI_STICKER_SAMPLE_DIR / WAI_STICKER_PREVIEW_OUT override both folders (used to test this path).
import { deflateSync, inflateSync } from 'node:zlib';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { STICKER_STYLES, buildSticker, distanceField, padFor } from '../vision/worker/sticker.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'variants', 'stickers');
const SAMPLE_DIR = process.env.WAI_STICKER_SAMPLE_DIR || join(homedir(), '.waikusa', 'stickers');
const SAMPLE_OUT = process.env.WAI_STICKER_PREVIEW_OUT || join(homedir(), '.waikusa', 'sticker-preview');

// ---------- tiny PNG codec (RGBA8, zlib from node) ----------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** RGBA8 → PNG bytes. Filter "up" on every row (small enough, simple). */
export function encodePng(rgba, w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (stride + 1);
    raw[o] = y ? 2 : 0;
    for (let x = 0; x < stride; x++) {
      const v = rgba[y * stride + x];
      raw[o + 1 + x] = y ? (v - rgba[(y - 1) * stride + x]) & 255 : v;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
/** PNG bytes → {rgba, w, h} for 8-bit RGB/RGBA, non-interlaced (what canvas.toBlob writes). null otherwise. */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  let p = 8, w = 0, h = 0, ct = 0, depth = 0, inter = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ct = data[9]; inter = data[12]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8 || inter !== 0 || (ct !== 6 && ct !== 2)) return null;
  const bpp = ct === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let r = v;
      if (f === 1) r = v + a;
      else if (f === 2) r = v + b;
      else if (f === 3) r = v + ((a + b) >> 1);
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      px[y * stride + x] = r & 255;
    }
  }
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    for (let c = 0; c < 3; c++) rgba[i * 4 + c] = px[i * bpp + c];
    rgba[i * 4 + 3] = bpp === 4 ? px[i * bpp + 3] : 255;
  }
  return { rgba, w, h };
}

// ---------- procedural subject ----------
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sdEllipse = (cx, cy, rx, ry) => (x, y) => (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry);
const sdCapsule = (ax, ay, bx, by, r) => (x, y) => {
  const pax = x - ax, pay = y - ay, bax = bx - ax, bay = by - ay;
  const t = clamp01((pax * bax + pay * bay) / (bax * bax + bay * bay));
  return Math.hypot(pax - bax * t, pay - bay * t) - r;
};
const sdRoundBox = (cx, cy, hx, hy, r) => (x, y) => {
  const qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const inter = (a, b) => (x, y) => Math.max(a(x, y), b(x, y));
const minus = (a, b) => (x, y) => Math.max(a(x, y), -b(x, y));
const LIGHT = (() => { const l = [-0.45, -0.6, 0.66]; const n = Math.hypot(...l); return l.map((v) => v / n); })();
/** Lambert shade of an ellipsoid bulge (0.45..1.1). */
const bulge = (cx, cy, rx, ry, amb = 0.45) => (x, y) => {
  const nx = (x - cx) / rx, ny = (y - cy) / ry;
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  return amb + 0.65 * Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
};
const scale = (c, k) => c.map((v) => v * k);
const hashNoise = (x, y, s) => {
  let n = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296 - 0.5;
};

function drawPerson(o, W = 448, H = 252) {
  const rgb = new Float32Array(W * H * 3);
  const cov = new Float32Array(W * H);
  const paint = (sdf, color, { person = true, alpha = 1 } = {}) => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const a = clamp01(0.5 - sdf(x + 0.5, y + 0.5)) * alpha;
        if (a <= 0) continue;
        const p = y * W + x;
        const c = typeof color === 'function' ? color(x + 0.5, y + 0.5) : color;
        for (let k = 0; k < 3; k++) rgb[p * 3 + k] += (c[k] - rgb[p * 3 + k]) * a;
        if (person) cov[p] = cov[p] + a * (1 - cov[p]);
      }
    }
  };
  // room: wall gradient, a door frame and a shelf, so the cut-out has something to remove
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      const g = 1 - 0.18 * (y / H) - 0.1 * Math.abs(x / W - 0.5);
      for (let k = 0; k < 3; k++) rgb[p * 3 + k] = o.wall[k] * g;
    }
  }
  paint(sdRoundBox(58, 150, 34, 120, 3), scale(o.wall, 0.78), { person: false });
  paint(sdRoundBox(58, 150, 28, 116, 2), scale(o.wall, 0.9), { person: false });
  paint(sdRoundBox(380, 70, 50, 4, 2), [120, 92, 70], { person: false });
  paint(sdRoundBox(360, 56, 8, 11, 2), [70, 120, 160], { person: false });
  paint(sdRoundBox(388, 54, 6, 13, 2), [190, 80, 70], { person: false });

  const cx = 224;
  const head = { cx, cy: 92, rx: 37, ry: 45 };
  const skinShade = (s) => (x, y) => scale(o.skin, s(x, y));
  if (o.longHair) paint(sdRoundBox(cx, 120, 50, 60, 34), (x, y) => scale(o.hair, 0.55 + 0.25 * bulge(cx, 110, 60, 80)(x, y)));
  paint(sdEllipse(cx, 84, 44, 44), (x, y) => scale(o.hair, 0.5 + 0.4 * bulge(cx, 80, 46, 46)(x, y))); // hair back
  paint(sdRoundBox(cx, 146, 17, 22, 8), skinShade((x) => 0.72 + 0.1 * Math.cos((x - cx) / 12))); // neck
  // torso + sleeves (shoulders as a big rounded box running off the bottom of the frame)
  const torso = sdRoundBox(cx, 238, 104, 80, 46);
  paint(torso, (x, y) => {
    const nx = (x - cx) / 110;
    const lit = 0.55 + 0.5 * Math.max(0, Math.sqrt(Math.max(0, 1 - nx * nx)) * 0.8 - nx * 0.35);
    const fold = 1 - 0.08 * Math.max(0, Math.sin((y - 170) / 7 + nx * 3)) * clamp01((y - 175) / 30);
    return scale(o.shirt, lit * fold);
  });
  paint(inter(sdEllipse(cx, 160, 22, 18), (x, y) => 158 - y), skinShade(() => 0.78)); // neckline
  paint(inter(sdCapsule(cx - 26, 158, cx + 26, 158, 5), (x, y) => y - 160), scale(o.shirt, 0.7)); // collar seam
  paint(sdEllipse(cx, 92, head.rx, head.ry), skinShade(bulge(head.cx, head.cy, head.rx, head.ry, 0.5))); // face
  paint(sdEllipse(cx - 38, 96, 6, 10), skinShade(() => 0.8)); // ears
  paint(sdEllipse(cx + 38, 96, 6, 10), skinShade(() => 0.66));
  // fringe: the hair ellipse above a wavy line
  paint(inter(sdEllipse(cx, 84, 44, 44), (x, y) => y - (68 + 5 * Math.sin((x - cx) * 0.16) + Math.abs(x - cx) * 0.18)), (x, y) =>
    scale(o.hair, 0.6 + 0.55 * bulge(cx, 70, 46, 30)(x, y) + 0.12 * Math.sin((x - cx) * 0.5)));
  // face details
  const eye = (ex) => {
    paint(sdEllipse(ex, 95, 7, 4.2), [245, 242, 236], { person: false });
    paint(sdEllipse(ex + 0.5, 95, 3.6, 4), [40, 28, 24], { person: false });
    paint(sdEllipse(ex - 1, 93.5, 1.2, 1.2), [255, 255, 255], { person: false });
    paint(sdCapsule(ex - 8, 84 - (ex < cx ? 0 : 0), ex + 7, 83, 1.8), scale(o.hair, 0.8), { person: false });
  };
  eye(cx - 15);
  eye(cx + 15);
  paint(sdCapsule(cx + 2, 100, cx + 4, 110, 2.5), skinShade(() => 0.78), { person: false }); // nose shadow
  paint(minus(sdEllipse(cx, 118, 12, 6), sdEllipse(cx, 114, 13, 5)), [160, 70, 70], { person: false }); // smile
  paint(sdEllipse(cx - 22, 110, 8, 5), [235, 120, 120], { person: false, alpha: 0.28 }); // blush
  paint(sdEllipse(cx + 22, 110, 8, 5), [235, 120, 120], { person: false, alpha: 0.28 });
  if (o.glasses) {
    for (const ex of [cx - 15, cx + 15]) paint(minus(sdRoundBox(ex, 95, 12, 9, 4), sdRoundBox(ex, 95, 10, 7, 3)), [30, 30, 36], { person: false });
    paint(sdCapsule(cx - 3, 93, cx + 3, 93, 1.2), [30, 30, 36], { person: false });
  }
  // wai: forearms from the elbows up to palms pressed together in front of the chest
  const arm = (ex) => {
    paint(sdCapsule(ex, 246, cx + (ex < cx ? -9 : 9), 196, 17), (x, y) => scale(o.shirt, 0.62 + 0.25 * bulge(ex, 230, 40, 40)(x, y))); // sleeve
    paint(sdCapsule(cx + (ex < cx ? -26 : 26), 214, cx + (ex < cx ? -8 : 8), 182, 11), skinShade(bulge(cx, 196, 30, 30, 0.55))); // wrist
  };
  arm(cx - 82);
  arm(cx + 82);
  const palms = sdEllipse(cx, 165, 15, 33);
  paint(palms, skinShade(bulge(cx, 160, 15, 33, 0.55)));
  paint(sdCapsule(cx, 136, cx, 194, 0.8), skinShade(() => 0.55), { person: false }); // palm seam
  for (const fy of [148, 156, 164]) paint(sdCapsule(cx - 12, fy, cx - 3, fy + 1, 0.6), skinShade(() => 0.7), { person: false });
  paint(sdEllipse(cx, 196, 14, 8), skinShade(() => 0.66)); // heels of the hands

  // camera grain + mask with the softness a segmenter gives
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    const x = p % W, y = (p - x) / W;
    const n = hashNoise(x, y, o.seed) * 9;
    rgba[p * 4] = rgb[p * 3] + n;
    rgba[p * 4 + 1] = rgb[p * 3 + 1] + n;
    rgba[p * 4 + 2] = rgb[p * 3 + 2] + n;
    rgba[p * 4 + 3] = 255;
  }
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0, c = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) { s += cov[yy * W + xx]; c++; }
      }
      mask[y * W + x] = Math.round((s / c) * 255);
    }
  }
  const face = { x: (head.cx - head.rx) / W, y: (head.cy - head.ry) / H, w: (2 * head.rx) / W, h: (2 * head.ry) / H };
  return { rgba, w: W, h: H, mask, face };
}

const SUBJECTS = [
  { id: 'a', label: 'subject A · ผมสั้น เสื้อเขียว', skin: [236, 186, 146], hair: [58, 38, 28], shirt: [36, 150, 158], wall: [214, 218, 224], seed: 11 },
  { id: 'b', label: 'subject B · ผมยาว แว่น เสื้อมัสตาร์ด', skin: [168, 112, 78], hair: [24, 20, 24], shirt: [214, 158, 48], wall: [196, 206, 190], longHair: true, glasses: true, seed: 23 },
];

const STYLE_INFO = {
  photo: { th: 'รูปถ่าย', note: 'ของเดิม: ภาพจริง + ขอบขาว 6px + เงา' },
  cartoon: { th: 'การ์ตูน', note: 'ของเดิม: เบลอ + posterize 5 ระดับ + เส้นหมึกตามขอบ' },
  comic: { th: 'คอมิก', note: 'สีอุ่นอิ่มตัว, เงาเป็นเม็ด halftone, เส้นหมึกดำหนา + ขอบสติ๊กเกอร์ขาว' },
  pixel: { th: 'พิกเซล', note: 'ย่อเหลือ ~64px, palette 13 สี + หมึก + ขาว, ขยายแบบ nearest, ขอบเข้ม 1 พิกเซล' },
  neon: { th: 'นีออน', note: 'duotone มืด→แดง hud→ทอง blessed, scanline, ฐานดำ + หลอดนีออนแดงเรือง (สีส่งเป็นพารามิเตอร์)' },
  kawaii: { th: 'คาวาอี้', note: 'พาสเทลนุ่ม, ขอบขาวมนใหญ่แบบไดคัท, ดาววิบวับตาม seed (waiId), หน้าสว่างขึ้นเมื่อรู้ตำแหน่งหน้า' },
};

// ---------- real sample (optional, stays outside the repo) ----------
function newestSample() {
  try {
    const files = readdirSync(SAMPLE_DIR).filter((f) => /^[A-Za-z0-9_-]+\.png$/.test(f));
    files.sort((a, b) => statSync(join(SAMPLE_DIR, b)).mtimeMs - statSync(join(SAMPLE_DIR, a)).mtimeMs);
    return files.length ? join(SAMPLE_DIR, files[0]) : null;
  } catch {
    return null;
  }
}

/** A saved sticker already has a white ring + shadow: take alpha as the mask and peel the ring off. */
function subjectFromSticker(file) {
  const img = decodePng(readFileSync(file));
  if (!img) return null;
  let { rgba, w, h } = img;
  const k = Math.min(1, 440 / Math.max(w, h));
  if (k < 1) {
    const nw = Math.round(w * k), nh = Math.round(h * k), small = new Uint8ClampedArray(nw * nh * 4);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      const s = (Math.min(h - 1, Math.floor(y / k)) * w + Math.min(w - 1, Math.floor(x / k))) * 4;
      small.set(rgba.subarray(s, s + 4), (y * nw + x) * 4);
    }
    rgba = small; w = nw; h = nh;
  }
  const hole = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) hole[i] = rgba[i * 4 + 3] < 200 ? 1 : 0;
  const d = distanceField(hole, w, h);
  const ring = Math.max(2, Math.round(6 * k)) + 1;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) { mask[i] = d[i] > ring ? 255 : 0; rgba[i * 4 + 3] = 255; }
  return { rgba, w, h, mask, face: null };
}

// ---------- run ----------
function main() {
  mkdirSync(OUT, { recursive: true });
  const rows = [];
  const rel = (p) => relative(OUT, p).split('\\').join('/');
  const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

  const subjects = SUBJECTS.map((s) => ({ ...s, ...drawPerson(s) }));
  for (const s of subjects) {
    writeFileSync(join(OUT, `source-${s.id}.png`), encodePng(s.rgba, s.w, s.h));
    const m = new Uint8ClampedArray(s.w * s.h * 4);
    for (let i = 0; i < s.w * s.h; i++) { m[i * 4] = m[i * 4 + 1] = m[i * 4 + 2] = s.mask[i]; m[i * 4 + 3] = 255; }
    writeFileSync(join(OUT, `mask-${s.id}.png`), encodePng(m, s.w, s.h));
  }

  const sampleFile = newestSample();
  const sample = sampleFile ? subjectFromSticker(sampleFile) : null;
  if (sample) mkdirSync(SAMPLE_OUT, { recursive: true });

  for (const style of STICKER_STYLES) {
    const cells = [];
    for (const s of subjects) {
      const t0 = performance.now();
      const st = buildSticker({ rgba: s.rgba, w: s.w, h: s.h, mask: s.mask, style, seed: `wai-demo-${s.id}`, face: s.face });
      const ms = performance.now() - t0;
      const png = encodePng(st.rgba, st.w, st.h);
      const file = join(OUT, `${style}-${s.id}.png`);
      writeFileSync(file, png);
      cells.push({ src: rel(file), w: st.w, h: st.h, bytes: png.length, ms, label: s.label });
    }
    let real = null;
    if (sample) {
      const st = buildSticker({ rgba: sample.rgba, w: sample.w, h: sample.h, mask: sample.mask, style, seed: 'wai-sample' });
      if (st) {
        const file = join(SAMPLE_OUT, `${style}.png`);
        writeFileSync(file, encodePng(st.rgba, st.w, st.h));
        real = { src: pathToFileURL(file).href, w: st.w, h: st.h };
      }
    }
    rows.push({ style, cells, real });
    console.log(`${style.padEnd(8)} ${cells.map((c) => `${c.w}x${c.h} ${kb(c.bytes)} ${c.ms.toFixed(0)}ms`).join(' · ')}`);
  }

  // ---------- gallery ----------
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const tile = (cls, c) => `<figure class="tile ${cls}"><img src="${esc(c.src)}" width="${c.w}" height="${c.h}" alt="" loading="lazy"></figure>`;
  const card = (r) => {
    const info = STYLE_INFO[r.style];
    const meta = r.cells.map((c) => `${c.w}×${c.h} · ${kb(c.bytes)} · ${c.ms.toFixed(0)} ms`).join('<br>');
    return `
    <section class="card" id="${r.style}">
      <header>
        <h2><code>${r.style}</code> <span>${esc(info.th)}</span></h2>
        <p class="meta">pad ${padFor(r.style)}px<br>${meta}</p>
      </header>
      <p class="note">${esc(info.note)}</p>
      <div class="pair">${r.cells.map((c) => tile('dark', c) + tile('light', c)).join('')}</div>
      <div class="strip" title="ขนาดจริงใน StickerStrip ของหน้าหลัก (48px บนพื้น surface)">
        <span>48px</span>${r.cells.map((c) => `<img class="thumb" src="${esc(c.src)}" alt="">`).join('')}
        ${r.cells.map((c) => `<img class="thumb on-light" src="${esc(c.src)}" alt="">`).join('')}
      </div>
      ${r.real ? `<div class="pair real">${tile('dark', r.real)}${tile('light', r.real)}</div>` : ''}
    </section>`;
  };
  const sampleNote = sampleFile
    ? `<p class="callout">ตัวอย่างจริง: re-style จาก <code>${esc(sampleFile)}</code> (ใหม่สุด) · ไฟล์ผลลัพธ์อยู่ที่ <code>${esc(SAMPLE_OUT)}</code> นอก repo · หน้านี้แค่ลิงก์ไปหา (เปิดได้เฉพาะเครื่องนี้) ไม่มีรูปจริงถูก copy เข้า repo · ขอบขาวเดิมถูกลอกออกโดยประมาณ ผลจึงหยาบกว่าการตัดจากเฟรมกล้องจริง</p>`
    : `<p class="callout">ไม่พบสติ๊กเกอร์จริงใน <code>~/.waikusa/stickers/</code> ตอนสร้างหน้านี้ · ไหว้ผ่านสักครั้งแล้วรัน <code>node scripts/sticker-preview.mjs</code> อีกรอบ จะมีแถวตัวอย่างจริงเพิ่ม (ผลเก็บใน <code>~/.waikusa/sticker-preview/</code> นอก repo)</p>`;

  const html = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sticker Looks</title>
<style>
  :root { --bg: #0a0a0c; --surface: #15151a; --hud: #ff2a2a; --hud-dim: #7a1414; --gold: #ffd54a; --text: #f2f2f2; --dim: #9a9aa5; --paper: #f2efe8; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, 'IBM Plex Sans Thai', sans-serif; }
  main { max-width: 1480px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { font: 600 22px/1.2 ui-monospace, 'JetBrains Mono', monospace; letter-spacing: 1px; margin: 0 0 4px; }
  h1 b { color: var(--hud); }
  .lede { color: var(--dim); margin: 0 0 16px; max-width: 80ch; }
  code { font-family: ui-monospace, 'JetBrains Mono', monospace; font-size: 0.92em; }
  .sources { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
  .sources figure { margin: 0; }
  .sources img { display: block; height: 96px; width: auto; border: 1px solid var(--hud-dim); border-radius: 4px; }
  .sources figcaption { color: var(--dim); font-size: 12px; }
  .callout { border-left: 3px solid var(--gold); padding: 6px 10px; color: var(--dim); background: var(--surface); border-radius: 0 4px 4px 0; max-width: 100ch; }
  nav { display: flex; gap: 6px; flex-wrap: wrap; margin: 12px 0 20px; }
  nav a { color: var(--text); text-decoration: none; border: 1px solid var(--hud-dim); border-radius: 4px; padding: 2px 10px; font: 13px ui-monospace, monospace; }
  nav a:hover { border-color: var(--hud); color: var(--hud); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 520px), 1fr)); gap: 16px; }
  .card { background: var(--surface); border: 1px solid #26262e; border-radius: 10px; padding: 14px; min-width: 0; }
  .card header { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
  .card h2 { margin: 0; font: 600 18px/1.2 ui-monospace, monospace; }
  .card h2 code { color: var(--hud); }
  .card h2 span { color: var(--text); font: 500 15px ui-sans-serif, system-ui, sans-serif; margin-left: 6px; }
  .meta { margin: 0; color: var(--dim); font: 11px/1.4 ui-monospace, monospace; text-align: right; }
  .note { margin: 6px 0 10px; color: var(--dim); font-size: 13px; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .tile { margin: 0; height: 232px; display: flex; align-items: center; justify-content: center; border-radius: 6px; overflow: hidden; padding: 8px; }
  .tile img { max-width: 100%; max-height: 100%; width: auto; height: auto; display: block; }
  @media (max-width: 560px) { .tile { height: 160px; } }
  #pixel .tile img, #pixel .thumb { image-rendering: pixelated; }
  .tile.dark { background: var(--bg); background-image: linear-gradient(rgba(255,42,42,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,42,42,.07) 1px, transparent 1px); background-size: 16px 16px; }
  .tile.light { background: var(--paper); }
  .strip { display: flex; align-items: center; gap: 4px; margin-top: 10px; flex-wrap: wrap; }
  .strip span { color: var(--dim); font: 11px ui-monospace, monospace; margin-right: 4px; }
  .thumb { height: 48px; width: 48px; object-fit: contain; background: var(--surface); border: 1px solid var(--hud-dim); border-radius: 4px; }
  .thumb.on-light { background: var(--paper); border-color: #d8d2c4; }
  .real { margin-top: 8px; }
  footer { color: var(--dim); font-size: 13px; margin-top: 28px; }
  @media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { --surface: #1b1b21; } }
</style>
</head>
<body>
<main>
  <h1>hwAI <b>ไหว้กูซะ</b> · sticker looks</h1>
  <p class="lede">ทุกสไตล์ที่ <code>vision/worker/sticker.js</code> ทำได้ วาดจากคนสังเคราะห์ (รูปทรงล้วน ไม่มีรูปถ่ายจริง) แต่ละใบโชว์บนพื้นมืด (HUD) และพื้นสว่าง แถว 48px คือขนาดจริงในแถบสติ๊กเกอร์ของหน้าหลัก · ตั้งค่า: <code>config.json → sticker_style</code> หรือ select ในหน้าหลัก · ค่าเริ่มต้น <code>photo</code></p>
  <div class="sources">
    ${subjects.map((s) => `<figure><img src="source-${s.id}.png" alt=""><figcaption>${esc(s.label)} · เฟรม</figcaption></figure><figure><img src="mask-${s.id}.png" alt=""><figcaption>mask</figcaption></figure>`).join('')}
  </div>
  ${sampleNote}
  <nav>${rows.map((r) => `<a href="#${r.style}">${r.style}</a>`).join('')}</nav>
  <div class="grid">${rows.map(card).join('')}</div>
  <footer>สร้างโดย <code>node scripts/sticker-preview.mjs</code> · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · เวลา (ms) วัดบน node เครื่องนี้ รวม segment-free pipeline เท่านั้น</footer>
</main>
</body>
</html>
`;
  writeFileSync(join(OUT, 'index.html'), html);
  console.log(`\nwrote ${rel(join(OUT, 'index.html'))} in ${relative(ROOT, OUT)}${sample ? ` · real sample renders in ${SAMPLE_OUT}` : ''}`);
}

export { drawPerson, SUBJECTS };
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
