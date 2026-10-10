import type { ReactNode } from 'react'
import type { SessionState, WaiReason } from '../api/types'
import { fontSize, v } from '../theme/tokens'

export type IslandProps = {
  state: SessionState
  failCount: number
  score: number
  reasons: WaiReason[]
  providerColor: string
  providerLabel: string
  mascot: ReactNode // app/ ส่ง <Mascot/> มาให้ (states import mascot ข้ามโฟลเดอร์ไม่ได้ถ้าไม่ผ่าน index)
  cards: ReactNode // slot สำหรับ CardStack
}

export function Island({ state, failCount, score, mascot, cards }: IslandProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      {mascot}
      <div className="display" style={{ fontSize: fontSize.speech, color: v('text') }}>
        {state} · พลาด {failCount} · {score}
      </div>
      {cards}
    </div>
  )
}
