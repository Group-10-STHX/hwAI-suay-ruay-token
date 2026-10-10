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

## Onboarding (เปิดแอปครั้งแรก)
ต้อนรับ → ขอกล้อง → ☐ Claude Code ☐ Codex (+ ปุ่มเปิด Codex ให้ trust) → ☐ เปิดตอนเข้าเครื่อง → เริ่มใช้งาน
เปิดใหม่ได้จากปุ่ม ⚙ ในหน้าหลัก · สถานะเก็บที่ `~/.waikusa/config.json` (ลบไฟล์นี้ = เห็น onboarding อีกรอบ)
- `install-hooks.mjs`: merge ลง settings เดิม ไม่ทับ hook อื่น, backup `.wai.bak` ครั้งแรก, ถอดเฉพาะของเรา (marker `WAI_HOOK=1`), JSON เสียอยู่แล้ว = ไม่แตะ
- hook รันด้วย Electron (`ELECTRON_RUN_AS_NODE=1`) ไม่ต้องมี node · dev = `~/wai-sandbox`, แอปที่ package = global (`WAI_HOOK_SCOPE` บังคับได้)
- เปิดตอนเข้าเครื่องตอน dev ชี้ไปที่ `~/Applications/ไหว้กูซะ.app` (ต้องลง shortcut ก่อน)
