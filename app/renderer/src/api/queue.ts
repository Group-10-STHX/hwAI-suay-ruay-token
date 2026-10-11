import { QUEUE_POLL_MS, type QueueItem, type QueueSnapshot, type SessionState, type Source, type WaiEvent } from './types'

const DAEMON_URL = import.meta.env.VITE_DAEMON_URL ?? 'http://localhost:7777'

// รูปที่ daemon ส่งมา (snake_case ตาม contract)
// แปลงเป็น camelCase ที่นี่ที่เดียว ห้ามไปแปลงใน component
type RawQueueItem = {
  id: string
  source: string
  kind: 'prompt' | 'subagent'
  agent_label?: string
  created_at?: number // epoch ms (รอยืนยันกับ #1 ว่า ms หรือวินาที)
}
type RawQueue =
  | RawQueueItem[]
  | {
      items: RawQueueItem[]
      state?: SessionState
      fail_count?: number
      bypass?: boolean
      monitor?: boolean
      avatar?: string
      linger_ms?: number
      event?: { kind?: string; text?: string; amount?: number; ms_left?: number } | null
    }

const KNOWN_SOURCES: Source[] = ['claude-code', 'codex', 'chatgpt', 'claude-web', 'gemini-web', 'test', 'terminal']

// ถ้า daemon ไม่ส่ง created_at มา ใช้เวลาที่เห็นการ์ดครั้งแรกแทน
// (ห้ามใช้ Date.now() ตรงๆ ไม่งั้นนับถอยหลังรีเซ็ตทุก poll)
const firstSeen = new Map<string, number>()

function toItem(raw: RawQueueItem): QueueItem {
  return {
    id: raw.id,
    source: KNOWN_SOURCES.includes(raw.source as Source) ? (raw.source as Source) : 'terminal',
    kind: raw.kind,
    agentLabel: raw.agent_label ?? raw.kind,
    createdAt: raw.created_at ?? firstSeen.get(raw.id)!,
  }
}

function toEvent(raw: unknown): WaiEvent | undefined {
  const e = raw as { kind?: string; text?: string; amount?: number; ms_left?: number } | null | undefined
  if (!e || (e.kind !== 'redo' && e.kind !== 'tribute') || typeof e.text !== 'string') return undefined
  return {
    kind: e.kind,
    text: e.text,
    amount: typeof e.amount === 'number' ? e.amount : undefined,
    msLeft: typeof e.ms_left === 'number' ? e.ms_left : 0,
  }
}

export function toSnapshot(raw: RawQueue): QueueSnapshot {
  const obj = Array.isArray(raw) ? { items: raw } : raw
  const now = Date.now()
  for (const it of obj.items) if (!firstSeen.has(it.id)) firstSeen.set(it.id, now)
  for (const id of firstSeen.keys()) if (!obj.items.some((it) => it.id === id)) firstSeen.delete(id)
  const items = obj.items.map(toItem)
  return {
    items,
    // ถ้า #1 ยังไม่ส่ง state มา เดาจากคิว
    state: 'state' in obj && obj.state ? obj.state : items.length > 0 ? 'DEMANDING' : 'IDLE',
    failCount: ('fail_count' in obj && obj.fail_count) || 0,
    bypass: ('bypass' in obj && obj.bypass) || false,
    monitor: 'monitor' in obj && obj.monitor === true,
    avatar: 'avatar' in obj && typeof obj.avatar === 'string' ? obj.avatar : undefined,
    event: 'event' in obj ? toEvent(obj.event) : undefined,
    lingerMs: 'linger_ms' in obj && typeof obj.linger_ms === 'number' && obj.linger_ms > 0 ? obj.linger_ms : undefined,
  }
}

/** poll GET /wai/queue ทุก 500ms คืนฟังก์ชันสำหรับหยุด */
export function subscribeQueue(
  onSnapshot: (s: QueueSnapshot) => void,
  onError?: (e: unknown) => void,
): () => void {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const tick = async () => {
    try {
      const res = await fetch(`${DAEMON_URL}/wai/queue`)
      if (!res.ok) throw new Error(`GET /wai/queue ${res.status}`)
      if (!stopped) onSnapshot(toSnapshot(await res.json()))
    } catch (e) {
      onError?.(e)
    }
    // รอให้ request เดิมจบก่อนค่อยยิงใหม่ กันยิงซ้อนตอน daemon ช้า
    if (!stopped) timer = setTimeout(tick, QUEUE_POLL_MS)
  }
  tick()

  return () => {
    stopped = true
    clearTimeout(timer)
  }
}

/** ข้ามการไหว้ใบนี้ (dev/spike เท่านั้น ใช้แทนกล้องจนกว่า Vision จะต่อเสร็จ ไม่อยู่ใน contract) */
export async function skipItem(id: string): Promise<void> {
  await fetch(`${DAEMON_URL}/wai/skip/${id}`, { method: 'POST' })
}
