import type { WaiReason } from '../api/types'
import { v } from '../theme/tokens'

export type ReasonChipProps = { reasons: WaiReason[] } // ข้อความจริง map ใน states/copy.ts (ผ่าน app/)

export function ReasonChip({ reasons }: ReasonChipProps) {
  if (reasons.length === 0) return null
  return <div style={{ color: v('hud') }}>{reasons.join(', ')}</div>
}
