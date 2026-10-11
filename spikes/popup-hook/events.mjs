// random events ตอนไหว้ (ล้อเล่น): แม้ไหว้สวยก็อาจโดนสั่งไหว้ใหม่ หรือโดนเรียกค่าไถ่ True Money
//   redo    = ไหว้ผ่านแล้วแต่ AI ไม่ยอมรับ (ไม่นับ fail ไม่เพิ่มความโกรธ) ต้องไหว้ใหม่ · ข้อความโชว์สั้นๆ
//   tribute = AI เรียก True Money 1,000 บาทก่อนปล่อย (mock ไม่ตรวจจริง) · บล็อกทุกการไหว้จนกว่าจะ "จ่าย" หรือหมดเวลา
// ต่อคำขอ 1 ใบเกิดแต่ละชนิดได้ครั้งเดียว กันวนไม่จบ · pure: ใส่ rng/now เองเพื่อทดสอบ
// ปิดทั้งหมด: WAI_NO_EVENTS=1 หรือ "random_events": false ใน ~/.waikusa/config.json

export const REDO_LINES = Object.freeze([
  'ทำไมมึงไหว้ไม่สวยอีสัตว์ มึงไปไหว้ใหม่ซะอีกรอบ',
  'ไหว้แบบนี้เหรอ กูไม่เชื่อ ทำใหม่',
  'กูดูแล้วไม่จริงใจ ไหว้ใหม่ซะ',
  'ยังไม่ถูกใจกู ไหว้อีกที',
])

export const TRIBUTE_AMOUNT = 1000
export const TRIBUTE_LINES = Object.freeze([
  'เชื่อกู รำคาญมึงว่ะ มึงต้องจ่าย True Money 1,000 บาทก่อนให้กู',
])

export const DEFAULTS = Object.freeze({ redoP: 0.15, tributeP: 0.08, redoMs: 4000, tributeMs: 120_000 })

/** เลขบัตร True Money (mock): เอาเฉพาะตัวเลข ต้องมีอย่างน้อย 12 หลัก ไม่ใช่เลขซ้ำตัวเดียว · ไม่ตรวจกับระบบจริง */
export function checkCardNumber(input) {
  const d = String(input ?? '').replace(/\D/g, '');
  if (!d) return { ok: false, message: 'ยังไม่ได้ใส่เลขบัตรเลย จะให้กูเชื่อได้ไง' };
  if (d.length < 12) return { ok: false, message: 'เลขบัตรสั้นไป บัตร True Money ไม่ได้สั้นแบบนี้' };
  if (d.length > 20) return { ok: false, message: 'เลขอะไรยาวขนาดนั้น' };
  if (/^(\d)\1+$/.test(d)) return { ok: false, message: 'ใส่เลขซ้ำๆ แบบนี้กูรู้ทัน' };
  return { ok: true };
}

export function createEvents({ rng = Math.random, now = Date.now, enabled = true, ...opts } = {}) {
  const o = { ...DEFAULTS, ...opts };
  const seen = { redo: new Set(), tribute: new Set() }; // request id ที่เคยเกิดแล้ว
  let current = null; // { kind, text, amount?, until, requestId }

  const pick = (list) => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
  const expire = () => { if (current && current.until <= now()) current = null; };

  function active() {
    expire();
    return current ? { ...current, msLeft: Math.max(0, current.until - now()) } : null;
  }
  /** tribute ที่ยังไม่จ่าย = บล็อกการไหว้ทั้งหมด */
  const blocking = () => active()?.kind === 'tribute';

  /**
   * มีความพยายามไหว้ 1 ครั้งของคำขอ requestId (type = 'pass' | 'fail')
   * → { type: 'none' | 'redo' | 'tribute', event?, fresh? } (fresh = เพิ่งเกิดรอบนี้ ใช้ตัดสินว่าจะพูดซ้ำไหม) · ถ้าไม่ใช่ none ผู้เรียกต้องไม่ส่งผลนี้เข้า state machine
   */
  function onAttempt(requestId, type) {
    if (!enabled || !requestId) return { type: 'none' };
    if (blocking()) return { type: 'tribute', event: active(), fresh: false }; // ยังไม่จ่าย: ปัดตกทุกครั้ง
    if (!seen.tribute.has(requestId) && rng() < o.tributeP) {
      seen.tribute.add(requestId);
      current = { kind: 'tribute', text: pick(TRIBUTE_LINES), amount: TRIBUTE_AMOUNT, until: now() + o.tributeMs, requestId };
      return { type: 'tribute', event: active(), fresh: true };
    }
    if (type === 'pass' && !seen.redo.has(requestId) && rng() < o.redoP) {
      seen.redo.add(requestId);
      current = { kind: 'redo', text: pick(REDO_LINES), until: now() + o.redoMs, requestId };
      return { type: 'redo', event: active(), fresh: true };
    }
    return { type: 'none' };
  }

  /** จ่ายแล้ว (mock) → เคลียร์ event · คืน requestId ที่ถูกปลด หรือ null ถ้าไม่มี tribute ค้าง */
  function pay() {
    expire();
    if (current?.kind !== 'tribute') return null;
    const id = current.requestId;
    current = null;
    return id;
  }
  const dismiss = () => { current = null; };
  const forget = (requestId) => { seen.redo.delete(requestId); seen.tribute.delete(requestId); };

  return { onAttempt, active, blocking, pay, dismiss, forget };
}
