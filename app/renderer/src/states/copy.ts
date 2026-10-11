import type { SessionState, WaiReason } from '../api/types'

// ข้อความทุกอันของน้อง (FRONT_RULES §5 Copy) ทีม Voice (#5) ใช้ไฟล์นี้ทำ TTS ด้วย
// เรียกผู้ใช้ว่า "มนุษย์" กวนได้ ห้ามด่าเรื่องเพศ ศาสนา รูปร่างหน้าตา

/** ข้อความหลักในฟองคำพูดของน้อง */
export const SPEECH: Record<SessionState, string> = {
  IDLE: 'ว่างอยู่ มนุษย์',
  DEMANDING: 'มนุษย์ ไหว้กูซะ',
  WATCHING: 'มนุษย์ ไหว้กูซะ',
  PASSED: 'อนุญาต',
  RETRY: 'ไหว้ใหม่ ไม่สวย',
  ANNOYED: 'ต้อง level 2 ขึ้นไป',
  SULKING: 'ไม่คุยด้วยแล้ว',
  RAGE_QUIT: 'ย้าย session ไปแล้ว',
  FORGIVE: 'ขอขมาซะ',
}

/** บรรทัดรองใต้ข้อความหลัก (ไม่มี = ไม่โชว์) */
export const SPEECH_HINT: Partial<Record<SessionState, string>> = {
  WATCHING: 'กูดูอยู่นะ',
  ANNOYED: 'ไหว้แบบเดิมไม่รอดแล้ว',
  SULKING: 'ไหว้ level 2 ถ้าอยากง้อ',
  RAGE_QUIT: 'ไหว้พระ level 3 ถึงจะกลับมา',
  FORGIVE: 'ไหว้พระ level 3 เท่านั้น',
}

/** เหตุผลที่ไหว้ผิด → ข้อความ (ใช้ทั้งใน island และ ReasonChip บน webcam) */
export const REASON_TEXT: Record<WaiReason, string> = {
  NO_PERSON: 'ไม่เห็นหน้ามนุษย์เลย',
  FACE_HIDDEN: 'อย่าเอาอะไรบังหน้า',
  HANDS_APART: 'มือไม่ชิดกัน',
  FINGERS_NOT_UP: 'นิ้วต้องชี้ขึ้น',
  HANDS_TOO_LOW: 'ยกมือให้สูงกว่านี้',
  NOT_BOWING: 'ก้มหัวด้วย',
  ASYMMETRIC: 'มือเบี้ยว',
  HOLD_TOO_SHORT: 'ค้างท่าให้นานกว่านี้',
}

// ---------- หนีเมาส์ (ANNOYED, window วิ่งหนีเมาส์) ----------
// ทุกคำแซวต้องยาว 2 บรรทัดเท่ากันในฟองคำพูด (28px กว้าง ~181px) ไม่งั้น island กระโดดทุกครั้งที่เปลี่ยนคำ
// ฟองตัดบรรทัดเฉพาะที่ช่องว่าง (byPhrase) วลีที่ไม่มีช่องว่างต้องกว้างไม่เกินฟอง

/** คำแซวแทนข้อความหลัก เปลี่ยนทุกครั้งที่ window หนี */
export const FLEE_TAUNTS = [
  'จับกูไม่ได้หรอก มนุษย์',
  'ไหว้ก่อนสิ ค่อยมาจับ',
  'ช้าไปนะ มนุษย์ ช้าไป',
  'เมาส์มึง ช้ากว่ากูอีก',
  'วิ่งตามทำไม ไหว้สิ',
] as const

/** คำแซวลำดับที่ n (n = จำนวนครั้งที่หนีไปแล้ว) */
export const fleeTaunt = (n: number) => FLEE_TAUNTS[((n % FLEE_TAUNTS.length) + FLEE_TAUNTS.length) % FLEE_TAUNTS.length]

/** บอกวิธีให้หยุดหนี แทน SPEECH_HINT.ANNOYED ตอนหนีเมาส์ */
export const FLEE_HINT = 'ไหว้ level 2 ขึ้นไป กูถึงจะหยุด'

/** เสียงประกอบตอน window กำลังวิ่ง */
export const FLEE_SFX = 'ฟิ้ววว'

/** ป้ายข้างชื่อ provider บอกว่าพลาดไปกี่ครั้งแล้ว */
export const failLabel = (n: number) => `พลาด ${n} ครั้ง`

/** น้องบนหน้าหลัก (ร่าง Mascot-first): ประโยคตามสวิตช์ + ประโยคตอนโดนจิ้ม */
export const HOME_SPEECH = {
  off: 'ปิดอยู่ กูพักก่อน',
  on: 'ว่างอยู่ แต่กูจับตาดูนะ',
  pending: (n: number) => `รอไหว้อยู่ ${n} ตัว ไหว้กูซะ`,
  poke: ['อย่าจิ้ม ไหว้สิ', 'กูไม่ใช่ของเล่นนะมนุษย์', 'จิ้มอีกทีจะไม่อนุญาต', 'เอามือมาพนมดีกว่า', 'ไหว้สวยๆ กูให้ token เพิ่ม', 'มนุษย์ว่างมากเหรอ'],
} as const
