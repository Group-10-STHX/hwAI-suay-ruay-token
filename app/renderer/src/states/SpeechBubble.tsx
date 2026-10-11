import type { ReactNode } from 'react'
import { font, fontSize, radius, shadow, space, v, type ColorToken } from '../theme/tokens'
import { byPhrase } from './byPhrase'

export type SpeechBubbleProps = {
  text: string // ข้อความหลักของน้อง (จาก copy.ts)
  tone: ColorToken // สีขอบตาม state (§4)
  children?: ReactNode // รายละเอียดใต้ข้อความ เช่น score, เหตุผล
  textFx?: string // class effect ของข้อความหลัก เล่นใหม่ทุกครั้งที่ text เปลี่ยน (เช่น fx-pop ตอนคำแซวเปลี่ยน)
  phraseWrap?: boolean // ตัดบรรทัดเฉพาะที่ช่องว่าง (ใช้กับข้อความที่เช็กแล้วว่าทุกวลีพอดีฟอง)
}

const MAX_W = 208

/** ฟองคำพูดหางชี้ไปทางขวา (น้องยืนอยู่ขวามือ) */
export function SpeechBubble({ text, tone, children, textFx, phraseWrap = false }: SpeechBubbleProps) {
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
        {phraseWrap ? byPhrase(text) : text}
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
