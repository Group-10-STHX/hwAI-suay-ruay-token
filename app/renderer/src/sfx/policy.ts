// นโยบายเสียง (pure, ไม่แตะ DOM) ใช้ได้ทั้งใน app และ node --experimental-strip-types
// ห้ามใช้ enum / namespace / parameter property ในไฟล์นี้ (strip-types ไม่รองรับ)
import type { SessionState, VisionEvent, WaiReason } from '../api/types'

export type SfxLevel = 'off' | 'few' | 'many'
export type SoundName =
  | 'tick'
  | 'tickQuiet'
  | 'levelUp'
  | 'pass'
  | 'fail'
  | 'rage'
  | 'forgive'
  | 'scanOn'
  | 'static'

export type SfxSnapshot = {
  state: SessionState
  score: number
  level: number
  isWai: boolean
  reasons: WaiReason[]
}

export type SfxMemory = {
  lastPlayedAt: number
  tickTimes: number[]
  lastWatchTickAt: number
}

export const initialMemory: SfxMemory = { lastPlayedAt: -1e9, tickTimes: [], lastWatchTickAt: -1e9 }

export const FEW_MIN_GAP_MS = 1000
export const TICK_STEP = 5
export const TICK_MAX_PER_SEC = 8
export const WATCH_TICK_MS = 1000

const FAIL_STATES: SessionState[] = ['RETRY', 'ANNOYED', 'SULKING']

export function snapshotOf(state: SessionState, v: Pick<VisionEvent, 'score' | 'level' | 'isWai' | 'reasons'>): SfxSnapshot {
  return { state, score: v.score, level: v.level, isWai: v.isWai, reasons: v.reasons }
}

const reasonKey = (r: WaiReason[]) => [...r].sort().join(',')

/**
 * ตัดสินว่าจะเล่นเสียงอะไร จาก prev -> next
 * คืน sounds (เรียงตามความสำคัญ) กับ memory ใหม่
 */
export function decideSounds(
  prev: SfxSnapshot | null,
  next: SfxSnapshot,
  level: SfxLevel,
  now: number,
  mem: SfxMemory = initialMemory,
): { sounds: SoundName[]; memory: SfxMemory } {
  const none = { sounds: [] as SoundName[], memory: mem }
  if (level === 'off') return none
  if (next.state === 'IDLE') return none // ไม่มีคำขอ ไม่มีเสียง

  const out: SoundName[] = []
  let tickTimes = mem.tickTimes.filter((t) => now - t < 1000)
  let lastWatchTickAt = mem.lastWatchTickAt
  const was = prev?.state ?? 'IDLE'
  const changed = was !== next.state

  // ---- เหตุการณ์ของ state (few + many) ----
  if (changed) {
    if (was === 'IDLE') out.push('scanOn')
    else if (next.state === 'RAGE_QUIT') out.push('rage')
    else if (next.state === 'PASSED') out.push('pass')
    else if (FAIL_STATES.includes(next.state)) out.push('fail')
    else if (next.state === 'FORGIVE' && level === 'many') out.push('forgive')
    if (next.state === 'RAGE_QUIT' && !out.includes('rage')) out.push('rage')
  }

  // ---- เฉพาะ many ----
  if (level === 'many' && prev) {
    const holding = next.isWai && next.state !== 'PASSED' && next.state !== 'RAGE_QUIT'
    if (holding && !changed) {
      if (next.level > prev.level) out.push('levelUp')
      const steps = Math.floor(next.score / TICK_STEP) - Math.floor(prev.score / TICK_STEP)
      if (steps > 0 && tickTimes.length < TICK_MAX_PER_SEC) {
        out.push('tick')
        tickTimes = [...tickTimes, now]
      }
    }
    if (!changed && reasonKey(prev.reasons) !== reasonKey(next.reasons) && next.reasons.length > 0) {
      out.push('static')
    }
  }
  if (level === 'many' && next.state === 'WATCHING' && !out.includes('tick') && now - lastWatchTickAt >= WATCH_TICK_MS) {
    out.push('tickQuiet')
    lastWatchTickAt = now
  }

  // ---- few: ประมาณหนึ่งเสียงต่อวินาที ----
  let sounds = out
  if (level === 'few' && sounds.length > 0) {
    const critical = sounds.filter((s) => s === 'rage' || s === 'fail' || s === 'pass')
    sounds = critical.length > 0 ? [critical[0]] : now - mem.lastPlayedAt >= FEW_MIN_GAP_MS ? [sounds[0]] : []
  }

  if (sounds.length === 0 && tickTimes === mem.tickTimes && lastWatchTickAt === mem.lastWatchTickAt) return none
  return {
    sounds,
    memory: { lastPlayedAt: sounds.length ? now : mem.lastPlayedAt, tickTimes, lastWatchTickAt },
  }
}
