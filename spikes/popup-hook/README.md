# SPIKE: hook → popup → skip

พิสูจน์ว่าส่ง prompt ใน Claude Code แล้ว popup เด้ง กดข้ามแล้ว AI ทำงานต่อ
**กล้องต่อแล้ว**: หน้าต่างกล้องที่ซ่อนอยู่ (`vision/worker`) เปิดเฉพาะตอนมีคนรอไหว้ ส่ง VisionEvent ~15 fps ให้ popup/หน้าหลัก และไหว้ผ่าน 1 ครั้ง = ปลดคำขอเก่าสุด 1 ใบ · ปุ่ม "ข้าม (dev)" ยังอยู่ไว้ทดสอบ · `WAI_DEBUG_VISION=1` พิมพ์สิ่งที่กล้องเห็นทุก ~2 วิ · ดัก `UserPromptSubmit` (prompt) + `PreToolUse` (subagent: Claude `Task|Agent`, Codex `spawn_agent|Agent`) ทั้ง Claude Code และ Codex
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

## หนีเมาส์ (ANNOYED, FRONT_RULES §4)
หัวคิวอยู่ state ANNOYED (fail 3–4) → popup วิ่งหนีเคอร์เซอร์ ทำใน main เพราะ renderer มองไม่เห็นเมาส์นอก window
- `flee.mjs` (pure, เทสใน `test/flee.test.mjs`): เมาส์เข้ามาใกล้ขอบ window ≤120px (หรืออยู่ข้างใน) → glide หนีไปจุดที่ห่างเมาส์ ~220px ที่ใกล้สุด (ทีละ 6–28px/tick, ไถไปตามขอบจอได้ ไม่วิ่งย้อนผ่านเมาส์) หยุดเมื่อเมาส์ห่าง ≥170px · โดนต้อนติดขอบ → วาร์ปไปอีกฝั่งของจอ (พัก 600ms ก่อนวาร์ปซ้ำ)
- ห้ามออกนอก workArea ของจอที่ window อยู่ (margin 16px) · ขนาดคงที่ 380×600 (`setBounds` ด้วยค่าคงที่) · ห้ามบังหน้าต่างกล้องถ้ามันโผล่ · หน้าหลักพยายามไม่บัง
- timer ~30 fps มีเฉพาะตอน ANNOYED กับตอน glide กลับที่เดิม (ขอบขวา กลางจอ) · คิวหมด = วางกลับทันทีแล้วหยุด · IDLE ไม่มี timer
- IPC ถึง Avatar window: `wai:flee` `{ active, fleeing }` ส่งเฉพาะตอนเปลี่ยน (active = โหมดหนีเปิด, fleeing = ขยับภายใน 300ms) · renderer ฟังผ่าน `window.wai.onFlee(cb)` คืนฟังก์ชันเลิกฟัง
- ปิด: `WAI_NO_FLEE=1` หรือ tray ติ๊ก "หนีเมาส์" ออก (ตอนต้องกดปุ่มข้าม dev) · `WAI_DEBUG_FLEE=1` พิมพ์ทุกการขยับ

ลองคู่กับตัวที่รันอยู่ได้ (userData/โฟลเดอร์ daemon แยกใน temp, ไม่เปิดกล้อง, ไม่ sync เว็บ, ไม่เปิดหน้าหลักเอง):
```bash
WAI_DEV_INSTANCE=1 WAI_PORT=7778 WAI_DEBUG_FLEE=1 WAI_DEV_CURSOR=984,435 npm --prefix spikes/popup-hook start
curl -XPOST localhost:7778/wai/request -d '{"session_id":"t"}'
curl -XPOST localhost:7778/wai/dev/fail   # ×3 = ANNOYED · /wai/dev/pass = ไหว้ผ่าน (dev instance เท่านั้น)
```
`WAI_DEV_CURSOR=x,y` = เมาส์ปลอม (ไม่ต้องขยับเมาส์จริง) · renderer ยังคุยกับ :7777 ตาม `VITE_DAEMON_URL`

## Tray (menu bar)
ไอคอน 🙏 บน menu bar (💤 = ปิด) · เมนู: สถานะ, จำนวนที่รอไหว้, เปิดใช้งาน (ติ๊กออก = bypass ทุกคำขอผ่านทันที + ปล่อยใบที่ค้าง), หนีเมาส์, โชว์ popup, ออก
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
- `install-hooks.mjs`: merge ลง settings เดิม ไม่ทับ hook อื่น, backup `.wai.bak` ครั้งแรก, ถอดเฉพาะของเรา (marker `--wai-hook` ท้ายคำสั่ง · รู้จัก `WAI_HOOK=1` รุ่นเก่าด้วย), JSON เสียอยู่แล้ว = ไม่แตะ
- hook รันด้วย `node` จาก PATH (ไม่ต้องมี env prefix ใช้ได้ทั้ง Windows/mac) · ไม่มี node → Electron + `hook-run.cjs` (spawn ตัวเองพร้อม `ELECTRON_RUN_AS_NODE=1`) · dev = `~/wai-sandbox`, แอปที่ package = global (`WAI_HOOK_SCOPE` บังคับได้)
- เปิดตอนเข้าเครื่องตอน dev ชี้ไปที่ `~/Applications/ไหว้กูซะ.app` (ต้องลง shortcut ก่อน)

## โหมด dev: เก็บคลิปการไหว้ (คุณภาพต่ำ แบบกล้องวงจรปิด)
เปิดด้วย `WAI_DEV_RECORD=1` หรือใส่ `"devRecord": true` ใน `~/.waikusa/config.json` (ค่าเริ่มต้นปิด)
- 1 คลิป = 1 การไหว้ (จากเริ่มยกมือจนผ่าน/ไม่ผ่าน + หางสั้นๆ) ขาวดำ 320×180 ~6 fps ~90 kbps มีแถบเวลา
- เก็บใน `~/.waikusa/clips/<วันที่>/HHMMSS_<pass|fail>_L<ระดับ>_s<คะแนน>.webm` และบรรทัดใน `clips/index.jsonl`
- ไม่ออกจากเครื่อง ไม่ส่งขึ้นเว็บ · เก็บล่าสุด 60 คลิป เกินแล้วลบเฉพาะคลิปเก่าสุดในโฟลเดอร์ `clips/` นี้เท่านั้น
- ท่อนที่แค่กะพริบสั้นกว่า 0.3 วินาทีไม่เก็บ
- ทดสอบตรรกะ: `node --test vision/worker/clip-plan.test.mjs`
