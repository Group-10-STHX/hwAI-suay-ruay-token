import type { CSSProperties } from 'react'
import { radius, space, v } from '../theme/tokens'

// สไตล์ร่วมของหน้าหลักกับ onboarding

// grid ไม่ใช่ flex: แถวไม่ถูกบีบจนข้อความหาย (เดิมสวิตช์ ONLINE โดนบีบ) เนื้อหาต้องพอดี window 520×680
export const page: CSSProperties = {
  height: '100%',
  overflow: 'auto',
  background: v('bg'),
  color: v('text'),
  padding: `${space.xl}px ${space.lg}px ${space.md}px`,
  display: 'grid',
  alignContent: 'start',
  gap: space.md,
  userSelect: 'none',
}

// แถบบนให้ลาก window ได้ (titleBarStyle: hiddenInset)
export const dragBar = { position: 'fixed', top: 0, left: 0, right: 0, height: 32, WebkitAppRegion: 'drag' } as CSSProperties

export const panel: CSSProperties = {
  display: 'block',
  width: '100%',
  background: v('surface'),
  color: 'inherit',
  font: 'inherit',
  border: `1px solid ${v('hudDim')}`,
  borderRadius: radius.md,
  padding: space.md,
}

export const row: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: `${space.sm}px 0`,
  borderBottom: `1px solid ${v('hudDim')}`,
}

export const ghostButton: CSSProperties = {
  background: 'transparent',
  color: v('text'),
  font: 'inherit',
  border: `1px dashed ${v('hud')}`,
  borderRadius: radius.md,
  padding: `${space.sm}px ${space.md}px`,
  cursor: 'pointer',
}
