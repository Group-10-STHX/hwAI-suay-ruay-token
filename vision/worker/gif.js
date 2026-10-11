// GIF89a encoder แบบโง่ๆ ไว้ทำ "GIF ตอนไหว้" ในเครื่อง (ไม่มี dependency, รันได้ทั้งใน worker และ node เทส)
// - รับเฟรม RGBA เล็กๆ (เช่น 160×90) หลายเฟรม → ไบต์ของ GIF วนซ้ำไม่จบ
// - สี: palette ตายตัว 256 สี แบบ 3-3-2 บิต (R8×G8×B4) + ordered dither 4×4 เล็กน้อย → ดูเป็นพิกเซลหยาบ ตั้งใจให้โง่ ไฟล์เล็ก
// - LZW ปกติของ GIF (min code size 8, ล้าง dictionary เมื่อเต็ม 4096)

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** palette 256 สี (R3 G3 B2) เป็น Uint8Array ยาว 768 */
export function palette332() {
  const p = new Uint8Array(768);
  for (let i = 0; i < 256; i++) {
    const r = (i >> 5) & 7, g = (i >> 2) & 7, b = i & 3;
    p[i * 3] = Math.round((r * 255) / 7);
    p[i * 3 + 1] = Math.round((g * 255) / 7);
    p[i * 3 + 2] = Math.round((b * 255) / 3);
  }
  return p;
}

/** RGBA → ดัชนีสี 3-3-2 พร้อม ordered dither */
export function quantize(rgba, w, h) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const t = (BAYER4[(y & 3) * 4 + (x & 3)] - 7.5) * 2; // ±15
      const r = Math.max(0, Math.min(255, rgba[i] + t));
      const g = Math.max(0, Math.min(255, rgba[i + 1] + t));
      const b = Math.max(0, Math.min(255, rgba[i + 2] + t * 2));
      out[y * w + x] = ((r >> 5) << 5) | ((g >> 5) << 2) | (b >> 6);
    }
  }
  return out;
}

function lzw(indices, minCode = 8) {
  const clear = 1 << minCode;
  const eoi = clear + 1;
  const bytes = [];
  let cur = 0, nbits = 0;
  const emit = (code, size) => {
    cur |= code << nbits;
    nbits += size;
    while (nbits >= 8) { bytes.push(cur & 255); cur >>>= 8; nbits -= 8; }
  };
  let size = minCode + 1;
  let next = eoi + 1;
  let dict = new Map();
  emit(clear, size);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const c = indices[i];
    const key = prefix * 256 + c;
    const hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    emit(prefix, size);
    if (next < 4096) {
      dict.set(key, next++);
      if (next - 1 === (1 << size) && size < 12) size++;
    } else {
      emit(clear, size);
      dict = new Map();
      size = minCode + 1;
      next = eoi + 1;
    }
    prefix = c;
  }
  emit(prefix, size);
  emit(eoi, size);
  if (nbits > 0) bytes.push(cur & 255);
  return bytes;
}

/**
 * frames: [{ rgba: Uint8ClampedArray|Uint8Array (w*h*4) }] · delayMs ต่อเฟรม (ปัดเป็นหน่วย 10 ms)
 * → Uint8Array ของไฟล์ .gif
 */
export function encodeGif(frames, w, h, { delayMs = 120 } = {}) {
  if (!frames.length || w < 1 || h < 1 || w > 65535 || h > 65535) throw new Error('encodeGif: bad input');
  const out = [];
  const u16 = (n) => out.push(n & 255, (n >> 8) & 255);
  for (const ch of 'GIF89a') out.push(ch.charCodeAt(0));
  u16(w); u16(h);
  out.push(0xf7, 0, 0); // global color table 256 สี, bg 0, aspect 0
  for (const v of palette332()) out.push(v);
  // NETSCAPE2.0 วนไม่จบ
  out.push(0x21, 0xff, 0x0b);
  for (const ch of 'NETSCAPE2.0') out.push(ch.charCodeAt(0));
  out.push(3, 1, 0, 0, 0);
  const delay = Math.max(2, Math.round(delayMs / 10));
  for (const f of frames) {
    out.push(0x21, 0xf9, 4, 0x04, delay & 255, (delay >> 8) & 255, 0, 0); // GCE: disposal 1 (ไม่ลบ)
    out.push(0x2c);
    u16(0); u16(0); u16(w); u16(h);
    out.push(0); // ไม่มี local table
    out.push(8);
    const data = lzw(quantize(f.rgba, w, h), 8);
    for (let i = 0; i < data.length; i += 255) {
      const n = Math.min(255, data.length - i);
      out.push(n);
      for (let k = 0; k < n; k++) out.push(data[i + k]);
    }
    out.push(0);
  }
  out.push(0x3b);
  return Uint8Array.from(out);
}
