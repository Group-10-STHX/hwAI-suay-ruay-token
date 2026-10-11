import { useEffect, useState, type CSSProperties } from 'react'
import { avatarUrl, listAvatars, setAvatar, type AvatarItem } from '../api'
import { AvatarImage, JASON_THUMB } from '../mascot'
import { fontSize, radius, space, v } from '../theme/tokens'

// แถว "ตัวละคร" ของหน้าหลัก: thumbnail (mood confused) บรรทัดเดียว กดเลือก → POST /wai/avatar
// current ที่ส่งมาจาก /wai/status (poll อยู่แล้ว) ใช้ก่อน ถ้ายังไม่มีใช้ค่าจาก listAvatars

const THUMB = 36

export function AvatarPicker({ current, className, style }: { current?: string; className?: string; style?: CSSProperties }) {
  const [items, setItems] = useState<AvatarItem[]>([])
  const [listed, setListed] = useState('jason')
  const [picked, setPicked] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    listAvatars()
      .then((l) => {
        if (!alive) return
        setItems(l.items)
        setListed(l.current)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  // ค่าที่เพิ่งกดชนะค่าจาก poll จนกว่า poll จะตามทัน
  useEffect(() => {
    if (picked && current === picked) setPicked(null)
  }, [current, picked])
  const active = picked ?? current ?? listed

  if (items.length < 2) return null // มีแค่ jason ไม่ต้องโชว์ตัวเลือก

  const choose = (name: string) => {
    setPicked(name)
    setAvatar(name)
      .then((c) => setPicked(c))
      .catch(() => setPicked(null))
  }

  return (
    <section className={className} style={{ display: 'flex', alignItems: 'center', gap: space.sm, ...style }}>
      <h2 className="mono" style={{ margin: 0, fontSize: fontSize.small, color: v('textDim'), letterSpacing: 2, flex: 'none' }}>
        ตัวละคร
      </h2>
      <div style={{ display: 'flex', gap: space.xs, overflowX: 'auto', minWidth: 0 }}>
        {items.map((it) => {
          const on = it.name === active
          return (
            <button
              key={it.name}
              onClick={() => choose(it.name)}
              aria-pressed={on}
              title={it.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                flex: 'none',
                padding: `${space.xs}px ${space.sm}px`,
                background: on ? v('surface') : 'transparent',
                color: on ? v('text') : v('textDim'),
                border: `1px solid ${on ? v('hud') : v('hudDim')}`,
                borderRadius: radius.md,
                cursor: 'pointer',
                font: 'inherit',
              }}
            >
              <Thumb item={it} />
              <span style={{ fontSize: 11, lineHeight: 1.1, maxWidth: 56, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {it.label}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function Thumb({ item }: { item: AvatarItem }) {
  if (item.kind === 'builtin') return <AvatarImage src={JASON_THUMB} size={THUMB} alt={item.label} />
  return <AvatarImage src={avatarUrl(item.name, 'confused')} size={THUMB} alt={item.label} />
}
