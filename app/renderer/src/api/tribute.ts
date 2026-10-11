// จ่าย True Money 1,000 บาท (MOCK ล้อเล่น) · IPC ของ Electron เท่านั้น ไม่ผ่าน HTTP
// ไม่ตรวจ ไม่เก็บ ไม่ log ไม่ส่งเลขบัตรไปไหน · browser ธรรมดา (ไม่มี bridge) = ตอบรับเมื่อเลขยาว >= 12 หลัก ให้ดูหน้าตาได้

export const TRIBUTE_AMOUNT_BAHT = 1000

export async function submitTribute(code: string): Promise<{ ok: boolean; message: string }> {
  if (window.wai?.tribute) return window.wai.tribute(code)
  const digits = code.replace(/\D/g, '')
  if (digits.length < 12) return { ok: false, message: 'เลขบัตรสั้นไป บัตร True Money เขาไม่สั้นแบบนี้' }
  return { ok: true, message: `(mock ในเบราว์เซอร์) รับ ${TRIBUTE_AMOUNT_BAHT} บาทแล้ว น้อยใจน้อยลงนิดนึง` }
}
