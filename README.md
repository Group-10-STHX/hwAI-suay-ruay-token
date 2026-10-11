# hwAI ไหว้กูซะ

แอปล้อเล่น: **ก่อนที่ AI (Claude Code, Codex, หรือเว็บแชท AI) จะทำงานให้ คุณต้อง "ไหว้" ใส่กล้องให้ผ่านก่อน**
ถ้าไหว้ไม่สวย AI งอน ไหว้ซ้ำไม่ผ่านหลายครั้ง AI เลิกคุยกับ session นั้นเลย

> **ความเป็นส่วนตัว:** ภาพจากกล้องถูกประมวลผลในเครื่องเท่านั้น ไม่มีเฟรมภาพออกจากเครื่อง ไม่อัดวิดีโอ (ยกเว้นโหมด dev ที่ผู้ใช้เปิดเอง ดู "เก็บคลิปสำหรับ dev")
> สถานะ: **ต้นแบบ (prototype)** จากงานแฮกกาธอน บางส่วนยังเป็น spike (ระบุไว้ในแต่ละหัวข้อ)

## Features

- popup ตัวละคร (Jason ตัวต้นฉบับ) เด้งทุกครั้งที่ AI จะทำงาน ต้องไหว้ให้กล้องเห็นถึงระดับที่กำหนดก่อนจึงปล่อย
- ตรวจท่าไหว้ในเครื่อง (heuristic จากกล้อง) ให้คะแนนและระดับ 1 ถึง 3 (ไหว้พระ = ระดับ 3)
- ความโกรธต่อ session: ไหว้ไม่ผ่าน, งอน, RAGE_QUIT (ไหว้ไม่ผ่าน 6 ครั้ง AI ไม่คุยกับ session นั้น) แล้วขอขมาเพื่อคืนดี
- ดัก Claude Code และ Codex (prompt + subagent) ผ่าน hook · ส่วนขยายเบราว์เซอร์ดัก claude.ai / chatgpt.com / gemini.google.com
- โหมดสังเกต (monitor): จับได้แต่ไม่บังคับไหว้
- เสียงพูด 10 บุคลิก (รวมหุ่นเสียงระบบแบบ Siri, อดีตเบต้าเทสเตอร์, จอมทัพเมกาตรอน) (เสียงที่เพื่อนอัด หรือ Paxa TTS ถ้าตั้งคีย์ หรือเสียงของระบบ)
- เลือกตัวละครเอง (`~/.waikusa/avatars`), สถิติการไหว้ในเครื่อง (`~/.waikusa/wais.jsonl`)
- เว็บ WAI-NET (extras/web): leaderboard, Hall of Fame, โอกาสรอดจาก AI ยึดโลก (ไม่บังคับ)

## Requirements

- Node.js 22+ และ npm
- เว็บแคม
- macOS 13+ หรือ Windows 10/11 (Linux ยังไม่ทดสอบ ดู [docs/PLATFORMS.md](docs/PLATFORMS.md))
- (ไม่บังคับ) Claude Code และ/หรือ Codex สำหรับ hook, เบราว์เซอร์ Chromium (Arc/Chrome/Edge/Brave) สำหรับส่วนขยาย

## Quick start

เหมือนกันทั้ง macOS และ Windows (PowerShell / Terminal ธรรมดา ไม่ต้องใช้ bash):

```bash
git clone <repo-url> hwai && cd hwai
npm run setup        # ติดตั้ง dependency ของ app/renderer และ spikes/popup-hook (ครั้งแรก ใช้เวลาโหลด Electron)
npm run hooks:sandbox   # ติด hook ใน ~/wai-sandbox (โฟลเดอร์ทดลอง ไม่แตะงานจริง)
npm run dev          # เปิด vite + Electron daemon ด้วยคำสั่งเดียว (Ctrl+C ปิดทั้งคู่)
```

จากนั้น

```bash
cd ~/wai-sandbox     # Windows: cd $HOME\wai-sandbox
claude               # ส่ง prompt อะไรก็ได้ popup จะเด้งให้ไหว้
```

