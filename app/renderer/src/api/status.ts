import type { AppStatus } from './types'

const DAEMON_URL = import.meta.env.VITE_DAEMON_URL ?? 'http://localhost:7777'
const STATUS_POLL_MS = 1000

type RawStatus = { enabled: boolean; pending: number; stats: AppStatus['stats']; last_seen?: AppStatus['lastSeen'] }

/** poll GET /wai/status ทุก 1 วิ (หน้าหลักไม่ต้องไวเท่าคิว) */
export function subscribeStatus(onStatus: (s: AppStatus) => void, onError?: (e: unknown) => void): () => void {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const tick = async () => {
    try {
      const res = await fetch(`${DAEMON_URL}/wai/status`)
      if (!res.ok) throw new Error(`GET /wai/status ${res.status}`)
      const raw: RawStatus = await res.json()
      if (!stopped) onStatus({ enabled: raw.enabled, pending: raw.pending, stats: raw.stats, lastSeen: raw.last_seen ?? {} })
    } catch (e) {
      onError?.(e)
    }
    if (!stopped) timer = setTimeout(tick, STATUS_POLL_MS)
  }
  tick()
  return () => {
    stopped = true
    clearTimeout(timer)
  }
}

export async function setEnabled(enabled: boolean): Promise<void> {
  await fetch(`${DAEMON_URL}/wai/enabled`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  })
}

/** ยิงคำขอปลอม 1 ใบ ให้ popup เด้งโดยไม่ต้องเปิด AI (ไม่รอผล) */
export async function sendTestRequest(): Promise<void> {
  await fetch(`${DAEMON_URL}/wai/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'test', kind: 'prompt', session_id: 'home-test', agent_label: 'ทดสอบจากหน้าหลัก' }),
  })
}

/** เปิด Terminal ให้ trust hook ของ Codex (ผ่าน IPC ของ Electron ไม่ใช่ HTTP กันเว็บอื่นสั่ง) */
export async function openCodexHooks(): Promise<{ ok: boolean; error?: string }> {
  if (!window.wai?.openCodexHooks) return { ok: false, error: 'ต้องเปิดในแอป (ไม่ใช่ browser)' }
  return window.wai.openCodexHooks()
}
