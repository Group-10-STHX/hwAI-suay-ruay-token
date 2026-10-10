import { QUEUE_POLL_MS, type QueueItem, type QueueSnapshot, type SessionState, type Source } from './types'

const DAEMON_URL = import.meta.env.VITE_DAEMON_URL ?? 'http://localhost:7777'

// รูปที่ daemon ส่งมา (snake_case ตาม contract)
// แปลงเป็น camelCase ที่นี่ที่เดียว ห้ามไปแปลงใน component
type RawQueueItem = {
  id: string
  source: string
  kind: 'prompt' | 'subagent'
  agent_label?: string
  created_at?: number
}
type RawQueue =
  | RawQueueItem[]
  | { items: RawQueueItem[]; state?: SessionState; fail_count?: number; bypass?: boolean }

const KNOWN_SOURCES: Source[] = ['claude-code', 'chatgpt', 'terminal']

function toItem(raw: RawQueueItem): QueueItem {
  return {
    id: raw.id,
    source: KNOWN_SOURCES.includes(raw.source as Source) ? (raw.source as Source) : 'terminal',
    kind: raw.kind,
    agentLabel: raw.agent_label ?? raw.kind,
    createdAt: raw.created_at ?? Date.now(),
  }
}

export function toSnapshot(raw: RawQueue): QueueSnapshot {
  const obj = Array.isArray(raw) ? { items: raw } : raw
  const items = obj.items.map(toItem)
  return {
    items,
    // ถ้า #1 ยังไม่ส่ง state มา เดาจากคิว
    state: 'state' in obj && obj.state ? obj.state : items.length > 0 ? 'DEMANDING' : 'IDLE',
    failCount: ('fail_count' in obj && obj.fail_count) || 0,
    bypass: ('bypass' in obj && obj.bypass) || false,
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
