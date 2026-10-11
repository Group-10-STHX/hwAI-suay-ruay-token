import { useEffect, useState } from 'react'
import { setCameraPreview, subscribeVision } from '../api'
import type { VisionEvent } from '../api/types'
import { ScanView } from '../camera-overlay'
import { fontSize, space, v } from '../theme/tokens'

export const CAMERA_ANCHOR = 'wai-camera'
import { HOLD_TARGET_MS } from './derive'

// ส่วน "กล้อง" ของหน้าหลัก (อยู่ใต้โหมดสังเกต ก่อนสถิติ): เปิดกล้องให้ผู้ใช้เห็นว่ากล้องทำงาน + level/คะแนนสด
// - ภาพ: getUserMedia ของหน้านี้เอง (แยกจากกล้องของ vision worker ใช้กล้องตัวเดียวกันได้)
// - level/คะแนน: vision:event ที่ daemon ส่งมา · daemon ต้องเปิดกล้องวิเคราะห์ให้ จึงยิง /wai/camera-preview ซ้ำทุก 5 วิ
// - เปิดเฉพาะตอนหน้านี้ถูก mount + หน้าต่างมองเห็น ย่อ/ซ่อนแล้วกล้องดับ (ไม่มี timer ค้าง)

const PREVIEW_PING_MS = 5000
const STALE_MS = 1500

const IDLE: VisionEvent = { isWai: false, level: 0, score: 0, holdMs: 0, reasons: [], facePresent: false }

export function CameraSection() {
  const [visible, setVisible] = useState(() => !document.hidden)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | undefined>()
  const [ev, setEv] = useState<VisionEvent>(IDLE)
  const [analysing, setAnalysing] = useState(false)

  useEffect(() => {
    const on = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])

  // ภาพกล้อง
  useEffect(() => {
    if (!visible) return
    let alive = true
    let s: MediaStream | null = null
    setError(undefined)
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false })
      .then((m) => {
        if (!alive) return m.getTracks().forEach((t) => t.stop())
        s = m
        setStream(m)
      })
      .catch((e: unknown) => {
        if (!alive) return
        const name = e instanceof Error ? e.name : ''
        setError(name === 'NotAllowedError' ? 'ยังไม่ได้อนุญาตกล้อง · เปิดที่ ตั้งค่าระบบ › ความเป็นส่วนตัว › กล้อง' : 'เปิดกล้องไม่ได้ (มีโปรแกรมอื่นใช้อยู่ หรือไม่มีกล้อง)')
      })
    return () => {
      alive = false
      s?.getTracks().forEach((t) => t.stop())
      setStream(null)
    }
  }, [visible])

  // ขอให้ daemon เปิดกล้องวิเคราะห์ + รับ event
  useEffect(() => {
    if (!visible) return
    const ping = () => setCameraPreview(true).catch(() => {})
    ping()
    const t = setInterval(ping, PREVIEW_PING_MS)
    let last = 0
    const off = subscribeVision((e) => {
      last = Date.now()
      setEv(e)
    })
    const stale = setInterval(() => {
      const fresh = Date.now() - last < STALE_MS
      setAnalysing(fresh)
      if (!fresh) setEv(IDLE)
    }, 500)
    return () => {
      clearInterval(t)
      clearInterval(stale)
      off()
      setCameraPreview(false).catch(() => {})
    }
  }, [visible])

  return (
    <section id={CAMERA_ANCHOR} style={{ display: 'grid', gap: space.sm, userSelect: 'none' }}>
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
    </section>
  )
}
