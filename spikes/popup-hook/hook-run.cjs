// Fallback launcher ของ hook เมื่อเครื่องผู้ใช้ไม่มี node: คำสั่งเป็น `"<electron>" "hook-run.cjs" <source> --wai-hook`
// ตั้ง ELECTRON_RUN_AS_NODE หลัง process เริ่มแล้วสายเกินไป จึง spawn Electron อีกตัวพร้อม env นั้นแล้วรัน hook.mjs ต่อ
// (stdin/stdout/stderr + exit code ส่งต่อตรงๆ) · ถ้ารันด้วย node ธรรมดาก็แค่ import hook.mjs
'use strict'
const path = require('node:path')
const hook = path.join(__dirname, 'hook.mjs')

if (process.versions.electron && !process.env.ELECTRON_RUN_AS_NODE) {
  const { app } = require('electron')
  app.dock?.hide?.()
  const { spawn } = require('node:child_process')
  const child = spawn(process.execPath, [hook, ...process.argv.slice(2)], {
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  })
  child.on('error', () => app.exit(0)) // fail-open เหมือน hook.mjs
  child.on('exit', (code) => app.exit(code ?? 0))
} else {
  process.argv.splice(1, 1, hook) // argv[2] = source เหมือนเดิม
  import(hook)
}
