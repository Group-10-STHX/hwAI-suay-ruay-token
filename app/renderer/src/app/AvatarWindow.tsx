import { useEffect, useState } from 'react'
import { MAX_VISIBLE_CARDS } from '../api'
import { Mascot } from '../mascot'
import { CardStack, PendingCount } from '../queue'
import { Island } from '../states'
import { providerAccent, v } from '../theme/tokens'
import { POSE } from './derive'
import { useStore } from './store'

export function AvatarWindow() {
  const { queue, vision, daemonOnline } = useStore()
  const now = useNow(queue.items.length > 0)
  const top = queue.items[0]
  const accent = providerAccent[top?.source ?? 'claude-code']
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
          providerColor={accent.color}
          providerLabel={accent.label}
          mascot={<Mascot pose={POSE[queue.state]} providerColor={accent.color} providerLabel={accent.label} />}
          cards={
            <>
              <CardStack items={queue.items} now={now} />
              <PendingCount count={queue.items.length - MAX_VISIBLE_CARDS} />
            </>
          }
        />
      )}
    </div>
  )
}

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
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [running])
  return now
}
