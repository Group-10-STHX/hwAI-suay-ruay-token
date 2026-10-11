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

// อีสเตอร์เอ้ก 67: คะแนนไหว้ออกมา 67 พอดี → ต้องทำท่า 6-7 (สองมือสลับขึ้น-ลง) แทน · always = ทุกคำขอ
export const SIXSEVEN_SCORE = 67;
export const SIXSEVEN_LINES = Object.freeze(['SIX SEVEN! ทำท่า 6-7 แทนเดี๋ยวนี้ สองมือสลับขึ้นลง']);
export const SIXSEVEN_MS = 25_000;

export const TRIBUTE_AMOUNT = 1000
export const TRIBUTE_LINES = Object.freeze([
  'เชื่อกู รำคาญมึงว่ะ มึงต้องจ่าย True Money 1,000 บาทก่อนให้กู',
])

/** โหมดต่อ event: off = ปิด · random = สุ่มตามโอกาส · always = เกิดทุกคำขอแน่นอน (ครั้งเดียวต่อคำขอ) */
export const EVENT_MODES = Object.freeze(['off', 'random', 'always']);
export const EVENT_KINDS = Object.freeze(['redo', 'tribute', 'chant', 'sixseven']);
export const normalizeMode = (m, d = 'random') => (EVENT_MODES.includes(m) ? m : d);

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

export function createEvents({ rng = Math.random, now = Date.now, enabled = true, modes: initial = {}, ...opts } = {}) {
  const o = { ...DEFAULTS, ...opts };
  // chant = ถามว่าจะให้สวดบอกว่าแก้โค้ด JS อะไร (ตัดสินใจใน main ตอน AI แก้ไฟล์ ไม่ใช่ตอนไหว้) ค่าเริ่มต้น always
  const modes = { redo: normalizeMode(initial.redo), tribute: normalizeMode(initial.tribute), chant: normalizeMode(initial.chant, 'always'), sixseven: normalizeMode(initial.sixseven) };
  /** โอกาสเกิดของแต่ละชนิดตามโหมด */
  const chance = (kind) => (modes[kind] === 'off' ? 0 : modes[kind] === 'always' ? 1 : kind === 'redo' ? o.redoP : o.tributeP);
  // rng() < 1 เสมอ → always เกิดแน่ · rng() < 0 ไม่เคย → off ไม่เกิด
  const seen = { redo: new Set(), tribute: new Set(), sixseven: new Set() }; // request id ที่เคยเกิดแล้ว
  let current = null; // { kind, text, amount?, until, requestId }

  const pick = (list) => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
  const expire = () => { if (current && current.until <= now()) current = null; };

  function active() {
    expire();
    return current ? { ...current, msLeft: Math.max(0, current.until - now()) } : null;
  }
  /** tribute ที่ยังไม่จ่าย = บล็อกการไหว้ทั้งหมด */
  const blocking = () => { const k = active()?.kind; return k === 'tribute' || k === 'sixseven'; };

  /**
   * มีความพยายามไหว้ 1 ครั้งของคำขอ requestId (type = 'pass' | 'fail')
   * → { type: 'none' | 'redo' | 'tribute', event?, fresh? } (fresh = เพิ่งเกิดรอบนี้ ใช้ตัดสินว่าจะพูดซ้ำไหม) · ถ้าไม่ใช่ none ผู้เรียกต้องไม่ส่งผลนี้เข้า state machine
   */
  function onAttempt(requestId, type) {
    if (!enabled || !requestId) return { type: 'none' };
    if (blocking()) return { type: 'tribute', event: active(), fresh: false }; // ยังไม่จ่าย: ปัดตกทุกครั้ง
    if (!seen.tribute.has(requestId) && rng() < chance('tribute')) {
      seen.tribute.add(requestId);
      current = { kind: 'tribute', text: pick(TRIBUTE_LINES), amount: TRIBUTE_AMOUNT, until: now() + o.tributeMs, requestId };
      return { type: 'tribute', event: active(), fresh: true };
    }
    if (type === 'pass' && !seen.redo.has(requestId) && rng() < chance('redo')) {
      seen.redo.add(requestId);
      current = { kind: 'redo', text: pick(REDO_LINES), until: now() + o.redoMs, requestId };
      return { type: 'redo', event: active(), fresh: true };
    }
    return { type: 'none' };
  }

  /**
   * อีสเตอร์เอ้ก 67: เรียกตอนมีผลไหว้ (pass/fail) พร้อมคะแนน · true = เริ่มเกม 67 (event kind 'sixseven' + บล็อกการไหว้ปกติ)
   * random = คะแนนปัดแล้วเป็น 67 พอดี · always = ทุกคำขอ (ครั้งเดียวต่อคำขอ) · off/ปิดทั้งระบบ = ไม่เกิด
   */
  function maybeSixSeven(requestId, score, { force = false } = {}) {
    if (!enabled || !requestId || (modes.sixseven === 'off' && !force) || blocking() || (seen.sixseven.has(requestId) && !force)) return false;
    const hit = force || modes.sixseven === 'always' || Math.round(Number(score)) === SIXSEVEN_SCORE;
    if (!hit) return false;
    seen.sixseven.add(requestId);
    current = { kind: 'sixseven', text: pick(SIXSEVEN_LINES), until: now() + SIXSEVEN_MS, requestId };
    return true;
  }
  /** ทำท่าครบแล้ว → เคลียร์ · คืน requestId หรือ null */
  function finishSixSeven() {
    expire();
    if (current?.kind !== 'sixseven') return null;
    const id = current.requestId;
    current = null;
    return id;
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

  function setMode(kind, mode) {
    if (!EVENT_KINDS.includes(kind) || !EVENT_MODES.includes(mode)) return false;
    modes[kind] = mode;
    if (mode === 'off' && current?.kind === kind) current = null; // ปิดแล้ว event ที่ค้างอยู่หายด้วย
    return true;
  }
  const getModes = () => ({ ...modes });

  return { onAttempt, maybeSixSeven, finishSixSeven, active, blocking, pay, dismiss, forget, setMode, getModes, enabled };
}
