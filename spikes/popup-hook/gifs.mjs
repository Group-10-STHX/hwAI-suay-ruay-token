// gifs: GIF ตอนไหว้ผ่าน (จาก vision/worker/gif.js) เก็บใน <home>/gifs/<waiId>.gif เฉพาะในเครื่อง ไม่อัปโหลดขึ้นเว็บ
// รูปแบบเดียวกับ stickers.mjs: atomic write, ชื่อไฟล์กรองจาก id, เกินจำนวนลบเก่าสุด
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const GIF_FILE_RE = /^[A-Za-z0-9_-]+\.gif$/;
export const MAX_GIFS = 100;
export const MAX_GIF_BYTES = 3 * 1024 * 1024;

export const gifFileName = (id) => {
  const clean = String(id ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  return clean ? `${clean}.gif` : null;
};
export const isGif = (b) => b && b.length > 12 && b.toString('latin1', 0, 6) === 'GIF89a' && b[b.length - 1] === 0x3b;

export function createGifs({ home, max = MAX_GIFS, logger = console } = {}) {
  const dir = join(home, 'gifs');

  function save(id, bytes) {
    try {
      const name = gifFileName(id);
      const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
      if (!name || !isGif(buf) || buf.length > MAX_GIF_BYTES) return null;
      mkdirSync(dir, { recursive: true });
      const tmp = join(dir, `.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      writeFileSync(tmp, buf);
      renameSync(tmp, join(dir, name));
      prune();
      return name;
    } catch (e) {
      logger.warn?.('[gifs] save failed', e?.message || e);
      return null;
    }
  }

  function prune() {
    try {
      const all = readdirSync(dir).filter((f) => GIF_FILE_RE.test(f)).map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }));
      all.sort((a, b) => b.t - a.t);
      for (const g of all.slice(max)) { try { unlinkSync(join(dir, g.f)); } catch { /* ช่างมัน */ } }
    } catch { /* ยังไม่มีโฟลเดอร์ */ }
  }

  const has = (id) => { const n = gifFileName(id); return Boolean(n && existsSync(join(dir, n))); };
  function resolveFile(file) {
    if (typeof file !== 'string' || !GIF_FILE_RE.test(file)) return null;
    const p = join(dir, file);
    return existsSync(p) ? p : null;
  }
  return { dir, save, has, resolveFile };
}