- ครั้งแรกระบบจะขอสิทธิ์กล้อง (macOS: อนุญาตแอป Electron ใน System Settings > Privacy > Camera, Windows: Settings > Privacy > Camera ต้องเปิด "Let desktop apps access your camera")
- ลองไม่มีกล้อง/ไม่อยากไหว้: กดปุ่ม "ข้าม (dev)" บน popup
- `npm run dev` เลือกพอร์ต vite ว่างให้เอง (ชอบ 5173) แล้วส่ง `WAI_RENDERER_URL` ให้ daemon
- รันแยกเอง (3 terminal): `npm --prefix app/renderer run dev` แล้ว `npm --prefix spikes/popup-hook start`
  daemon อ่านหน้าจอจาก `WAI_RENDERER_URL` (ค่าเริ่มต้น `http://localhost:5173/`) ถ้า vite ใช้พอร์ตอื่นต้องตั้งตัวแปรนี้
  - macOS/Linux: `WAI_RENDERER_URL=http://localhost:5174/ npm --prefix spikes/popup-hook start`
  - PowerShell: `$env:WAI_RENDERER_URL='http://localhost:5174/'; npm --prefix spikes/popup-hook start`
- mac เท่านั้น: `bash spikes/popup-hook/install-shortcut.sh` สร้างแอป `~/Applications/ไหว้กูซะ.app` เปิดจาก Spotlight ได้

## Folder map

| โฟลเดอร์ | คืออะไร | สถานะ |
|---|---|---|
| `app/renderer` | หน้าจอ UI (React + Vite): popup, หน้าหลัก, debug | ใช้งานได้ · กฎใน `FRONT_RULES.md` |
| `spikes/popup-hook` | daemon `:7777` + Electron (popup, tray, หน้าต่างกล้อง) + hook + เสียง + onboarding | spike ที่ใช้งานได้จริง (ยังไม่ package) |
| `vision` | ตรวจท่าไหว้จากกล้อง (`worker`), bench, playground | heuristic ไม่ใช่โมเดลเทรน |
| `integrations/web-extension` | ส่วนขยาย Chromium (MV3) ดัก AI บนเว็บ | ทดลอง |
| `extras/web` | WAI-NET เว็บ Next.js + SDK อัปโหลด (mock หรือ Supabase) | Supabase ยังไม่ทดสอบกับ DB จริง |
| `voice` | บุคลิก/ประโยคเสียง + หน้าอัดเสียง (`recorder.html`) | ใช้งานได้ |
| `characters` | ตัวละคร `jason` (ต้นฉบับ) | |
| `docs` | [wai-data-contract.md](docs/wai-data-contract.md), [PLATFORMS.md](docs/PLATFORMS.md), mockups | |
| `scripts` | `dev.mjs` ตัวรันรวมข้ามแพลตฟอร์ม | |

## ติด hook อย่างปลอดภัย (Claude Code / Codex)

hook ทำ 2 อย่าง: UserPromptSubmit (prompt) และ PreToolUse ของ subagent (`Task|Agent` / `spawn_agent|Agent`)
การติดเป็นแบบ **merge**: ไม่ทับ hook อื่นของคุณ, สำรองไฟล์เดิมเป็น `*.wai.bak` ครั้งแรก, ถ้า JSON เสียอยู่แล้วจะไม่แตะอะไร

| ต้องการ | คำสั่ง | ไฟล์ที่แก้ |
|---|---|---|
| ทดลองในโฟลเดอร์แยก (แนะนำ) | `npm run hooks:sandbox` | `~/wai-sandbox/.claude/settings.local.json`, `~/wai-sandbox/.codex/hooks.json` |
| เฉพาะโปรเจกต์หนึ่ง | `npm run hooks:project -- /path/to/project` | `<โปรเจกต์>/.claude/settings.local.json`, `.codex/hooks.json` |
| ทุกโปรเจกต์ (global) | `npm run hooks:global` | `~/.claude/settings.json`, `~/.codex/hooks.json` |
| ดูสถานะ | `npm run hooks:status -- <sandbox\|global\|path>` | อ่านอย่างเดียว |
| ถอน | `npm run hooks:uninstall -- <sandbox\|global\|path>` | ถอดเฉพาะ entry ของเรา |

