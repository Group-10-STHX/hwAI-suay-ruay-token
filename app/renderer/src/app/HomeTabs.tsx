import type { CSSProperties } from 'react'
import { fontSize, radius, space, v } from '../theme/tokens'

// แถบแท็บของหน้าหลัก: กล้อง | หน้าหลัก · props เท่านั้น

export type HomeTab = 'camera' | 'home'

const TABS: { id: HomeTab; label: string }[] = [
  { id: 'camera', label: '● กล้อง' },
  { id: 'home', label: 'หน้าหลัก' },
]

const btn = (on: boolean): CSSProperties => ({
  flex: 1,
  height: 32,
  background: on ? v('surface') : 'transparent',
  color: on ? v('hud') : v('textDim'),
  font: 'inherit',
  fontSize: fontSize.small,
  letterSpacing: 1,
  border: `1px solid ${on ? v('hud') : v('surfaceRaised')}`,
  borderRadius: radius.sm,
  cursor: 'pointer',
  WebkitAppRegion: 'no-drag',
} as CSSProperties)

export function HomeTabs({ tab, onTab }: { tab: HomeTab; onTab: (t: HomeTab) => void }) {
  return (
    <nav data-wai-chrome style={{ display: 'flex', gap: space.xs, padding: `34px ${space.lg}px ${space.xs}px`, background: v('bg') }}>
      {TABS.map((t) => (
        <button key={t.id} className="mono" onClick={() => onTab(t.id)} aria-pressed={tab === t.id} style={btn(tab === t.id)}>
          {t.label}
        </button>
      ))}
    </nav>
  )
}
