import { MOCK_AVATARS, getMockAvatar, setMockAvatar } from '../mocks/mockAvatars'
import type { AvatarList, AvatarMood } from './types'

const DAEMON_URL = import.meta.env.VITE_DAEMON_URL ?? 'http://localhost:7777'
const USE_MOCK = import.meta.env.VITE_USE_MOCK === '1'

/** GET /wai/avatars */
export async function listAvatars(): Promise<AvatarList> {
  if (USE_MOCK) return { current: getMockAvatar(), items: MOCK_AVATARS }
  const res = await fetch(`${DAEMON_URL}/wai/avatars`)
  if (!res.ok) throw new Error(`GET /wai/avatars ${res.status}`)
  const raw = (await res.json()) as Partial<AvatarList>
  return { current: raw.current ?? 'jason', items: Array.isArray(raw.items) ? raw.items : [] }
}

/** POST /wai/avatar {name} → ชื่อที่ daemon บันทึกจริง */
export async function setAvatar(name: string): Promise<string> {
  if (USE_MOCK) {
    setMockAvatar(name)
    return getMockAvatar()
  }
  const res = await fetch(`${DAEMON_URL}/wai/avatar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error(`POST /wai/avatar ${res.status}`)
  return ((await res.json()) as { current: string }).current
}

/** URL รูปของน้อง (mock คืน `mock:<name>` ให้ AvatarImage วาด stub เอง) */
export function avatarUrl(name: string, mood: AvatarMood): string {
  if (USE_MOCK) return `mock:${name}`
  return `${DAEMON_URL}/wai/avatar/${encodeURIComponent(name)}/${mood}.png`
}
