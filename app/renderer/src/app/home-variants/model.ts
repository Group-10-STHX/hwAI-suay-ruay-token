import type { CSSProperties } from 'react'
import type { AppStatus, AvatarItem, AvatarMood, StickerItem, StickerStyle } from '../../api/types'
import type { SfxLevel } from '../../sfx/policy'
import type { Variant } from './variant'

// ข้อมูลทั้งหมดที่ร่างหน้าหลักต้องใช้ (FRONT_RULES "home variants")
// HomeWindow เป็นคนเดียวที่อ่าน api/hook แล้วส่งลงมา ร่างทุกตัว props-only ดูด้วย mock ได้

export type HomeProps = {
  status: AppStatus | null
  offline: boolean
  mock: boolean
  // เสียงคะแนน (localStorage waiSfxLevel)
  sfx: SfxLevel
  onSfx: (l: SfxLevel) => void
  // ตัวละคร: รายการจาก /wai/avatars, ชื่อที่เลือกอยู่, กดเลือก, URL รูป (api.avatarUrl ที่ app ส่งให้ component ห้ามประกอบเอง)
  avatars: AvatarItem[]
  avatar: string
  onAvatar: (name: string) => void
  avatarSrc: (name: string, mood: AvatarMood) => string
  // สติ๊กเกอร์ล่าสุด (ว่าง = ซ่อน)
  stickers: StickerItem[]
  stickerStyle: StickerStyle
  onStickerStyle: (s: StickerStyle) => void
  stickerUrl: (file: string) => string
  // ปุ่ม
  onToggle: () => void
  onMonitor: () => void
  onTest: () => void
  onSettings: () => void
  // ร่างที่ใช้อยู่ (ไม่ส่ง = default ไม่มีชิปสลับ)
  variant?: Variant
  onCycleVariant?: () => void
}

/** ลำดับการ render ของบล็อก (--i ใช้ใน effects.css) */
export const at = (i: number) => ({ '--i': i }) as CSSProperties

export function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

/** เปิดอยู่ไหม / มีคิวรอไหว้กี่ตัว (นับเฉพาะตอนเปิด เหมือน .has-pending ของร่างเดิม) */
export const isOn = (s: AppStatus | null) => s?.enabled ?? false
export const pendingOf = (s: AppStatus | null) => (s?.enabled ? s.pending : 0)
