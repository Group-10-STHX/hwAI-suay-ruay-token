import { ScanView } from '../camera-overlay'
import { fontSize, space, v } from '../theme/tokens'
import { HOLD_TARGET_MS } from './derive'
import { dragBar } from './homeStyles'
import { useCameraPreview } from './useCameraPreview'

// หน้าต่างกล้อง (แยกจากหน้าหลัก): viewfinder SCAN มนุษย์ + กล่อง level 3→0 + วงค้างท่า
// window ปกติ ไม่โปร่ง ไม่ alwaysOnTop · ปิดหน้าต่าง = unmount = กล้องดับ + heartbeat หยุด

export function CameraViewWindow() {
  const { stream, error, analysing, ev } = useCameraPreview()
  return (
    <div style={{ height: '100%', background: v('bg'), color: v('text'), padding: `${space.xl + space.sm}px ${space.lg}px ${space.md}px`, display: 'grid', alignContent: 'start', gap: space.sm, userSelect: 'none', boxSizing: 'border-box' }}>
      <div style={dragBar} />
      <ScanView
        stream={stream}
        error={error}
        analysing={analysing}
        level={ev.level}
        score={ev.score}
        holdMs={ev.holdMs}
        holdTargetMs={HOLD_TARGET_MS}
        isWai={ev.isWai}
        facePresent={ev.facePresent}
      />
      <div style={{ color: v('textDim'), fontSize: fontSize.small }}>
        {analysing ? 'กำลังอ่านท่าไหว้จากกล้อง · ภาพไม่ออกจากเครื่อง' : 'ภาพจากกล้องแสดงในหน้านี้เท่านั้น ไม่อัด ไม่ส่งออก'}
      </div>
    </div>
  )
}
