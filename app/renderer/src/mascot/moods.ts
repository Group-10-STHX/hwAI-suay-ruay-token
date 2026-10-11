import type { AvatarMood, SessionState } from '../api/types'
import annoyed from './assets/jason-annoyed.svg'
import demanding from './assets/jason-demanding.svg'
import forgive from './assets/jason-forgive.svg'
import neutralStill from './assets/jason-neutral-still.svg'
import passed from './assets/jason-passed.svg'
import rageQuit from './assets/jason-rage_quit.svg'
import retry from './assets/jason-retry.svg'
import sulking from './assets/jason-sulking.svg'
import watching from './assets/jason-watching.svg'
import watchingStill from './assets/jason-watching-still.svg'

// state → ท่าของน้อง Jason (FRONT_RULES §4, characters/jason/character.json)
// asset มาจาก scripts/sync-jason.mjs อย่าแก้ไฟล์ใน assets/ ตรงๆ
export const MOOD_SRC: Record<SessionState, string> = {
  IDLE: neutralStill, // ตอนว่างห้ามมี animation วน (§5)
  DEMANDING: demanding,
  WATCHING: watching,
  PASSED: passed,
  RETRY: retry,
  ANNOYED: annoyed,
  SULKING: sulking,
  RAGE_QUIT: rageQuit,
  FORGIVE: forgive,
}

/** น้องตัวเล็กบนการ์ด: นิ่ง ไม่ขยับ จะได้ไม่แย่งซีนตัวหลัก */
export const STILL_SRC = { idle: neutralStill, waiting: watchingStill } as const

/** mood ของรูปตัวละครของผู้ใช้ตาม state (ใช้ส่งให้ api.avatarUrl) */
export const AVATAR_MOOD: Record<SessionState, AvatarMood> = {
  IDLE: 'confused',
  DEMANDING: 'confused',
  WATCHING: 'confused',
  RETRY: 'sad',
  SULKING: 'sad',
  ANNOYED: 'angry',
  RAGE_QUIT: 'angry',
  PASSED: 'forgive',
  FORGIVE: 'forgive',
}

export const avatarMoodFor = (state: SessionState): AvatarMood => AVATAR_MOOD[state]
