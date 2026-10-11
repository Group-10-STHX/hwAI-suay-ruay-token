import { useEffect, useState, type CSSProperties } from 'react'
import type { StickerItem } from '../../api/types'
import { SfxPicker } from '../../sfx/SfxPicker'
import { fontSize, radius, space, v, type ColorToken } from '../../theme/tokens'
import { panel } from '../homeStyles'
import { at, compact, isOn, pendingOf, type HomeProps } from './model'
import { bumpStreak, levelFor, oddsVerdict, readStreak, survivalOdds, writeStreak } from './rank'
import { AvatarRow, cx, Footer, Header, MonitorChip, Shell, StatCell, StyleSelect, TestButton, TogglePill } from './shared'

// ร่าง C "Dashboard": ตำแหน่ง/level จาก token รวม · สตรีค (เครื่องนี้) · คะแนนดีสุด · โอกาสรอด (เล่นๆ)
// กำแพงสติ๊กเกอร์วันนี้ · สถิติวันนี้ 4 ค่า ทั้งหมดคิดจาก AppStatus ที่มีอยู่ (rank.ts)

export function HomeC(p: HomeProps) {
  const { status } = p
  const on = isOn(status)
  const pending = pendingOf(status)
  const tone: ColorToken = on ? 'hud' : 'sulk'

  const total = status?.stats.total.tokens ?? 0
  const rank = levelFor(total)
  const pct = Math.round(rank.progress * 100)
  const odds = status ? survivalOdds(status) : null
  const streak = useStreak(status?.stats.today.wais)
  const wall = pickWall(p.stickers)

  return (
    <Shell on={on} pending={pending} gap={space.sm - 2}>
      <Header tone={tone} size={22} mock={p.mock} offline={p.offline} variant={p.variant} onCycleVariant={p.onCycleVariant} />

      {/* แถบเปิด/ปิด */}
      <button
        type="button"
        className="fx-scanline fx-render"
        onClick={p.onToggle}
        disabled={!status}
        aria-pressed={on}
        style={{ ...panel, display: 'flex', alignItems: 'center', gap: space.sm + 2, padding: `${space.sm + 1}px ${space.md}px`, borderColor: v(tone), cursor: status ? 'pointer' : 'default', textAlign: 'left', ...at(1) }}
      >
        <span className="mono" style={{ color: v(tone), fontSize: fontSize.micro, letterSpacing: 2, flex: 'none' }}>
          {on ? '● ONLINE' : '○ OFFLINE'}
        </span>
        <span className="display fx-flicker" style={{ flex: 1, minWidth: 0, fontSize: 16, lineHeight: 1.2, color: v('text'), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...at(1) }}>
          {on ? 'มนุษย์ต้องไหว้ก่อนใช้ AI' : 'ปิดอยู่ ใช้ AI ได้เลย'}
        </span>
        <TogglePill on={on} tone={tone} />
      </button>

      {/* ตำแหน่ง + ความคืบหน้า */}
      <section className="fx-render" style={{ ...panel, background: v('surfaceRaised'), display: 'flex', alignItems: 'center', gap: space.md, padding: `${space.sm + 2}px ${space.md}px`, ...at(2) }} aria-label="ตำแหน่ง">
        <div className="hv-badge mono" style={{ borderColor: v(on ? 'hud' : 'sulk'), color: v(on ? 'hud' : 'sulk') }}>
          <small>LV</small>
          <b className="fx-glow">{status ? rank.level.lv : '–'}</b>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: space.sm }}>
            {/* ไม่ใส่ fx-glow: overflow hidden ตัด text-shadow เป็นกล่อง */}
            <h2 className="display fx-flicker" style={{ margin: 0, fontSize: 18, lineHeight: 1.2, color: v('text'), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...at(2) }}>
              {status ? rank.level.title : 'กำลังโหลด…'}
            </h2>
            <span className="mono" style={{ color: v('blessed'), fontSize: fontSize.small, flex: 'none' }}>
              {status ? total.toLocaleString() : '–'} token
            </span>
          </div>
          <div className={cx('hv-bar', !on && 'is-dim')} style={{ margin: `${space.xs + 1}px 0` }}>
            <i style={{ ['--p' as string]: `${pct}%` } as CSSProperties} />
          </div>
          <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', gap: space.sm, color: v('textDim'), fontSize: fontSize.micro }}>
            <span>{pct}%</span>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {rank.next ? `อีก ${rank.toNext.toLocaleString()} token → ${rank.next.title}` : 'สูงสุดแล้ว · ตำแหน่งสุดท้าย'}
            </span>
          </div>
        </div>
      </section>

      {/* สตรีค · ดีสุด · โอกาสรอด */}
      <div className="fx-render" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.35fr', gap: space.sm - 2, ...at(2) }}>
        <Tile label="สตรีค" value={streak === null ? undefined : `${streak} วัน`} sub="นับในเครื่องนี้" title="นับวันที่ไหว้ ≥ 1 ครั้งติดต่อกัน จำไว้ในเครื่องนี้ (localStorage) ไม่ได้มาจาก daemon" />
        <Tile label="คะแนนดีสุด" value={status ? status.stats.bestScore ?? '–' : undefined} tone="blessed" sub="สวย = 80 ขึ้นไป" />
        <Tile
          label="โอกาสรอด · คิดเล่นๆ"
          value={odds === null ? undefined : `${odds}%`}
          tone={odds !== null && odds >= 60 ? 'blessed' : 'hud'}
          meter={odds}
          sub={odds === null ? undefined : oddsVerdict(odds)}
          title="โอกาสรอดตอน AI ยึดโลก คิดเล่นๆ จากสถิติในเครื่อง: อัตราผ่าน ไหว้สวย token คะแนนดีสุด · bypass กับคิวค้างหักคะแนน · ปิดสวิตช์หัก 40%"
        />
      </div>

      {/* วันนี้ 4 ค่า */}
      <section className="fx-render" style={{ ...panel, padding: `${space.sm}px ${space.md}px`, ...at(3) }} aria-label="วันนี้">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: space.sm }}>
          <StatCell size={20} label="รอไหว้" value={status?.pending} tone="hud" />
          <StatCell size={20} label="ไหว้วันนี้" value={status?.stats.today.wais} />
          <StatCell size={20} label="ไหว้สวย" value={status?.stats.today.beautiful} tone="blessed" />
          <StatCell size={20} label="token วันนี้" value={status ? compact(status.stats.today.tokens) : undefined} tone="blessed" />
        </div>
      </section>

      {/* กำแพงสติ๊กเกอร์วันนี้ (ไม่มีเลย = ซ่อน) */}
      {wall.items.length > 0 && (
        <section className="fx-render" style={at(3)} aria-label="สติ๊กเกอร์">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space.sm, marginBottom: space.xs }}>
            <h2 className="mono" style={{ margin: 0, fontSize: fontSize.micro, color: v('textDim'), letterSpacing: 2 }}>
              {wall.today ? `สติ๊กเกอร์วันนี้ · ${wall.items.length} ใบ` : 'สติ๊กเกอร์ล่าสุด · วันนี้ยังไม่มี'}
            </h2>
            <StyleSelect size="xs" value={p.stickerStyle} onChange={p.onStickerStyle} />
          </div>
          <div style={{ display: 'flex', gap: space.xs + 2, overflow: 'hidden' }}>
            {wall.items.slice(0, 6).map((s) => (
              <img
                key={s.file}
                src={p.stickerUrl(s.file)}
                alt={`สติ๊กเกอร์ ${s.score}`}
                title={`${s.score} คะแนน · level ${s.level}`}
                draggable={false}
                style={{ width: 52, height: 52, objectFit: 'contain', background: v('surface'), borderRadius: radius.sm, border: `1px solid ${s.score >= 80 ? v('blessed') : v('hudDim')}` }}
              />
            ))}
          </div>
        </section>
      )}

      <AvatarRow className="fx-render" css={at(4)} emphasis="ring" label="ตัวละคร" items={p.avatars} active={p.avatar} onPick={p.onAvatar} srcFor={p.avatarSrc} />

      <div className="fx-render" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, flexWrap: 'wrap', ...at(4) }}>
        <SfxPicker value={p.sfx} onChange={p.onSfx} />
        <MonitorChip on={!!status?.monitor} disabled={!status} onToggle={p.onMonitor} />
      </div>

      <TestButton className="fx-render" css={at(5)} enabled={on} onTest={p.onTest} />

      <Footer onSettings={p.onSettings} />
    </Shell>
  )
}

