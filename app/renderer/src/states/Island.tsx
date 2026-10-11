import { useEffect, type ReactNode } from 'react'
import type { SessionState, WaiReason } from '../api/types'
import { font, fontSize, radius, shadow, space, stateColor, v } from '../theme/tokens'
import { byPhrase } from './byPhrase'
import { failLabel, FLEE_HINT, FLEE_SFX, fleeTaunt, REASON_TEXT, SPEECH, SPEECH_HINT } from './copy'
import { FleeFx } from './FleeFx'
import { SixSevenMeter } from './SixSevenMeter'
import { SpeechBubble } from './SpeechBubble'

export type IslandProps = {
  state: SessionState
  failCount: number
  score: number
  reasons: WaiReason[]
  // ---- คำขอใบบนสุด (items[0]) island เป็นที่โชว์ใบนี้ที่เดียว CardStack โชว์ใบที่เหลือ ----
  providerColor?: string // ไม่มี = ไม่มีคำขอในคิว (เช่น RAGE_QUIT) ซ่อนป้าย
  providerLabel?: string
  agentLabel?: string // เช่น "Codex › Explore" ถ้าซ้ำกับ providerLabel จะไม่โชว์ซ้ำ
  timeLeft?: ReactNode // app/ ส่ง <TimeLeft/> ของใบบนสุดมา
  mascot: ReactNode // app/ ส่ง <Mascot/> มาให้ (states import mascot ข้ามโฟลเดอร์ไม่ได้ถ้าไม่ผ่าน index)
  cards: ReactNode // slot สำหรับ CardStack
  /**
   * หนีเมาส์ (§4 ANNOYED) ไม่ส่ง = ไม่หนี
   * fleeing = window เพิ่งขยับ · dodges = หนีไปแล้วกี่ครั้ง ใช้หมุนคำแซว (app/ นับให้)
   */
  flee?: { fleeing: boolean; dodges: number }
  /** ไหว้ผ่านแล้วน้องคุยต่อ: ข้อความนี้แทนข้อความของ state และพิมพ์ทีละตัวอักษร (app/ เป็นคนเลื่อนบรรทัด) */
  chat?: string
  /**
   * อีเวนต์สุ่ม (ล้อเล่น) ข้อความนี้แทนข้อความของ state ตลอดที่อีเวนต์ยังอยู่ (พิมพ์ทีละตัวอักษร, tone RETRY) · ไม่ส่ง = ปกติ
   * ลำดับความสำคัญ: flee > eventText > chat > SPEECH[state]
   */
  eventText?: string
  /** อีเวนต์ 67: โชว์แถบนับท่า 6-7 ใต้ eventText (ฟองโทน blessed) · ไม่ส่ง = ไม่โชว์ */
  sixSeven?: { swings: number; need: number }
  /**
   * ข้อความที่ "กำลังขึ้นในฟอง" เปลี่ยนเมื่อไหร่ แจ้งตรงนี้ให้ app/ ส่งไปพูด (เสียงตรงกับที่เห็น)
   * ไม่แจ้งตอนเป็นอีเวนต์ (eventText) เพราะ daemon พูดข้อความอีเวนต์เองอยู่แล้ว (67 ร้องเป็นอังกฤษ)
   */
  onSpeak?: (text: string) => void
}

const SHOW_SCORE: Partial<Record<SessionState, true>> = { RETRY: true, ANNOYED: true }

