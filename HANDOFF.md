# HANDOFF · ใครรับช่วงต่ออะไร

สำหรับเพื่อนในทีมที่จะมารับงานต่อจาก spike · ภาพรวมแอปดู [README.md](README.md) · แผนเต็มดู [artifact.md](artifact.md)
อ้างโค้ดด้วย **ชื่อฟังก์ชัน / route** ไม่ใช่เลขบรรทัด เพราะ `spikes/popup-hook/main.mjs` ยังโดนแก้อยู่ (Windows)

---

## 1. สถานะตอนนี้

**ทำงานจริง end-to-end บน mac** (ทดสอบแล้ว)
- ส่ง prompt ใน Claude Code ที่ `~/wai-sandbox` → hook ยิง daemon :7777 → popup น้องหุ่นเด้งขอบขวา → กด "ข้าม (dev) ▶" → AI ทำงานต่อ
- AI แตก subagent (Claude `Task|Agent`, Codex `spawn_agent|Agent`) → ได้การ์ดเพิ่มอีกใบ ต้องปลดทีละใบ
- Codex: ทำงานทั้ง CLI และแอป Codex หลังกด trust ใน `/hooks`
- tray 🙏/💤 (เปิด/ปิด = bypass, จำนวนรอไหว้, เปิดหน้าหลัก, ออก) · เปิดได้ตัวเดียว
- หน้าหลัก: สวิตช์เปิด/ปิด, ต่อ Claude Code/Codex แล้วยัง, สถิติ, ปุ่ม "ลองไหว้ (เด้ง popup ทดสอบ)"
- onboarding: กล้อง → ☐ Claude Code ☐ Codex (merge + backup + ถอดได้) → ☐ เปิดตอนเข้าเครื่อง
- shortcut `~/Applications/ไหว้กูซะ.app` (build renderer แล้วโหลดจาก `file://`)
- WAI-NET leaderboard (`extras/web`) รันได้กับ mock store แต่ยังไม่ได้ต่อกับ daemon

