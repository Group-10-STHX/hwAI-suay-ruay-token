import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { StickerItem } from '../api'
import { fontSize, radius, space, v } from '../theme/tokens'

// แกลเลอรีสติ๊กเกอร์: กดรูปในแถบสติ๊กเกอร์แล้วเปิดดูทั้งหมด กดรูปเพื่อขยาย ← → เปลี่ยนรูป Esc ปิด
// props เท่านั้น · วาดผ่าน portal ลง body (แถบเดิม overflow hidden + มี transform ของ fx-render)

export type StickerGalleryProps = {
  items: StickerItem[]
  urlFor: (file: string) => string
  startIndex?: number // รูปที่ขยายตอนเปิด (undefined = ตารางรวม)
  onClose: () => void
}

const when = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
const LEVEL = ['ไม่ไหว้', 'ไหว้เพื่อน', 'ไหว้ผู้ใหญ่', 'ไหว้พระ']

export function StickerGallery({ items, urlFor, startIndex, onClose }: StickerGalleryProps) {
  const [open, setOpen] = useState<number | null>(startIndex ?? null)

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return open === null ? onClose() : setOpen(null)
      if (open === null) return
      if (e.key === 'ArrowRight') setOpen((i) => (i === null ? i : Math.min(items.length - 1, i + 1)))
      if (e.key === 'ArrowLeft') setOpen((i) => (i === null ? i : Math.max(0, i - 1)))
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [open, items.length, onClose])

  const cur = open === null ? null : items[open]

  return createPortal(
    <div
      role="dialog"
      aria-label="สติ๊กเกอร์ทั้งหมด"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'color-mix(in srgb, ' + v('bg') + ' 92%, transparent)', display: 'grid', gridTemplateRows: 'auto 1fr', color: v('text'), padding: space.md, overflow: 'auto' }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: space.sm }}>
        <span className="mono" style={{ letterSpacing: 2 }}>
          สติ๊กเกอร์ {items.length} ใบ
        </span>
        <button onClick={onClose} style={{ background: 'transparent', color: v('text'), border: `1px solid ${v('hudDim')}`, borderRadius: radius.sm, padding: `${space.xs}px ${space.sm}px`, font: 'inherit', cursor: 'pointer' }}>
          ปิด ✕
        </button>
      </div>

      {cur ? (
        <div onClick={(e) => e.stopPropagation()} style={{ display: 'grid', gap: space.sm, justifyItems: 'center', alignContent: 'center' }}>
          <img src={urlFor(cur.file)} alt={`สติ๊กเกอร์ ${cur.score} คะแนน`} style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain', background: v('surface'), borderRadius: radius.md, border: `1px solid ${v('hudDim')}` }} />
          <div className="mono" style={{ color: v('textDim'), fontSize: fontSize.small }}>
            {cur.score} คะแนน · ระดับ {cur.level} {LEVEL[cur.level] ?? ''} · {when(cur.at)}
          </div>
          <div style={{ display: 'flex', gap: space.sm }}>
            <button disabled={open === 0} onClick={() => setOpen((open ?? 0) - 1)} style={navBtn}>◀ ใหม่กว่า</button>
            <button onClick={() => setOpen(null)} style={navBtn}>ดูทั้งหมด</button>
            <button disabled={open === items.length - 1} onClick={() => setOpen((open ?? 0) + 1)} style={navBtn}>เก่ากว่า ▶</button>
          </div>
        </div>
      ) : (
        <div onClick={(e) => e.stopPropagation()} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: space.sm, alignContent: 'start' }}>
          {items.map((s, i) => (
            <button key={s.file} onClick={() => setOpen(i)} title={`${s.score} คะแนน · ${when(s.at)}`} style={{ display: 'grid', gap: 2, padding: space.xs, background: v('surface'), border: `1px solid ${v('hudDim')}`, borderRadius: radius.sm, cursor: 'pointer', color: 'inherit', font: 'inherit' }}>
              <img src={urlFor(s.file)} alt={`สติ๊กเกอร์ ${s.score}`} draggable={false} style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'contain' }} />
              <span className="mono" style={{ fontSize: fontSize.micro, color: v('textDim') }}>
                {s.score} · L{s.level}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  )
}

const navBtn = {
  background: 'transparent',
  color: v('text'),
  border: `1px solid ${v('hudDim')}`,
  borderRadius: radius.sm,
  padding: `${space.xs}px ${space.sm}px`,
  font: 'inherit',
  cursor: 'pointer',
} as const
