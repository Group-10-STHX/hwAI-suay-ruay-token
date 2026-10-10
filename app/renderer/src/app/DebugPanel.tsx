import { useEffect, useState, type ReactNode } from 'react'
import {
  DEFAULT_QUEUE_SIZE,
  getMockControl,
  onMockControl,
  QUEUE_SIZES,
  SCENARIOS,
  setMockControl,
  USE_MOCK,
  type ScenarioName,
} from '../api'
import { v } from '../theme/tokens'
import { useStore } from './store'

// dev เท่านั้น: สลับ scenario ให้ avatar + camera-overlay ที่เปิดอยู่
export function DebugPanel() {
  const { queue, vision } = useStore()
  const [ctl, setCtl] = useState(getMockControl)
  useEffect(() => onMockControl(setCtl), [])

  const pick = (scenario: ScenarioName) => setMockControl({ scenario, queueSize: DEFAULT_QUEUE_SIZE[scenario] })

  return (
    <div style={{ background: v('bg'), color: v('text'), height: '100%', overflow: 'auto', padding: 16 }}>
      <h1 className="display" style={{ margin: '0 0 12px', color: v('hud') }}>
        DEBUG · ไหว้กูซะ
      </h1>
      {!USE_MOCK && <p style={{ color: v('hud') }}>ตอนนี้ต่อ daemon จริงอยู่ ปุ่มข้างล่างไม่มีผล รันด้วย npm run dev:mock</p>}

      <Section title="Scenario">
        {(Object.keys(SCENARIOS) as ScenarioName[]).map((name) => (
          <Btn key={name} on={ctl.scenario === name} onClick={() => pick(name)}>
            {SCENARIOS[name].label}
          </Btn>
        ))}
      </Section>

      <Section title="จำนวนการ์ดในคิว">
        {QUEUE_SIZES.map((n) => (
          <Btn key={n} on={ctl.queueSize === n} onClick={() => setMockControl({ ...ctl, queueSize: n })}>
            {String(n)}
          </Btn>
        ))}
      </Section>

      <Section title="สด">
        <pre className="mono" style={{ margin: 0, color: v('textDim'), fontSize: 13 }}>
          {JSON.stringify({ state: queue.state, failCount: queue.failCount, cards: queue.items.length, vision }, null, 2)}
        </pre>
      </Section>

      <p style={{ color: v('textDim') }}>
        เปิด <a href="./avatar.html" target="_blank" style={{ color: v('hud') }}>avatar</a> ·{' '}
        <a href="./camera-overlay.html" target="_blank" style={{ color: v('hud') }}>camera-overlay</a> คู่กันแล้วกดสลับได้เลย
      </p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 16 }}>
      <h2 style={{ fontSize: 14, color: v('textDim'), margin: '0 0 6px' }}>{title}</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{children}</div>
    </section>
  )
}

function Btn({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: on ? v('hud') : v('surface'),
        color: v('text'),
        border: `1px solid ${v('hudDim')}`,
        padding: '6px 10px',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  )
}
