import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { isStickerStyle, STICKER_STYLES, type AvatarItem, type AvatarMood, type StickerStyle } from '../../api/types'
import { AvatarImage, JASON_THUMB } from '../../mascot'
import { fontSize, radius, space, v, type ColorToken } from '../../theme/tokens'
import { dragBar, ghostButton } from '../homeStyles'
import { at } from './model'
import { VARIANT_LABEL, type Variant } from './variant'
import './home.css'

// ชิ้นร่วมของร่างหน้าหลัก (props-only สีจาก token เท่านั้น)

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ')

/** padding บน 36 เว้นที่ให้ traffic light (titleBarStyle hiddenInset) */
const PAD_TOP = 36

/** root ของร่าง: class เดิมของ effects.css (.fx-boot/.is-active/.has-pending) · สูงตามเนื้อหาให้ main หด window ได้ */
export function Shell({ on, pending, children, gap = space.sm }: { on: boolean; pending: number; children: ReactNode; gap?: number }) {
  useEffect(() => {
    document.documentElement.classList.add('hv-home')
    return () => document.documentElement.classList.remove('hv-home')
  }, [])
  return (
    <div className={cx('fx-boot', 'hv-root', on && 'is-active', on && pending > 0 && 'has-pending')} style={{ gap, padding: `${PAD_TOP}px ${space.md}px ${space.sm + 4}px` }}>
      <div style={dragBar} />
      {children}
    </div>
  )
}

export function Header({ tone, mock, offline, variant, onCycleVariant, size = fontSize.title }: { tone: ColorToken; mock: boolean; offline: boolean; variant?: Variant; onCycleVariant?: () => void; size?: number }) {
  return (
    <header className="fx-render" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm, ...at(0) }}>
      <h1 className="display fx-glow fx-flicker" style={{ margin: 0, fontSize: size, lineHeight: 1.1, color: v(tone), ...at(0) }}>
        ไหว้กูซะ
      </h1>
      <span style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
        <span className="mono" style={{ color: v('textDim'), fontSize: fontSize.small }}>
          {mock ? 'MOCK' : offline ? 'DAEMON OFFLINE' : 'v0 spike'}
        </span>
        {variant && onCycleVariant && <VariantChip variant={variant} onCycle={onCycleVariant} />}
      </span>
    </header>
  )
}

/** ชิปบอกร่างที่ใช้อยู่ กดวน a→b→c→ร่างเดิม (ร่างเดิมไม่มีชิป) */
export function VariantChip({ variant, onCycle }: { variant: Variant; onCycle: () => void }) {
  return (
    <button
      type="button"
      className="mono"
      onClick={onCycle}
      title={`ร่าง ${variant.toUpperCase()} · ${VARIANT_LABEL[variant]} · กดเพื่อสลับ (a→b→c→ร่างเดิม) หรือเปิด ?variant=`}
      style={{ font: 'inherit', fontFamily: 'inherit', fontSize: fontSize.micro, letterSpacing: 1, padding: `1px ${space.sm - 2}px`, border: `1px solid ${v('hudDim')}`, borderRadius: radius.sm, background: 'transparent', color: v('textDim'), cursor: 'pointer' }}
    >
      ร่าง {variant.toUpperCase()}
    </button>
  )
}

export function Footer({ onSettings, i = 5, children }: { onSettings: () => void; i?: number; children?: ReactNode }) {
  return (
    <footer className="fx-render" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, ...at(i) }}>
      <span style={{ color: v('textDim'), fontSize: fontSize.micro, minWidth: 0 }}>ปิดหน้านี้ได้ แอปยังอยู่บน menu bar (🙏)</span>
      {children}
      <button onClick={onSettings} style={{ ...ghostButton, border: 'none', padding: `0 ${space.xs}px`, color: v('textDim'), fontSize: fontSize.small, lineHeight: 1.6, flex: 'none' }}>
        ⚙ ตั้งค่า
      </button>
    </footer>
  )
}

