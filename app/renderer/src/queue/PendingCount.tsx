import { v } from '../theme/tokens'

export type PendingCountProps = { count: number }

export function PendingCount({ count }: PendingCountProps) {
  if (count <= 0) return null
  return <div style={{ color: v('textDim') }}>รอไหว้อีก {count} ตัว</div>
}
