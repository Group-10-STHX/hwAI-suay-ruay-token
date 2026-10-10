import type { QueueItem, QueueSnapshot, SessionState, Source, VisionEvent, WaiLevel, WaiReason } from '../api/types'

// Scenario ปลอมสำหรับดู UI โดยไม่ต้องมีกล้องหรือ hook
// ทุก scenario = snapshot ของคิว + ฟังก์ชันสร้าง vision event ตามเวลา (t = ms ตั้งแต่เริ่ม scenario)

export type ScenarioName =
  | 'idle'
  | 'demanding'
  | 'demand'
  | 'pass'
  | 'retry'
  | 'annoyed'
  | 'sulk'
  | 'rageQuit'
  | 'forgive'
  | 'bypass'

export type Scenario = {
  name: ScenarioName
  label: string
  state: SessionState
  failCount: number
  bypass?: boolean
  vision: (t: number) => VisionEvent
}

export const QUEUE_SIZES = [0, 1, 3, 5] as const
export type QueueSize = (typeof QUEUE_SIZES)[number]

const LABELS: Array<[Source, QueueItem['kind'], string]> = [
  ['claude-code', 'prompt', 'Claude Code'],
  ['codex', 'prompt', 'Codex'],
  ['claude-code', 'subagent', 'Explore agent'],
  ['chatgpt', 'prompt', 'ChatGPT'],
  ['test', 'prompt', 'ทดสอบจากหน้าหลัก'],
  ['terminal', 'prompt', 'zsh'],
]

/** สร้างคิวปลอม n ใบ ใบแรกเก่าสุด (ใกล้หมดเวลาสุด) */
export function makeQueue(n: number, now = Date.now()): QueueItem[] {
  return Array.from({ length: n }, (_, i) => {
    const [source, kind, agentLabel] = LABELS[i % LABELS.length]
    return { id: `mock-${i}`, source, kind, agentLabel, createdAt: now - (n - i) * 20_000 }
  })
}

// ---------- ตัวช่วยสร้าง vision event ----------

const base: VisionEvent = { isWai: false, level: 0, score: 0, holdMs: 0, reasons: [], facePresent: true }

/** ยกมือขึ้นไหว้ทีละนิด ค้างท่า แล้ววนใหม่ ทุก cycleMs */
function rampTo(level: WaiLevel, maxScore: number, cycleMs = 4000): (t: number) => VisionEvent {
  return (t) => {
    const p = (t % cycleMs) / cycleMs
    if (p < 0.25) return { ...base, reasons: ['HANDS_APART'] }
    const hold = (p - 0.25) / 0.75
    return {
      ...base,
      isWai: true,
      level,
      score: Math.round(maxScore * Math.min(1, hold * 1.5)),
      holdMs: Math.round(hold * cycleMs * 0.75),
    }
  }
}

/** ไหว้ไม่ถึงเกณฑ์ พร้อมเหตุผล */
function sloppy(level: WaiLevel, score: number, reasons: WaiReason[]): (t: number) => VisionEvent {
  return (t) => ({
    ...base,
    isWai: level > 0,
    level,
    score: Math.max(0, score + Math.round(Math.sin(t / 300) * 6)), // ขยับนิดๆ ให้ดูมีชีวิต
    holdMs: level > 0 ? Math.round(t % 1500) : 0,
    reasons,
  })
}

// ---------- scenario ทั้งหมด ----------

export const SCENARIOS: Record<ScenarioName, Scenario> = {
  idle: { name: 'idle', label: 'ว่าง (ไม่มีคำขอ)', state: 'IDLE', failCount: 0, vision: () => base },
  // daemon จริงตอนนี้ส่งแค่ DEMANDING (ยังไม่มี WATCHING) ต้องดูได้ด้วย
  demanding: { name: 'demanding', label: 'DEMANDING (ยังไม่ยกมือ)', state: 'DEMANDING', failCount: 0, vision: () => base },
  demand: {
    name: 'demand',
    label: 'WATCHING (กำลังไหว้)',
    state: 'WATCHING',
    failCount: 0,
    vision: rampTo(1, 72),
  },
  pass: { name: 'pass', label: 'PASSED ไหว้ผ่าน', state: 'PASSED', failCount: 0, vision: () => ({ ...base, isWai: true, level: 2, score: 91, holdMs: 1500, snapshotId: 'mock-snap' }) },
  retry: {
    name: 'retry',
    label: 'RETRY (พลาด 2)',
    state: 'RETRY',
    failCount: 2,
    vision: sloppy(1, 41, ['ASYMMETRIC', 'HOLD_TOO_SHORT']),
  },
  annoyed: {
    name: 'annoyed',
    label: 'ANNOYED (พลาด 4)',
    state: 'ANNOYED',
    failCount: 4,
    vision: sloppy(1, 58, ['HANDS_TOO_LOW']),
  },
  sulk: { name: 'sulk', label: 'SULKING (พลาด 5)', state: 'SULKING', failCount: 5, vision: sloppy(0, 0, ['FINGERS_NOT_UP']) },
  rageQuit: { name: 'rageQuit', label: 'RAGE_QUIT (พลาด 6)', state: 'RAGE_QUIT', failCount: 6, vision: () => ({ ...base, facePresent: false, reasons: ['NO_PERSON'] }) },
  forgive: {
    name: 'forgive',
    label: 'FORGIVE ขอขมา level 3',
    state: 'FORGIVE',
    failCount: 6,
    vision: (t) => (t % 6000 < 3000 ? sloppy(2, 66, ['NOT_BOWING'])(t) : rampTo(3, 98, 6000)(t)),
  },
  bypass: { name: 'bypass', label: 'WAI_BYPASS=1', state: 'IDLE', failCount: 0, bypass: true, vision: () => base },
}

/** คิวขนาดที่เหมาะกับ state ถ้าไม่ได้เลือกเอง */
export const DEFAULT_QUEUE_SIZE: Record<ScenarioName, QueueSize> = {
  idle: 0,
  demanding: 1,
  demand: 3,
  pass: 1,
  retry: 1,
  annoyed: 3,
  sulk: 5,
  rageQuit: 0,
  forgive: 1,
  bypass: 0,
}

export function scenarioSnapshot(s: Scenario, queueSize: number): QueueSnapshot {
  return { items: makeQueue(queueSize), state: s.state, failCount: s.failCount, bypass: s.bypass ?? false }
}