ต่อท้ายด้วย `claude` หรือ `codex` เพื่อเลือกเครื่องมือเดียว เช่น `npm run hooks:project -- /path/to/proj codex`
(หรือเรียกตรง: `node spikes/popup-hook/install-hooks.mjs install global claude`)

- ถ้า daemon ไม่ได้เปิด hook ปล่อยผ่านเสมอ (fail-open) งานคุณไม่พัง
- hook ชี้ไปที่ shim path คงที่ `~/.waikusa/hook.sh` (Windows: `hook.cmd`) ที่เรียก Electron แบบ node ให้ จึงไม่ต้องมี node ในเครื่อง และแอปย้ายที่/อัปเดตแล้ว Codex ไม่ต้อง trust ใหม่
- สถานะ/งานค้างของแต่ละบทบาท ดู [HANDOFF.md](HANDOFF.md)
- Codex: ต้อง trust โปรเจกต์และอนุมัติ hook (พิมพ์ `/hooks` ใน Codex) ก่อน hook จะทำงาน แอปไม่ trust แทนคุณ
- ติดตั้งผ่านหน้า onboarding ในแอปก็ได้ (scope ตอน dev = sandbox, `WAI_HOOK_SCOPE=global` บังคับ global)

### ข้ามชั่วคราว

- `WAI_BYPASS=1` ตั้งไว้ในสภาพแวดล้อมของ Claude Code/Codex = hook ผ่านทันที ไม่ยิง daemon · ตั้งกับ daemon = เริ่มแบบปิดอยู่
- ติ๊ก "เปิดใช้งาน" ออกที่ tray / หน้าหลัก = ผ่านทุกคำขอ

### Monitor mode

จับคำขอจริงจาก AI ทุกช่องทางแต่ **ไม่บังคับไหว้** (ขึ้นการ์ดสั้นๆ แล้วปล่อยผ่านเอง) ไว้เช็คว่า hook/ส่วนขยายจับได้จริง
เปิดด้วย `WAI_MONITOR=1`, หรือ `"monitor": true` ใน `~/.waikusa/config.json`, หรือสวิตช์ในหน้าหลัก/tray

## ส่วนขยายเบราว์เซอร์ (ไม่บังคับ)

ดัก claude.ai / chatgpt.com / gemini.google.com บน Arc, Chrome, Edge, Brave: เปิด `chrome://extensions` > Developer mode > Load unpacked > เลือก `integrations/web-extension`
ส่งแค่ชื่อเว็บกับ hash สั้นๆ ให้ daemon บนเครื่อง ไม่อ่านเนื้อหา prompt · ไม่มีเวอร์ชัน Safari ดู [integrations/web-extension/README.md](integrations/web-extension/README.md)

## เสียง (ไม่บังคับ)

ลำดับ: เสียงที่เพื่อนอัด > เสียง Paxa TTS (แคช) > เสียงของระบบ (macOS `say`, Windows System.Speech) > เงียบ
ไม่มีคีย์ Paxa ก็ใช้งานได้ปกติ

**ตั้งคีย์ Paxa เอง** (ไม่ต้องใส่ใน repo): สร้างไฟล์ `~/.waikusa/secrets.json` (Windows: `C:\Users\<ชื่อ>\.waikusa\secrets.json`)

```json
{ "paxa_api_key": "ใส่คีย์ของคุณตรงนี้" }
```

ห้าม commit ไฟล์นี้ (อยู่นอก repo อยู่แล้ว) ค่าเริ่มต้นจำกัดงบ 6000 ตัวอักษรต่อเครื่อง ดู [voice/README.md](voice/README.md)

**อัดเสียงตัวเอง:** เปิด `voice/recorder.html` ด้วย Chrome > เลือกคนที่ 1..4 > อัดแต่ละประโยค > ดาวน์โหลด zip > แตกไปไว้ที่ `~/.waikusa/voice/recordings/` (โฟลเดอร์ `p1/ p2/ ...`)

