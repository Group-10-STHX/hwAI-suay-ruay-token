import type { ReactNode } from 'react'
import type { QueueItem } from '../api/types'
import { space } from '../theme/tokens'
import { AgentCard } from './AgentCard'

export type CardStackProps = {
  items: QueueItem[] // คิวที่รออยู่ "หลัง" ใบที่ island กำลังขอไหว้ (ห้ามส่งใบบนสุดมาซ้ำ)
  now: number // epoch ms ใช้คำนวณเวลาที่เหลือ
  timeoutMs: number // REQUEST_TIMEOUT_MS
  max: number // MAX_VISIBLE_CARDS (โชว์ไม่เกินนี้ ที่เหลือใช้ PendingCount)
  avatar?: (item: QueueItem, index: number) => ReactNode // น้องตัวเล็กของแต่ละใบ
}

/** กองการ์ดเอเจนต์ที่รอคิว ใบละ 1 คำขอ ไม่เกิน max ใบ */
export function CardStack({ items, now, timeoutMs, max, avatar }: CardStackProps) {
  if (items.length === 0 || max <= 0) return null
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: space.sm }}>
      {items.slice(0, max).map((it, i) => (
        <AgentCard key={it.id} item={it} now={now} timeoutMs={timeoutMs} tone="hudDim" dim avatar={avatar?.(it, i)} />
      ))}
    </ul>
  )
}
