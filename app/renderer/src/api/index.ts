// จุดเดียวที่ app/ ใช้ดึงข้อมูล เลือก real หรือ mock จาก VITE_USE_MOCK
import * as mock from '../mocks/mockFeed'
import * as realQueue from './queue'
import * as realStatus from './status'
import * as realVision from './vision'

export * from './types'

export const USE_MOCK = import.meta.env.VITE_USE_MOCK === '1'

export const subscribeQueue = USE_MOCK ? mock.subscribeQueue : realQueue.subscribeQueue
export const subscribeVision = USE_MOCK ? mock.subscribeVision : realVision.subscribeVision
export const subscribeStatus = USE_MOCK ? mock.subscribeStatus : realStatus.subscribeStatus
export const setEnabled = USE_MOCK ? mock.setEnabled : realStatus.setEnabled
export const sendTestRequest = USE_MOCK ? mock.sendTestRequest : realStatus.sendTestRequest
export const skipItem = USE_MOCK ? async (_id: string) => {} : realQueue.skipItem

// ของ DebugPanel (app/ ห้าม import mocks ตรง ต้องผ่าน api ตามทิศ app → api → mocks)
export { getMockControl, onMockControl, setMockControl, type MockControl } from '../mocks/mockFeed'
export { DEFAULT_QUEUE_SIZE, QUEUE_SIZES, SCENARIOS, type ScenarioName } from '../mocks/scenarios'
