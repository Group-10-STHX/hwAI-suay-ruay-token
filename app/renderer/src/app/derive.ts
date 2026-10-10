import type { SessionState } from '../api/types'
import type { Pose } from '../mascot'

// state → ท่าของน้อง (FRONT_RULES §4)
export const POSE: Record<SessionState, Pose> = {
  IDLE: 'crossArms',
  DEMANDING: 'crossArms',
  WATCHING: 'crossArms',
  PASSED: 'wai',
  RETRY: 'stick',
  ANNOYED: 'laserGun',
  SULKING: 'sulk',
  RAGE_QUIT: 'spaceship',
  FORGIVE: 'crossArms',
}

/** state ที่ต้องเปิดกล้อง */
export const CAMERA_ON: Record<SessionState, boolean> = {
  IDLE: false,
  DEMANDING: true,
  WATCHING: true,
  PASSED: false, // ปิดเมื่อคิวหมด app/ เช็กคิวเพิ่ม
  RETRY: true,
  ANNOYED: true,
  SULKING: true,
  RAGE_QUIT: false,
  FORGIVE: true,
}

/** ต้องค้างท่ากี่ ms (เดาเอง รอยืนยันกับ Vision) */
export const HOLD_TARGET_MS = 1500
