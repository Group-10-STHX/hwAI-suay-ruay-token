import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { openCodexHooks, sendTestRequest, setEnabled, subscribeStatus, USE_MOCK, type AppStatus } from '../api'
import { fontSize, providerAccent, radius, space, v } from '../theme/tokens'

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
  const now = useNow()

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

  return (
    <div className={on ? 'is-active' : undefined} style={page}>
      <div style={dragBar} />

      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h1 className="display" style={{ margin: 0, fontSize: 40, color: v(tone) }}>
          ไหว้กูซะ
        </h1>
        <span className="mono" style={{ color: v('textDim'), fontSize: fontSize.small }}>
          {USE_MOCK ? 'MOCK' : offline ? 'DAEMON OFFLINE' : 'v0 spike'}
        </span>
      </header>

      {/* สวิตช์ใหญ่ */}
      <button
        className="fx-scanline"
        onClick={() => status && setEnabled(!on)}
        disabled={!status}
        style={{ ...panel, borderColor: v(tone), cursor: status ? 'pointer' : 'default', textAlign: 'left' }}
      >
        <div className="mono" style={{ color: v(tone), fontSize: fontSize.small, letterSpacing: 2 }}>
          {on ? '● ONLINE' : '○ OFFLINE'}
        </div>
        <div className="display" style={{ fontSize: fontSize.speech, color: v('text'), margin: `${space.sm}px 0` }}>
          {on ? 'มนุษย์ต้องไหว้ก่อนใช้ AI' : 'ปิดอยู่ AI ใช้ได้เลยไม่ต้องไหว้'}
        </div>
        <div style={{ color: v('textDim') }}>{on ? 'กดเพื่อปิด' : 'กดเพื่อเปิด'}</div>
      </button>

      <Section title="ต่อกับ">
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
          style={{ ...ghostButton, width: '100%', marginTop: space.md }}
        >
          อนุญาต hook ของ Codex
        </button>
        {codexMsg && (
          <p style={{ color: v('textDim'), fontSize: fontSize.small, margin: `${space.sm}px 0 0` }}>{codexMsg}</p>
        )}
      </Section>

      <Section title="วันนี้">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: space.sm }}>
          <Stat label="รอไหว้" value={status?.pending} tone="hud" />
          <Stat label="ไหว้ผ่าน" value={status?.stats.passed} tone="blessed" />
          <Stat label="ขอทั้งหมด" value={status?.stats.requests} tone="text" />
        </div>
      </Section>

      <button onClick={() => sendTestRequest()} disabled={!on} style={{ ...ghostButton, opacity: on ? 1 : 0.4 }}>
        ลองไหว้ (เด้ง popup ทดสอบ)
      </button>

      <p style={{ color: v('textDim'), fontSize: fontSize.small, margin: 0 }}>
        ปิดหน้านี้ได้ แอปยังทำงานอยู่บน menu bar (🙏)
      </p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mono" style={{ margin: `0 0 ${space.sm}px`, fontSize: fontSize.small, color: v('textDim'), letterSpacing: 2 }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

function Stat({ label, value, tone }: { label: string; value?: number; tone: 'hud' | 'blessed' | 'text' }) {
  return (
    <div style={{ ...panel, padding: space.md }}>
      <div className="mono" style={{ fontSize: 36, color: v(tone) }}>
        {value ?? '–'}
      </div>
      <div style={{ color: v('textDim'), fontSize: fontSize.small }}>{label}</div>
    </div>
  )
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

const page: CSSProperties = {
  height: '100%',
  overflow: 'auto',
  background: v('bg'),
  color: v('text'),
  padding: `${space.xl}px ${space.lg}px ${space.lg}px`,
  display: 'flex',
  flexDirection: 'column',
  gap: space.lg,
  userSelect: 'none',
}

// แถบบนให้ลาก window ได้ (titleBarStyle: hiddenInset)
const dragBar = { position: 'fixed', top: 0, left: 0, right: 0, height: 32, WebkitAppRegion: 'drag' } as CSSProperties

const panel: CSSProperties = {
  display: 'block',
  width: '100%',
  background: v('surface'),
  color: 'inherit',
  font: 'inherit',
  border: `1px solid ${v('hudDim')}`,
  borderRadius: radius.md,
  padding: space.lg,
}

const row: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: `${space.sm}px 0`,
  borderBottom: `1px solid ${v('hudDim')}`,
}

const ghostButton: CSSProperties = {
  background: 'transparent',
  color: v('text'),
  font: 'inherit',
  border: `1px dashed ${v('hud')}`,
  borderRadius: radius.md,
  padding: `${space.md}px`,
  cursor: 'pointer',
}
