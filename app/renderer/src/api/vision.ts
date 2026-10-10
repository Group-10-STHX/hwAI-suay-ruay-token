import type { VisionEvent, WaiLevel } from './types'

// bridge ที่ preload ของ #1 ต้อง expose ไว้ใน window (ยังไม่ได้ตกลงชื่อ รอยืนยันกับ #1)
// ตัวอย่างฝั่ง preload:
//   contextBridge.exposeInMainWorld('wai', {
//     onVisionEvent: (cb) => { const h = (_e, d) => cb(d); ipcRenderer.on('vision:event', h); return () => ipcRenderer.off('vision:event', h) }
//   })
declare global {
  interface Window {
    wai?: {
      onVisionEvent: (cb: (raw: Partial<VisionEvent>) => void) => () => void
    }
  }
}

/** เติมค่า default ให้ฟิลด์ที่ Vision อาจยังไม่ส่ง */
export function toVisionEvent(raw: Partial<VisionEvent>): VisionEvent {
  return {
    isWai: raw.isWai ?? false,
    level: (raw.level ?? 0) as WaiLevel,
    score: raw.score ?? 0,
    holdMs: raw.holdMs ?? 0,
    reasons: raw.reasons ?? [],
    facePresent: raw.facePresent ?? true,
    snapshotId: raw.snapshotId,
    style: raw.style,
  }
}

/** subscribe IPC vision:event (~15 fps) คืนฟังก์ชันสำหรับหยุด */
export function subscribeVision(onEvent: (e: VisionEvent) => void): () => void {
  if (!window.wai) {
    console.warn('[vision] ไม่เจอ window.wai ถ้าไม่ได้รันใน Electron ให้ใช้ VITE_USE_MOCK=1')
    return () => {}
  }
  return window.wai.onVisionEvent((raw) => onEvent(toVisionEvent(raw)))
}
