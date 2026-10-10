import { v } from '../theme/tokens'

// รับข้อความที่ map แล้ว (app/ map จาก WaiReason ด้วย states/copy.ts) ไม่รับ enum ดิบ
export type ReasonChipProps = { messages: string[] }

export function ReasonChip({ messages }: ReasonChipProps) {
  if (messages.length === 0) return null
  return <div style={{ color: v('hud') }}>{messages.join(' · ')}</div>
}