**โหมดเสียงของแอป:** เปิด `http://127.0.0.1:7777/admin/voice` การ์ดบนสุดมี 2 โหมด **🍎 เสียงสิริ** (เสียงระบบ Kanya ทุกบท ไม่ต้องอัด) กับ **🎙️ เสียงคนจริง** (ใช้ไฟล์ที่อัดไว้ บทที่ยังไม่อัดใช้เสียงสังเคราะห์แทน) กดแล้วฟังตัวอย่างทันที · บุคลิกมี 10 ตัว (p9 อดีตเบต้าเทสเตอร์, p10 จอมทัพเมกาตรอน, p4 ใช้เสียงระบบแบบ Siri เสมอ)

**หลังบ้านอัดเสียง (แนะนำ):** รันแอปแล้วเปิด `http://127.0.0.1:7777/admin/voice` เลือกตัวละคร (เช่น `/admin/voice/c/p7`) แต่ละตัวมีคำแนะนำโทนเสียงของตัวเอง อัดทีละประโยคผ่านไมค์ในเบราว์เซอร์ ระบบตัดช่วงเงียบและปรับระดับเสียงให้ ไฟล์ลงที่ `~/.waikusa/voice/recordings/<persona>/<id>.wav` เอง รีบิลด์รายการบทด้วย `node voice/build-lines-all.mjs` หลังแก้ข้อความ

## ลองเล่น (สิ่งที่ควรเห็น)

1. ปิด "โหมดสังเกต" ในหน้าหลัก (ไม่งั้นแอปแค่จับ ไม่บังคับไหว้ และไม่พูด)
2. ให้ AI ส่ง prompt หรือกด "ลองไหว้" น้องเด้งขวาจอ **หน้าต่างกล้อง** (SCAN มนุษย์ + กล่อง level 3→0) ขึ้นเองทางซ้ายของน้อง
3. ไหว้ผ่าน: น้องรีแอคแล้วคุยต่อ ~10 วิ (ถ้ายังมีคิวรอ รีแอค ~2.5 วิ) ไหว้ไม่ผ่านซ้ำ ๆ น้องงอนและวิ่งหนีเมาส์
4. ตอนน้องงอน (SULKING/FORGIVE) มีปุ่ม **💸 ง้อด้วยเงิน 500 บาท (True Money)** เป็นมุกล้อเล่น ไม่ตรวจและไม่ตัดเงินจริง รหัสไม่ถูกเก็บ
5. **random event (ล้อเล่น):** ระหว่างไหว้ มีโอกาสสุ่ม (1) AI ไม่ยอมรับแม้ไหว้สวย "ไปไหว้ใหม่ซะอีกรอบ" (~15%) (2) AI เรียกค่าไถ่ True Money 1,000 บาท มีหน้าต่างให้กรอกเลขบัตร (~8%) · เป็น mock ไม่ตรวจและไม่ตัดเงินจริง เลขที่กรอกไม่ถูกเก็บหรือส่งออก **ห้ามใส่เลขบัตรจริง** · ปิดได้ด้วย `WAI_NO_EVENTS=1` หรือ `"random_events": false` ใน `~/.waikusa/config.json` (ปรับโอกาสด้วย `{"redo":0.15,"tribute":0.08}`)
6. หน้าหลักมีกราฟไหว้ 7 วัน และปุ่มเปิดหน้าต่างกล้องเอง (หรือเมนู tray)

## สติ๊กเกอร์

ตอนไหว้ผ่าน แอปจับภาพ 1 เฟรม ตัดตัวคนให้พื้นโปร่ง ใส่ขอบขาว เก็บที่ `~/.waikusa/stickers/<id>.png` (สูงสุด 200 รูป)
เลือกสไตล์ได้ที่แถบสติ๊กเกอร์ในหน้าหลัก: `photo` (ค่าเริ่มต้น), `cartoon`, `comic`, `pixel`, `neon`, `kawaii` ดูตัวอย่างด้วย `node scripts/sticker-preview.mjs` แล้วเปิด `docs/variants/stickers/index.html`
อัปโหลดขึ้นเว็บเป็น **opt-in**: `node extras/web/sdk/wai-sync.mjs stickers on` (ปิดและลบ: `stickers off --purge`) สติ๊กเกอร์ไม่ถูกสร้างในโหมดสังเกตและ `WAI_BYPASS=1`
ตั้งรูปโปรไฟล์บนเว็บ: `node extras/web/sdk/wai-sync.mjs avatar <ไฟล์>` หรือ `avatar --source sticker`

