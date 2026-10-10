import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { openCodexHooks, sendTestRequest, setEnabled, setup, subscribeStatus, USE_MOCK, type AppStatus } from '../api'
import { fontSize, providerAccent, space, v } from '../theme/tokens'
import { dragBar, ghostButton, page, panel, row } from './homeStyles'
import { Onboarding } from './Onboarding'

// หน้าหลัก: เปิดตอนเริ่มแอป ปิดแล้วแอปยังอยู่บน menu bar
// (SPIKE: หน้านี้ยังไม่ได้ทำตาม wireframe)

const TOOLS = [
  { source: 'claude-code', label: 'Claude Code', color: providerAccent['claude-code'].color },
  { source: 'codex', label: 'Codex', color: v('hud') },
]

export function HomeWindow() {
  const [status, setStatus] = useState<AppStatus | null>(null)
  const [offline, setOffline] = useState(false)
  const [codexMsg, setCodexMsg] = useState<string | null>(null)
  const [onboarding, setOnboarding] = useState(false)
  const now = useNow()

  // เปิดครั้งแรก (ยังไม่เคย onboard) → โชว์ onboarding · ใน browser ธรรมดาไม่มี bridge ก็ข้ามไป
  useEffect(() => {
    setup
      .status()
      .then((s) => setOnboarding(!s.onboarded))
      .catch(() => {})
  }, [])

  useEffect(
    () =>
      subscribeStatus(
        (s) => {
          setStatus(s)
          setOffline(false)
        },
        () => setOffline(true),
      ),
    [],
  )

  const on = status?.enabled ?? false
  const tone = on ? 'hud' : 'sulk'

  if (onboarding) return <Onboarding onDone={() => setOnboarding(false)} />

  return (
    <div className={`fx-boot${on ? ' is-active' : ''}`} style={page}>
      <div style={dragBar} />

      <header className="fx-render" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', ...at(0) }}>
        <h1 className="display fx-glow" style={{ margin: 0, fontSize: 28, lineHeight: 1.1, color: v(tone) }}>
          ไหว้กูซะ
        </h1>
        <span className="mono" style={{ color: v('textDim'), fontSize: fontSize.small }}>
          {USE_MOCK ? 'MOCK' : offline ? 'DAEMON OFFLINE' : 'v0 spike'}
        </span>
      </header>

      {/* สวิตช์ใหญ่ */}
      <button
        className="fx-scanline fx-render"
        onClick={() => status && setEnabled(!on)}
        disabled={!status}
        style={{ ...panel, borderColor: v(tone), cursor: status ? 'pointer' : 'default', textAlign: 'left', ...at(1) }}
      >
        <div className="mono" style={{ color: v(tone), fontSize: fontSize.small, letterSpacing: 2 }}>
          {on ? '● ONLINE' : '○ OFFLINE'}
        </div>
        <div className="display fx-glow" style={{ fontSize: fontSize.speech, lineHeight: 1.2, color: v('text'), margin: `${space.xs}px 0` }}>
          {on ? 'มนุษย์ต้องไหว้ก่อนใช้ AI' : 'ปิดอยู่ AI ใช้ได้เลยไม่ต้องไหว้'}
        </div>
        <div style={{ color: v('textDim') }}>{on ? 'กดเพื่อปิด' : 'กดเพื่อเปิด'}</div>
      </button>

      <Section title="ต่อกับ" i={2}>
        {TOOLS.map((t) => {
          const seen = status?.lastSeen[t.source]
          return (
            <div key={t.source} style={row}>
              <span style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.color }} />
                {t.label}
              </span>
              <span className="mono" style={{ color: seen ? v('blessed') : v('textDim'), fontSize: fontSize.small }}>
                {seen ? `เห็นล่าสุด ${ago(now - seen)}` : 'ยังไม่เห็นคำขอ'}
              </span>
            </div>
          )
        })}
        {/* Codex ไม่รัน hook ที่ยังไม่ trust ต้องเข้า /hooks ใน CLI กด trust เอง */}
        <button
          onClick={async () => {
            const r = await openCodexHooks()
            setCodexMsg(r.ok ? 'เปิด Terminal แล้ว พิมพ์ /hooks แล้วกด trust ทุกตัว จากนั้นปิด-เปิดแอป Codex ใหม่' : `เปิดไม่ได้: ${r.error}`)
          }}
          style={{ ...ghostButton, width: '100%', marginTop: space.sm }}
        >
          อนุญาต hook ของ Codex
        </button>
        {codexMsg && (
          <p style={{ color: v('textDim'), fontSize: fontSize.small, margin: `${space.sm}px 0 0` }}>{codexMsg}</p>
        )}
      </Section>

      <Section title="วันนี้" i={3}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: space.sm }}>
          <Stat label="รอไหว้" value={status?.pending} tone="hud" />
          <Stat label="ไหว้วันนี้" value={status?.stats.today.wais} tone="text" />
          <Stat label="ไหว้สวย" value={status?.stats.today.beautiful} tone="blessed" />
          <Stat label="token วันนี้" value={status ? compact(status.stats.today.tokens) : undefined} tone="blessed" />
        </div>
        <div className="mono" style={{ color: v('textDim'), fontSize: fontSize.small, marginTop: space.sm }}>
          token รวม {status ? compact(status.stats.total.tokens) : '–'} · คะแนนดีสุด {status?.stats.bestScore ?? '–'}
        </div>
      </Section>

      <button className="fx-render" onClick={() => sendTestRequest()} disabled={!on} style={{ ...ghostButton, opacity: on ? 1 : 0.4, ...at(4) }}>
        ลองไหว้ (เด้ง popup ทดสอบ)
      </button>

      <footer className="fx-render" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, ...at(5) }}>
        <span style={{ color: v('textDim'), fontSize: fontSize.small }}>ปิดหน้านี้ได้ แอปยังอยู่บน menu bar (🙏)</span>
        <button
          onClick={() => setOnboarding(true)}
          style={{ ...ghostButton, border: 'none', padding: space.xs, color: v('textDim'), fontSize: fontSize.small }}
        >
          ⚙ ตั้งค่า
        </button>
      </footer>
    </div>
  )
}

/** ลำดับการ render ของบล็อก (--i ใช้ใน effects.css) */
const at = (i: number) => ({ '--i': i }) as CSSProperties

function Section({ title, children, i }: { title: string; children: ReactNode; i: number }) {
  return (
    <section className="fx-render" style={at(i)}>
      <h2 className="mono" style={{ margin: `0 0 ${space.sm}px`, fontSize: fontSize.small, color: v('textDim'), letterSpacing: 2 }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

function Stat({ label, value, tone }: { label: string; value?: number | string; tone: 'hud' | 'blessed' | 'text' }) {
  return (
    <div style={{ ...panel, padding: `${space.sm}px ${space.md}px` }}>
      {/* key = ค่า: เปลี่ยนค่าแล้ว remount เล่น fx-tick ใหม่ */}
      <div key={String(value)} className="mono fx-tick fx-glow" style={{ fontSize: fontSize.speech, lineHeight: 1.2, color: v(tone) }}>
        {value ?? '–'}
      </div>
      <div style={{ color: v('textDim'), fontSize: fontSize.small }}>{label}</div>
    </div>
  )
}

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} วิที่แล้ว`
  if (s < 3600) return `${Math.round(s / 60)} นาทีที่แล้ว`
  return `${Math.round(s / 3600)} ชม.ที่แล้ว`
}

function useNow() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(t)
  }, [])
  return now
}