/** island ลอย: ไม่มีกรอบรวม (§2) ฟองคำพูดซ้าย น้องขวาอยู่บนแผ่นพื้นหลังทึบมี padding การ์ดเรียงข้างล่าง */
export function Island({ state, failCount, score, reasons, providerColor, providerLabel, agentLabel, timeLeft, mascot, cards, flee, chat, eventText, sixSeven, onSpeak }: IslandProps) {
  // อีเวนต์ใช้โทน RETRY (สีเดียวกับตอนไหว้พลาด)
  const tone = sixSeven && eventText && !flee ? 'blessed' : eventText && !flee ? stateColor.RETRY : stateColor[state]
  // ตอนหนี: ข้อความหลักเป็นคำแซว (เปลี่ยนทุกครั้งที่หนี) บรรทัดรองบอกวิธีให้หยุด
  const text = flee ? fleeTaunt(flee.dodges) : eventText ?? chat ?? SPEECH[state]
  const hint = flee ? FLEE_HINT : eventText || chat ? undefined : SPEECH_HINT[state]
  const reason = reasons[0]
  // เสียงตามข้อความ: ข้อความหลัก + บรรทัดคำใบ้ (ถ้ามี) · เปลี่ยนเมื่อไหร่ค่อยแจ้ง (ไม่ยิงซ้ำตอน render)
  const spoken = eventText ? '' : [text, hint].filter(Boolean).join(' ')
  useEffect(() => {
    if (spoken) onSpeak?.(spoken)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spoken])
  const mascotFx = state === 'ANNOYED' ? 'fx-shake fx-blink-danger' : state === 'PASSED' || state === 'FORGIVE' ? 'fx-bless' : undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: space.sm + 2, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', gap: space.sm }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: space.xs + 2, paddingBottom: space.md }}>
          <SpeechBubble text={text} tone={tone} textFx={flee ? 'fx-pop' : undefined} phraseWrap={!!flee} typing={!flee && !!(eventText ?? chat)}>
            {SHOW_SCORE[state] && !eventText && (
              <div className="mono" style={{ fontSize: fontSize.score, lineHeight: 1, color: v(tone), marginTop: space.xs }}>
                {score}
              </div>
            )}
            {SHOW_SCORE[state] && !eventText && reason && <Detail>{REASON_TEXT[reason]}</Detail>}
            {sixSeven && eventText && !flee && <SixSevenMeter swings={sixSeven.swings} need={sixSeven.need} />}
            {hint && <Detail tone={flee ? 'text' : undefined}>{flee ? byPhrase(hint) : hint}</Detail>}
          </SpeechBubble>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: space.sm - 2, maxWidth: 220, fontSize: fontSize.small, textShadow: shadow.text }}>
            {providerLabel && providerColor && (
              <span
                className="display"
                style={{
                  padding: '1px 8px',
                  borderRadius: radius.lg,
                  border: `1px solid ${providerColor}`,
                  background: `color-mix(in srgb, ${v('bg')} 70%, transparent)`,
                  color: providerColor,
                }}
              >
                {providerLabel}
              </span>
            )}
            {agentLabel && agentLabel !== providerLabel && (
              <span style={{ color: v('text'), maxWidth: 120, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{agentLabel}</span>
            )}
            {timeLeft}
            {failCount > 0 && (
              <span className="mono" style={{ color: v('textDim') }}>
                {failLabel(failCount)}
              </span>
            )}
          </div>
        </div>
        {/* หนีเมาส์: FleeFx เอนตัว/ขีดความเร็วให้ทั้งแผ่นพื้นหลัง */}
        <FleeFx active={!!flee} fleeing={flee?.fleeing ?? false} sfx={FLEE_SFX}>
          {/* แผ่นพื้นหลังตัวน้อง: ทึบ ~88% + padding กันมองยากบนพื้นจอที่ลาย (FRONT_RULES §2) */}
          <div
            style={{
              padding: space.md,
              borderRadius: radius.lg,
              background: `color-mix(in srgb, ${v('bg')} 88%, transparent)`,
              border: `1px solid color-mix(in srgb, ${v(tone)} 45%, transparent)`,
              boxShadow: shadow.backing,
              backdropFilter: 'blur(6px)',
            }}
          >
            {/* key ทำให้ effect เล่นใหม่ทุกครั้งที่ state เปลี่ยน (bless เล่นครั้งเดียว) */}
            <div key={state} className={mascotFx}>
              {mascot}
            </div>
          </div>
        </FleeFx>
      </div>
      {cards}
    </div>
  )
}

/** บรรทัดรองในฟอง tone = text ใช้กับบรรทัดที่ต้องเด่นกว่าปกติ (เช่นวิธีให้น้องหยุดหนี) */
function Detail({ children, tone = 'textDim' }: { children: ReactNode; tone?: 'text' | 'textDim' }) {
  return <div style={{ fontFamily: font.body, fontSize: fontSize.body, color: v(tone), marginTop: space.xs }}>{children}</div>
}
