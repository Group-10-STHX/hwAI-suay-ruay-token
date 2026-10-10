import type { ColorToken } from '../theme/tokens'
import { v } from '../theme/tokens'

export type ScanFrameProps = {
  tone: ColorToken // hud / danger / blessed / sulk ตาม state
  active: boolean // false = ไม่มีคำขอ ห้ามมี animation
}

export function ScanFrame({ tone }: ScanFrameProps) {
  return <div style={{ position: 'absolute', inset: 24, border: `2px dashed ${v(tone)}`, pointerEvents: 'none' }} />
}
