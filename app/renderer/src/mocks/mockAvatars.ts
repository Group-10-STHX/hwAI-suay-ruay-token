import type { AvatarList } from '../api/types'

// ตัวละครปลอมสำหรับ VITE_USE_MOCK=1: jason + น้องปลอม 2 ตัว (วาดด้วย CSS ใน mascot/AvatarImage ไม่มีไฟล์รูป)
// ซิงก์ข้ามหน้าต่างด้วย BroadcastChannel + localStorage เหมือน mockFeed

const KEY = 'wai-mock-avatar'
const CHANNEL = 'wai-mock-avatar'

export const MOCK_AVATARS: AvatarList['items'] = [
  { name: 'jason', label: 'jason', kind: 'builtin', moods: [] },
  { name: 'stub-a', label: 'stub-a', kind: 'user', moods: ['angry', 'sad', 'confused', 'forgive'] },
  { name: 'stub-b', label: 'stub-b', kind: 'user', moods: ['confused'] },
]

function read(): string {
  try {
    const v = localStorage.getItem(KEY)
    if (v && MOCK_AVATARS.some((a) => a.name === v)) return v
  } catch {
    // ไม่มี localStorage ก็ใช้ default
  }
  return 'jason'
}

let current = read()
const listeners = new Set<() => void>()
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null
channel?.addEventListener('message', (e: MessageEvent<string>) => {
  current = e.data
  listeners.forEach((l) => l())
})

export const getMockAvatar = () => current

export function setMockAvatar(name: string) {
  if (!MOCK_AVATARS.some((a) => a.name === name)) return
  current = name
  try {
    localStorage.setItem(KEY, name)
  } catch {
    // ignore
  }
  channel?.postMessage(name)
  listeners.forEach((l) => l())
}

export function onMockAvatar(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
