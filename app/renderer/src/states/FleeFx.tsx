import type { CSSProperties, ReactNode } from 'react'
import { font, fontSize, shadow, v } from '../theme/tokens'

export type FleeFxProps = {
  active: boolean // โหมดหนีเมาส์เปิด (ANNOYED) = เอนตัวหลบ พร้อมวิ่ง
  fleeing: boolean // window เพิ่งขยับ = กระโดดวิ่ง + เส้นความเร็ว + เสียงประกอบ
  sfx: string // คำเสียงประกอบตอนวิ่ง (จาก copy.ts)
  children: ReactNode // น้องตัวหลัก
}

/**
 * ท่าตอนหนีเมาส์ ห่อน้องไว้ (§4 ANNOYED)
 * main เป็นคนขยับ window ทิศไหนก็ได้ ที่นี่จึงใช้ท่าที่ไม่บอกทิศ: กระโดด squash/stretch + ขีดสั่นสองข้าง
 * ทุกอย่าง absolute หรือ transform ไม่ดัน layout ของ island · ปิด motion เมื่อ prefers-reduced-motion (effects.css)
 */
export function FleeFx({ active, fleeing, sfx, children }: FleeFxProps) {
  const running = active && fleeing
  // โครงสร้างเหมือนเดิมทุก state (แค่สลับ class) น้องข้างในจะได้ไม่ mount ใหม่ตอนเริ่ม/หยุดหนี
  return (
    <div className={active ? (running ? 'fx-flee is-fleeing' : 'fx-flee') : undefined} style={{ position: 'relative' }}>
      <div className={running ? 'fx-flee-run' : undefined}>{children}</div>
      {running && (
        <>
          {ZIPS.map((z, i) => (
            <span key={i} aria-hidden className="fx-flee-zip" style={zipStyle(z, i)} />
          ))}
          <span aria-hidden style={sfxWrap}>
            <span className="display fx-pop" style={sfxText}>
              {sfx}
            </span>
          </span>
        </>
      )}
    </div>
  )
}

// ขีดสั่นข้างตัวน้อง (กล่องน้อง 128px ตัวน้องอยู่ราว x 21–101 ข้างๆ ว่าง)
type Zip = { side: 'left' | 'right'; top: number; w: number; tilt: number }
const ZIPS: Zip[] = [
  { side: 'left', top: 44, w: 16, tilt: -14 },
  { side: 'left', top: 58, w: 20, tilt: 0 },
  { side: 'left', top: 72, w: 14, tilt: 14 },
  { side: 'right', top: 50, w: 16, tilt: 14 },
  { side: 'right', top: 64, w: 20, tilt: 0 },
  { side: 'right', top: 78, w: 14, tilt: -14 },
]

const zipStyle = (z: Zip, i: number) =>
  ({
    position: 'absolute',
    top: z.top,
    [z.side]: 0,
    width: z.w,
    height: 3,
    borderRadius: 2,
    background: v('danger'),
    rotate: `${z.tilt}deg`,
    transformOrigin: z.side === 'left' ? 'right center' : 'left center',
    '--dir': z.side === 'left' ? -1 : 1,
    '--i': i % 3,
  }) as CSSProperties

// เสียงประกอบลอยเหนือหัวน้อง (คอลัมน์น้องเตี้ยกว่าฟองคำพูด ข้างบนว่าง) เยื้องซ้ายไม่ทับขีดโกรธบนหัวขวา
const sfxWrap: CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: '100%',
  transform: 'translate(-64%, -6px) rotate(-8deg)',
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
}

const sfxText: CSSProperties = {
  display: 'inline-block',
  fontFamily: font.display,
  fontSize: fontSize.speech,
  lineHeight: 1,
  color: v('danger'),
  textShadow: shadow.text,
  transformOrigin: 'center',
}
