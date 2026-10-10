import { QUEUE_POLL_MS, type AppStatus, type QueueSnapshot, type VisionEvent } from '../api/types'
import { DEFAULT_QUEUE_SIZE, SCENARIOS, scenarioSnapshot, type ScenarioName } from './scenarios'

// ยิง scenario เป็นคิว + vision event ปลอม
// avatar / camera-overlay / debug เป็นคนละหน้า จึงซิงก์ scenario ที่เลือกผ่าน BroadcastChannel
// (ใช้ได้ทั้งใน browser ธรรมดาและใน Electron) และจำค่าล่าสุดไว้ใน localStorage ให้หน้าที่เปิดทีหลัง

export type MockControl = { scenario: ScenarioName; queueSize: number }

const CHANNEL = 'wai-mock'
const STORAGE_KEY = 'wai-mock-control'
const VISION_FPS = 15

function readControl(): MockControl {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch {
    // ไม่มี localStorage ก็ใช้ค่า default
  }
  return { scenario: 'demand', queueSize: DEFAULT_QUEUE_SIZE.demand }
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
  const emit = () => onSnapshot(scenarioSnapshot(SCENARIOS[control.scenario], control.queueSize))
  emit()
  const timer = setInterval(emit, QUEUE_POLL_MS)
  const off = onMockControl(emit)
  return () => {
    clearInterval(timer)
    off()
  }
}

export function subscribeVision(onEvent: (e: VisionEvent) => void): () => void {
  const timer = setInterval(() => {
    onEvent(SCENARIOS[control.scenario].vision(performance.now() - startedAt))
  }, 1000 / VISION_FPS)
  return () => clearInterval(timer)
}

// ---------- หน้าหลัก ----------
let mockEnabled = true

export function subscribeStatus(onStatus: (s: AppStatus) => void): () => void {
  const emit = () =>
    onStatus({
      enabled: mockEnabled && !SCENARIOS[control.scenario].bypass,
      pending: control.queueSize,
      stats: { requests: 42, passed: 37, bypassed: 2 },
      lastSeen: { 'claude-code': Date.now() - 90_000 },
    })
  emit()
  const timer = setInterval(emit, 1000)
  return () => clearInterval(timer)
}

export async function setEnabled(enabled: boolean) {
  mockEnabled = enabled
}

export async function sendTestRequest() {
  setMockControl({ scenario: 'demand', queueSize: Math.min(5, control.queueSize + 1) })
}
