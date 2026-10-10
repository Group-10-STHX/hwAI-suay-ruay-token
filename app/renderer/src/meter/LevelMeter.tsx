import type { WaiLevel } from '../api/types'
import { v } from '../theme/tokens'

export type LevelMeterProps = {
  level: WaiLevel
  requiredLevel: WaiLevel // เส้นเป้า โชว์ชัดตอน ANNOYED / FORGIVE
  showTarget: boolean
}

export function LevelMeter({ level, requiredLevel }: LevelMeterProps) {
  return (
    <div className="mono" style={{ color: v('hud') }}>
      LV {level} / {requiredLevel}
    </div>
  )
}
