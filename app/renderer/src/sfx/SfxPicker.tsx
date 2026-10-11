import type { CSSProperties } from 'react'
import { font, fontSize, radius, space, v } from '../theme/tokens'
import type { SfxLevel } from './policy'

const OPTIONS: { value: SfxLevel; label: string }[] = [
  { value: 'off', label: 'ปิด' },
  { value: 'few', label: 'น้อย' },
  { value: 'many', label: 'เยอะ' },
]

type Props = { value: SfxLevel; onChange: (l: SfxLevel) => void; label?: string }

export function SfxPicker({ value, onChange, label = 'เสียง' }: Props) {
  return (
    <div role="radiogroup" aria-label={label} style={wrap}>
      <span style={{ color: v('textDim'), fontSize: fontSize.small }}>{label}</span>
      {OPTIONS.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            style={{
              ...btn,
              color: on ? v('bg') : v('text'),
              background: on ? v('hud') : 'transparent',
              borderColor: on ? v('hud') : v('hudDim'),
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

const wrap: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: space.xs, fontFamily: font.body }
const btn: CSSProperties = {
  fontFamily: 'inherit',
  fontSize: fontSize.small,
  padding: `${space.xs}px ${space.sm}px`,
  border: '1px solid',
  borderRadius: radius.sm,
  cursor: 'pointer',
}
