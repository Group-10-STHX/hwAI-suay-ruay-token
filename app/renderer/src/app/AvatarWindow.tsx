import { useEffect, useState } from 'react'
import { MAX_VISIBLE_CARDS, REQUEST_TIMEOUT_MS, skipItem } from '../api'
import { Mascot } from '../mascot'
import { CardStack, PendingCount, TimeLeft } from '../queue'
import { Island } from '../states'
import { providerAccent, v } from '../theme/tokens'
import { splitQueue } from './derive'
import { useStore } from './store'

export function AvatarWindow() {
  const { queue, vision, daemonOnline } = useStore()
  const now = useNow(queue.items.length > 0)
  // ใบบนสุดอยู่ใน island ใบที่เหลือลงกองการ์ด แต่ละคำขอโชว์ครั้งเดียว
  const { top, waiting, shown, hidden } = splitQueue(queue.items, MAX_VISIBLE_CARDS)
  const accent = top ? providerAccent[top.source] : undefined
  const active = queue.state !== 'IDLE'

  return (
    <div
      className={active ? 'is-active' : undefined}
      style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end', padding: 16 }}
    >
      {queue.bypass && <Badge tone="blessed">WAI_BYPASS เปิดอยู่</Badge>}
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
          timeLeft={top && <TimeLeft createdAt={top.createdAt} now={now} timeoutMs={REQUEST_TIMEOUT_MS} />}
          mascot={<Mascot state={queue.state} providerColor={accent?.color ?? v('hudDim')} />}
          cards={
            <>
              <CardStack
                items={waiting}
                now={now}
                timeoutMs={REQUEST_TIMEOUT_MS}
                max={shown}
                avatar={(it) => <Mascot state={queue.state} providerColor={providerAccent[it.source].color} size="small" still />}
              />
              <PendingCount count={hidden} />
            </>
          }
        />
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