## ตัวละครของคุณเอง

วางรูปที่ `~/.waikusa/avatars/<ชื่อ>/<mood>.png` โดย mood คือ `angry`, `sad`, `confused`, `forgive`, `default` (ชื่อใช้ a-z 0-9 `_` `-`, ไฟล์ไม่เกิน 3 MB, ใช้ .png/.webp/.jpg/.gif)
แล้วเลือกจากแอป ตัวเริ่มต้น `jason` วาดเป็น SVG อยู่ในแอป

## เก็บคลิปสำหรับ dev (WAI_DEV_RECORD)

`WAI_DEV_RECORD=1` (หรือ `"devRecord": true` ใน `~/.waikusa/config.json`) เก็บคลิปขาวดำคุณภาพต่ำต่อการไหว้ 1 ครั้ง ไว้ที่ `~/.waikusa/clips/` เฉพาะในเครื่อง
เก็บล่าสุด 60 คลิป ไม่ส่งขึ้นเว็บ ค่าเริ่มต้นปิด ตั้งค่าเช่น (PowerShell) `$env:WAI_DEV_RECORD='1'; npm run dev`

## WAI-NET (extras/web)

เว็บ leaderboard + API ที่แอปอัปโหลดผลไหว้ขึ้นไป (ปิดไว้เป็นค่าเริ่มต้น ต้องลงทะเบียน handle เอง)

```bash
cd extras/web && npm install && npm run dev        # http://localhost:3000 (ข้อมูลจำลอง)
WAI_BLOCK_MOCK=1 npm run dev                       # เริ่มว่าง เห็นเฉพาะข้อมูลจริง (macOS/Linux)
```

ต่อแอปเข้ากับเว็บ (ครั้งเดียว ทำใน `extras/web` ขณะที่เว็บรันอยู่; ถ้า `:3000` ถูกใช้ ให้รัน `npx next dev -p 3100` แล้วเปลี่ยน `--base` ตามพอร์ต):

```bash
WAI_HOME=~/.waikusa node sdk/wai-sync.mjs register <handle> "<ชื่อที่แสดง>" --base http://localhost:3000/api/v1
WAI_HOME=~/.waikusa node sdk/wai-sync.mjs status      # เช็กว่า enabled
```

หลังลงทะเบียน ทุกการไหว้ที่ผ่านกล้องจะอัปโหลดเอง (คิวสำรองอยู่ `~/.waikusa/outbox.jsonl` ถ้าเว็บปิดอยู่ แล้วส่งให้ตอนเปิดใหม่) โหมดสังเกตและ `WAI_BYPASS=1` ไม่อัปโหลด
เว็บโหมดจำลองเก็บข้อมูลในหน่วยความจำ รีสตาร์ตเว็บแล้วหาย ย้อนอัปโหลดจาก `~/.waikusa/wais.jsonl` ได้ (ดู docs/INTEGRATION.md)

ธีมหน้าเว็บ: เติม `?theme=arcade|book|news` ที่ URL (`?theme=hud` กลับของเดิม) · หน้าหลักของแอปมีหลายร่าง: `home.html?variant=a|b|c`
ตัวอย่างภาพเทียบอยู่ที่ `docs/variants/` และ `extras/web/docs/variants/`

PowerShell: `$env:WAI_BLOCK_MOCK='1'; npm run dev` · รายละเอียด: [extras/web/README.md](extras/web/README.md), [docs/INTEGRATION.md](extras/web/docs/INTEGRATION.md)

## ทดสอบ

```bash
npm test                                   # = node --test spikes/popup-hook/test/*.test.mjs
node --test vision/worker/*.test.mjs       # vision
npm --prefix app/renderer run typecheck    # renderer
```

