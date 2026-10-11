// ง้อน้องด้วยซอง True Money 500 บาท (MOCK ล้อเล่น) · IPC ของ Electron เท่านั้น ไม่ผ่าน HTTP
// browser ธรรมดา (ไม่มี bridge) = ตอบรับเฉพาะรหัสที่ผ่านเช็กแบบกั๊กๆ ให้ดูหน้าตาได้ ไม่มีผลกับ daemon

export const BRIBE_AMOUNT_BAHT = 500

export async function submitBribe(code: string): Promise<{ ok: boolean; message: string }> {
  if (window.wai?.bribe) return window.wai.bribe(code)
  const c = code.trim()
  if (c.length < 8) return { ok: false, message: 'รหัสสั้นไป 500 บาทเขาไม่สั้นแบบนี้' }
  return { ok: true, message: `(mock ในเบราว์เซอร์) รับ ${BRIBE_AMOUNT_BAHT} บาทแล้ว` }
}
