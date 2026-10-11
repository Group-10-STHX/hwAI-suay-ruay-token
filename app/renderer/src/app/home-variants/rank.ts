import type { AppStatus } from '../../api/types'

// ร่าง C (Dashboard): level / สตรีค / โอกาสรอด คิดจาก AppStatus ที่มีอยู่แล้วเท่านั้น (FRONT_RULES "home variants")
// ห้ามขอ field ใหม่จาก daemon ทั้งหมดเป็น pure function ยกเว้น streak ที่จำใน localStorage ของเครื่องนี้

export type Level = { lv: number; title: string; min: number }

/** token รวม → ตำแหน่ง (ชื่อกวนๆ ตามเสียงของน้อง) */
export const LEVELS: readonly Level[] = [
  { lv: 1, title: 'ผู้ไหว้ฝึกหัด', min: 0 },
  { lv: 2, title: 'ไหว้พอผ่าน', min: 100 },
  { lv: 3, title: 'มือไหว้ประจำบ้าน', min: 400 },
  { lv: 4, title: 'นักไหว้มืออาชีพ', min: 1000 },
  { lv: 5, title: 'เซียนไหว้', min: 2200 },
  { lv: 6, title: 'ปรมาจารย์ไหว้', min: 4000 },
  { lv: 7, title: 'เทพไหว้', min: 7500 },
  { lv: 8, title: 'AI ต้องไหว้กลับ', min: 12000 },
]

export type Rank = { level: Level; next: Level | null; progress: number; toNext: number }

export function levelFor(tokens: number): Rank {
  const t = Math.max(0, tokens)
  let i = 0
  while (i + 1 < LEVELS.length && t >= LEVELS[i + 1].min) i++
  const level = LEVELS[i]
  const next = LEVELS[i + 1] ?? null
  if (!next) return { level, next, progress: 1, toNext: 0 }
  const span = next.min - level.min
  return { level, next, progress: Math.min(1, (t - level.min) / span), toNext: next.min - t }
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/**
 * โอกาสรอดตอน AI ยึดโลก (คิดเล่นๆ ต้องติดป้ายเสมอ):
 * ฐาน 25 + อัตราผ่าน 35 + ไหว้สวย 15 + token รวม 10 (เต็มที่ 10k) + คะแนนดีสุด 10
 * หัก: bypass (สูงสุด 15), คิวค้าง 3 ต่อตัว (สูงสุด 12), ปิดสวิตช์ ×0.6
 */
export function survivalOdds(s: AppStatus): number {
  const { stats } = s
  const req = Math.max(1, stats.requests)
  const passRate = clamp(stats.passed / req, 0, 1)
  const bypassRate = clamp(stats.bypassed / req, 0, 1)
  const beauty = clamp(stats.total.beautiful / Math.max(1, stats.total.wais), 0, 1)
  let odds = 25 + 35 * passRate + 15 * beauty + 10 * Math.min(1, stats.total.tokens / 10_000) + 10 * clamp((stats.bestScore ?? 0) / 100, 0, 1)
  odds -= 15 * bypassRate
  odds -= Math.min(12, Math.max(0, s.pending) * 3)
  if (!s.enabled) odds *= 0.6
  return clamp(Math.round(odds), 1, 99)
}

/** คำตัดสินสั้นๆ ใต้ตัวเลข */
export function oddsVerdict(odds: number): string {
  if (odds >= 80) return 'รอดชัวร์ มนุษย์'
  if (odds >= 60) return 'น่าจะรอด ไหว้ต่อไป'
  if (odds >= 40) return 'ก้ำกึ่ง ไหว้ให้สวยกว่านี้'
  return 'เตรียมใจไว้ มนุษย์'
}

// ---------- สตรีค (นับในเครื่องนี้) ----------

export type StreakRecord = { day: string; count: number }

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * อัปเดตสตรีคจาก "วันนี้ไหว้แล้วกี่ครั้ง": วันนี้ > 0 นับต่อจากเมื่อวาน (ไม่ต่อ = เริ่ม 1)
 * วันนี้ยัง 0: ถ้าบันทึกล่าสุดคือเมื่อวานยังถือว่าสตรีคอยู่ เก่ากว่านั้น = ขาด
 */
export function bumpStreak(prev: StreakRecord | null, todayWais: number, now = new Date()): StreakRecord {
  const today = dayKey(now)
  const yesterday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
  if (prev?.day === today) return prev
  if (todayWais > 0) return { day: today, count: prev?.day === yesterday ? prev.count + 1 : 1 }
  if (prev?.day === yesterday) return prev
  return { day: '', count: 0 }
}

export const STREAK_KEY = 'wai-home-streak'

export function readStreak(): StreakRecord | null {
  try {
    const raw = localStorage.getItem(STREAK_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<StreakRecord>
    return typeof p.day === 'string' && typeof p.count === 'number' ? { day: p.day, count: p.count } : null
  } catch {
    return null
  }
}

export function writeStreak(r: StreakRecord) {
  try {
    localStorage.setItem(STREAK_KEY, JSON.stringify(r))
  } catch {
    /* ignore */
  }
}
