import { font, radius, space, v } from '../theme/tokens'

// อีเวนต์ 67: แถบนับท่า "6-7" ใต้ข้อความในฟอง props เท่านั้น
// need ช่อง สลับเลข 6 / 7 ช่องที่ผ่านแล้ว (ถึง swings) เป็นสีกล้วย blessed · ช่องล่าสุดเด้ง (fx-pop, reduced-motion = นิ่ง)

export type SixSevenMeterProps = {
  swings: number // สลับมือแล้วกี่ครั้ง
  need: number // ต้องได้กี่ครั้ง
}

export function SixSevenMeter({ swings, need }: SixSevenMeterProps) {
  const total = Math.max(1, Math.min(12, Math.round(need)))
  const done = Math.max(0, Math.min(total, Math.floor(swings)))
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-label="ความคืบหน้าท่า 6-7"
      style={{ display: 'grid', gap: space.xs, marginTop: space.sm }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.xs }}>
        {Array.from({ length: total }, (_, i) => {
          const on = i < done
          return (
            <span
              // key รวมสถานะ: ช่องที่เพิ่งเต็มเล่น fx-pop ใหม่
              key={`${i}-${on}`}
              className={`mono${on && i === done - 1 ? ' fx-pop' : ''}`}
              style={{
                width: 24,
                height: 32,
                display: 'grid',
                placeItems: 'center',
                borderRadius: radius.md,
                fontFamily: font.display,
                fontWeight: 800,
                fontSize: 20,
                lineHeight: 1,
                background: on ? v('blessed') : 'transparent',
                color: on ? v('bg') : v('textDim'),
                border: `2px solid ${on ? v('blessed') : v('hudDim')}`,
                transform: i % 2 === 0 ? 'translateY(-3px)' : 'translateY(3px)', // ขึ้น-ลงสลับเหมือนตาชั่ง
              }}
            >
              {i % 2 === 0 ? 6 : 7}
            </span>
          )
        })}
      </div>
      <div className="mono" style={{ color: v('blessed'), fontWeight: 700, fontSize: 16 }}>
        {done}/{total}
      </div>
    </div>
  )
}
