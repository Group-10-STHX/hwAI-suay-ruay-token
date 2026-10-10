import type { SessionState } from '../api/types'
import { radius, shadow } from '../theme/tokens'
import { MOOD_SRC, STILL_SRC } from './moods'

export type MascotSize = 'big' | 'small'

export type MascotProps = {
  state: SessionState // ท่าของน้องตาม state (§4)
  providerColor: string // สี accent ของ provider โชว์เป็นฐานใต้เท้าน้อง (ไม่มีโลโก้ §5)
  size?: MascotSize // big = น้องหลักใน island, small = น้องบนการ์ด
  still?: boolean // true = ไม่ขยับ (ใช้กับน้องตัวเล็กบนการ์ด)
}

const PX: Record<MascotSize, number> = { big: 128, small: 46 }

export function Mascot({ state, providerColor, size = 'big', still = false }: MascotProps) {
  const px = PX[size]
  const src = still ? (state === 'IDLE' ? STILL_SRC.idle : STILL_SRC.waiting) : MOOD_SRC[state]
  return (
    <div style={{ width: px, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <img src={src} alt="" width={px} height={px} draggable={false} style={{ display: 'block', filter: shadow.ink }} />
      <div
        aria-hidden
        style={{
          width: px * 0.45,
          height: size === 'big' ? 4 : 3,
          marginTop: size === 'big' ? -18 : -6,
          borderRadius: radius.sm,
          background: providerColor,
        }}
      />
    </div>
  )
}
