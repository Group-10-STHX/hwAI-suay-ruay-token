// สี ฟอนต์ ระยะ ทั้งหมดของทีม (FRONT_RULES §5)
// ห้ามเขียน hex ที่อื่นนอกจากไฟล์นี้ ถ้าจะเพิ่มสี แก้ FRONT_RULES.md ก่อน
import type { SessionState, Source } from '../api/types'

export const color = {
  bg: '#0A0A0C',
  surface: '#15151A',
  hud: '#FF2A2A',
  hudDim: '#7A1414',
  danger: '#FF0040',
  blessed: '#FFD54A',
  sulk: '#8A8A99',
  text: '#F2F2F2',
  textDim: '#9A9AA5',
} as const

export type ColorToken = keyof typeof color

export const providerAccent: Record<Source, { color: string; label: string }> = {
  'claude-code': { color: '#E07A4F', label: 'Claude Code' },
  chatgpt: { color: '#3FBF8F', label: 'ChatGPT' },
  terminal: { color: color.hud, label: 'Terminal' },
}

/** สีหลักของแต่ละ state (§4) */
export const stateColor: Record<SessionState, ColorToken> = {
  IDLE: 'hud',
  DEMANDING: 'hud',
  WATCHING: 'hud',
  PASSED: 'blessed',
  RETRY: 'hud',
  ANNOYED: 'danger',
  SULKING: 'sulk',
  RAGE_QUIT: 'danger',
  FORGIVE: 'blessed',
}

export const font = {
  display: "'Chakra Petch', 'IBM Plex Sans Thai', sans-serif", // หัวข้อ, ข้อความของน้อง
  mono: "'JetBrains Mono', ui-monospace, monospace", // level, score, timer
  body: "'IBM Plex Sans Thai', sans-serif",
} as const

/** ขั้นต่ำที่อ่านออกจากจอโปรเจกเตอร์ */
export const fontSize = {
  speech: 28,
  score: 48,
  body: 16,
  small: 13,
} as const

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 } as const

export const radius = { sm: 4, md: 10, lg: 16 } as const

export const shadow = {
  float: '0 8px 24px rgba(0, 0, 0, 0.45)', // เงาบางๆ ของ island (ไม่มีกรอบ)
} as const

export const motion = {
  blessFlashMs: 300,
  shakePx: 4,
  cardFlyMs: 400,
} as const

/** ใช้ใน style={{ color: v('hud') }} แทนการใส่ hex ตรงๆ */
export const v = (t: ColorToken) => `var(--${t})`

/** เรียกครั้งเดียวตอน mount ให้ CSS ใช้ var(--hud) ได้ */
export function applyTokens(root: HTMLElement = document.documentElement) {
  for (const [k, val] of Object.entries(color)) root.style.setProperty(`--${k}`, val)
  root.style.setProperty('--font-display', font.display)
  root.style.setProperty('--font-mono', font.mono)
  root.style.setProperty('--font-body', font.body)
  root.style.setProperty('--shake', `${motion.shakePx}px`)
  root.style.setProperty('--bless-ms', `${motion.blessFlashMs}ms`)
}
