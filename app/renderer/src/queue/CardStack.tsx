import type { QueueItem } from '../api/types'
import { v } from '../theme/tokens'

export type CardStackProps = {
  items: QueueItem[] // ใบแรก = ใบบนสุด (ไหว้ผ่านแล้วปลิวออก)
  now: number // epoch ms ใช้คำนวณเวลาที่เหลือ
}

export function CardStack({ items }: CardStackProps) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', color: v('textDim') }}>
      {items.slice(0, 3).map((it) => (
        <li key={it.id}>
          {it.agentLabel} ({it.kind})
        </li>
      ))}
    </ul>
  )
}
