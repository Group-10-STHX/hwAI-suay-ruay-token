import type { AppStatus, DayPoint, DayStats } from './types'

const DAEMON_URL = import.meta.env.VITE_DAEMON_URL ?? 'http://localhost:7777'
const STATUS_POLL_MS = 1000

type RawDay = Partial<DayStats>
type RawStatus = {
  enabled: boolean
  pending: number
  stats?: { requests?: number; passed?: number; bypassed?: number; today?: RawDay; total?: RawDay; best_score?: number; days?: (RawDay & { day?: string })[] }
  last_seen?: AppStatus['lastSeen']
  avatar?: string
  monitor?: boolean
  web?: { rank?: string; tv?: string; me?: string | null } | null
}

const day = (d?: RawDay): DayStats => ({ wais: d?.wais ?? 0, passed: d?.passed ?? 0, beautiful: d?.beautiful ?? 0, tokens: d?.tokens ?? 0 })

function mapStats(st: RawStatus['stats']): AppStatus['stats'] {
  return {
    requests: st?.requests ?? 0,
    passed: st?.passed ?? 0,
    bypassed: st?.bypassed ?? 0,
    today: day(st?.today),
    total: day(st?.total),
    bestScore: st?.best_score ?? undefined,
    days: Array.isArray(st?.days)
      ? st.days.filter((d): d is RawDay & { day: string } => typeof d?.day === 'string').map((d): DayPoint => ({ day: d.day, ...day(d) }))
      : undefined,
  }
}

/** poll GET /wai/status ทุก 1 วิ (หน้าหลักไม่ต้องไวเท่าคิว) */
export function subscribeStatus(onStatus: (s: AppStatus) => void, onError?: (e: unknown) => void): () => void {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const tick = async () => {
    try {
      const res = await fetch(`${DAEMON_URL}/wai/status`)
      if (!res.ok) throw new Error(`GET /wai/status ${res.status}`)
      const raw: RawStatus = await res.json()
      if (!stopped) onStatus({ enabled: raw.enabled, pending: raw.pending, stats: mapStats(raw.stats), lastSeen: raw.last_seen ?? {}, avatar: typeof raw.avatar === 'string' ? raw.avatar : undefined, monitor: raw.monitor === true, web: raw.web?.rank && raw.web?.tv ? { rank: raw.web.rank, tv: raw.web.tv, me: raw.web.me ?? null } : null })
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

export async function setMonitor(monitor: boolean): Promise<void> {
  await fetch(`${DAEMON_URL}/wai/monitor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ monitor }),
  })
}

export async function setEnabled(enabled: boolean): Promise<void> {
  await fetch(`${DAEMON_URL}/wai/enabled`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  })
}

/** หน้าต่างกล้อง: ขอให้ daemon เปิดกล้องวิเคราะห์ไว้ (ยิงซ้ำทุก ~5 วิ หมดอายุเองที่ 12 วิ) */
export async function setCameraPreview(on: boolean): Promise<void> {
  await fetch(`${DAEMON_URL}/wai/camera-preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ on }),
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

/** เปิดเว็บอันดับ WAI-NET (ผ่าน IPC · ใน browser ธรรมดาเปิด URL ที่ daemon บอกมาแทน) */
export async function openWeb(kind: 'rank' | 'tv' | 'me', fallbackUrl?: string): Promise<{ ok: boolean; error?: string }> {
  if (window.wai?.openWeb) return window.wai.openWeb(kind)
  if (fallbackUrl) {
    window.open(fallbackUrl, '_blank', 'noopener')
    return { ok: true }
  }
  return { ok: false, error: 'ยังไม่ได้เชื่อมเว็บ' }
}

/** เปิด Terminal ให้ trust hook ของ Codex (ผ่าน IPC ของ Electron ไม่ใช่ HTTP กันเว็บอื่นสั่ง) */
/** เปิดหน้าต่างกล้อง: ในแอปผ่าน IPC · browser/mock เปิด camera-view.html ในแท็บใหม่ */
export async function openCameraView(): Promise<void> {
  if (window.wai?.openCameraView) {
    await window.wai.openCameraView()
    return
  }
  window.open(new URL('camera-view.html', window.location.href).toString(), '_blank')
}

export async function openCodexHooks(): Promise<{ ok: boolean; error?: string }> {
  if (!window.wai?.openCodexHooks) return { ok: false, error: 'ต้องเปิดในแอป (ไม่ใช่ browser)' }
  return window.wai.openCodexHooks()
}
