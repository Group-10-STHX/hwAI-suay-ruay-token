import { useEffect, useState, type CSSProperties } from 'react'
import type { SessionState } from '../../api/types'
import { avatarMoodFor, Mascot } from '../../mascot'
import { SfxPicker } from '../../sfx/SfxPicker'
import { HOME_SPEECH } from '../../states'
import { fontSize, radius, space, v, type ColorToken } from '../../theme/tokens'
import { panel } from '../homeStyles'
import { at, compact, isOn, pendingOf, type HomeProps } from './model'
import { AvatarRow, cx, Footer, Header, MonitorChip, Shell, StatCell, StyleSelect, TestButton } from './shared'

// ร่าง B "Mascot-first": น้องที่เลือกเป็นพระเอก (ตัวใหญ่ ท่าตาม mood) · สวิตช์เป็นคันโยกใต้ตัว
// สถิติเป็นแถบบางๆ · สติ๊กเกอร์เป็นกอง polaroid ในฉากเดียวกับน้อง
// state ของน้อง: ปิด → SULKING · เปิดไม่มีคิว → IDLE (นิ่ง ตามกฎไม่วนตอนว่าง) · มีคิว → DEMANDING

const ROT = [-10, -3, 5, 11]
const POKE_MS = 2600

export function HomeB(p: HomeProps) {
  const { status } = p
  const on = isOn(status)
  const pending = pendingOf(status)
  const tone: ColorToken = on ? 'hud' : 'sulk'
  const state: SessionState = !on ? 'SULKING' : pending > 0 ? 'DEMANDING' : 'IDLE'
  const avatarSrc = p.avatar !== 'jason' ? p.avatarSrc(p.avatar, avatarMoodFor(state)) : undefined

  // จิ้มน้อง: โยกครั้งเดียว + สุ่มประโยค (ไม่ซ้ำประโยคก่อนหน้า) แล้วกลับประโยคเดิมเอง
  const [poke, setPoke] = useState<{ line: string; n: number } | null>(null)
  useEffect(() => {
    if (!poke) return
    const t = setTimeout(() => setPoke(null), POKE_MS)
    return () => clearTimeout(t)
  }, [poke])
  const doPoke = () =>
    setPoke((prev) => {
      const lines = HOME_SPEECH.poke
      let i = Math.floor(Math.random() * lines.length)
      if (prev && lines[i] === prev.line) i = (i + 1) % lines.length
      return { line: lines[i], n: (prev?.n ?? 0) + 1 }
    })

  const line = poke?.line ?? (!status ? 'กำลังต่อ daemon…' : !on ? HOME_SPEECH.off : pending > 0 ? HOME_SPEECH.pending(pending) : HOME_SPEECH.on)
  const fan = p.stickers.slice(0, ROT.length)

  return (
    <Shell on={on} pending={pending} gap={space.sm}>
      <Header tone={tone} size={22} mock={p.mock} offline={p.offline} variant={p.variant} onCycleVariant={p.onCycleVariant} />

      {/* ฉาก: ฟองคำพูด + น้อง + กอง polaroid */}
      <section className="fx-render hv-stage" style={at(1)} aria-label="น้อง">
        <div key={line} className="hv-bubble fx-flicker" style={at(1)}>
          {line}
        </div>
        <button type="button" className="hv-mascot" onClick={doPoke} aria-label="จิ้มน้อง" title="จิ้มน้องดูสิ">
          <div key={poke?.n ?? 0} className={poke ? 'hv-poke' : undefined}>
            <Mascot state={state} providerColor={v(tone)} size="hero" avatar={p.avatar} avatarSrc={avatarSrc} />
          </div>
        </button>
        {fan.map((s, i) => (
          <figure key={s.file} className="hv-pola" style={{ left: 10 + i * 24, zIndex: i + 1, ['--r' as string]: `${ROT[i]}deg` } as CSSProperties} title={`${s.score} คะแนน`}>
            <img src={p.stickerUrl(s.file)} alt={`สติ๊กเกอร์ ${s.score}`} draggable={false} />
            <span>{s.score}</span>
          </figure>
        ))}
        {fan.length > 0 && (
          <div style={{ position: 'absolute', right: 10, bottom: 10, zIndex: 4 }}>
            <StyleSelect size="xs" value={p.stickerStyle} onChange={p.onStickerStyle} />
          </div>
        )}
      </section>

      {/* คันโยกเปิด/ปิด */}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className={cx('fx-render', 'hv-lever', on && 'is-on')}
        style={at(2)}
        disabled={!status}
        onClick={p.onToggle}
      >
        <span className="hv-lever-knob mono">{on ? 'ON' : 'OFF'}</span>
        <span className="hv-lever-text">
          <b className="fx-glow">{on ? 'เปิดอยู่ · ต้องไหว้ก่อนใช้ AI' : 'ปิดอยู่ · ใช้ AI ได้เลย'}</b>
          <small>{on ? 'กดเพื่อปิด' : 'กดเพื่อเปิด'}</small>
        </span>
      </button>

      {/* ticker สถิติ */}
      <section className="fx-render" style={{ ...panel, background: v('surfaceRaised'), borderRadius: radius.sm, padding: `${space.xs + 2}px ${space.sm + 4}px`, ...at(3) }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: space.sm }}>
          <StatCell inline size={18} label="รอไหว้" value={status?.pending} tone="hud" />
          <StatCell inline size={18} label="ไหว้วันนี้" value={status?.stats.today.wais} />
          <StatCell inline size={18} label="ไหว้สวย" value={status?.stats.today.beautiful} tone="blessed" />
          <StatCell inline size={18} label="token" value={status ? compact(status.stats.today.tokens) : undefined} tone="blessed" />
        </div>
        <div className="mono" style={{ color: v('textDim'), fontSize: fontSize.micro, marginTop: 2, letterSpacing: 1 }}>
          วันนี้ · token รวม {status ? compact(status.stats.total.tokens) : '–'} · คะแนนดีสุด {status?.stats.bestScore ?? '–'}
        </div>
      </section>

      <AvatarRow className="fx-render" css={at(3)} emphasis="ring" label="ตัวละคร" items={p.avatars} active={p.avatar} onPick={p.onAvatar} srcFor={p.avatarSrc} />

      <div className="fx-render" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, flexWrap: 'wrap', ...at(4) }}>
        <SfxPicker value={p.sfx} onChange={p.onSfx} />
        <MonitorChip on={!!status?.monitor} disabled={!status} onToggle={p.onMonitor} />
      </div>

      <TestButton className="fx-render" css={at(4)} enabled={on} onTest={p.onTest} />

      <Footer onSettings={p.onSettings} />
    {p.cameraLink}
      {p.graphSlot}
    </Shell>
  )
}
