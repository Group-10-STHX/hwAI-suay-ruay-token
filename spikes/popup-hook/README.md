# SPIKE: hook → popup → skip

พิสูจน์ว่าส่ง prompt ใน Claude Code แล้ว popup เด้ง กดข้ามแล้ว AI ทำงานต่อ
**ยังไม่มีกล้อง** ใช้ปุ่ม "ข้าม (dev)" แทนการไหว้ · ดัก `UserPromptSubmit` (prompt) + `PreToolUse` (subagent: Claude `Task|Agent`, Codex `spawn_agent|Agent`) ทั้ง Claude Code และ Codex
ของจริงย้ายไป `/app/main` (#1) กับ `/integrations` (#4)

## รัน (3 terminal)

```bash
npm --prefix app/renderer run dev          # 1. renderer โหมดจริง :5173
npm --prefix spikes/popup-hook start       # 2. daemon :7777 + popup window
bash spikes/popup-hook/setup-sandbox.sh    # 3. ติด hook ใน ~/wai-sandbox (ไม่ global)
```

แล้ว `cd ~/wai-sandbox && claude` ส่ง prompt อะไรก็ได้ → popup ขอบขวาเด้ง → กดข้าม → AI ตอบ

## พฤติกรรม
| เหตุการณ์ | ผล |
|---|---|
| กดข้าม | hook exit 0 → AI ทำงาน |
| `WAI_BYPASS=1` | ผ่านทันที ไม่ยิง daemon |
| daemon ไม่ได้เปิด / ตาย | ผ่าน (fail-open) กันทีมใช้ Claude Code ไม่ได้ |
| หน้าหลัก (เปิดตอนเริ่มแอป) | สวิตช์เปิด/ปิด, ต่อ Claude Code/Codex แล้วยัง, สถิติ, ปุ่มลองไหว้ · ปิดแล้วยังอยู่บน menu bar |
| ไม่กดจนครบ 290 วิ | exit 2 "หมดเวลาไหว้" (hook timeout ตั้ง 300 วิ เพราะ default ของ UserPromptSubmit แค่ 30) |

## เพิ่มจาก contract (spike เท่านั้น)
- `POST /wai/skip/:id` แทนการไหว้
- `GET /wai/wait/:id` ตอบ `202 {pending:true}` เมื่อครบ 55 วิแล้วยังไม่ไหว้ hook วนถามใหม่
- `GET /wai/queue` ตอบ `{items, state, fail_count, bypass}`

## ข้อควรรู้จาก docs ของ Claude Code
- tool แตก subagent ชื่อ `Agent` แล้ว (เดิม `Task`) ใช้ matcher `Task|Agent`
- hook หมดเวลา = prompt ผ่านไปเลย ถ้าจะบล็อกต้องใส่ `onFailure: "block"`

## Tray (menu bar)
ไอคอน 🙏 บน menu bar (💤 = ปิด) · เมนู: สถานะ, จำนวนที่รอไหว้, เปิดใช้งาน (ติ๊กออก = bypass ทุกคำขอผ่านทันที + ปล่อยใบที่ค้าง), โชว์ popup, ออก
ไม่ขึ้นใน Dock · `WAI_BYPASS=1` = เริ่มแบบปิดอยู่ · ยังไม่มีไอคอนจริง (Windows ต้องมี)

## Shortcut (mac)
```bash
bash spikes/popup-hook/install-shortcut.sh              # สร้าง ~/Applications/ไหว้กูซะ.app
bash spikes/popup-hook/install-shortcut.sh --uninstall  # ลบ
```
กดเปิดจาก Spotlight/Launchpad → build renderer แล้วเปิดแอปจากไฟล์ (ไม่ต้องรัน vite) · เปิดซ้ำ = เด้งหน้าหลักของตัวเดิม
log: `~/Library/Logs/wai-kusa.log` · แอปชี้มาที่ path ของ repo นี้ ถ้าย้าย repo ให้รันใหม่

## Windows (ยังไม่ได้ทดสอบบนเครื่องจริง)
ต้องมี Node.js LTS + git · ใช้ PowerShell (5.1 ที่ติดมากับ Windows หรือ pwsh 7 ก็ได้)

**dev (3 terminal)** เหมือน mac
```powershell
npm --prefix app/renderer run dev          # 1. renderer :5173 (หรือ dev:mock)
npm --prefix spikes/popup-hook start       # 2. daemon :7777 + popup
powershell -ExecutionPolicy Bypass -File spikes\popup-hook\setup-sandbox.ps1   # 3. ติด hook ใน %USERPROFILE%\wai-sandbox
```
`setup-sandbox.ps1` ไม่เขียน JSON เอง เรียก `install()` ของ `install-hooks.mjs` (merge + backup + marker เหมือน onboarding) โดยให้ hook รันด้วย `electron.exe`
แล้ว `cd ~\wai-sandbox; claude` ส่ง prompt → popup เด้ง

**Shortcut (Start Menu)**
```powershell
powershell -ExecutionPolicy Bypass -File spikes\popup-hook\install-shortcut.ps1             # Start Menu
powershell -ExecutionPolicy Bypass -File spikes\popup-hook\install-shortcut.ps1 -Desktop    # + Desktop
powershell -ExecutionPolicy Bypass -File spikes\popup-hook\install-shortcut.ps1 -Uninstall  # ลบ
```
กด Win พิมพ์ "ไหว้กูซะ" → `wscript launch.vbs` (ซ่อนหน้าต่าง) → `launch.ps1` build renderer แล้วเปิด `electron.exe` พร้อม `WAI_RENDERER_URL=file:///C:/.../app/renderer/dist/`
ไฟล์อยู่ที่ `%LOCALAPPDATA%\waikusa\` (launch.vbs, launch.ps1, **log: `wai-kusa.log`**) · ย้าย repo = รันใหม่ · ไอคอนใช้ `assets\*.ico` ถ้ามี ไม่งั้นใช้ของ electron

**Codex**: เปิด `%USERPROFILE%\wai-sandbox` ใน Codex → `/hooks` กด trust เอง (ไม่ trust = hook ไม่รัน)

**รู้ไว้ก่อน**
- เขียนบน mac ยังไม่เคยรันบน Windows จริง · สคริปต์ .ps1 ต้องเป็น UTF-8 **มี BOM** (5.1 อ่านไทยเพี้ยนถ้าไม่มี) แก้ไฟล์แล้วอย่าให้ editor ลบ BOM
- คำสั่ง hook ที่ `install-hooks.mjs` สร้างตอนนี้เป็นแบบ POSIX (`WAI_HOOK=1 ELECTRON_RUN_AS_NODE=1 '...'`) ใช้บน cmd ไม่ได้ ต้องรอ shim `%USERPROFILE%\.waikusa\hook.cmd`
- SmartScreen/antivirus อาจเตือน `electron.exe` หรือ `wscript` · บางองค์กรปิด Windows Script Host → shortcut เปิดไม่ขึ้น
- execution policy: ใช้ `-ExecutionPolicy Bypass` เสมอ (launcher ก็ใส่ไว้แล้ว)
- tray บน Windows ต้องมี `.ico` · กล้องไม่ต้องขอสิทธิ์แบบ mac แต่ Windows Privacy → Camera ต้องเปิดให้แอป desktop
- เปิดตอนเข้าเครื่อง (onboarding) ยังชี้ไป path ของ mac

## Onboarding (เปิดแอปครั้งแรก)
ต้อนรับ → ขอกล้อง → ☐ Claude Code ☐ Codex (+ ปุ่มเปิด Codex ให้ trust) → ☐ เปิดตอนเข้าเครื่อง → เริ่มใช้งาน
เปิดใหม่ได้จากปุ่ม ⚙ ในหน้าหลัก · สถานะเก็บที่ `~/.waikusa/config.json` (ลบไฟล์นี้ = เห็น onboarding อีกรอบ)
- `install-hooks.mjs`: merge ลง settings เดิม ไม่ทับ hook อื่น, backup `.wai.bak` ครั้งแรก, ถอดเฉพาะของเรา (marker `WAI_HOOK=1`), JSON เสียอยู่แล้ว = ไม่แตะ
- hook รันด้วย Electron (`ELECTRON_RUN_AS_NODE=1`) ไม่ต้องมี node · dev = `~/wai-sandbox`, แอปที่ package = global (`WAI_HOOK_SCOPE` บังคับได้)
- เปิดตอนเข้าเครื่องตอน dev ชี้ไปที่ `~/Applications/ไหว้กูซะ.app` (ต้องลง shortcut ก่อน)
