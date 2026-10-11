import type { FleeState, VisionEvent, WaiLevel } from './types'

// bridge ที่ preload ของ #1 ต้อง expose ไว้ใน window (ยังไม่ได้ตกลงชื่อ รอยืนยันกับ #1)
// ตัวอย่างฝั่ง preload:
//   contextBridge.exposeInMainWorld('wai', {
//     onVisionEvent: (cb) => { const h = (_e, d) => cb(d); ipcRenderer.on('vision:event', h); return () => ipcRenderer.off('vision:event', h) }
//   })
declare global {
  interface Window {
    wai?: {
      onVisionEvent: (cb: (raw: Partial<VisionEvent>) => void) => () => void
      /** หน้าหลัก: เปิด Terminal รัน Codex CLI ให้ผู้ใช้พิมพ์ /hooks กด trust (spike) */
      openCodexHooks?: () => Promise<{ ok: boolean; error?: string }>
      /** onboarding: ติด/ถอด hook, ขอกล้อง, เปิดตอนเข้าเครื่อง (spike) */
      setup?: import('./setup').SetupBridge
      /** หนีเมาส์ (ANNOYED): IPC wai:flee จาก main ส่งเมื่อค่าเปลี่ยน ไม่มี = ไม่หนี (api/flee.ts) */
      onFlee?: (cb: (raw: Partial<FleeState>) => void) => () => void
      setInteractive?: (on: boolean) => void
      /** ง้อด้วยรหัสซอง True Money (mock ล้อเล่น) ผ่าน IPC ไม่ผ่าน HTTP */
      /** เปิดเว็บอันดับ WAI-NET ในเบราว์เซอร์ (main เป็นคนเปิด renderer ส่งแค่ชนิดลิงก์) */
      openWeb?: (kind: 'rank' | 'tv' | 'me') => Promise<{ ok: boolean; error?: string }>
      /** จ่าย True Money 1,000 บาท (mock ล้อเล่น) จากหน้าต่าง tribute · IPC ไม่ผ่าน HTTP */
      tribute?: (code: string) => Promise<{ ok: boolean; message: string }>
      /** ปิดหน้าต่าง tribute (IPC wai:tribute-close) คำขอยังรออยู่ */
      closeTribute?: () => void
      bribe?: (code: string) => Promise<{ ok: boolean; message: string }>
      /** หน้าหลัก: เปิด/โฟกัสหน้าต่างกล้อง (IPC wai:open-camera-view) */
      openCameraView?: () => Promise<{ ok: boolean }>
      /** หน้าต่างสวดบาลี: ตอบ [ฟัง]=true (IPC wai:chant-answer) ห้ามส่ง false จากปุ่มที่วิ่งหนี */
      chantAnswer?: (yes: boolean) => Promise<{ ok: boolean }>
      /** ปิดหน้าต่างสวดบาลี (IPC wai:chant-close) */
      closeChant?: () => void
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
