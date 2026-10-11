import { useEffect, useRef } from 'react'
import type { WaiLevel } from '../api/types'
import { font, fontSize, radius, space, v } from '../theme/tokens'

// มุมมองกล้องแบบ viewfinder ของหน้าต่างกล้อง: ภาพสดซ้าย กล่อง level 3→0 ขวา วงค้างท่ามุมล่างซ้าย
// props เท่านั้น (FRONT_RULES §ห้าม import api/store) · ไม่มี animation ที่วนไม่จบ

export type ScanViewProps = {
  stream: MediaStream | null // ภาพกล้องที่ app/ ขอมา (null = ยังไม่มี/ไม่ได้)
  error?: string // เหตุที่เปิดกล้องไม่ได้ (โชว์แทนภาพ)
  analysing: boolean // กำลังได้ event จาก vision อยู่ (ไม่ใช่ค่าค้าง)
  level: WaiLevel
  score: number
  holdMs: number
  holdTargetMs: number
  isWai: boolean
  facePresent: boolean
  /** อีเวนต์ 67: ไม่ส่ง = ปกติ · ส่ง = โชว์ "67" ใหญ่ทับภาพ + ความคืบหน้า และหรี่กล่อง level */
  sixSeven?: { swings: number; need: number }
}

export const SCAN_LEVELS: { level: WaiLevel; label: string }[] = [
  { level: 3, label: 'ไหว้พระ' },
  { level: 2, label: 'ไหว้ผู้ใหญ่' },
  { level: 1, label: 'ไหว้เพื่อน' },
  { level: 0, label: 'ไม่ไหว้' },
]

const BRACKET = 22

function Corner({ at }: { at: 'tl' | 'tr' | 'bl' | 'br' }) {
  const top = at[0] === 't'
  const left = at[1] === 'l'
  const edge = `3px solid ${v('hud')}`
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        width: BRACKET,
        height: BRACKET,
        [top ? 'top' : 'bottom']: space.sm,
        [left ? 'left' : 'right']: space.sm,
        [top ? 'borderTop' : 'borderBottom']: edge,
        [left ? 'borderLeft' : 'borderRight']: edge,
      }}
    />
  )
}

function Ring({ progress, value }: { progress: number; value: number }) {
  const r = 26
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(1, progress))
  return (
    <div style={{ position: 'relative', width: 68, height: 68 }}>
      <svg viewBox="0 0 68 68" width={68} height={68} style={{ transform: 'rotate(-90deg)' }} aria-hidden>
        <circle cx={34} cy={34} r={r} fill="none" stroke={v('surfaceRaised')} strokeWidth={6} />
        <circle
          cx={34}
          cy={34}
          r={r}
          fill="none"
          stroke={v('hud')}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
        />
      </svg>
      <span
        className="mono"
        style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 700, color: v('text') }}
      >
        {Math.round(value)}
      </span>
    </div>
  )
}

function SixSevenOverlay({ swings, need }: { swings: number; need: number }) {
  const total = Math.max(1, Math.min(12, Math.round(need)))
  const done = Math.max(0, Math.min(total, Math.floor(swings)))
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        alignContent: 'center',
        gap: space.xs,
        padding: space.sm,
        textAlign: 'center',
        background: `color-mix(in srgb, ${v('bg')} 45%, transparent)`,
        border: `3px solid ${v('blessed')}`,
      }}
    >
      <div
        className="display"
        aria-label="67"
        style={{ fontSize: 84, lineHeight: 0.95, fontWeight: 800, color: v('blessed'), letterSpacing: 4, textShadow: '0 2px 10px rgba(0, 0, 0, 0.7)' }}
      >
        <span className="fx-six">6</span>
        <span className="fx-seven">7</span>
      </div>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 4 }}>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            aria-hidden
            style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              border: `2px solid ${v('blessed')}`,
              background: i < done ? v('blessed') : 'transparent',
            }}
          />
        ))}
      </div>
      <div className="mono" style={{ fontSize: fontSize.body, fontWeight: 700, color: v('blessed') }}>
        {done}/{total}
      </div>
      <div style={{ fontSize: fontSize.small, color: v('text'), textShadow: '0 1px 3px rgba(0, 0, 0, 0.9)', lineHeight: 1.25 }}>
        มือสองข้าง หงายมือ ขยับสลับขึ้น-ลง
      </div>
    </div>
  )
}

export function ScanView({ stream, error, analysing, level, score, holdMs, holdTargetMs, isWai, facePresent, sixSeven }: ScanViewProps) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.srcObject = stream
    if (stream) el.play().catch(() => {})
  }, [stream])

  const seen = analysing && facePresent
  const title = sixSeven ? 'ทำท่า 6-7 เดี๋ยวนี้' : error ? 'ไม่มีภาพกล้อง' : !stream ? 'กำลังเปิดกล้อง' : !analysing ? 'กล้องเปิดอยู่' : seen ? 'SCAN มนุษย์' : 'ไม่เห็นหน้ามนุษย์'

  return (
    <div style={{ border: `2px solid ${v('hud')}`, borderRadius: radius.sm, background: v('bg'), padding: space.md, display: 'grid', gap: space.sm }}>
      <div className="mono" style={{ display: 'flex', alignItems: 'center', gap: space.sm, color: v('hud'), fontSize: fontSize.body, fontWeight: 700, letterSpacing: 2 }}>
        <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: stream && !error ? v('hud') : v('sulk') }} />
        <span className="display">{title}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 132px', gap: space.sm }}>
        <div style={{ position: 'relative', aspectRatio: '16 / 9', background: v('surface'), overflow: 'hidden' }}>
          <video
            ref={ref}
            muted
            playsInline
            autoPlay
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', display: stream && !error ? 'block' : 'none' }}
          />
          {(!stream || error) && (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: space.md, textAlign: 'center', color: v('textDim'), fontSize: fontSize.small }}>
              {error ?? 'รอสิทธิ์กล้อง…'}
            </div>
          )}
          <Corner at="tl" />
          <Corner at="tr" />
          <Corner at="bl" />
          <Corner at="br" />
          {sixSeven && <SixSevenOverlay swings={sixSeven.swings} need={sixSeven.need} />}
          {!sixSeven && <div
            style={{
              position: 'absolute',
              left: space.sm,
              bottom: space.sm,
              borderRadius: '50%',
              background: `color-mix(in srgb, ${v('bg')} 72%, transparent)`,
            }}
          >
            <Ring progress={isWai ? holdMs / Math.max(1, holdTargetMs) : 0} value={analysing ? score : 0} />
          </div>}
        </div>

        <div style={{ display: 'grid', gridTemplateRows: 'repeat(4, 1fr)', gap: space.xs, opacity: sixSeven ? 0.35 : 1 }}>
          {SCAN_LEVELS.map((l) => {
            const on = analysing && seen && level === l.level
            return (
              <div
                key={l.level}
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  padding: `${space.xs}px ${space.sm}px`,
                  border: `2px solid ${on ? v('hud') : v('surfaceRaised')}`,
                  background: on ? `color-mix(in srgb, ${v('hud')} 22%, transparent)` : 'transparent',
                  color: on ? v('text') : v('textDim'),
                  fontFamily: font.body,
                  fontSize: fontSize.small,
                  lineHeight: 1.2,
                }}
              >
                {l.level} {l.label}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
