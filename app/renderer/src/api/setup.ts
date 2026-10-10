// onboarding: คุยกับ main ผ่าน IPC (preload expose window.wai.setup) ไม่ผ่าน HTTP
// เพราะเป็นการแก้ไฟล์ settings ของผู้ใช้ ห้ามให้เว็บอื่นยิง localhost มาสั่งได้

export type HookTool = 'claude' | 'codex'
export type Result = { ok: boolean; error?: string; file?: string }

export type SetupStatus = {
  scope: 'sandbox' | 'global' // dev = sandbox (~/wai-sandbox) · แอปจริง = global
  folder: string // ต้องเปิด AI ในโฟลเดอร์นี้ถึงจะโดนดัก
  onboarded: boolean
  camera: 'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown'
  claude: { installed: boolean }
  codex: { installed: boolean; trusted: boolean; cli: boolean }
  loginItem: boolean
  canLoginItem: boolean
}

export type SetupBridge = {
  status: () => Promise<SetupStatus>
  hooks: (tool: HookTool, on: boolean) => Promise<Result>
  camera: () => Promise<{ ok: boolean }>
  loginItem: (on: boolean) => Promise<Result>
  onboarded: (done: boolean) => Promise<Result>
}

const NOT_IN_APP: Result = { ok: false, error: 'ต้องเปิดในแอป (ไม่ใช่ browser)' }

export const setup: SetupBridge = {
  status: async () => {
    if (!window.wai?.setup) throw new Error(NOT_IN_APP.error)
    return window.wai.setup.status()
  },
  hooks: async (tool, on) => window.wai?.setup?.hooks(tool, on) ?? NOT_IN_APP,
  camera: async () => window.wai?.setup?.camera() ?? { ok: false },
  loginItem: async (on) => window.wai?.setup?.loginItem(on) ?? NOT_IN_APP,
  onboarded: async (done) => window.wai?.setup?.onboarded(done) ?? NOT_IN_APP,
}
