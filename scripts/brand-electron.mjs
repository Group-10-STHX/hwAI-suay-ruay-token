#!/usr/bin/env node
// ตอน dev แอปรันบน Electron.app ของ node_modules → Dock โชว์ชื่อ "Electron" กับไอคอนอะตอม
// สคริปต์นี้แก้ bundle นั้นให้เป็นชื่อ "ไหว้กูซะ" + ไอคอนโลโก้ (spikes/popup-hook/assets/icon.png) · macOS เท่านั้น
// idempotent (รันซ้ำได้) · ล้มเหลวเงียบๆ (ไม่ขวางการรัน) · npm install ใหม่แล้ว bundle ถูกรีเซ็ต รัน dev อีกทีก็ใส่ให้เอง
//   node scripts/brand-electron.mjs        (npm run dev เรียกให้อัตโนมัติ)
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const APP_NAME = 'ไหว้กูซะ'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const APP = join(ROOT, 'spikes', 'popup-hook', 'node_modules', 'electron', 'dist', 'Electron.app')
const PLIST = join(APP, 'Contents', 'Info.plist')
const ICNS = join(APP, 'Contents', 'Resources', 'electron.icns')
const SOURCE = join(ROOT, 'spikes', 'popup-hook', 'assets', 'icon.png')
const STAMP = join(APP, 'Contents', 'Resources', '.wai-branded')

export function brandElectron({ log = () => {} } = {}) {
  if (process.platform !== 'darwin' || !existsSync(PLIST) || !existsSync(SOURCE)) return false
  // ใส่แล้วและไอคอนต้นทางไม่ได้เปลี่ยนหลังใส่ → ข้าม
  try {
    if (existsSync(STAMP)) {
      const { mtimeMs: s } = statSyncSafe(STAMP)
      if (s >= statSyncSafe(SOURCE).mtimeMs) return false
    }
  } catch { /* ใส่ใหม่ */ }
  const tmp = mkdtempSync(join(tmpdir(), 'wai-icon-'))
  try {
    const set = join(tmp, 'icon.iconset')
    mkdirSync(set)
    for (const s of [16, 32, 128, 256, 512]) {
      for (const [scale, suffix] of [[1, ''], [2, '@2x']]) {
        const px = s * scale
        if (px > 1024) continue
        execFileSync('sips', ['-z', String(px), String(px), SOURCE, '--out', join(set, `icon_${s}x${s}${suffix}.png`)], { stdio: 'ignore' })
      }
    }
    const out = join(tmp, 'icon.icns')
    execFileSync('iconutil', ['-c', 'icns', set, '-o', out], { stdio: 'ignore' })
    if (!existsSync(`${ICNS}.orig`)) copyFileSync(ICNS, `${ICNS}.orig`)
    copyFileSync(out, ICNS)
    for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
      execFileSync('plutil', ['-replace', key, '-string', APP_NAME, PLIST], { stdio: 'ignore' })
    }
    const now = new Date()
    utimesSync(APP, now, now) // ให้ LaunchServices/Dock อ่านใหม่
    execFileSync('touch', [STAMP])
    log(`[brand] Electron.app → "${APP_NAME}" + ไอคอนโลโก้`)
    return true
  } catch (e) {
    log(`[brand] ข้าม (${e.message})`)
    return false
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

import { statSync } from 'node:fs'
const statSyncSafe = (p) => statSync(p)

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(brandElectron({ log: console.log }) ? 'ok' : 'ไม่มีอะไรต้องทำ (หรือไม่ใช่ macOS)')
}
