// หน้าต่างสวดบาลี (ล้อเล่น): poll GET /wai/chant + ตอบ/ปิดผ่าน IPC ของ Electron
// contract ฝั่ง daemon: { active:false } | { active:true, id, phase, file, lines, started_at?, duration_ms? }

const DAEMON_URL = import.meta.env.VITE_DAEMON_URL ?? 'http://localhost:7777'
export const CHANT_POLL_MS = 500

export type ChantWord = { src: string; th: string; rom?: string }
export type ChantLine = { src: string; words: ChantWord[] }
export type ChantPhase = 'offer' | 'playing' | 'done'
export type ChantState =
  | { active: false }
  | {
      active: true
      id: string
      phase: ChantPhase
      file: string
      lines: ChantLine[]
      startedAt?: number
      durationMs?: number
      // เนื้อเพลงเดินตามเสียงจริง: บรรทัดที่กำลังสวด / เริ่มเมื่อไหร่ / เวลาโดยประมาณของบรรทัดนั้น
      line?: number
      lineStartedAt?: number
      lineMs?: number
    }

// ตัวอย่างบทสวด ใช้ตอนไม่มี bridge/daemon (mock) ให้ดูหน้าตาได้ในเบราว์เซอร์: เปิด /chant.html?mock
const MOCK_LINES: ChantLine[] = [
  {
    src: 'const total = price * qty',
    words: [
      { src: 'const', th: 'กนฺสฺตํ', rom: 'กัน-สะ-ตัง' },
      { src: 'total', th: 'โตตฺตํ', rom: 'โต-ตัง' },
      { src: '=', th: 'สมํ', rom: 'สะ-มัง' },
      { src: 'price', th: 'ปฺริสฺโส', rom: 'ปริด-โส' },
      { src: '*', th: 'คุโณ', rom: 'คุ-โณ' },
      { src: 'qty', th: 'กฺวนฺติ', rom: 'กวัน-ติ' },
    ],
  },
  {
    src: 'return total',
    words: [
      { src: 'return', th: 'ปฏินิวตฺตติ', rom: 'ปะ-ติ-นิ-วัด-ตะ-ติ' },
      { src: 'total', th: 'โตตฺตํ', rom: 'โต-ตัง' },
    ],
  },
]
const MOCK_MS_PER_WORD = 700

const query = typeof location !== 'undefined' ? new URLSearchParams(location.search) : undefined
const MOCK = import.meta.env.VITE_USE_MOCK === '1' || query?.has('mock') === true

let mockStart: number | undefined
let mockTotal = 0
function mockState(): ChantState {
  const total = MOCK_LINES.reduce((n, l) => n + l.words.length, 0)
  mockTotal = total * MOCK_MS_PER_WORD
  const base = { active: true as const, id: 'mock', file: 'sum.js', lines: MOCK_LINES, durationMs: mockTotal }
  if (mockStart === undefined) return { ...base, phase: 'offer' }
  const phase: ChantPhase = Date.now() - mockStart >= mockTotal ? 'done' : 'playing'
  return { ...base, phase, startedAt: mockStart }
}

type RawChant = {
  active?: boolean
  id?: string
  phase?: string
  file?: string
  lines?: { src?: string; words?: { src?: string; th?: string; rom?: string }[] }[]
  started_at?: number
  duration_ms?: number
  line?: number
  line_started_at?: number
  line_ms?: number
}

export function toChantState(raw: RawChant | null | undefined): ChantState {
  if (!raw || raw.active !== true || typeof raw.id !== 'string') return { active: false }
  const phase: ChantPhase = raw.phase === 'playing' || raw.phase === 'done' ? raw.phase : 'offer'
  const lines: ChantLine[] = (raw.lines ?? []).map((l) => ({
    src: typeof l.src === 'string' ? l.src : '',
    words: (l.words ?? [])
      .filter((w) => typeof w?.th === 'string')
      .map((w) => ({ src: w.src ?? '', th: w.th as string, rom: typeof w.rom === 'string' ? w.rom : undefined })),
  }))
  return {
    active: true,
    id: raw.id,
    phase,
    file: typeof raw.file === 'string' ? raw.file : 'ไฟล์ JS',
    lines,
    startedAt: typeof raw.started_at === 'number' ? raw.started_at : undefined,
    durationMs: typeof raw.duration_ms === 'number' && raw.duration_ms > 0 ? raw.duration_ms : undefined,
    line: typeof raw.line === 'number' && raw.line >= 0 ? raw.line : undefined,
    lineStartedAt: typeof raw.line_started_at === 'number' ? raw.line_started_at : undefined,
    lineMs: typeof raw.line_ms === 'number' && raw.line_ms > 0 ? raw.line_ms : undefined,
  }
}

/** poll GET /wai/chant ทุก 500ms คืนฟังก์ชันสำหรับหยุด */
export function subscribeChant(onState: (s: ChantState) => void, onError?: (e: unknown) => void): () => void {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const tick = async () => {
    try {
      if (MOCK) {
        if (!stopped) onState(mockState())
      } else {
        const res = await fetch(`${DAEMON_URL}/wai/chant`)
        if (!res.ok) throw new Error(`GET /wai/chant ${res.status}`)
        const raw = await res.json()
        if (!stopped) onState(toChantState(raw))
      }
    } catch (e) {
      onError?.(e)
    }
    if (!stopped) timer = setTimeout(tick, CHANT_POLL_MS)
  }
  tick()
  return () => {
    stopped = true
    clearTimeout(timer)
  }
}

/** ตอบคำถาม "อยากฟังไหม" · ปุ่ม [ฟัง] เท่านั้นที่เรียกด้วย true (ปุ่ม [ไม่ฟัง] วิ่งหนี กดไม่ได้) */
export async function answerChant(yes: boolean): Promise<{ ok: boolean }> {
  if (window.wai?.chantAnswer) return window.wai.chantAnswer(yes)
  if (yes && MOCK) mockStart = Date.now()
  return { ok: true }
}

/** ปิดหน้าต่าง (ไม่มี bridge = window.close()) */
/** เปิดรีโป paliscript (เครดิต) ผ่าน main · ไม่มี bridge = เปิดแท็บใหม่ */
export const PALISCRIPT_URL = 'https://github.com/maiaowmorseesom/sht9-paliscript'
export async function openPaliscript(): Promise<void> {
  if (window.wai?.openPaliscript) {
    await window.wai.openPaliscript()
    return
  }
  window.open(PALISCRIPT_URL, '_blank', 'noopener')
}

export function closeChant(): void {
  if (window.wai?.closeChant) window.wai.closeChant()
  else window.close()
}

/** mock: เริ่มใหม่ตั้งแต่ offer (ใช้ดูหน้าตาซ้ำ) */
export function resetMockChant(): void {
  mockStart = undefined
}
