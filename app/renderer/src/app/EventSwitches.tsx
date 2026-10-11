import type { CSSProperties } from 'react'
import { EVENT_MODES, type EventKind, type EventMode } from '../api/types'
import { fontSize, radius, space, v } from '../theme/tokens'

// สวิตช์ Quick Event ของหน้าหลัก: ต่อ event ปิด | สุ่ม | ทุกครั้ง · props เท่านั้น
// ทุกครั้ง = เกิดแน่นอนทุกคำขอ (ครั้งเดียวต่อคำขอ) · ล็อก = daemon ถูกปิดไว้ด้วย WAI_NO_EVENTS=1

export type EventSwitchesProps = {
  modes: { redo: EventMode; tribute: EventMode; chant: EventMode; sixseven: EventMode }
  locked: boolean
  onChange: (kind: EventKind, mode: EventMode) => void
}

const LABEL: Record<EventMode, string> = { off: 'ปิด', random: 'สุ่ม', always: 'ทุกครั้ง' }
const ROWS: { kind: EventKind; title: string; hint?: string }[] = [
  { kind: 'tribute', title: '💸 เรียกค่าไถ่ True Money 1,000' },
  { kind: 'redo', title: '🙏 สั่งไหว้ใหม่ ("ไหว้ไม่สวย…")' },
  { kind: 'chant', title: '🪷 ถามสวดบทแก้โค้ด JS' },
  { kind: 'sixseven', title: '🍌 อีสเตอร์เอ้ก 67', hint: 'สุ่ม = เมื่อคะแนนออกมาเป็น 67 พอดี · ทุกครั้ง = ทุกคำขอต้องทำท่า 67' },
]

const seg = (on: boolean, locked: boolean): CSSProperties => ({
  padding: `${space.xs}px ${space.sm}px`,
  font: 'inherit',
  fontSize: fontSize.small,
  border: `1px solid ${on ? v('hud') : v('hudDim')}`,
  background: on ? v('hud') : 'transparent',
  color: on ? v('bg') : v('text'),
  fontWeight: on ? 700 : 400,
  cursor: locked ? 'not-allowed' : 'pointer',
  opacity: locked ? 0.5 : 1,
})

export function EventSwitches({ modes, locked, onChange }: EventSwitchesProps) {
  return (
    <div style={{ display: 'grid', gap: space.xs, padding: space.sm, border: `1px solid ${v('hudDim')}`, borderRadius: radius.md, background: v('surface') }}>
      <div className="mono" style={{ color: v('textDim'), fontSize: fontSize.small, letterSpacing: 2 }}>
        QUICK EVENT{locked ? ' · ล็อกปิดด้วย WAI_NO_EVENTS' : ''}
      </div>
      {ROWS.map((r) => (
        <div key={r.kind} style={{ display: 'grid', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
          <span style={{ fontSize: fontSize.small, minWidth: 0 }}>{r.title}</span>
          <span style={{ display: 'flex', flex: '0 0 auto' }}>
            {EVENT_MODES.map((m, i) => (
              <button
                key={m}
                disabled={locked}
                aria-pressed={modes[r.kind] === m}
                onClick={() => onChange(r.kind, m)}
                style={{ ...seg(modes[r.kind] === m, locked), borderRadius: i === 0 ? `${radius.sm}px 0 0 ${radius.sm}px` : i === EVENT_MODES.length - 1 ? `0 ${radius.sm}px ${radius.sm}px 0` : 0, marginLeft: i === 0 ? 0 : -1 }}
              >
                {LABEL[m]}
              </button>
            ))}
          </span>
        </div>
        {r.hint && <span style={{ color: v('textDim'), fontSize: fontSize.micro }}>{r.hint}</span>}
        </div>
      ))}
    </div>
  )
}
