// Type กลางของทีม Front (FRONT_RULES §3, §6)
// ทุก component ใช้ type จากไฟล์นี้ ถ้าจะแก้ ให้แก้ FRONT_RULES.md ก่อน
//
// ฟิลด์ที่มี "รอยืนยัน" ยังไม่อยู่ใน contract ของ daemon/Vision
// adapter ใน api/queue.ts และ api/vision.ts ใส่ค่า default ให้แล้ว
// component จึงใช้ได้เลยโดยไม่ต้องเช็ก undefined

export type SessionState =
  | 'IDLE'
  | 'DEMANDING'
  | 'WATCHING'
  | 'PASSED'
  | 'RETRY'
  | 'ANNOYED'
  | 'SULKING'
  | 'RAGE_QUIT'
  | 'FORGIVE'

export type WaiLevel = 0 | 1 | 2 | 3

// codex = hook ของ Codex CLI · test = ปุ่ม "ลองไหว้" ในหน้าหลัก · terminal = source อื่นที่ไม่รู้จัก
export type Source = 'claude-code' | 'codex' | 'chatgpt' | 'test' | 'terminal'

export type QueueItem = {
  id: string
  source: Source
  kind: 'prompt' | 'subagent'
  agentLabel: string
  createdAt: number // epoch ms ใช้คำนวณเวลาที่เหลือจาก REQUEST_TIMEOUT_MS
}

/** สิ่งที่ UI ได้จากการ poll GET /wai/queue หนึ่งครั้ง */
export type QueueSnapshot = {
  items: QueueItem[]
  state: SessionState // รอยืนยันกับ #1
  failCount: number // รอยืนยันกับ #1
  bypass: boolean // WAI_BYPASS=1 ต้องมีป้ายบอก (§7) รอยืนยันกับ #1
}

export type WaiReason =
  | 'NO_PERSON' // ไม่เห็นคน
  | 'FACE_HIDDEN' // หน้าโดนบัง
  | 'HANDS_APART' // มือไม่ชิดกัน
  | 'FINGERS_NOT_UP' // นิ้วไม่ชี้ขึ้น
  | 'HANDS_TOO_LOW' // มือต่ำกว่าเกณฑ์ของ state นั้น
  | 'NOT_BOWING' // ไม่ก้มหัว
  | 'ASYMMETRIC' // มือเบี้ยว
  | 'HOLD_TOO_SHORT' // ค้างท่าไม่นานพอ

export type VisionEvent = {
  isWai: boolean
  level: WaiLevel
  score: number // 0–100
  holdMs: number
  // ---- รอยืนยันกับ Vision ----
  reasons: WaiReason[] // ว่างถ้าไม่มีอะไรผิด
  facePresent: boolean
  snapshotId?: string // ส่งมาตอนไหว้ผ่าน
  style?: 'normal' | 'weird'
}

/** ค่าคงที่จาก contract */
export const REQUEST_TIMEOUT_MS = 300_000 // hook timeout
export const QUEUE_POLL_MS = 500
export const MAX_VISIBLE_CARDS = 3

/** level ขั้นต่ำที่ต้องได้ในแต่ละ state (§4) */
export const REQUIRED_LEVEL: Record<SessionState, WaiLevel> = {
  IDLE: 1,
  DEMANDING: 1,
  WATCHING: 1,
  PASSED: 1,
  RETRY: 1,
  ANNOYED: 2,
  SULKING: 2, // เดาเอง รอยืนยันกับ #1
  RAGE_QUIT: 3,
  FORGIVE: 3,
}

/** สถานะของแอปสำหรับหน้าหลัก (GET /wai/status ยังไม่อยู่ใน contract รอ #1) */
export type AppStatus = {
  enabled: boolean // false = ปิดอยู่ ทุกคำขอผ่านทันที
  pending: number
  stats: { requests: number; passed: number; bypassed: number }
  lastSeen: Partial<Record<string, number>> // source → epoch ms ที่เห็นคำขอล่าสุด
}
