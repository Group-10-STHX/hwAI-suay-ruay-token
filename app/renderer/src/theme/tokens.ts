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
  surfaceRaised: '#1E1E26', // ชั้นที่ยกขึ้นจาก surface (ลิ้นชัก, รางคันโยก, พื้นสถิติ) ดู FRONT_RULES "home variants"
} as const

export type ColorToken = keyof typeof color

export const providerAccent: Record<Source, { color: string; label: string }> = {
  'claude-code': { color: '#E07A4F', label: 'Claude Code' },
  // Codex ยังไม่มีสีของตัวเอง ใช้แถว "อื่นๆ" (hud) ไปก่อน ป้ายเป็นตัวหนังสือ
  codex: { color: color.hud, label: 'Codex' },
  chatgpt: { color: '#3FBF8F', label: 'ChatGPT' },
  // เว็บผ่าน extension: ใช้สีเดิมของ Claude Code / textDim ป้ายเป็นตัวหนังสือ
  'claude-web': { color: '#E07A4F', label: 'Claude (เว็บ)' },
  'gemini-web': { color: color.textDim, label: 'Gemini (เว็บ)' },
  // คำขอทดสอบจากปุ่ม "ลองไหว้" ในหน้าหลัก
  test: { color: color.textDim, label: 'ทดสอบ' },
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
  micro: 11, // ป้ายกำกับใต้ตัวเลข (หน้าหลัก)
  stat: 22, // ตัวเลขสถิติหน้าหลัก
  title: 26, // ชื่อแอปในร่างหน้าหลักแบบกะทัดรัด
} as const

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 } as const

export const radius = { sm: 4, md: 10, lg: 16 } as const

export const shadow = {
  float: '0 8px 24px rgba(0, 0, 0, 0.45)', // เงาบางๆ ของ island (ไม่มีกรอบ)
  /** เงาของแผ่นพื้นหลังตัวน้อง */
  backing: '0 6px 18px rgba(0, 0, 0, 0.5)',
  /** ตัวหนังสือที่ลอยบนจอโดยไม่มีพื้นหลัง ให้อ่านออกทั้งจอมืดและสว่าง */
  text: '0 1px 2px rgba(0, 0, 0, 0.6)',
  /** เงาเส้นน้อง Jason (เส้นสีอ่อน) ให้อ่านออกบนจอพื้นสว่าง ใช้กับ filter */
  ink: 'drop-shadow(0 0 1px rgba(0, 0, 0, 0.7)) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.45))',
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
