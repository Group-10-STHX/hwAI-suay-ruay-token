import type { QueueItem, SessionState } from '../api/types'

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

/** ต้องค้างท่ากี่ ms (artifact.md: ค้าง ≥ 1 วินาที) */
export const HOLD_TARGET_MS = 1000

/**
 * แบ่งคิวให้แต่ละคำขอโชว์บนจอครั้งเดียว:
 * top = ใบบนสุด (island + น้องตัวใหญ่), waiting = ใบที่เหลือ (CardStack โชว์ไม่เกิน shown ใบ),
 * hidden = ที่ล้นออกไป ("รอไหว้อีก N ตัว") ซ้ำ id กันให้เหลือใบเดียว
 */
export function splitQueue(items: QueueItem[], maxCards: number) {
  const seen = new Set<string>()
  const unique = items.filter((it) => !seen.has(it.id) && seen.add(it.id))
  const [top, ...waiting] = unique
  const shown = Math.min(waiting.length, maxCards)
  return { top: top as QueueItem | undefined, waiting, shown, hidden: waiting.length - shown }
}