**ยัง mock / ยังไม่มี**
- กล้อง + Vision จริง → ใช้ปุ่มข้ามแทน (`POST /wai/skip/:id`) · `window.wai.onVisionEvent` ใน `preload.cjs` เป็นฟังก์ชันว่าง
- state ความโกรธใน daemon → `/wai/queue` ตอบ `state` แค่ `DEMANDING`/`IDLE` และ `fail_count: 0` ตลอด · UI ของ RETRY…FORGIVE มีแล้วแต่ดูได้ผ่าน mock (`npm --prefix app/renderer run dev:mock` → `debug.html`)
- TTS / เสียง (#5), daemon ตัวจริง `/app/main` (#1), `/integrations` (#4), electron-builder dmg/exe (#6)
- Windows: กำลังทำบน branch `windows` (shim `~/.waikusa/hook.cmd`, ไอคอน tray PNG, `install-shortcut.ps1`, `setup-sandbox.ps1`) **ยังไม่ได้ทดสอบบนเครื่องจริง** ดู [spikes/popup-hook/README.md](spikes/popup-hook/README.md#windows-ยังไม่ได้ทดสอบบนเครื่องจริง)

---

## 2. ต่อจากนี้ใครทำอะไร

### #1 Core → `/app/main` (ยังไม่มีโฟลเดอร์)
**เอาจาก spike** (`spikes/popup-hook/`)
- `main.mjs`: HTTP `server` (route `request`, `wait`, `queue`, `skip`, `status`, `enabled`), ตัวแปร `queue` / `results` / `waiters`, `resolve()`, `setInterval` ที่ทิ้งการ์ดเกิน 300 วิ, `setEnabled()`, `updateTray()`, `createWindow()`, `openHome()`, single instance lock
- IPC ทั้งหมดใน `main.mjs`: `wai:open-codex-hooks`, `wai:setup-status`, `wai:hooks`, `wai:camera`, `wai:login-item`, `wai:onboarded` + bridge `preload.cjs` (`window.wai`)
- config `~/.waikusa/config.json` (`readConfig()` / `saveConfig()`)

**ต้องส่งกลับให้คนอื่น**
- `/wai/queue`: ให้ `state` กับ `fail_count` เป็นค่าจริงจาก state machine (ตอนนี้ hard-code) · คง `created_at` (epoch **ms**) และ `source` ต่อ item ไว้ (spike ส่งแล้ว) · ล็อกรูปแบบ `{items, state, fail_count, bypass}` ลง contract (artifact.md ยังเขียนว่าเป็น array เปล่า)
- state machine ความโกรธต่อ session: RETRY (1–2) → ANNOYED (3–4, ต้อง Lv ≥ 2) → SULKING (5) → RAGE_QUIT (6) → FORGIVE (ไหว้ Lv3) + `POST /wai/forgive/:session_id`
- ใส่ endpoint ใหม่ (`skip`, `status`, `enabled`, 202 pending) ลง **`CLAUDE.md` ที่ root** (ยังไม่มีไฟล์นี้) แล้วบอกกลุ่ม
- IPC ส่ง `vision:event` จากหน้าต่างกล้องไป Avatar/overlay · `setIgnoreMouseEvents` ให้คลิกทะลุพื้นโปร่งใส · IPC ขยับ window สำหรับ "หนีเมาส์" ตอน ANNOYED (ห้ามออกนอกจอ ห้ามบัง webcam)
- เรียก `webSync.record()` ตอนตัดสินผล ตาม [extras/web/docs/INTEGRATION.md](extras/web/docs/INTEGRATION.md) (ห้าม await บน hot path)

### #3 Vision → `/vision`
**มีแล้ว**: `vision/playground/mediapipe.html` (heuristic + level 0–3), `recorder.html`, `CAPTURE_PLAN.md`, `MEDIAPIPE_TUNING.md`, `prototype/lab/`

**ต้องส่งให้** (type อยู่ที่ `app/renderer/src/api/types.ts`, adapter เติม default ใน `src/api/vision.ts` `toVisionEvent()`)
- ยิงผ่าน IPC channel `vision:event` ~15 fps
- ฟิลด์: `isWai`, `level` 0–3, `score` 0–100, `holdMs` + ขอเพิ่ม `reasons: WaiReason[]`, `facePresent`, `snapshotId?`, `style?`
- นับว่าผ่านเมื่อค้างท่า **≥ 1000 ms**
- `WaiReason`: `NO_PERSON`, `FACE_HIDDEN`, `HANDS_APART`, `FINGERS_NOT_UP`, `HANDS_TOO_LOW`, `NOT_BOWING`, `ASYMMETRIC`, `HOLD_TOO_SHORT` (ข้อความไทย map ที่ `src/states/copy.ts` ที่เดียว)
- หน้าต่าง webcam เป็นของ Vision · Front วาด overlay ทับ (`src/app/CameraOverlayWindow.tsx`)

### #4 Integrations → `/integrations` (ยังไม่มีโฟลเดอร์)
**เอาจาก spike**
- `spikes/popup-hook/hook.mjs`: อ่าน stdin → `POST /wai/request` → long-poll `GET /wai/wait/:id` (202 = วนใหม่) → exit 0/2 · `GIVE_UP_MS` 290 วิ · `WAI_BYPASS=1` · fail-open ถ้า daemon ไม่ตอบ
- `spikes/popup-hook/install-hooks.mjs`: `install()`, `uninstall()`, `installed()`, `codexTrusted()`, `TOOLS` (matcher ต่อเครื่องมือ), `MARKER` = `WAI_HOOK=1`, backup `.wai.bak`
- `setup-sandbox.sh` เป็นรุ่นเก่า (เขียนทับ, ใช้ `node`, ไม่มี marker) ควรเลิกใช้ ให้ทุกทางไปผ่าน `install()`

**ต้องแก้ / ส่งกลับ**
- `rage_quit`: artifact.md บอกให้ตอบ `continue:false` แต่ `hook.mjs` แค่ exit 2
- รู: daemon รีสตาร์ทหลัง `request` → `wait` ตอบ 404 → hook exit 2 "ไหว้ไม่สวย" (บล็อก ไม่ใช่ fail-open)
- คำสั่ง hook ตอนนี้เป็น POSIX (`WAI_HOOK=1 ELECTRON_RUN_AS_NODE=1 '…'`) ใช้บน cmd ไม่ได้ → shim `~/.waikusa/hook.cmd` (กำลังทำ) · path ของ shim ต้องคงที่ ไม่งั้น Codex ต้อง trust ใหม่ทุกเวอร์ชัน
- shell wrapper / browser extension (ตัดได้ถ้าไม่ทัน: extension อยู่ในลิสต์ตัด scope)

### #5 Voice → `/voice` (ยังไม่มีโฟลเดอร์)
- edge-tts เสียงไทย พูดตาม state · **ใช้ข้อความจาก `app/renderer/src/states/copy.ts`** จะได้ตรงกับบนจอ
- ต้องตกลงกับ #1 ว่ารับ state ทางไหน (IPC หรือ poll `/wai/queue`)

### #6 Extras & Ship → `/extras`
- `extras/web` เสร็จฝั่ง web แล้ว เหลือ: Supabase จริง, deploy URL, เอา contract daemon → web ใส่ root `CLAUDE.md`
- electron-builder dmg + nsis ตาม [INSTALL_PLAN.md](spikes/popup-hook/INSTALL_PLAN.md) · hook ต้องอยู่นอก asar (หรือก๊อปไป `~/.waikusa/`) · แอปที่ package แล้ว `SCOPE` = global
- ไอคอนจริง (tray ตอนนี้ใช้ `nativeImage.createEmpty()` + emoji ใน title, Windows ต้องมีไอคอน)
- สไลด์พิช + คลิปเดโมสำรอง

### Front → `/app/renderer`
- ยึด [FRONT_RULES.md](app/renderer/FRONT_RULES.md) · ข้อมูลผ่าน `src/api/` เท่านั้น
- ยังไม่มีตาม blueprint: `src/states/useFlee.ts`, `src/mascot/poses.ts` + `parts/`, `src/meter/SurvivalBar.tsx`, `src/extras/` (Leaderboard, Sticker, PromptPayBypass, SurvivalReport · ห้ามเริ่มก่อน P0)
- รอ #1 (คลิกทะลุ, IPC หนีเมาส์, state จริง) และ Vision (`reasons`, `facePresent`)
- พอ #1 ย้ายไป `/app/main` แล้ว spike ทั้งโฟลเดอร์ลบได้

---

## 3. Contract ที่ต้องตกลงกัน

| Endpoint / ฟิลด์ | spike ทำอยู่ | คำถามที่ค้าง |
|---|---|---|
| `POST /wai/request` | ตาม contract, ตอบ `{id}` · ถ้าปิดอยู่ตอบ id ที่ผ่านแล้ว | `source` ใช้ชื่ออะไร (ดูข้อ 4) |
| `GET /wai/wait/:id` | long-poll 55 วิ แล้วตอบ `202 {pending:true}` · id ไม่รู้จัก = 404 | ใส่ 202 ลง contract · 404 ควร fail-open ไหม |
| `GET /wai/queue` | `{items, state, fail_count, bypass}` · item มี `created_at` (ms), `source` | contract เดิมเป็น array เปล่า · `state`/`fail_count` ยัง hard-code |
| `POST /wai/skip/:id` | ปลดการ์ดแทนการไหว้ | dev เท่านั้น? ปิดใน build จริงไหม |
| `GET /wai/status` | `{enabled, pending, stats, last_seen}` | ยังไม่อยู่ใน contract |
| `POST /wai/enabled` | `{enabled}` สลับ bypass ตัวเดียวกับ tray | ยังไม่อยู่ใน contract |
| `POST /wai/forgive/:session_id` | **ยังไม่ทำ** | อยู่ใน contract แต่ไม่มีใคร implement |
| `action: rage_quit` | hook exit 2 | ต้อง `continue:false` ตาม artifact.md |
| Vision event | ไม่มี (onVisionEvent ว่าง) | ฟิลด์เพิ่ม `reasons`, `facePresent`, `snapshotId`, `style` |
| onboarding / setup | Electron IPC (`wai:*`) **ไม่ใช่ HTTP** กันเว็บอื่นยิงมาสั่งติด hook / เปิด Terminal | คงไว้แบบนี้ |

---

## 4. คำถามที่ยังค้าง

- **SULKING**: "บล็อกทุก request" แปลว่าอะไร deny ทันที? หรือค้างจนกว่าจะไหว้ Lv3? การ์ดใหม่ที่เข้ามาตอนงอนทำยังไง
- **หมดเวลา 300 วิ**: hook ยอมแพ้ที่ 290 วิแล้วบล็อก · UI ควรบอกยังไงตอนการ์ดหมดเวลา, นับเป็นไหว้ไม่ผ่าน (เพิ่ม anger) ไหม
- **ชื่อ source**: renderer ใช้ `claude-code` / `codex` / `chatgpt` / `test` แต่ SDK ของ web map เป็น `claude_code` / `shell` / `extension` (Codex กลายเป็น `shell`) → เลือกชุดเดียว
- **PromptPay 50.29**: ตัวเลขนี้ไม่มีอยู่ใน repo เลย ยังไม่รู้สูตร ใครคิดมาช่วยเขียนลง FRONT_RULES
- **`CLAUDE.md` ที่ root ยังไม่มี** ทั้งที่ artifact.md, FRONT_RULES และ extras/web อ้างถึง → #1 สร้างจาก contract ใน artifact.md + endpoint ที่เพิ่ม
- config แยกสองที่: `~/.waikusa/` (แอป) กับ `~/.wai/` (SDK web, sulk dir ใน artifact.md) → รวมเป็นที่เดียวไหม

---

## 5. วิธีทดสอบ (mac)

1. **ปิดของที่ใช้ :7777** เช่น `prototype/agent-popup/server.py` · `lsof -i :7777` ต้องว่าง
2. **เริ่ม**: `npm --prefix app/renderer run dev` + `npm --prefix spikes/popup-hook start` (ครั้งแรก `npm install` ทั้งสองที่ก่อน) หรือเปิด `ไหว้กูซะ.app` จาก shortcut
3. **onboarding**: ลบ `~/.waikusa/config.json` ถ้าอยากเห็นใหม่ → อนุญาตกล้อง → ติ๊ก Claude Code + Codex → เช็กว่าเกิด `~/wai-sandbox/.claude/settings.local.json` และ `~/wai-sandbox/.codex/hooks.json` ที่มี `WAI_HOOK=1`
4. **Claude Code**: `cd ~/wai-sandbox && claude` → พิมพ์อะไรก็ได้ → popup เด้ง + tray นับ 1 → กด "ข้าม (dev) ▶" → AI ตอบ
5. **Codex trust**: หน้าหลัก → "อนุญาต hook ของ Codex" (หรือรัน `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex` ใน `~/wai-sandbox` เอง) → `/hooks` → trust → ส่ง prompt ใน Codex CLI หรือแอป Codex ที่เปิด `~/wai-sandbox` → popup เด้ง · trust เก็บใน `~/.codex/config.toml` `[hooks.state]`
6. **subagent**: สั่ง "ใช้ subagent ไปอ่านไฟล์ในโฟลเดอร์นี้" → ปลด prompt แล้วจะมีการ์ด `Claude Code › <ชนิด>` เด้งอีกใบ
7. **ปิด**: ติ๊ก "เปิดใช้งาน" ออกใน tray (หรือสวิตช์หน้าหลัก) → การ์ดที่ค้างผ่านทันที, prompt ใหม่ไม่เด้ง, tray เป็น 💤
8. **daemon ตาย (fail-open)**: ออกจากแอป (tray → ออก) → ส่ง prompt ใน `~/wai-sandbox` → AI ตอบปกติไม่ค้าง · (ถ้า kill daemon ตอนการ์ดค้าง → ผ่าน · ถ้าเปิด daemon ใหม่ระหว่างรอ → บล็อก ดูรูใน #4)
9. log ของ shortcut: `~/Library/Logs/wai-kusa.log`

---

## 6. ข้อควรระวัง

- **ห้ามติด hook แบบ global ตอน dev** (`~/.claude/settings.json`, `~/.codex/hooks.json`) ใช้ `~/wai-sandbox` เท่านั้น · `WAI_HOOK_SCOPE` บังคับ scope ได้ อย่าตั้งเป็น global บนเครื่องตัวเอง
- `WAI_BYPASS=1`: ฝั่ง hook = ผ่านทันทีไม่ยิง daemon · ฝั่งแอป = เริ่มแบบปิดอยู่ · UI ต้องมีป้ายบอกว่า bypass
- Claude Code: `UserPromptSubmit` default timeout แค่ 30 วิ เราเลยตั้ง `timeout: 300` · hook หมดเวลา = prompt **ผ่าน** (ถ้าจะบล็อกต้อง `onFailure: "block"`)
- **Codex ต้อง trust ใหม่ทุกครั้งที่คำสั่ง hook เปลี่ยน** (ผูก path + hash) เช่น สลับระหว่าง `setup-sandbox.sh` (ใช้ `node`) กับ onboarding (ใช้ electron), ย้าย repo, หรือเปลี่ยนเป็น shim · `codexTrusted()` เช็กแค่ว่าเคย trust ไฟล์นี้ บอกไม่ได้ว่า hash ยังตรง · Codex ข้าม hook ที่ไม่ trust แบบเงียบๆ
- **PromptPay**: QR ปลอม + ปุ่ม "โอนแล้ว" เท่านั้น ห้ามรับเงินจริง
- **โลโก้แบรนด์**: ตอนนี้ตัดสินใจชั่วคราวว่าใช้โลโก้จริงได้ (รอโลโก้ของเราเอง) แต่ตอนนี้ provider ยังเป็นตัวหนังสือ · FRONT_RULES §5 ยังเขียนว่าห้าม ต้องแก้ก่อนใส่
- `install-shortcut.sh` จำ path ของ repo + `node` ตอนติดตั้ง ย้าย repo/เปลี่ยน node = รันใหม่
- `.ps1` ต้องเป็น UTF-8 มี BOM (PowerShell 5.1 อ่านไทยเพี้ยน)
