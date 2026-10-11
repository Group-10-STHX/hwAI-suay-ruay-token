import { useState } from 'react'
import type { SfxLevel } from '../../sfx/policy'
import { SfxPicker } from '../../sfx/SfxPicker'
import { fontSize, space, v, type ColorToken } from '../../theme/tokens'
import { panel } from '../homeStyles'
import { StickerStrip } from '../StickerStrip'
import { at, compact, isOn, pendingOf, type HomeProps } from './model'
import { AvatarRow, cx, Footer, Header, MonitorChip, Shell, StatCell, TestButton, TogglePill } from './shared'

// ร่าง A "Compact HUD": ภาษาเดิมแต่บีบให้พอดี ~560px
// สถิติเป็นแถวเดียว · ตัวละครแถวเดียว ตัวที่เลือกขยาย · เสียง/โหมดสังเกตอยู่ในลิ้นชัก "ตั้งค่าเร็ว"

const SFX_LABEL: Record<SfxLevel, string> = { off: 'ปิด', few: 'น้อย', many: 'เยอะ' }

export function HomeA(p: HomeProps) {
  const { status } = p
  const on = isOn(status)
  const pending = pendingOf(status)
  const tone: ColorToken = on ? 'hud' : 'sulk'
  const [open, setOpen] = useState(false)

  return (
    <Shell on={on} pending={pending} gap={space.sm + 2}>
      <Header tone={tone} mock={p.mock} offline={p.offline} variant={p.variant} onCycleVariant={p.onCycleVariant} />

      {/* สวิตช์ใหญ่ (ข้อความเดิม + สวิตช์เล็กให้รู้ว่ากดได้) */}
      <button
        className="fx-scanline fx-render"
        onClick={p.onToggle}
        disabled={!status}
        aria-pressed={on}
        style={{ ...panel, display: 'flex', alignItems: 'center', gap: space.md, padding: `${space.sm + 2}px ${space.md}px`, borderColor: v(tone), cursor: status ? 'pointer' : 'default', textAlign: 'left', ...at(1) }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mono" style={{ color: v(tone), fontSize: fontSize.micro, letterSpacing: 2 }}>
            {on ? '● ONLINE' : '○ OFFLINE'}
          </div>
          <div className="display fx-glow fx-flicker" style={{ fontSize: 22, lineHeight: 1.2, color: v('text'), margin: '2px 0', ...at(1) }}>
            {on ? 'มนุษย์ต้องไหว้ก่อนใช้ AI' : 'ปิดอยู่ AI ใช้ได้เลยไม่ต้องไหว้'}
          </div>
          <div style={{ color: v('textDim'), fontSize: fontSize.micro }}>{on ? 'กดเพื่อปิด' : 'กดเพื่อเปิด'}</div>
        </div>
        <TogglePill on={on} tone={tone} />
      </button>

      {/* วันนี้: แถวเดียว + บรรทัดรวม */}
      <section className="fx-render" style={{ ...panel, background: v('surfaceRaised'), padding: `${space.sm}px ${space.md}px`, ...at(2) }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: space.sm, marginBottom: space.xs + 2 }}>
          <h2 className="mono" style={{ margin: 0, fontSize: fontSize.micro, color: v('textDim'), letterSpacing: 2 }}>
            วันนี้
          </h2>
          <span className="mono" style={{ color: v('textDim'), fontSize: fontSize.micro }}>
            token รวม {status ? compact(status.stats.total.tokens) : '–'} · ดีสุด {status?.stats.bestScore ?? '–'}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: space.sm }}>
          <StatCell label="รอไหว้" value={status?.pending} tone="hud" />
          <StatCell label="ไหว้วันนี้" value={status?.stats.today.wais} />
          <StatCell label="ไหว้สวย" value={status?.stats.today.beautiful} tone="blessed" />
          <StatCell label="token วันนี้" value={status ? compact(status.stats.today.tokens) : undefined} tone="blessed" />
        </div>
      </section>

      <AvatarRow className="fx-render" css={at(3)} emphasis="grow" label="ตัวละคร" items={p.avatars} active={p.avatar} onPick={p.onAvatar} srcFor={p.avatarSrc} />

      <StickerStrip className="fx-render" css={at(3)} items={p.stickers} style={p.stickerStyle} urlFor={p.stickerUrl} onStyle={p.onStickerStyle} />

      {/* ลิ้นชักตั้งค่าเร็ว: เสียง + โหมดสังเกต */}
      <section className="fx-render" style={{ ...panel, padding: 0, overflow: 'hidden', ...at(4) }}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, background: 'transparent', border: 'none', color: v('text'), font: 'inherit', fontSize: fontSize.small, padding: `${space.sm}px ${space.md}px`, cursor: 'pointer' }}
        >
          <span>
            <span className={cx('hv-caret', open && 'is-open')} style={{ color: v('hud'), marginRight: space.xs }}>
              ▸
            </span>
            ตั้งค่าเร็ว
          </span>
          <span className="mono" style={{ color: status?.monitor ? v('blessed') : v('textDim'), fontSize: fontSize.micro }}>
            เสียง {SFX_LABEL[p.sfx]} · สังเกต {status?.monitor ? 'เปิด' : 'ปิด'}
          </span>
        </button>
        <div className={cx('hv-drawer-body', open && 'is-open')}>
          <div>
            <div style={{ display: 'grid', gap: space.sm, padding: `${space.sm}px ${space.md}px ${space.md}px`, borderTop: `1px solid ${v('hudDim')}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
                <span className="mono" style={{ color: v('textDim'), fontSize: fontSize.micro, letterSpacing: 2 }}>
                  เสียงคะแนน
                </span>
                <SfxPicker value={p.sfx} onChange={p.onSfx} />
              </div>
              <MonitorChip on={!!status?.monitor} disabled={!status} onToggle={p.onMonitor} long />
            </div>
          </div>
        </div>
      </section>

      <TestButton className="fx-render" css={at(4)} enabled={on} onTest={p.onTest} />

      <Footer onSettings={p.onSettings} />
    {p.cameraSlot}
      {p.graphSlot}
    </Shell>
  )
}
