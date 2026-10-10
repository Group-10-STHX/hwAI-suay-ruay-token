import { v } from '../theme/tokens'

export type Pose = 'crossArms' | 'stick' | 'laserGun' | 'sulk' | 'spaceship' | 'wai'

export type MascotProps = {
  pose: Pose
  providerColor: string // สีเสื้อตาม provider (theme/tokens providerAccent)
  providerLabel: string // ป้ายชื่อตัวหนังสือ เช่น "Claude Code"
}

export function Mascot({ pose, providerColor, providerLabel }: MascotProps) {
  return (
    <div style={{ width: 160, height: 200, display: 'grid', placeItems: 'center', color: v('textDim') }}>
      <div style={{ width: 72, height: 72, borderRadius: '50%', background: providerColor }} />
      <div className="mono">[{pose}]</div>
      <div className="display">{providerLabel}</div>
    </div>
  )
}
