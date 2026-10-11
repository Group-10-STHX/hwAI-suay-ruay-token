import { useState } from 'react'
import type { AvatarMood, SessionState } from '../api/types'
import { radius, shadow } from '../theme/tokens'
import { AvatarImage } from './AvatarImage'
import './avatarMotion.css'
import { avatarMoodFor, MOOD_SRC, STILL_SRC } from './moods'

export type MascotSize = 'big' | 'small' | 'hero'

export type MascotProps = {
  state: SessionState // ท่าของน้องตาม state (§4)
  providerColor: string // สี accent ของ provider โชว์เป็นฐานใต้เท้าน้อง (ไม่มีโลโก้ §5)
  size?: MascotSize // big = น้องหลักใน island, small = น้องบนการ์ด, hero = น้องตัวใหญ่ในหน้าหลัก (ร่าง Mascot-first)
  still?: boolean // true = ไม่ขยับ (ใช้กับน้องตัวเล็กบนการ์ด)
  avatar?: string // ชื่อตัวละครของผู้ใช้ (ไม่ใส่/'jason' = Jason SVG เดิม)
  avatarSrc?: string // URL รูป mood ของ state นี้ที่ app/ แก้ไว้แล้ว (api.avatarUrl + avatarMoodFor)
}

const PX: Record<MascotSize, number> = { big: 128, small: 46, hero: 168 }
/** ฐานใต้เท้า: ความหนา / ดึงขึ้นทับเท้า */
const BASE: Record<MascotSize, { h: number; up: number }> = { big: { h: 4, up: -18 }, small: { h: 3, up: -6 }, hero: { h: 5, up: -24 } }
const KNOWN = ['bob', 'miku', 'teto', 'robot']

export function Mascot({ state, providerColor, size = 'big', still = false, avatar, avatarSrc }: MascotProps) {
  const px = PX[size]
  const [bad, setBad] = useState<string | null>(null) // รูปโหลดไม่ได้ → กลับไป Jason
  const custom = !!avatar && avatar !== 'jason' && !!avatarSrc && bad !== avatarSrc
  const jasonSrc = still ? (state === 'IDLE' ? STILL_SRC.idle : STILL_SRC.waiting) : MOOD_SRC[state]
  return (
    <div style={{ width: px, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {custom ? (
        <AvatarFigure name={avatar!} src={avatarSrc!} mood={avatarMoodFor(state)} px={px} still={still} onError={() => setBad(avatarSrc!)} />
      ) : (
        <img src={jasonSrc} alt="" width={px} height={px} draggable={false} style={{ display: 'block', filter: shadow.ink }} />
      )}
      <div
        aria-hidden
        style={{
          width: px * 0.45,
          height: BASE[size].h,
          marginTop: BASE[size].up,
          borderRadius: radius.sm,
          background: providerColor,
        }}
      />
    </div>
  )
}

type FigureProps = { name: string; src: string; mood: AvatarMood; px: number; still: boolean; onError: () => void }

function AvatarFigure({ name, src, mood, px, still, onError }: FigureProps) {
  const known = KNOWN.includes(name) ? name : 'generic'
  const cls = ['av', `av--${known}`, `av-mood--${mood}`, still ? 'av--still' : ''].filter(Boolean).join(' ')
  const mock = src.startsWith('mock:')
  return (
    <div className={cls} style={{ width: px, height: px, filter: shadow.ink, ['--av-radius' as string]: `${radius.md}px` }}>
      {known === 'bob' && <BoilFilter />}
      <span className="av-glow" />
      <div className="av-body">
        {mock ? (
          <AvatarImage src={src} size={px} />
        ) : (
          <img className="av-img" src={src} alt="" width={px} height={px} draggable={false} onError={onError} />
        )}
        {known === 'robot' && (
          <>
            <span className="av-scan" />
            <span className="av-tint" />
          </>
        )}
      </div>
    </div>
  )
}

/** line boil: เส้นปากกาสั่นแบบ pencil test · baseFrequency เปลี่ยนเป็นขั้นๆ ~7 ครั้ง/วิ (SMIL discrete ไม่ใช้ timer) scale 3px */
function BoilFilter() {
  return (
    <svg width="0" height="0" aria-hidden style={{ position: 'absolute' }}>
      <filter id="wai-boil" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.03 0.035" numOctaves={2} seed={3} result="n">
          <animate
            attributeName="baseFrequency"
            calcMode="discrete"
            dur="0.6s"
            repeatCount="indefinite"
            values="0.030 0.035;0.034 0.029;0.028 0.038;0.036 0.032"
          />
        </feTurbulence>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="3" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  )
}
