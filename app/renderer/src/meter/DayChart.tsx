import type { DayPoint } from '../api/types'
import { fontSize, radius, space, v } from '../theme/tokens'

// กราฟแท่ง 7 วันล่าสุด: ไหว้ทั้งหมด (hud) ซ้อนด้วย ไหว้สวย (blessed) · props เท่านั้น ไม่มี animation

export type DayChartProps = {
  days: DayPoint[]
  height?: number
}

const W = 340
const PAD_X = 8
const LABEL_H = 16
const TOP = 16

/** "2026-10-11" → "11/10" */
const shortDay = (d: string) => {
  const [, m, day] = d.split('-')
  return m && day ? `${Number(day)}/${Number(m)}` : d
}

export function DayChart({ days, height = 150 }: DayChartProps) {
  const n = Math.max(1, days.length)
  const max = Math.max(1, ...days.map((d) => d.wais))
  const plotH = height - LABEL_H - TOP
  const slot = (W - PAD_X * 2) / n
  const bar = Math.min(34, slot * 0.6)
  const total = days.reduce((a, d) => a + d.wais, 0)

  return (
    <figure style={{ margin: 0, background: v('surface'), border: `1px solid ${v('hudDim')}`, borderRadius: radius.md, padding: space.md }}>
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" role="img" aria-label={`ไหว้ 7 วันล่าสุดรวม ${total} ครั้ง`} style={{ display: 'block' }}>
        <line x1={PAD_X} x2={W - PAD_X} y1={TOP + plotH} y2={TOP + plotH} stroke={v('surfaceRaised')} strokeWidth={2} />
        {days.map((d, i) => {
          const cx = PAD_X + slot * i + slot / 2
          const h = (d.wais / max) * plotH
          const hb = (Math.min(d.beautiful, d.wais) / max) * plotH
          const last = i === days.length - 1
          return (
            <g key={d.day}>
              <rect x={cx - bar / 2} y={TOP + plotH - h} width={bar} height={Math.max(h, d.wais > 0 ? 2 : 0)} fill={v('hud')} opacity={last ? 1 : 0.75} />
              <rect x={cx - bar / 2} y={TOP + plotH - hb} width={bar} height={hb} fill={v('blessed')} />
              <text x={cx} y={TOP + plotH - h - 4} textAnchor="middle" fill={v('text')} fontSize={fontSize.micro} fontFamily="inherit">
                {d.wais}
              </text>
              <text x={cx} y={height - 3} textAnchor="middle" fill={last ? v('text') : v('textDim')} fontSize={fontSize.micro} fontFamily="inherit">
                {shortDay(d.day)}
              </text>
            </g>
          )
        })}
      </svg>
      <figcaption className="mono" style={{ display: 'flex', gap: space.md, color: v('textDim'), fontSize: fontSize.small, marginTop: space.xs }}>
        <span><span style={{ color: v('hud') }}>■</span> ไหว้</span>
        <span><span style={{ color: v('blessed') }}>■</span> ไหว้สวย</span>
        <span style={{ marginLeft: 'auto' }}>7 วัน · รวม {total}</span>
      </figcaption>
    </figure>
  )
}