/** ตัวเลขสถิติ: ค่าใหญ่ + ป้ายเล็ก (key = ค่า: เปลี่ยนแล้ว remount เล่น fx-flicker ใหม่) */
export function StatCell({ label, value, tone = 'text', size = fontSize.stat, align = 'left', inline = false }: { label: string; value?: number | string; tone?: ColorToken; size?: number; align?: 'left' | 'center'; inline?: boolean }) {
  const num = (
    <span key={String(value)} className="mono fx-flicker fx-glow" style={{ display: inline ? 'inline' : 'block', fontSize: size, lineHeight: 1.1, color: v(tone) }}>
      {value ?? '–'}
    </span>
  )
  const lab = (
    <span style={{ display: inline ? 'inline' : 'block', color: v('textDim'), fontSize: fontSize.micro, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {label}
    </span>
  )
  return (
    <div style={{ minWidth: 0, textAlign: align, whiteSpace: inline ? 'nowrap' : undefined }}>
      {num}
      {inline && ' '}
      {lab}
    </div>
  )
}

/** ป้ายสไตล์สติ๊กเกอร์ (ชุดเดียวกับ StickerStrip ของร่างเดิม · รายการสไตล์มาจาก api/types STICKER_STYLES) */
const STYLE_LABEL: Record<StickerStyle, string> = {
  photo: 'รูปถ่าย',
  cartoon: 'การ์ตูน',
  comic: 'คอมิก',
  pixel: 'พิกเซล',
  neon: 'นีออน',
  kawaii: 'คาวาอี้',
}

/** เลือกสไตล์สติ๊กเกอร์ใบถัดไป: <select> เล็กบรรทัดเดียว (6 แบบ ปุ่มสลับไม่พอที่) */
export function StyleSelect({ value, onChange, size = 'sm' }: { value: StickerStyle; onChange: (s: StickerStyle) => void; size?: 'sm' | 'xs' }) {
  const fs = size === 'xs' ? fontSize.micro : fontSize.small
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', flex: 'none' }}>
      <select
        aria-label="สไตล์สติ๊กเกอร์"
        title="สไตล์ของสติ๊กเกอร์ใบถัดไป"
        value={value}
        onChange={(e) => isStickerStyle(e.target.value) && onChange(e.target.value)}
        style={{
          font: 'inherit',
          fontSize: fs,
          appearance: 'none',
          WebkitAppearance: 'none',
          padding: size === 'xs' ? `2px ${space.lg - 4}px 2px ${space.sm}px` : `${space.xs}px ${space.lg}px ${space.xs}px ${space.sm}px`,
          border: `1px solid ${v('hudDim')}`,
          borderRadius: radius.sm,
          background: v('surface'),
          color: v('text'),
          cursor: 'pointer',
        }}
      >
        {STICKER_STYLES.map((id) => (
          <option key={id} value={id}>
            {STYLE_LABEL[id]}
          </option>
        ))}
      </select>
      <span aria-hidden="true" style={{ position: 'absolute', right: space.sm - 2, pointerEvents: 'none', color: v('hud'), fontSize: fs }}>
        ▾
      </span>
    </span>
  )
}

/** สวิตช์เล็ก (แค่ภาพ ปุ่มจริงคือตัวแม่) */
export function TogglePill({ on, tone }: { on: boolean; tone: ColorToken }) {
  return (
    <span aria-hidden className={cx('hv-pill', on && 'is-on')} style={{ borderColor: v(tone) }}>
      <i style={{ background: v(tone) }} />
    </span>
  )
}

export type AvatarRowProps = {
  items: AvatarItem[]
  active: string
  onPick: (name: string) => void
  srcFor: (name: string, mood: AvatarMood) => string
  /** grow = ตัวที่เลือกขยายเป็นพิลพร้อมชื่อ (ร่าง A) · ring = วงกลมเท่ากัน ตัวที่เลือกมีวงแหวน (ร่าง B/C) */
  emphasis: 'grow' | 'ring'
  label?: string
  className?: string
  css?: CSSProperties
}

/** แถวตัวละครบรรทัดเดียว · มีแค่ตัวเดียว (jason) ไม่โชว์ */
export function AvatarRow({ items, active, onPick, srcFor, emphasis, label, className, css }: AvatarRowProps) {
  if (items.length < 2) return null
  const grow = emphasis === 'grow'
  const small = grow ? 30 : 34
  const big = grow ? 40 : 34
  return (
    <section className={className} aria-label="ตัวละคร" style={{ display: 'flex', alignItems: 'center', gap: space.sm, minWidth: 0, ...css }}>
      {label && (
        <h2 className="mono" style={{ margin: 0, fontSize: fontSize.micro, color: v('textDim'), letterSpacing: 2, flex: 'none' }}>
          {label}
        </h2>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: space.xs + 2, flex: 1, minWidth: 0, overflowX: 'auto' }}>
        {items.map((it) => {
          const on = it.name === active
          const px = on ? big : small
          return (
            <button
              key={it.name}
              type="button"
              className={cx('hv-av', on && 'is-on')}
              onClick={() => onPick(it.name)}
              aria-pressed={on}
              title={it.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: space.sm - 2,
                flex: 'none',
                padding: grow ? (on ? `${space.xs}px ${space.sm + 2}px ${space.xs}px ${space.xs}px` : space.xs) : 2,
                background: on ? v('surface') : 'transparent',
                color: on ? v('text') : v('textDim'),
                border: `1px solid ${on ? v('hud') : v('hudDim')}`,
                borderRadius: 999,
                cursor: 'pointer',
                font: 'inherit',
                opacity: on ? 1 : 0.75,
              }}
            >
              <span className="hv-av-thumb" style={{ width: px, height: px, borderRadius: '50%', overflow: 'hidden', display: 'grid', placeItems: 'center', background: it.kind === 'builtin' ? 'transparent' : v('surfaceRaised') }}>
                {it.kind === 'builtin' ? <AvatarImage src={JASON_THUMB} size={px} alt={it.label} /> : <AvatarImage src={srcFor(it.name, 'confused')} size={px} alt={it.label} />}
              </span>
              {grow && on && <span style={{ fontSize: fontSize.small, lineHeight: 1.1, maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>}
            </button>
          )
        })}
      </div>
    </section>
  )
}

/** ปุ่มโหมดสังเกต (long = ประโยคเต็มแบบร่างเดิม) */
export function MonitorChip({ on, disabled, onToggle, long = false, className, css }: { on: boolean; disabled: boolean; onToggle: () => void; long?: boolean; className?: string; css?: CSSProperties }) {
  const text = long
    ? on
      ? '◐ โหมดสังเกตเปิดอยู่ · ไม่ต้องไหว้ (กดเพื่อกลับไปบังคับไหว้)'
      : '○ เปิดโหมดสังเกต: ใช้ AI จริงโดยไม่ต้องไหว้ ดูว่าจับได้ไหม'
    : on
      ? '◐ สังเกตอยู่ · ไม่ต้องไหว้'
      : '○ โหมดสังเกต'
  return (
    <button
      type="button"
      className={className}
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={on}
      title="โหมดสังเกต: ใช้ AI จริงโดยไม่ต้องไหว้ ดูว่าจับได้ไหม"
      style={{ ...ghostButton, borderStyle: on ? 'solid' : 'dashed', color: on ? v('blessed') : v('text'), borderColor: on ? v('blessed') : v('hud'), padding: `${space.xs + 1}px ${space.sm + 2}px`, fontSize: fontSize.small, whiteSpace: long ? 'normal' : 'nowrap', textAlign: 'left', ...css }}
    >
      {text}
    </button>
  )
}

export function TestButton({ enabled, onTest, className, css, label = 'ลองไหว้ (เด้ง popup ทดสอบ)' }: { enabled: boolean; onTest: () => void; className?: string; css?: CSSProperties; label?: string }) {
  return (
    <button type="button" className={className} onClick={onTest} disabled={!enabled} style={{ ...ghostButton, opacity: enabled ? 1 : 0.4, padding: `${space.sm}px ${space.md}px`, fontSize: fontSize.small, ...css }}>
      {label}
    </button>
  )
}
