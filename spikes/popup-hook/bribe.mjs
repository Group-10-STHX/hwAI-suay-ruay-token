// ง้อ AI ด้วยเงิน (MOCK ล้อเล่น): กรอกรหัสซอง True Money Wallet 500 บาทเพื่อ bypass ตอนน้องงอน
// ไม่เช็กกับ True Money จริง ไม่มีเงินเข้า-ออกจริง · รหัสที่กรอกถูกทิ้งทันที: ไม่เก็บ ไม่ log ไม่ส่งออกจากเครื่อง
// pure: ทดสอบได้โดยไม่ boot Electron

export const BRIBE_AMOUNT_BAHT = 500
export const BRIBE_STATES = Object.freeze(['SULKING', 'FORGIVE']) // งอน / รอขอขมา (ANNOYED ไม่รวม: ตอนนั้นน้องวิ่งหนีเมาส์ กรอกไม่ทัน)
export const MIN_CODE_LEN = 8

/** เช็กแบบกั๊กๆ ให้พอมีลูกเล่น: ไม่ว่าง, ยาวพอ, ไม่ใช่เลขซ้ำตัวเดียว (ไม่ได้ตรวจกับระบบจริง) */
export function checkVoucher(code) {
  const c = String(code ?? '').trim()
  if (!c) return { ok: false, message: 'ยังไม่ได้ใส่รหัสเลย จะให้น้องง้อฟรีเหรอ' }
  if (c.length > 200) return { ok: false, message: 'รหัสอะไรยาวขนาดนั้น' }
  if (c.length < MIN_CODE_LEN) return { ok: false, message: 'รหัสสั้นไป 500 บาทเขาไม่สั้นแบบนี้' }
  if (/^(.)\1+$/.test(c)) return { ok: false, message: 'ใส่เลขซ้ำๆ แบบนี้น้องรู้ทัน' }
  return { ok: true }
}

/** จะรับค่าไถ่ได้ไหมจาก state ของหัวคิว */
export function canBribe(state) {
  return BRIBE_STATES.includes(state)
}
