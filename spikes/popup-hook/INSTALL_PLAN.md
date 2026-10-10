# แผนทำให้ติดตั้งง่ายแบบ vorssaint-utils

อ้างอิง: https://github.com/vorssaint/vorssaint-utils (README, `Tools/uninstall.sh`, `.github/workflows/release.yml`, `docs/TROUBLESHOOTING.md`, `OnboardingView.swift`, `LaunchAtLogin.swift`, `UpdateService.swift`, cask ใน homebrew-cask)

## เขาทำยังไง
- ไม่มี `curl | sh` · ติดตั้งด้วย `brew install --cask vorssaint` หรือโหลด `.dmg` จาก Releases แล้วลากเข้า Applications
- แอป Swift native, mac อย่างเดียว · เซ็น Developer ID + notarize เลยไม่โดน Gatekeeper
- เปิดครั้งแรก: onboarding 4 ขั้น (welcome → เลือกฟีเจอร์ → ขอสิทธิ์เฉพาะที่ใช้ → done)
- ใช้งาน: ไอคอนเดียวบน menu bar, เปิดตอน login, อัปเดตเองจาก GitHub Releases
- ถอน: `brew uninstall --cask` / `Tools/uninstall.sh` ลบเกลี้ยง · dev build ใช้ bundle id แยก

## ลอกได้
- แจกเป็นแอปสำเร็จรูป (dmg/exe ด้วย electron-builder) บน GitHub Releases ไม่ใช่สคริปต์
- onboarding ให้เลือกเอง: ต่อ Claude Code? ต่อ Codex? เปิดตอน login? แล้วค่อยขอกล้อง
- tray ตัวเดียว + `app.setLoginItemSettings`
- ปุ่มถอน hook ที่ลบเฉพาะของเราออกจาก settings ของคนอื่น (สำคัญกว่าของเขา)
- dev = sandbox, release = global (แยกเหมือน bundle id แยก)

## ลอกไม่ได้ / ไม่คุ้มช่วง hackathon
- Developer ID + notarize ($99/ปี) → dmg ของเราต้องคลิกขวา → Open ครั้งแรก, Windows ต้อง More info → Run anyway
- homebrew-cask ทางการไม่ได้ → ทำ tap เองทีหลัง
- เราต้องไปแก้ config ของแอปอื่น (`~/.claude/settings.json`, `~/.codex/hooks.json`) + Codex ต้องกด trust เอง → ต้องออกแบบเอง

## แผนของเรา
**เปิดครั้งแรก (onboarding ในหน้าหลัก)**
1. ต้อนรับ + บอกว่าจะแก้ไฟล์ไหน
2. ขอกล้อง (mac: `NSCameraUsageDescription` + `systemPreferences.askForMediaAccess('camera')`)
3. ☐ ต่อ Claude Code (ปิดไว้ก่อน) → merge ลง `~/.claude/settings.json` ไม่ทับของเดิม, ใส่ marker, backup `.bak`
4. ☐ ต่อ Codex → เขียน `~/.codex/hooks.json` แล้วเปิด Terminal ให้ `/hooks` กด trust เอง อ่าน `[hooks.state]` ใน `~/.codex/config.toml` มาโชว์สถานะ (อ่านอย่างเดียว ห้ามเขียน trust แทนผู้ใช้)
5. ☐ เปิดตอนเข้าเครื่อง
6. อยู่บน tray

**คำสั่งใน hook**
- ไม่พึ่ง `node` ของผู้ใช้: `ELECTRON_RUN_AS_NODE=1 "<แอป>" hook.mjs claude-code`
- hook ต้องอยู่นอก asar หรือก๊อปไป `~/.waikusa/` · Codex trust ผูกกับ path + hash → hooks.json ต้องชี้ shim ที่ path คงที่ ไม่งั้นต้อง trust ใหม่ทุกเวอร์ชัน

**ถอน**: ปุ่ม "ถอด hook" ในหน้าหลัก/tray (ลบเฉพาะ entry ที่มี marker) + ปิด login item + ลบ `~/.waikusa` · ต้องทดสอบว่าลบแอปทิ้งโดยไม่ถอด hook แล้ว Claude Code ยัง fail-open

| | mac | Windows |
|---|---|---|
| ไฟล์ | dmg (ad-hoc) | NSIS exe |
| เตือนครั้งแรก | คลิกขวา Open | More info → Run anyway |
| เปิด Codex CLI | osascript → Terminal (มีแล้ว) | `start cmd /k codex` (หา path เอง) |
| config | `~/.claude`, `~/.codex` | `%USERPROFILE%\.claude`, `.codex` |
| tray | emoji ได้ | ต้องมี `.ico` |

## ความเสี่ยง
- hook global ทำ Claude Code ของทีมพัง → global ได้เฉพาะ build ที่ package แล้ว + ผู้ใช้ติ๊กเอง · dev ใช้ sandbox
- เขียน settings.json พัง → parse/merge + backup เสมอ
- ไม่เซ็นโค้ด → ต้องมีรูปวิธีเปิดใน README
- port 7777 ชน / antivirus บน Windows

## ลำดับ
**P0 (เดโม)**: electron-builder dmg+nsis (#6) → `integrations/install-hooks.mjs` install/uninstall/status (#4) → onboarding + ปุ่มถอด hook ในหน้าหลัก (Front) → README ติดตั้ง/ถอน → ทดสอบบนเครื่องที่ไม่มี node/repo
**ทีหลัง**: brew tap, CI release ตอน push tag, auto update, เซ็นโค้ด, Linux, `npx waikusa-hooks install`
