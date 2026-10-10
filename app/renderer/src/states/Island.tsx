import type { ReactNode } from 'react'
import type { SessionState, WaiReason } from '../api/types'
import { font, fontSize, radius, shadow, space, stateColor, v } from '../theme/tokens'
import { byPhrase } from './byPhrase'
import { failLabel, FLEE_HINT, FLEE_SFX, fleeTaunt, REASON_TEXT, SPEECH, SPEECH_HINT } from './copy'
import { FleeFx } from './FleeFx'
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
}

const SHOW_SCORE: Partial<Record<SessionState, true>> = { RETRY: true, ANNOYED: true }

/** island ลอย: ไม่มีกรอบ ไม่มีพื้นหลัง (§2) ฟองคำพูดซ้าย น้องขวา การ์ดเรียงข้างล่าง */
export function Island({ state, failCount, score, reasons, providerColor, providerLabel, agentLabel, timeLeft, mascot, cards, flee }: IslandProps) {
  const tone = stateColor[state]
  // ตอนหนี: ข้อความหลักเป็นคำแซว (เปลี่ยนทุกครั้งที่หนี) บรรทัดรองบอกวิธีให้หยุด
  const text = flee ? fleeTaunt(flee.dodges) : SPEECH[state]
  const hint = flee ? FLEE_HINT : SPEECH_HINT[state]
  const reason = reasons[0]
  const mascotFx = state === 'ANNOYED' ? 'fx-shake fx-blink-danger' : state === 'PASSED' || state === 'FORGIVE' ? 'fx-bless' : undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: space.sm + 2, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', gap: space.sm }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: space.xs + 2, paddingBottom: space.md }}>
          <SpeechBubble text={text} tone={tone} textFx={flee ? 'fx-pop' : undefined} phraseWrap={!!flee}>
            {SHOW_SCORE[state] && (
              <div className="mono" style={{ fontSize: fontSize.score, lineHeight: 1, color: v(tone), marginTop: space.xs }}>
                {score}
              </div>
            )}
            {SHOW_SCORE[state] && reason && <Detail>{REASON_TEXT[reason]}</Detail>}
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
        <FleeFx active={!!flee} fleeing={flee?.fleeing ?? false} sfx={FLEE_SFX}>
          {/* key ทำให้ effect เล่นใหม่ทุกครั้งที่ state เปลี่ยน (bless เล่นครั้งเดียว) */}
          <div key={state} className={mascotFx}>
            {mascot}
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