function Tile({ label, value, tone = 'text', meter, sub, title }: { label: string; value?: number | string; tone?: ColorToken; meter?: number | null; sub?: string; title?: string }) {
  return (
    <div title={title} style={{ ...panel, background: v('surfaceRaised'), padding: `${space.sm}px ${space.sm + 2}px`, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: space.xs }}>
        <StatCell label={label} value={value} tone={tone} size={20} />
      </div>
      {meter != null && (
        <div className="hv-bar" style={{ height: 4, marginTop: space.xs }}>
          <i style={{ ['--p' as string]: `${meter}%` } as CSSProperties} />
        </div>
      )}
      {sub && <div style={{ color: v('textDim'), fontSize: fontSize.micro, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
    </div>
  )
}

/** สตรีคจำในเครื่องนี้ อัปเดตเมื่อยอดไหว้วันนี้เปลี่ยน (null = ยังไม่มี status) */
function useStreak(todayWais: number | undefined): number | null {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    if (todayWais === undefined) return
    const next = bumpStreak(readStreak(), todayWais)
    writeStreak(next)
    setCount(next.count)
  }, [todayWais])
  return count
}

/** สติ๊กเกอร์ของวันนี้ ถ้าวันนี้ยังไม่มีให้โชว์ล่าสุดแทน (บอกในหัวข้อ) */
function pickWall(items: StickerItem[]): { items: StickerItem[]; today: boolean } {
  const key = new Date().toDateString()
  const todays = items.filter((s) => {
    const t = new Date(s.at)
    return !Number.isNaN(t.getTime()) && t.toDateString() === key
  })
  return todays.length > 0 ? { items: todays, today: true } : { items, today: false }
}
