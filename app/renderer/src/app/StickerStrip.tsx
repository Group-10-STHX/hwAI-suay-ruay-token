import type { CSSProperties } from 'react'
import { isStickerStyle, STICKER_STYLES, type StickerItem, type StickerStyle } from '../api'
import { fontSize, radius, space, v } from '../theme/tokens'

// แถบ "สติ๊กเกอร์ล่าสุด" ของหน้าหลัก: props-only สูงไม่เกิน 72px ไม่มีสติ๊กเกอร์ = ไม่วาดอะไรเลย
// สไตล์มี 6 แบบ ปุ่มสลับไม่พอที่ จึงเป็น <select> เล็กบรรทัดเดียว (หน้าตาแต่ละแบบ: docs/variants/stickers/index.html)

const MAX_H = 72
const THUMB = 48
const STYLE_LABEL: Record<StickerStyle, string> = {
  photo: 'รูปถ่าย',
  cartoon: 'การ์ตูน',
  comic: 'คอมิก',
  pixel: 'พิกเซล',
  neon: 'นีออน',
  kawaii: 'คาวาอี้',
}

export type StickerStripProps = {
  items: StickerItem[]
  style: StickerStyle
  urlFor: (file: string) => string
  onStyle: (s: StickerStyle) => void
  className?: string
  css?: CSSProperties
}

export function StickerStrip({ items, style, urlFor, onStyle, className, css }: StickerStripProps) {
  if (items.length === 0) return null
  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: space.sm, maxHeight: MAX_H, overflow: 'hidden', ...css }}>
      <span className="mono" style={{ color: v('textDim'), fontSize: fontSize.small, letterSpacing: 2, flex: '0 0 auto' }}>
        สติ๊กเกอร์
      </span>
      <div style={{ display: 'flex', gap: space.xs, flex: '1 1 auto', minWidth: 0, overflow: 'hidden' }}>
        {items.slice(0, 6).map((s) => (
          <img
            key={s.file}
            src={urlFor(s.file)}
            alt={`สติ๊กเกอร์ ${s.score}`}
            title={`${s.score} คะแนน`}
            draggable={false}
            style={{ height: THUMB, width: THUMB, objectFit: 'contain', background: v('surface'), borderRadius: radius.sm, border: `1px solid ${v('hudDim')}` }}
          />
        ))}
      </div>
      <span style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: '0 0 auto' }}>
        <select
          aria-label="สไตล์สติ๊กเกอร์"
          title="สไตล์ของสติ๊กเกอร์ใบถัดไป"
          value={style}
          onChange={(e) => isStickerStyle(e.target.value) && onStyle(e.target.value)}
          style={{
            font: 'inherit',
            fontSize: fontSize.small,
            appearance: 'none',
            WebkitAppearance: 'none',
            padding: `${space.xs}px ${space.lg}px ${space.xs}px ${space.sm}px`,
            border: `1px solid ${v('hudDim')}`,
            borderRadius: radius.sm,
            background: v('surface'),
            color: v('text'),
            cursor: 'pointer',
          }}
        >
          {STICKER_STYLES.map((id) => (
            <option key={id} value={id}>
              {STYLE_LABEL[id]}
            </option>
          ))}
        </select>
        <span aria-hidden="true" style={{ position: 'absolute', right: space.sm, pointerEvents: 'none', color: v('hud'), fontSize: fontSize.small }}>
          ▾
        </span>
      </span>
    </div>
  )
}
