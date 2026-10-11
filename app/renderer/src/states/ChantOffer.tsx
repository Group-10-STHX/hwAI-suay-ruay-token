import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { fontSize, radius, space, v } from '../theme/tokens'
import './chant.css'

// หน้าถาม "อยากให้กูสวดให้ฟังไหม" · props เท่านั้น (ไม่ import api)
// ปุ่ม [ไม่ฟัง] วิ่งหนีเมาส์ กดไม่ได้ (tabIndex -1, aria-hidden) · [ฟัง] เท่านั้นที่เรียก onYes · ปิดด้วยปุ่ม OS ได้ ไม่ขังผู้ใช้

export type ChantOfferProps = {
  file: string
  onYes: () => void
  busy?: boolean // กดฟังแล้ว รอ daemon เริ่มสวด
}

const RUN_DIST = 90 // เมาส์เข้ามาใกล้กว่านี้ ปุ่มกระโดดหนี
const PAD = 8

const btnBase: CSSProperties = {
  font: 'inherit',
  fontSize: fontSize.body,
  fontWeight: 700,
  padding: `${space.sm + 2}px ${space.lg}px`,
  borderRadius: radius.md,
  whiteSpace: 'nowrap',
}

export function ChantOffer({ file, onYes, busy }: ChantOfferProps) {
  const arena = useRef<HTMLDivElement>(null)
  const yesRef = useRef<HTMLButtonElement>(null)
  const noRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | undefined>()
  const [hops, setHops] = useState(0)

  const jump = useCallback((px?: number, py?: number) => {
    const a = arena.current?.getBoundingClientRect()
    const n = noRef.current
    if (!a || !n) return
    const w = n.offsetWidth
    const h = n.offsetHeight
    const yes = yesRef.current?.getBoundingClientRect()
    const maxX = Math.max(PAD, a.width - w - PAD)
    const maxY = Math.max(PAD, a.height - h - PAD)
    let best = { x: PAD, y: PAD }
    let bestScore = -1
    for (let i = 0; i < 24; i++) {
      const x = PAD + Math.random() * (maxX - PAD)
      const y = PAD + Math.random() * (maxY - PAD)
      const cx = a.left + x + w / 2
      const cy = a.top + y + h / 2
      let score = px === undefined || py === undefined ? 300 : Math.hypot(cx - px, cy - py)
      if (yes && cx > yes.left - w / 2 - 12 && cx < yes.right + w / 2 + 12 && cy > yes.top - h / 2 - 12 && cy < yes.bottom + h / 2 + 12) score = 0
      if (score > bestScore) {
        bestScore = score
        best = { x, y }
      }
      if (score > 190) break
    }
    setPos(best)
    setHops((c) => c + 1)
  }, [])

  // ตั้งตำแหน่งเริ่มต้น: ข้างๆ ปุ่ม [ฟัง]
  useEffect(() => {
    const a = arena.current
    const n = noRef.current
    if (!a || !n) return
    setPos({ x: Math.max(PAD, a.clientWidth / 2 + 24), y: Math.max(PAD, a.clientHeight / 2 - n.offsetHeight / 2) })
  }, [])

  // เมาส์/นิ้วเข้าใกล้ภายใน 90px → กระโดดหนี
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const r = noRef.current?.getBoundingClientRect()
      if (!r) return
      const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right)
      const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom)
      if (Math.hypot(dx, dy) < RUN_DIST) jump(e.clientX, e.clientY)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerdown', onMove)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onMove)
    }
  }, [jump])

  const evade = (e: { preventDefault: () => void; clientX?: number; clientY?: number }) => {
    e.preventDefault()
    jump(e.clientX, e.clientY)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: space.md, textAlign: 'center' }}>
      <div style={{ paddingTop: space.lg }}>
        <span className="chant-sway" style={{ fontSize: 64 }} aria-hidden>
          🪷
        </span>
      </div>
      <div style={{ fontSize: fontSize.speech - 6, fontWeight: 700, lineHeight: 1.35, color: v('blessed'), padding: `0 ${space.md}px` }}>
        อยากให้กูสวดให้ฟังไหม
        <br />
        ว่ากูแก้ไปว่าอะไร?
      </div>
      <div className="mono" style={{ color: v('textDim'), fontSize: fontSize.small }}>
        ไฟล์ที่ AI เพิ่งแก้: <span style={{ color: v('text') }}>{file}</span>
      </div>
      <div ref={arena} style={{ position: 'relative', flex: 1, minHeight: 170 }}>
        <button
          ref={yesRef}
          className="chant-yes"
          disabled={busy}
          onClick={onYes}
          style={{
            ...btnBase,
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(calc(-100% - 24px), -50%)',
            background: v('blessed'),
            color: v('bg'),
            border: `1px solid ${v('blessed')}`,
            cursor: busy ? 'wait' : 'pointer',
            fontSize: fontSize.body + 2,
          }}
        >
          {busy ? 'กำลังเตรียมสวด…' : '🔔 ฟัง'}
        </button>
        <div
          ref={noRef}
          className="chant-runaway"
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            transform: `translate(${pos?.x ?? 0}px, ${pos?.y ?? 0}px)`,
            visibility: pos ? 'visible' : 'hidden',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <button
            tabIndex={-1}
            aria-hidden
            data-hops={hops}
            onMouseEnter={evade}
            onPointerDown={evade}
            onTouchStart={evade}
            onFocus={(e) => {
              e.currentTarget.blur()
              jump()
            }}
            onClick={evade}
            style={{ ...btnBase, background: 'transparent', color: v('textDim'), border: `1px solid ${v('hudDim')}`, cursor: 'not-allowed' }}
          >
            ไม่ฟัง
          </button>
          <span style={{ fontSize: fontSize.micro, color: v('textDim'), whiteSpace: 'nowrap' }}>ปุ่มนี้ใช้ไม่ได้ 🙏</span>
        </div>
      </div>
      <div style={{ color: v('textDim'), fontSize: fontSize.micro, paddingBottom: space.sm }}>ไม่อยากฟังจริงๆ ก็ปิดหน้าต่างได้ ไม่มีใครบังคับ (มั้ง)</div>
    </div>
  )
}
