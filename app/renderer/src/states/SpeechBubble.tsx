import { useEffect, useState, type ReactNode } from 'react'
import { font, fontSize, radius, shadow, space, v, type ColorToken } from '../theme/tokens'
import { byPhrase } from './byPhrase'

export type SpeechBubbleProps = {
  text: string // ข้อความหลักของน้อง (จาก copy.ts)
  tone: ColorToken // สีขอบตาม state (§4)
  children?: ReactNode // รายละเอียดใต้ข้อความ เช่น score, เหตุผล
  textFx?: string // class effect ของข้อความหลัก เล่นใหม่ทุกครั้งที่ text เปลี่ยน (เช่น fx-pop ตอนคำแซวเปลี่ยน)
  phraseWrap?: boolean // ตัดบรรทัดเฉพาะที่ช่องว่าง (ใช้กับข้อความที่เช็กแล้วว่าทุกวลีพอดีฟอง)
  typing?: boolean // พิมพ์ข้อความทีละตัวอักษร (text เปลี่ยน = พิมพ์ใหม่) · reduced-motion = โชว์ทั้งประโยค
}

const TYPE_MS = 40

/** ค่อยๆ เผยข้อความ จบแล้ว timer หยุดเอง */
function useTyped(text: string, on: boolean) {
  const [n, setN] = useState(on ? 0 : text.length)
  useEffect(() => {
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!on || reduce) return setN(text.length)
    setN(0)
    let i = 0
    const t = setInterval(() => {
      i += 1
      setN(i)
      if (i >= text.length) clearInterval(t)
    }, TYPE_MS)
    return () => clearInterval(t)
  }, [text, on])
  return Array.from(text).slice(0, n).join('')
}

const MAX_W = 208

/** ฟองคำพูดหางชี้ไปทางขวา (น้องยืนอยู่ขวามือ) */
export function SpeechBubble({ text, tone, children, textFx, phraseWrap = false, typing = false }: SpeechBubbleProps) {
  const shown = useTyped(text, typing)
  const fill = v('surface')
  const edge = `1.5px solid ${v(tone)}`
  return (
    <div
      style={{
        position: 'relative',
        maxWidth: MAX_W,
        padding: `${space.sm}px ${space.md - 4}px`,
        borderRadius: radius.lg,
        background: fill,
        border: edge,
        boxShadow: shadow.float,
        color: v('text'),
      }}
    >
      <div key={text} className={textFx} style={{ fontFamily: font.display, fontWeight: 700, fontSize: fontSize.speech, lineHeight: 1.15, transformOrigin: 'left center' }}>
        {phraseWrap ? byPhrase(shown) : shown}
      </div>
      {children}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          right: -7,
          bottom: 28,
          width: 12,
          height: 12,
          transform: 'rotate(-45deg)',
          background: fill,
          borderRight: edge,
          borderBottom: edge,
        }}
      />
    </div>
  )
}
