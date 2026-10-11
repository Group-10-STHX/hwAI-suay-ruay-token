import type { FleeState } from './types'

// หนีเมาส์ (FRONT_RULES §4 ANNOYED)
// การขยับ window อยู่ใน Electron main เพราะ renderer มองไม่เห็นเมาส์นอก window ตัวเอง
// main ส่ง IPC wai:flee { active, fleeing } เมื่อค่าเปลี่ยน · preload expose window.wai.onFlee
// ฝั่งนี้แค่บอก UI ว่าตอนนี้กำลังหนีอยู่ไหม จะได้โชว์ท่า

/** กันค่าแปลกจาก IPC: fleeing นับเฉพาะตอน active */
export function toFleeState(raw: Partial<FleeState> | null | undefined): FleeState {
  const active = raw?.active === true
  return { active, fleeing: active && raw?.fleeing === true }
}

/** subscribe IPC wai:flee คืนฟังก์ชันสำหรับหยุด */
export function subscribeFlee(onFlee: (s: FleeState) => void): () => void {
  // browser ธรรมดา หรือ preload รุ่นที่ยังไม่มี onFlee = ไม่หนี (ไม่ต้องเตือน vision เตือนให้แล้ว)
  if (!window.wai?.onFlee) return () => {}
  return window.wai.onFlee((raw) => onFlee(toFleeState(raw)))
}
