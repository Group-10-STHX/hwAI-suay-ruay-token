import type { ReactNode } from 'react'
import { fontSize, space, v } from '../../theme/tokens'
import { dragBar, ghostButton, page, panel } from '../homeStyles'
import { AvatarPicker } from '../AvatarPicker'
import { StickerStrip } from '../StickerStrip'
import { SfxPicker } from '../../sfx/SfxPicker'
import { at, compact, type HomeProps } from './model'

// ร่างเดิมของหน้าหลัก (ย้ายมาจาก HomeWindow ตอนทำ home variants) หน้าตาและพฤติกรรมเท่าเดิม
// (SPIKE: หน้านี้ยังไม่ได้ทำตาม wireframe)

export function HomeDefault({ status, offline, mock, sfx, onSfx, stickers, stickerStyle, onStickerStyle, stickerUrl, onToggle, onMonitor, onTest, onSettings, cameraSlot, graphSlot }: HomeProps) {
  const on = status?.enabled ?? false
  const tone = on ? 'hud' : 'sulk'

  return (
    <div className={['fx-boot', on ? 'is-active' : '', on && (status?.pending ?? 0) > 0 ? 'has-pending' : ''].join(' ').trim()} style={page}>
      <div style={dragBar} />

      <header className="fx-render" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', ...at(0) }}>
        <h1 className="display fx-glow fx-flicker" style={{ margin: 0, fontSize: 32, lineHeight: 1.1, color: v(tone), ...at(0) }}>
          ไหว้กูซะ
        </h1>
        <span className="mono" style={{ color: v('textDim'), fontSize: fontSize.small }}>
          {mock ? 'MOCK' : offline ? 'DAEMON OFFLINE' : 'v0 spike'}
        </span>
      </header>

      {/* สวิตช์ใหญ่ */}
      <button
        className="fx-scanline fx-render"
        onClick={onToggle}
        disabled={!status}
        style={{ ...panel, borderColor: v(tone), cursor: status ? 'pointer' : 'default', textAlign: 'left', ...at(1) }}
      >
        <div className="mono" style={{ color: v(tone), fontSize: fontSize.small, letterSpacing: 2 }}>
          {on ? '● ONLINE' : '○ OFFLINE'}
        </div>
        <div className="display fx-glow fx-flicker" style={{ fontSize: fontSize.speech, lineHeight: 1.2, color: v('text'), margin: `${space.xs}px 0`, ...at(1) }}>
          {on ? 'มนุษย์ต้องไหว้ก่อนใช้ AI' : 'ปิดอยู่ AI ใช้ได้เลยไม่ต้องไหว้'}
        </div>
        <div style={{ color: v('textDim') }}>{on ? 'กดเพื่อปิด' : 'กดเพื่อเปิด'}</div>
      </button>

      <AvatarPicker current={status?.avatar} className="fx-render" style={at(3)} />
      <div className="fx-render" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, ...at(3) }}>
        <span className="mono" style={{ color: v('textDim'), fontSize: fontSize.small, letterSpacing: 2 }}>เสียงคะแนน</span>
        <SfxPicker value={sfx} onChange={onSfx} />
      </div>
      {/* โหมดสังเกต: ใช้ AI จริงแล้วดูว่าจับได้ไหม โดยไม่ต้องไหว้ */}
      <button
        className="fx-render"
        onClick={onMonitor}
        disabled={!status}
        style={{ ...ghostButton, borderStyle: status?.monitor ? 'solid' : 'dashed', color: status?.monitor ? v('blessed') : v('text'), borderColor: status?.monitor ? v('blessed') : v('hud'), ...at(4) }}
      >
        {status?.monitor ? '◐ โหมดสังเกตเปิดอยู่ · ไม่ต้องไหว้ (กดเพื่อกลับไปบังคับไหว้)' : '○ เปิดโหมดสังเกต: ใช้ AI จริงโดยไม่ต้องไหว้ ดูว่าจับได้ไหม'}
      </button>

      {cameraSlot}

      <StickerStrip className="fx-render" css={at(4)} items={stickers} style={stickerStyle} urlFor={stickerUrl} onStyle={onStickerStyle} />

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

      <button className="fx-render" onClick={onTest} disabled={!on} style={{ ...ghostButton, opacity: on ? 1 : 0.4, ...at(4) }}>
        ลองไหว้ (เด้ง popup ทดสอบ)
      </button>

      <footer className="fx-render" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, ...at(5) }}>
        <span style={{ color: v('textDim'), fontSize: fontSize.small }}>ปิดหน้านี้ได้ แอปยังอยู่บน menu bar (🙏)</span>
        <button onClick={onSettings} style={{ ...ghostButton, border: 'none', padding: space.xs, color: v('textDim'), fontSize: fontSize.small }}>
          ⚙ ตั้งค่า
        </button>
      </footer>

      {graphSlot}
    </div>
  )
}

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
      {/* key = ค่า: เปลี่ยนค่าแล้ว remount เล่น fx-flicker ใหม่ */}
      <div key={String(value)} className="mono fx-flicker fx-glow" style={{ fontSize: fontSize.speech, lineHeight: 1.2, color: v(tone) }}>
        {value ?? '–'}
      </div>
      <div style={{ color: v('textDim'), fontSize: fontSize.small }}>{label}</div>
    </div>
  )
}
