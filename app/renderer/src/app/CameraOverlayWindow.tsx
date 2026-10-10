import { REQUIRED_LEVEL } from '../api'
import { ReasonChip, ScanFrame } from '../camera-overlay'
import { HoldRing, LevelMeter } from '../meter'
import { stateColor } from '../theme/tokens'
import { CAMERA_ON, HOLD_TARGET_MS } from './derive'
import { useStore } from './store'

export function CameraOverlayWindow() {
  const { queue, vision } = useStore()
  const { state } = queue
  const on = CAMERA_ON[state] || (state === 'PASSED' && queue.items.length > 0)
  if (!on) return null

  return (
    <div className="is-active" style={{ position: 'relative', height: '100%' }}>
      <ScanFrame tone={stateColor[state]} active />
      <div style={{ position: 'absolute', left: 32, bottom: 32 }}>
        <LevelMeter
          level={vision.level}
          requiredLevel={REQUIRED_LEVEL[state]}
          showTarget={state === 'ANNOYED' || state === 'FORGIVE'}
        />
      </div>
      <div style={{ position: 'absolute', right: 32, bottom: 32 }}>
        <HoldRing holdMs={vision.holdMs} holdTargetMs={HOLD_TARGET_MS} score={vision.score} isWai={vision.isWai} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 32, display: 'flex', justifyContent: 'center' }}>
        <ReasonChip messages={vision.reasons} /* TODO: map ผ่าน states/copy.ts เมื่อคนที่ 1 ทำเสร็จ */ />
      </div>
    </div>
  )
}
