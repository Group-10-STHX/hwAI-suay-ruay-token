// สวดบอกว่าแก้โค้ดอะไร: แปลงโค้ด JS ที่ AI เพิ่งแก้เป็นบทสวดบาลี (อักษรไทย) ด้วยพจนานุกรมของ sht9-paliscript
// ที่มา/สัญญาอนุญาต: voice/pali/NOTICE.md · pure: ไม่มี I/O นอกจากโหลด JSON ที่ส่ง path มา · ไม่เรียกเครือข่าย ไม่รันโค้ดใครเลย

import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';

const JS_EXT = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx']);
export const MAX_CODE_CHARS = 4000;
export const MAX_LINES = 5;
export const MAX_WORDS_PER_LINE = 12;

export function loadDict(file) {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    const out = new Map();
    for (const [k, v] of Object.entries(raw)) {
      if (v && typeof v['th-pali'] === 'string' && v['th-pali']) {
        out.set(k, { th: v['th-pali'], rom: typeof v['phonetic-karaoke'] === 'string' ? v['phonetic-karaoke'] : undefined });
      }
    }
    return out;
  } catch {
    return new Map();
  }
}

/** payload ของ Claude Code PostToolUse (Edit/Write/MultiEdit) → { file, code } เฉพาะไฟล์ JS/TS ไม่งั้น null */
export function extractEdit(input) {
  const ti = input?.tool_input;
  if (!ti || typeof ti.file_path !== 'string') return null;
  if (!JS_EXT.has(extname(ti.file_path).toLowerCase())) return null;
  let code = '';
  if (typeof ti.new_string === 'string') code = ti.new_string;
  else if (typeof ti.content === 'string') code = ti.content;
  else if (Array.isArray(ti.edits)) code = ti.edits.map((e) => (typeof e?.new_string === 'string' ? e.new_string : '')).join('\n');
  code = code.slice(0, MAX_CODE_CHARS);
  if (!code.trim()) return null;
  return { file: basename(ti.file_path), code };
}

const TOKEN_RE = /[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|[^\sA-Za-z_$\d]/g;
const COMMENT_RE = /^\s*(\/\/|\/\*|\*|#)/;

/** โค้ด → บรรทัดบทสวด [{ src, words:[{ src, th, rom? }] }] (คำที่ไม่มีในพจนานุกรม เช่นชื่อตัวแปร อ่านตามตัวอักษรเดิม) */
export function toChant(code, dict, { maxLines = MAX_LINES, maxWords = MAX_WORDS_PER_LINE } = {}) {
  const lines = [];
  for (const rawLine of String(code).split(/\r?\n/)) {
    if (lines.length >= maxLines) break;
    const src = rawLine.trim();
    if (!src || COMMENT_RE.test(src) || /^[{}()[\];,]+$/.test(src)) continue;
    const words = [];
    for (const tok of src.match(TOKEN_RE) ?? []) {
      if (words.length >= maxWords) break;
      const hit = dict.get(tok);
      words.push(hit ? { src: tok, th: hit.th, ...(hit.rom ? { rom: hit.rom } : {}) } : { src: tok, th: tok });
    }
    if (words.length) lines.push({ src: src.slice(0, 120), words });
  }
  return lines;
}

/** ข้อความให้เสียงอ่าน (ไทย-บาลีเว้นวรรค คั่นบรรทัดด้วยจุลภาค) ไม่เกิน limit ตัวอักษร (กันงบ TTS) */
export function chantText(lines, limit = 280) {
  const t = lines.map((l) => l.words.map((w) => w.th).join(' ')).join(', ');
  return t.length > limit ? t.slice(0, limit) : t;
}

/** เวลาโดยประมาณของเสียงสวด (ms) ไว้ไฮไลต์คาราโอเกะ: ช้าๆ ประมาณ 520 ms ต่อคำ + หัวท้าย */
export function estimateDurationMs(lines) {
  const n = lines.reduce((a, l) => a + l.words.length, 0);
  return 1200 + n * 520;
}
