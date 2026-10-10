import { fontSize, shadow, v } from '../theme/tokens'

export type PendingCountProps = { count: number }

/** "รอไหว้อีก N ตัว" ใต้กองการ์ด เมื่อคิวเกินที่โชว์ได้ */
export function PendingCount({ count }: PendingCountProps) {
  if (count <= 0) return null
  return (
    <div style={{ color: v('textDim'), fontSize: fontSize.small + 1, textShadow: shadow.text, paddingRight: 54 }}>
      รอไหว้อีก{' '}
      <span className="mono" style={{ color: v('text') }}>
        {count}
      </span>{' '}
      ตัว
    </div>
  )
}
