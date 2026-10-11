import { useEffect, useState } from 'react'
import { avatarUrl, BRIBE_AMOUNT_BAHT, MAX_VISIBLE_CARDS, REQUEST_TIMEOUT_MS, skipItem, submitBribe } from '../api'
import { avatarMoodFor, Mascot } from '../mascot'
import { useSfxLevel } from '../sfx/store'
import { useScoreSound } from '../sfx/useScoreSound'
import { CardStack, PendingCount, TimeLeft } from '../queue'
import { BribePanel, Island, LINGER_LINES } from '../states'
import { providerAccent, v } from '../theme/tokens'
import { splitQueue } from './derive'
import { useStore } from './store'

export function AvatarWindow() {
  const { queue, vision, daemonOnline, flee, fleeCount } = useStore()
  const now = useNow(queue.items.length > 0)
  // เสียง HUD: เปิดที่หน้าต่างนี้ที่เดียว (ไม่งั้นเสียงซ้อน) ระดับเลือกที่หน้าหลัก
  const [sfx] = useSfxLevel()
  useScoreSound({ state: queue.state, vision, level: sfx })
  // ตัวละครที่เลือก (jason = SVG ในแอป · ชื่ออื่นดึงภาพจาก daemon)
  const avatar = queue.avatar
  const avatarSrc = avatar && avatar !== 'jason' ? avatarUrl(avatar, avatarMoodFor(queue.state)) : undefined
  // ใบบนสุดอยู่ใน island ใบที่เหลือลงกองการ์ด แต่ละคำขอโชว์ครั้งเดียว
  const { top, waiting, shown, hidden } = splitQueue(queue.items, MAX_VISIBLE_CARDS)
  const accent = top ? providerAccent[top.source] : undefined
  const active = queue.state !== 'IDLE'
  // ไหว้ผ่านแล้ว: น้องรีแอค ~2.5 วิ (ยังมีคิวต่อ) หรืออยู่คุยต่อ ~10 วิ (คิวว่าง) ก่อนไปต่อ/หาย
  const lingering = queue.state === 'PASSED' && (queue.lingerMs ?? 0) > 0
  const chat = useLingerChat(lingering, vision.score)
  // main หนีเฉพาะ ANNOYED อยู่แล้ว เช็กซ้ำเพราะ IPC กับ poll คิวมาไม่พร้อมกัน (กันท่าหนีค้างตอน state เปลี่ยน)
  const fleeOn = flee.active && queue.state === 'ANNOYED'

  // อีเวนต์ 67: ความคืบหน้าสดจาก vision (~150 ms) ถ้าไม่มีใช้ค่าจาก event ของคิว (poll 500 ms)
  const six = queue.event?.kind === 'sixseven' && !queue.monitor ? queue.event : undefined
  const sixSeven = six ? { swings: vision.sixSeven?.swings ?? six.swings ?? 0, need: vision.sixSeven?.need ?? six.need ?? 6 } : undefined

  // popup เป็นหน้าต่างโปร่งใหญ่ main ให้เมาส์ทะลุ · ถึงปุ่ม (.interactive) ค่อยขอรับคลิก ไม่งั้นปุ่มข้ามกดไม่ได้
  useEffect(() => {
    let on = false
    const move = (e: MouseEvent) => {
      const next = e.target instanceof Element && e.target.closest('.interactive') !== null
      if (next === on) return
      on = next
      window.wai?.setInteractive?.(on)
    }
    document.addEventListener('mousemove', move)
    return () => document.removeEventListener('mousemove', move)
  }, [])

  return (
    <div
      className={active ? 'is-active' : undefined}
      style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end', padding: 16 }}
    >
      {queue.bypass && <Badge tone="blessed">WAI_BYPASS เปิดอยู่</Badge>}
      {queue.monitor && <Badge tone="blessed">โหมดสังเกต ไม่ต้องไหว้</Badge>}
      {!daemonOnline && <Badge tone="hud">ต่อ daemon ไม่ได้</Badge>}
      {active && (
        <Island
          state={queue.state}
          failCount={queue.failCount}
          score={vision.score}
          reasons={vision.reasons}
          providerColor={accent?.color}
          providerLabel={accent?.label}
          agentLabel={top?.agentLabel}
          chat={chat}
          eventText={queue.event && !queue.monitor ? queue.event.text : undefined}
          sixSeven={sixSeven}
          flee={fleeOn ? { fleeing: flee.fleeing, dodges: fleeCount } : undefined}
          timeLeft={top && <TimeLeft createdAt={top.createdAt} now={now} timeoutMs={REQUEST_TIMEOUT_MS} />}
          mascot={<Mascot state={queue.state} providerColor={accent?.color ?? v('hudDim')} avatar={avatar} avatarSrc={avatarSrc} />}
          cards={
            <>
              <CardStack
                items={waiting}
                now={now}
                timeoutMs={REQUEST_TIMEOUT_MS}
                max={shown}
                avatar={(it) => (
                  <Mascot state={queue.state} providerColor={providerAccent[it.source].color} size="small" still avatar={avatar} avatarSrc={avatarSrc} />
                )}
              />
              <PendingCount count={hidden} />
            </>
          }
        />
      )}
      {/* ง้อด้วยเงิน (mock ล้อเล่น): เฉพาะตอนงอน/รอขอขมา ที่ ANNOYED น้องวิ่งหนีเมาส์ จึงไม่โชว์ */}
      {top && !queue.monitor && (queue.state === 'SULKING' || queue.state === 'FORGIVE') && (
        <BribePanel amount={BRIBE_AMOUNT_BAHT} onSubmit={submitBribe} />
      )}
      {top && (
        <button className="interactive mono" onClick={() => skipItem(top.id)} style={skipStyle}>
          ข้าม (dev) ▶
        </button>
      )}
    </div>
  )
}

