import { isStickerStyle, type StickerList, type StickerStyle } from './types'

const DAEMON_URL = import.meta.env.VITE_DAEMON_URL ?? 'http://localhost:7777'
const USE_MOCK = import.meta.env.VITE_USE_MOCK === '1'

/** GET /wai/stickers · mock/daemon เก่า = รายการว่าง (หน้าหลักจะซ่อนแถบเอง) */
export async function listStickers(): Promise<StickerList> {
  if (USE_MOCK) return { items: [], style: 'photo' }
  const res = await fetch(`${DAEMON_URL}/wai/stickers`)
  if (!res.ok) throw new Error(`GET /wai/stickers ${res.status}`)
  const raw = (await res.json()) as Partial<StickerList>
  return {
    items: Array.isArray(raw.items) ? raw.items.filter((i) => i && typeof i.file === 'string') : [],
    style: isStickerStyle(raw.style) ? raw.style : 'photo', // daemon เก่า/ค่าแปลก = photo
  }
}

/** URL รูปสติ๊กเกอร์ (daemon ตรวจชื่อไฟล์อีกชั้น) */
export function stickerUrl(file: string): string {
  return `${DAEMON_URL}/wai/sticker/${encodeURIComponent(file)}`
}

/** POST /wai/sticker-style {style} → style ที่ daemon บันทึกจริง */
export async function setStickerStyle(style: StickerStyle): Promise<StickerStyle> {
  if (USE_MOCK) return style
  const res = await fetch(`${DAEMON_URL}/wai/sticker-style`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ style }),
  })
  if (!res.ok) throw new Error(`POST /wai/sticker-style ${res.status}`)
  const saved = ((await res.json()) as { style?: unknown }).style
  return isStickerStyle(saved) ? saved : style
}