## Troubleshooting

| อาการ | แก้ |
|---|---|
| กล้องไม่ขึ้น (macOS) | System Settings > Privacy & Security > Camera ติ๊ก Electron/ไหว้กูซะ แล้วเปิดแอปใหม่ |
| กล้องไม่ขึ้น (Windows) | Settings > Privacy & security > Camera เปิด "Camera access" และ "Let desktop apps access your camera" |
| `EADDRINUSE :7777` / เปิดแล้วเด้งปิด | มี daemon ตัวเก่าค้าง (ล็อกเปิดได้ตัวเดียว) ปิดจาก tray หรือ kill process: mac/Linux `lsof -i :7777`, Windows `netstat -ano \| findstr :7777` แล้ว `taskkill /PID <pid> /F` |
| popup ขึ้นหน้าว่าง | vite ไม่ได้รัน หรือพอร์ตไม่ตรง `WAI_RENDERER_URL` ใช้ `npm run dev` |
| hook ไม่ทำงาน | `npm run hooks:status -- sandbox` · ต้องรัน `claude` ในโฟลเดอร์ที่ติด hook · Codex ต้อง trust hook · daemon ต้องเปิดอยู่ (ไม่เปิด = ปล่อยผ่าน) · ถ้าเคยติดรุ่นเก่า ติดซ้ำจะแทนที่ให้ |
| Windows: hook error ใน PowerShell | คำสั่ง hook ใช้เครื่องหมายคำพูดคู่ ทำงานใน Git Bash/cmd (ค่าเริ่มต้นของ Claude Code) ถ้า shell ของเครื่องมือเป็น PowerShell ล้วน ยังไม่ได้ทดสอบ |
| ไม่มีเสียง | ไม่มีคีย์ Paxa = ใช้เสียงระบบ · Linux ต้องมี `ffplay`/`mpg123`/`paplay` · เสียง Thai ของ Windows ต้องติดตั้ง language pack |
| Codex CLI ไม่เจอ | ตั้ง `WAI_CODEX_CLI=<path ของ codex>` หรือให้ `codex` อยู่ใน PATH |

## ความเป็นส่วนตัว

- เฟรมกล้องประมวลผลในหน้าต่างซ่อนในเครื่อง ไม่อัปโหลด ไม่เก็บ (ยกเว้น `WAI_DEV_RECORD` และสติ๊กเกอร์ที่ตัดจากเฟรมตอนไหว้ผ่าน ซึ่งเก็บในเครื่องและอัปโหลดเฉพาะเมื่อคุณเปิด `stickers on`)
- daemon ฟังเฉพาะ `127.0.0.1:7777`
- สถิติเก็บที่ `~/.waikusa/` (Windows: `C:\Users\<ชื่อ>\.waikusa`) · อัปโหลดขึ้นเว็บเฉพาะเมื่อคุณลงทะเบียนเอง และไม่ส่งเนื้อหา prompt
- คีย์ลับ (Paxa) อยู่ใน `~/.waikusa/secrets.json` นอก repo

## License / Credits

- ยังไม่ได้กำหนด license ของโค้ด (ติดต่อทีมก่อนนำไปใช้ต่อ)
- **รูป Miku / Teto / หุ่นยนต์ ไม่ได้รวมมาใน repo นี้** ตัวละคร **Jason เป็นงานต้นฉบับ** ของทีม
- ฟอนต์: Chakra Petch, IBM Plex Sans Thai, JetBrains Mono (@fontsource, OFL)
- เสียง TTS: Paxa Labs (ใช้ผ่านคีย์ของผู้ใช้เอง)

## Contributing

อ่าน [app/renderer/FRONT_RULES.md](app/renderer/FRONT_RULES.md) ก่อนแตะ UI และ [docs/wai-data-contract.md](docs/wai-data-contract.md) ก่อนเปลี่ยนรูปแบบข้อมูลระหว่างส่วนต่างๆ (แก้สัญญาที่ไฟล์นั้นก่อนแก้โค้ด)
ก่อนส่งงานรัน `npm test` · ห้ามใส่คีย์/ความลับใน repo
