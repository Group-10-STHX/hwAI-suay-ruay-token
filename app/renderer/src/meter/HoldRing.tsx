import { fontSize, v } from '../theme/tokens'

export type HoldRingProps = {
  holdMs: number
  holdTargetMs: number // ต้องค้างกี่ ms ถึงผ่าน (รอยืนยันกับ Vision)
  score: number
  isWai: boolean
}

export function HoldRing({ holdMs, holdTargetMs, score }: HoldRingProps) {
  return (
    <div className="mono" style={{ fontSize: fontSize.score, color: v('text') }}>
      {score} <small style={{ fontSize: fontSize.small }}>{Math.round((holdMs / holdTargetMs) * 100)}%</small>
    </div>
  )
}
