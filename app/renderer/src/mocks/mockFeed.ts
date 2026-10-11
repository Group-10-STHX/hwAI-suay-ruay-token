import { QUEUE_POLL_MS, type AppStatus, type FleeState, type QueueSnapshot, type VisionEvent } from '../api/types'
import type { SetupBridge, SetupStatus } from '../api/setup'
import { getMockAvatar, onMockAvatar } from './mockAvatars'
import { DEFAULT_QUEUE_SIZE, SCENARIOS, scenarioSnapshot, type ScenarioName } from './scenarios'

// ยิง scenario เป็นคิว + vision event ปลอม
// avatar / camera-overlay / debug เป็นคนละหน้า จึงซิงก์ scenario ที่เลือกผ่าน BroadcastChannel
// (ใช้ได้ทั้งใน browser ธรรมดาและใน Electron) และจำค่าล่าสุดไว้ใน localStorage ให้หน้าที่เปิดทีหลัง

/** หนีเมาส์ปลอม (มีผลเฉพาะ state ANNOYED): off = ไม่หนี, auto = วิ่ง/หยุดสลับทุก 1.5 วิ, hold = วิ่งค้าง */
export type MockFlee = 'off' | 'auto' | 'hold'

export type MockControl = { scenario: ScenarioName; queueSize: number; flee: MockFlee }

const CHANNEL = 'wai-mock'
const STORAGE_KEY = 'wai-mock-control'
const VISION_FPS = 15
const FLEE_TOGGLE_MS = 1500

function readControl(): MockControl {
  const fallback: MockControl = { scenario: 'demand', queueSize: DEFAULT_QUEUE_SIZE.demand, flee: 'auto' }
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    // ค่าเก่าใน localStorage ยังไม่มี flee เติม default ให้
    if (saved) return { ...fallback, ...JSON.parse(saved) }
  } catch {
    // ไม่มี localStorage ก็ใช้ค่า default
  }
  return fallback
}

let control = readControl()
let startedAt = performance.now()
const listeners = new Set<(c: MockControl) => void>()
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null

function apply(next: MockControl) {
  control = next
  startedAt = performance.now()
  listeners.forEach((l) => l(control))
}

channel?.addEventListener('message', (e: MessageEvent<MockControl>) => apply(e.data))

/** ใช้ใน DebugPanel เปลี่ยน scenario ให้ทุกหน้า */
export function setMockControl(next: MockControl) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
  channel?.postMessage(next)
  apply(next)
}

export function getMockControl(): MockControl {
  return control
}

export function onMockControl(cb: (c: MockControl) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function subscribeQueue(onSnapshot: (s: QueueSnapshot) => void): () => void {
  const emit = () => onSnapshot({ ...scenarioSnapshot(SCENARIOS[control.scenario], control.queueSize), avatar: getMockAvatar() })
  emit()
  const timer = setInterval(emit, QUEUE_POLL_MS)
  const off = onMockControl(emit)
  const offAvatar = onMockAvatar(emit)
  return () => {
    clearInterval(timer)
    off()
    offAvatar()
  }
}

export function subscribeVision(onEvent: (e: VisionEvent) => void): () => void {
  const timer = setInterval(() => {
    onEvent(SCENARIOS[control.scenario].vision(performance.now() - startedAt))
  }, 1000 / VISION_FPS)
  return () => clearInterval(timer)
}

/** แทน IPC wai:flee: หนีเฉพาะ scenario ที่ state = ANNOYED ส่งเมื่อค่าเปลี่ยนเท่านั้น (เหมือน main) */
export function subscribeFlee(onFlee: (s: FleeState) => void): () => void {
  let last: FleeState | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  const emit = (next: FleeState) => {
    if (last && last.active === next.active && last.fleeing === next.fleeing) return
    last = next
    onFlee(next)
  }
  const sync = () => {
    clearInterval(timer)
    timer = undefined
    const active = SCENARIOS[control.scenario].state === 'ANNOYED' && control.flee !== 'off'
    if (!active) return emit({ active: false, fleeing: false })
    if (control.flee === 'hold') return emit({ active: true, fleeing: true })
    // auto: เริ่มด้วยวิ่งเลยจะได้เห็นทันที แล้วสลับวิ่ง/หยุดไปเรื่อยๆ (เฉพาะตอน ANNOYED ไม่วนตอนว่าง)
    let fleeing = true
    emit({ active: true, fleeing })
    timer = setInterval(() => {
      fleeing = !fleeing
      emit({ active: true, fleeing })
    }, FLEE_TOGGLE_MS)
  }
  sync()
  const off = onMockControl(sync)
  return () => {
    clearInterval(timer)
    off()
  }
}

// ---------- หน้าหลัก ----------
let mockEnabled = true

export function subscribeStatus(onStatus: (s: AppStatus) => void): () => void {
  const emit = () =>
    onStatus({
      enabled: mockEnabled && !SCENARIOS[control.scenario].bypass,
      pending: control.queueSize,
      stats: {
        requests: 42,
        passed: 37,
        bypassed: 2,
        // token = ระดับ×10 + 20 ถ้าไหว้สวย (docs/wai-data-contract.md) สูงสุด 50 ต่อครั้ง
        today: { wais: 37, passed: 30, beautiful: 9, tokens: 630 },
        total: { wais: 312, passed: 270, beautiful: 71, tokens: 5470 },
        bestScore: 96,
        days: [4, 11, 7, 15, 9, 22, 37].map((w, i) => ({
          day: `2026-10-${String(5 + i).padStart(2, '0')}`,
          wais: w,
          passed: Math.round(w * 0.8),
          beautiful: Math.round(w * 0.3),
          tokens: w * 17,
        })),
      },
      lastSeen: { 'claude-code': Date.now() - 90_000 },
      avatar: getMockAvatar(),
      monitor: mockMonitor,
    })
  emit()
  const timer = setInterval(emit, 1000)
  return () => clearInterval(timer)
}

export async function setEnabled(enabled: boolean) {
  mockEnabled = enabled
}

let mockMonitor = false
export async function setMonitor(monitor: boolean) {
  mockMonitor = monitor
}

export async function sendTestRequest() {
  setMockControl({ ...control, scenario: 'demand', queueSize: Math.min(5, control.queueSize + 1) })
}

// ---------- onboarding ----------
const mockSetupState: SetupStatus = {
  scope: 'sandbox',
  folder: '~/wai-sandbox',
  onboarded: false,
  camera: 'not-determined',
  claude: { installed: false },
  codex: { installed: false, trusted: false, cli: true },
  loginItem: false,
  canLoginItem: true,
}

export const mockSetup: SetupBridge = {
  status: async () => structuredClone(mockSetupState),
  hooks: async (tool, on) => {
    mockSetupState[tool].installed = on
    return { ok: true, file: `mock/${tool}` }
  },
  camera: async () => {
    mockSetupState.camera = 'granted'
    return { ok: true }
  },
  loginItem: async (on) => {
    mockSetupState.loginItem = on
    return { ok: true }
  },
  onboarded: async (done) => {
    mockSetupState.onboarded = done
    return { ok: true }
  },
}