// ปุ่มแทนการไหว้ ใช้จนกว่ากล้องจะต่อเสร็จ
const skipStyle = {
  marginTop: 12,
  background: v('surface'),
  color: v('text'),
  border: `1px solid ${v('hud')}`,
  padding: '8px 14px',
  cursor: 'pointer',
} as const

function Badge({ tone, children }: { tone: 'hud' | 'blessed'; children: string }) {
  return (
    <div className="mono" style={{ color: v(tone), border: `1px solid ${v(tone)}`, padding: '2px 8px', marginBottom: 8 }}>
      {children}
    </div>
  )
}

/** บรรทัดคุยต่อหลังไหว้ผ่าน: เปลี่ยนบรรทัดทุก ~2.5 วิ เริ่มใหม่ทุกครั้งที่เข้าช่วงคุย · ไม่คุย = undefined */
const LINGER_LINE_MS = 2500
function useLingerChat(on: boolean, score: number) {
  const [i, setI] = useState(0)
  const [frozen, setFrozen] = useState(score)
  useEffect(() => {
    if (!on) return setI(0)
    setFrozen(score) // คะแนนไหว้ครั้งที่ผ่าน (ตอนนั้น worker หยุดส่งแล้ว ค่าค้างอยู่)
    setI(0)
    const t = setInterval(() => setI((n) => Math.min(n + 1, LINGER_LINES.length - 1)), LINGER_LINE_MS)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on])
  if (!on) return undefined
  return LINGER_LINES[i].replace('{score}', frozen > 0 ? `${Math.round(frozen)} คะแนน` : '').trim()
}

/** เวลาปัจจุบัน อัปเดตทุกวิ เฉพาะตอนมีการ์ด (ไม่วนตอนว่าง) */
function useNow(running: boolean) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!running) return
    // ตอนว่าง now ค้างไว้ที่ค่าเก่า ต้องอัปเดตทันทีที่มีการ์ด ไม่งั้นใบแรกนับจากเวลาเก่า (เคยโชว์ 5:01)
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [running])
  return now
}
