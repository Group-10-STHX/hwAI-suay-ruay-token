// stickers: PNG ที่ตัดฉากหลังแล้ว (จาก vision/worker) เก็บใน <home>/stickers/<waiId>.png เฉพาะในเครื่อง
// เขียนแบบ atomic (tmp แล้ว rename) · เกิน max ไฟล์ลบเก่าสุด · ชื่อไฟล์สร้างเองจาก id ที่ผ่านการกรองแล้วเท่านั้น
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const STICKER_FILE_RE = /^[A-Za-z0-9_-]+\.png$/;
// สไตล์ที่ vision/worker/sticker.js ทำได้ (ต้องตรงกับ STICKER_STYLES ในไฟล์นั้นและใน app/renderer/src/api/types.ts มีเทสเช็ค)
// ไม่ import จาก worker ตรงๆ เพราะไฟล์นั้นเป็น ESM ของหน้าต่าง renderer (.js) ส่วนนี่รันใน main ของ Electron
export const STICKER_STYLES = Object.freeze(['photo', 'cartoon', 'comic', 'pixel', 'neon', 'kawaii']);
export const DEFAULT_STICKER_STYLE = 'photo';
export const isStickerStyle = (s) => STICKER_STYLES.includes(s);
/** ค่าจาก config.sticker_style → สไตล์ที่ใช้ได้ (ไม่รู้จัก = photo) */
export const normalizeStickerStyle = (s) => (isStickerStyle(s) ? s : DEFAULT_STICKER_STYLE);
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export const MAX_STICKERS = 200;
export const MAX_STICKER_BYTES = 2 * 1024 * 1024;

/** id → ชื่อไฟล์ปลอดภัย (ตัดทุกอย่างที่ไม่ใช่ A-Z a-z 0-9 _ -) · ว่าง = null */
export function stickerFileName(id) {
  const clean = String(id ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  return clean ? `${clean}.png` : null;
}

export function isPng(buf) {
  return buf && buf.length > PNG_SIG.length && PNG_SIG.every((b, i) => buf[i] === b);
}

export function createStickers({ home, max = MAX_STICKERS, logger = console } = {}) {
  const dir = join(home, 'stickers');

  /** บันทึก → ชื่อไฟล์ หรือ null ถ้าไม่ใช่ PNG / ใหญ่เกิน / เขียนไม่ได้ (ไม่ throw) */
  function save(id, bytes) {
    try {
      const name = stickerFileName(id);
      const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
      if (!name || !isPng(buf) || buf.length > MAX_STICKER_BYTES) return null;
      mkdirSync(dir, { recursive: true });
      const tmp = join(dir, `.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      writeFileSync(tmp, buf);
      renameSync(tmp, join(dir, name));
      prune();
      return name;
    } catch (e) {
      logger.warn?.('[stickers] save failed', e?.message || e);
      return null;
    }
  }

  /** ใหม่สุดก่อน: [{file, id, mtimeMs}] */
  function list(limit = 24) {
    try {
      if (!existsSync(dir)) return [];
      const out = [];
      for (const f of readdirSync(dir)) {
        if (!STICKER_FILE_RE.test(f)) continue;
        try { out.push({ file: f, id: f.slice(0, -4), mtimeMs: statSync(join(dir, f)).mtimeMs }); } catch { /* หายไประหว่างอ่าน */ }
      }
      out.sort((a, b) => b.mtimeMs - a.mtimeMs || (a.file < b.file ? 1 : -1));
      return out.slice(0, limit);
    } catch {
      return [];
    }
  }

  function prune() {
    const all = list(Infinity);
    for (const s of all.slice(max)) {
      try { unlinkSync(join(dir, s.file)); } catch { /* ช่างมัน */ }
    }
  }

  /** path เต็มของไฟล์ที่ผ่านตรวจชื่อแล้วและมีอยู่จริง ไม่งั้น null */
  function resolveFile(file) {
    if (typeof file !== 'string' || !STICKER_FILE_RE.test(file)) return null;
    const p = join(dir, file);
    return existsSync(p) ? p : null;
  }

  return { dir, save, list, resolveFile };
}
