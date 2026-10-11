import { useEffect, useRef } from 'react'
import type { WaiLevel } from '../api/types'
import { font, fontSize, radius, space, v } from '../theme/tokens'

// มุมมองกล้องแบบ viewfinder ของหน้าหลัก (แท็บ "กล้อง"): ภาพสดซ้าย กล่อง level 3→0 ขวา วงค้างท่ามุมล่างซ้าย
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

export function ScanView({ stream, error, analysing, level, score, holdMs, holdTargetMs, isWai, facePresent }: ScanViewProps) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.srcObject = stream
    if (stream) el.play().catch(() => {})
  }, [stream])

  const seen = analysing && facePresent
  const title = error ? 'ไม่มีภาพกล้อง' : !stream ? 'กำลังเปิดกล้อง' : !analysing ? 'กล้องเปิดอยู่' : seen ? 'SCAN มนุษย์' : 'ไม่เห็นหน้ามนุษย์'

  return (
    <div style={{ border: `2px solid ${v('hud')}`, borderRadius: radius.sm, background: v('bg'), padding: space.md, display: 'grid', gap: space.sm }}>
      <div className="mono" style={{ display: 'flex', alignItems: 'center', gap: space.sm, color: v('hud'), fontSize: fontSize.body, fontWeight: 700, letterSpacing: 2 }}>
        <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: stream && !error ? v('hud') : v('sulk') }} />
        <span className="display">{title}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 104px', gap: space.sm }}>
        <div style={{ position: 'relative', aspectRatio: '4 / 3', background: v('surface'), overflow: 'hidden' }}>
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
          <div
            style={{
              position: 'absolute',
              left: space.sm,
              bottom: space.sm,
              borderRadius: '50%',
              background: `color-mix(in srgb, ${v('bg')} 72%, transparent)`,
            }}
          >
            <Ring progress={isWai ? holdMs / Math.max(1, holdTargetMs) : 0} value={analysing ? score : 0} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateRows: 'repeat(4, 1fr)', gap: space.xs }}>
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
