import { v } from '../theme/tokens'

export type TimeLeftProps = {
  createdAt: number // epoch ms ของคำขอ
  now: number // epoch ms
  timeoutMs: number // REQUEST_TIMEOUT_MS จาก app/
}

/** เวลาที่เหลือก่อน hook timeout แบบ m:ss นับถอยหลังจาก timeoutMs ไม่เกิน timeoutMs และไม่ติดลบ */
export function TimeLeft({ createdAt, now, timeoutMs }: TimeLeftProps) {
  // now อาจช้ากว่า createdAt นิดหน่อยตอนการ์ดเพิ่งเข้า (นาฬิกา tick ทุกวิ) จึงต้อง clamp ไม่ให้เกิน timeout
  const left = Math.min(timeoutMs, Math.max(0, timeoutMs - (now - createdAt)))
  const s = Math.floor(left / 1000)
  return (
    <span className="mono" style={{ color: left < 60_000 ? v('hud') : v('textDim') }} title="เวลาที่เหลือก่อน timeout">
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </span>
  )
}
