# FRONT_RULES.md · hwAI ไหว้กูซะ (Overlay UI)

กฎของทีม Front ทุกคนรวมถึง AI agent ที่ช่วยเขียนโค้ดต้องยึดไฟล์นี้ ถ้าต้องเปลี่ยนอะไรในนี้ ให้แก้ไฟล์ก่อนแล้วบอกในกลุ่ม ห้ามแก้เงียบ

ไฟล์นี้ใช้คู่กับ `CLAUDE.md` (API contract) และ FigJam: User Stories + User Flow

---

## 1. ขอบเขต

ทีม Front ทำงานใน `/app/renderer` เท่านั้น ใครทำอะไรคุยกันเอง

- ห้ามแก้โฟลเดอร์ที่คนอื่นกำลังทำโดยไม่บอกก่อน ถ้าต้องใช้ของเขา ให้ import ผ่าน `index.ts` ของโฟลเดอร์นั้น
- ใช้ mock ทำงานไปก่อนจนกว่าจะถึงช่วง integrate
- แยก branch คนละอัน ตั้งชื่อ `front/<ชื่อเรื่อง>` แล้วส่ง PR เล็กๆ ให้ Lead รีวิวก่อนส่งต่อให้ #1 merge

## 2. หน้าต่าง (windows)

| Window | ตำแหน่ง | ขนาด | หน้าที่ |
|---|---|---|---|
| Avatar | ขอบขวาของจอ | **คงที่ ไม่เปลี่ยนตาม state** | น้องหุ่น, ข้อความ, กองการ์ด ลอยอยู่บนจอ **ไม่มีกรอบหรือพื้นหลังของ island** มีแค่เงาบางๆ ขยับขึ้นลงได้แบบ Dynamic Island |
| Webcam | กลางจอ | คงที่ | ภาพกล้องของทีม Vision เราวาด overlay ทับ เช่น แถบ level, วงค้างท่า, กรอบสแกน |
| Debug panel | ที่ไหนก็ได้ (dev เท่านั้น) | - | ปุ่มสลับ state ปลอม |
| หน้าหลัก (Home) | กลางจอ เปิดตอนเริ่มแอป | คงที่ | window ปกติ (มีพื้นหลัง) สวิตช์เปิด/ปิด, ต่อกับ Claude Code/Codex แล้วหรือยัง, สถิติวันนี้, ปุ่มลองไหว้ ปิดแล้วแอปยังอยู่บน menu bar |

- Window ทั้งหมดยกเว้นหน้าหลักเป็น transparent, frameless และ alwaysOnTop
- พื้นที่โปร่งใสต้องคลิกทะลุได้ ห้ามบังงานของผู้ใช้
- Webcam window เป็นของทีม Vision (MediaPipe รันอยู่ในนั้น) ทีมเราห้ามไปปิดหรือซ่อนมันเอง ให้ส่งคำขอผ่าน main


## สถิติหน้าหลัก (/wai/status ขยาย)

`AppStatus.stats` = `{requests, passed, bypassed, today:{wais,passed,beautiful,tokens}, total:{wais,passed,beautiful,tokens}, bestScore?}` (map จาก `best_score`). daemon เก่าที่ไม่ส่ง today/total ต้องยังแสดงได้: `status.ts` default เป็น 0 / undefined.
หน้าหลักส่วน "วันนี้" โชว์: รอไหว้ (`pending`, hud), ไหว้วันนี้ (`today.wais`, text), ไหว้สวย (`today.beautiful`, blessed), token วันนี้ (`today.tokens`, blessed) + บรรทัดเล็ก token รวม / คะแนนดีสุด. ต้องพอดี window 520x680 ไม่ scroll.

## 3. ข้อมูลที่ UI ใช้

ทุกการดึงข้อมูลต้องผ่าน `src/api` เท่านั้น ห้าม component เรียก fetch หรือ IPC ตรงๆ

| ข้อมูล | ทาง | ความถี่ |
|---|---|---|
| คิวที่รอไหว้ | `GET /wai/queue` | poll ทุก 500ms |
| ผลของคำขอ | `GET /wai/wait/:id` | ใช้ฝั่ง hook ไม่ใช่ UI |
| Vision event | IPC `vision:event` | ประมาณ 15 fps |
| หนีเมาส์ (ANNOYED) | IPC `wai:flee` `{ active, fleeing }` (preload: `window.wai.onFlee`) | ส่งเมื่อค่าเปลี่ยนเท่านั้น |
| State ของ session | `GET /wai/queue` (ขอให้ #1 ใส่ `state` และ `failCount` เพิ่ม) | poll พร้อมกับคิว |

### ฟิลด์ Vision event ที่จะขอเพิ่ม (รอ Vision ยืนยัน)

```ts
type VisionEvent = {
  isWai: boolean
  level: 0 | 1 | 2 | 3
  score: number            // 0–100
  holdMs: number
  // ---- ขอเพิ่ม ----
  reasons: WaiReason[]     // ไหว้ผิดตรงไหน ว่างไว้ถ้าไม่มีอะไรผิด
  facePresent: boolean
  snapshotId?: string      // ส่งมาตอนไหว้ผ่าน เอาไว้ทำ sticker และ leaderboard
  style?: 'normal' | 'weird'  // ใช้กับรางวัลไหว้แปลก
}

type WaiReason =
  | 'NO_PERSON'        // ไม่เห็นคน
  | 'FACE_HIDDEN'      // หน้าโดนบัง
  | 'HANDS_APART'      // มือไม่ชิดกัน
  | 'FINGERS_NOT_UP'   // นิ้วไม่ชี้ขึ้น
  | 'HANDS_TOO_LOW'    // มือต่ำกว่าเกณฑ์ของ state นั้น
  | 'NOT_BOWING'       // ไม่ก้มหัว
  | 'ASYMMETRIC'       // มือเบี้ยว
  | 'HOLD_TOO_SHORT'   // ค้างท่าไม่นานพอ
```

ข้อความที่จะโชว์ให้ผู้ใช้ map มาจาก `WaiReason` ใน `src/states/copy.ts` ที่เดียว

## 4. State → UI

| State | น้องหุ่น | ข้อความตัวอย่าง | Webcam | สี |
|---|---|---|---|---|
| DEMANDING / WATCHING | ยืนกอดอก มือเปล่า | "มนุษย์ ไหว้กูซะ" | เปิด, กรอบสแกนสีแดง | แดง |
| PASSED | ไหว้กลับ มีแสงทองรอบตัว | "อนุญาต" | ปิดเมื่อคิวหมด | ทอง |
| RETRY (ไม่ผ่าน 1–2 ครั้ง) | ถือไม้เรียว | "ไหว้ใหม่ ไม่สวย" + score + เหตุผล | เปิด | แดง |
| ANNOYED (3–4) | ถือปืนเลเซอร์ ตาแดง | "ต้อง level 2 ขึ้นไป" | เปิด, มีเส้นเป้าบนแถบ level | แดงเข้ม กระพริบ |
| SULKING (5) | นั่งหันหลัง | "ไม่คุยด้วยแล้ว" | เปิด | เทา |
| RAGE_QUIT (6) | ขึ้นยานบินออกนอกจอ | "ย้าย session ไปแล้ว" | ปิด | แดง |
| FORGIVE | ไหว้พระ level 3 ถึงจะกลับมา | "ขอขมาซะ" | เปิด | ทอง |

- ขนาด Avatar window ห้ามเปลี่ยน ให้แสดงความต่างด้วยท่าของน้อง สี และ motion เท่านั้น
- ช่วง ANNOYED: ตัว window หนีเมาส์ได้ แต่ห้ามออกนอกจอ และห้ามบัง webcam
  - การขยับ window อยู่ใน **Electron main** (renderer มองไม่เห็นเมาส์นอก window ตัวเอง) main ส่ง IPC `wai:flee` `{ active, fleeing }` มาเมื่อค่าเปลี่ยน: `active` = โหมดหนีเปิด (ANNOYED และไม่ได้ปิดไว้), `fleeing` = window ขยับใน ~300ms ล่าสุด · ขอให้ main ส่งค่าปัจจุบันตอน avatar โหลดเสร็จ (`did-finish-load`) ด้วย ไม่งั้นหน้าที่ reload กลาง ANNOYED จะไม่รู้ว่ากำลังหนีจนกว่าค่าจะเปลี่ยน
  - renderer แค่โชว์ท่า (`states/FleeFx.tsx`) และเช็กซ้ำว่า state ยังเป็น ANNOYED: `active` = น้องเอนหลบ ย่อตัว, ข้อความหลักเป็นคำแซว (`FLEE_TAUNTS` เปลี่ยนทุกครั้งที่หนี), บรรทัดรองบอกวิธีให้หยุด "ไหว้ level 2 ขึ้นไป กูถึงจะหยุด" · `fleeing` = กระโดดวิ่ง squash/stretch + ขีดสั่นสองข้าง + "ฟิ้ววว" เหนือหัว (ไม่บอกทิศ เพราะ main หนีไปทางไหนก็ได้)
  - ห้ามเปลี่ยนขนาดหรือ layout ของ island ตอนหนี: effect ทั้งหมดเป็น absolute/transform และคำแซวทุกอันต้องยาว 2 บรรทัดเท่ากัน
  - ดูด้วย mock: debug.html → ANNOYED → "จำลองหนีเมาส์" (ปิด / วิ่ง-หยุดสลับทุก 1.5 วิ / วิ่งค้าง)

## 5. CI (Brand)

### แนวคิด
**Skynet HUD × สายมู**: AI กำลังจะยึดโลก หน้าจอเป็น HUD สีแดง แต่ความศักดิ์สิทธิ์ของการไหว้ชนะทุกอย่าง พอไหว้ผ่าน หน้าจอเปลี่ยนเป็นสีทอง

### Color tokens

ใช้ผ่าน `src/theme/tokens.ts` เท่านั้น ห้ามเขียน hex ลงใน component ตรงๆ

| Token | Hex | ใช้กับ |
|---|---|---|
| `bg` | `#0A0A0C` | พื้นหลัง |
| `surface` | `#15151A` | การ์ด, panel |
| `hud` | `#FF2A2A` | เส้น HUD, กรอบสแกน, state ปกติ |
| `hudDim` | `#7A1414` | เส้นรอง, grid |
| `danger` | `#FF0040` | ANNOYED, RAGE_QUIT |
| `blessed` | `#FFD54A` | ไหว้ผ่าน, FORGIVE, level 3 |
| `sulk` | `#8A8A99` | SULKING |
| `text` | `#F2F2F2` | ตัวหนังสือหลัก |
| `textDim` | `#9A9AA5` | ตัวหนังสือรอง |

### Provider accent
เปลี่ยนแค่สีเสื้อของน้องหุ่น กับป้ายชื่อตัวหนังสือ

| Source | Accent | ป้าย |
|---|---|---|
| Claude Code | `#E07A4F` | "Claude Code" |
| Codex (CLI) | `#FF2A2A` (ใช้ `hud` เหมือนแถวอื่นๆ ยังไม่มีสีของตัวเอง) | "Codex" |
| ChatGPT (extension) | `#3FBF8F` | "ChatGPT" |
| ทดสอบจากหน้าหลัก (`test`) | `#9A9AA5` (`textDim`) | "ทดสอบ" |
| อื่นๆ | `#FF2A2A` | ชื่อ source |

### Typography
| ใช้กับ | Font | หมายเหตุ |
|---|---|---|
| หัวข้อ, ข้อความของน้อง | Chakra Petch Bold | ไทยได้, หน้าตาเหมือนหุ่น |
| ตัวเลข level, score, timer | JetBrains Mono | ตัวเลขกว้างเท่ากัน ไม่กระตุก |
| body | IBM Plex Sans Thai | |

ขนาดต้องอ่านออกจากจอโปรเจกเตอร์ตอนพิช: ข้อความของน้องไม่ต่ำกว่า 28px, ตัวเลข score ไม่ต่ำกว่า 48px

### Motion
- ทุกอย่างของ HUD: เส้น scanline วิ่ง, กรอบสแกนกะพริบเบาๆ
- ไหว้ผ่าน: flash สีทอง 300ms แล้ว fade
- ANNOYED: สั่น (shake) 4px, กระพริบแดง
- ANNOYED หนีเมาส์: เอนตัวนิ่งๆ ตอน `active` (`.fx-flee`), กระโดดวิ่ง + ขีดสั่น ตอน `fleeing` (`.fx-flee-run`, `.fx-flee-zip`), คำแซวใหม่เด้งครั้งเดียว (`.fx-pop`) · มีเฉพาะตอนมีคำขอ · prefers-reduced-motion เหลือแค่ท่าเอนกับขีดนิ่งๆ
- ห้ามมี animation ที่วนไม่จบตอนไม่มีคำขอ เพราะเปลือง CPU และน่ารำคาญ
- หน้าหลัก (ฟีล terminal โลกล่มสลาย แบบ Fallout แต่ใช้สีทีมเรา ไม่ใช้เขียว): เนื้อหา "ไหลลง" ทีละบรรทัดตอนเปิดหน้า (`.fx-render`, เล่นครั้งเดียว แต่ละบล็อกเลื่อนด้วย `--i`) · มีแถบสแกนกวาดลงหนึ่งครั้ง (`.fx-boot`) · ตัวเลขสถิติเล่น `.fx-tick` ใหม่ทุกครั้งที่ค่าเปลี่ยน · ตัวอักษรเรืองด้วย `.fx-glow` · ทั้งหมดเป็น one-shot จึงไม่ขัดกฎ "ห้ามวนไม่จบ" และหยุดเมื่อผู้ใช้ปิด motion
- หน้าหลักขนาด 420×600 (ขนาด Avatar window ยังห้ามเปลี่ยน)

### Copy (เสียงของน้อง)
- เรียกผู้ใช้ว่า "มนุษย์" พูดเป็นภาษาไทยแบบกวนๆ ใช้ กู/มึง ได้ แต่ห้ามด่าเรื่องเพศ ศาสนา หรือรูปร่างหน้าตา
- ข้อความทั้งหมดอยู่ใน `src/states/copy.ts` ไฟล์เดียว ทีม Voice (#5) ใช้ไฟล์นี้ด้วย ข้อความบนจอกับเสียง TTS จะได้ตรงกัน

### ห้าม
- ห้ามใช้โลโก้ หรือ mascot ของ Anthropic, OpenAI หรือแบรนด์ AI อื่น ให้ใช้แค่ชื่อเป็นตัวหนังสือ
- ห้ามใช้ภาพ โลโก้ หรือตัวละครจากหนัง Terminator เอาแค่ฟีลมาใช้
- ห้ามสร้างสีหรือฟอนต์ใหม่โดยไม่แก้ไฟล์นี้ก่อน

## 6. Blueprint ไฟล์

```
app/renderer/
├── FRONT_RULES.md
├── avatar.html                 # entry ของ Avatar window
├── camera-overlay.html         # entry ของ overlay ที่ซ้อนบน webcam
├── debug.html                  # entry ของ Debug panel (dev เท่านั้น)
├── home.html                   # entry ของหน้าหลัก
├── vite.config.ts              # multi-page: 4 entry ข้างบน
└── src/
    ├── app/
    │   ├── main-avatar.tsx         mount AvatarWindow
    │   ├── main-camera.tsx         mount CameraOverlayWindow
    │   ├── main-debug.tsx          mount DebugPanel
│   ├── main-home.tsx           mount HomeWindow
│   ├── HomeWindow.tsx          หน้าหลัก (สวิตช์, สถานะการต่อ, สถิติ)
    │   ├── AvatarWindow.tsx        ประกอบ Island + CardStack
    │   ├── CameraOverlayWindow.tsx ประกอบ ScanFrame + LevelMeter + HoldRing + ReasonChip
    │   ├── DebugPanel.tsx          ปุ่มสลับ scenario
    │   └── store.tsx               React context + useReducer เก็บ queue, sessionState, vision, flee (+ นับจำนวนครั้งที่หนี)
    ├── api/
    │   ├── types.ts                QueueItem, SessionState, VisionEvent, WaiReason, FleeState
    │   ├── queue.ts                poll GET /wai/queue ทุก 500ms
│   ├── status.ts               หน้าหลัก: GET /wai/status, เปิด/ปิด, ยิงคำขอทดสอบ (รอ #1 ใส่ใน contract)
    │   ├── vision.ts               subscribe IPC vision:event (+ type ของ window.wai)
    │   ├── flee.ts                 subscribe IPC wai:flee (หนีเมาส์) ไม่มี window.wai.onFlee = ไม่หนี
    │   └── index.ts                เลือก real หรือ mock จาก env VITE_USE_MOCK
    ├── mocks/
    │   ├── scenarios.ts            demand, retry, annoyed, sulk, rageQuit, forgive, pass
    │   └── mockFeed.ts             ยิง scenario เป็น queue + vision event ปลอม 15 fps + flee ปลอม (annoyed วิ่ง/หยุดสลับทุก 1.5 วิ)
    ├── theme/
    │   ├── tokens.ts               สี ฟอนต์ ระยะ จากข้อ 5
    │   ├── global.css              reset, ฟอนต์, พื้นโปร่งใส
    │   └── effects.css             scanline, shake, bless flash
    ├── mascot/
    │   ├── Mascot.tsx              รับ pose + providerColor
    │   ├── poses.ts                state → pose (crossArms, stick, laserGun, sulk, spaceship, wai)
    │   ├── parts/                  Head.tsx, Body.tsx, Eyes.tsx, Stick.tsx, LaserGun.tsx, Halo.tsx, Spaceship.tsx
    │   └── index.ts
    ├── states/
    │   ├── Island.tsx              กล่องลอยไม่มีกรอบ จัด Mascot + SpeechBubble + slot การ์ด
    │   ├── SpeechBubble.tsx
    │   ├── FleeFx.tsx              ท่าตอนหนีเมาส์ (เอน, กระโดดวิ่ง, ขีดสั่น, "ฟิ้ววว") รับ active/fleeing ทาง props · logic ขยับ window อยู่ใน Electron main
    │   ├── byPhrase.tsx            ตัดบรรทัดภาษาไทยเฉพาะที่ช่องว่าง (ใช้กับคำแซว/คำใบ้ตอนหนี)
    │   ├── copy.ts                 ข้อความทุกอันของน้อง + map WaiReason → ข้อความ (ทีม Voice ใช้ร่วม)
    │   └── index.ts
    ├── queue/
    │   ├── CardStack.tsx           คิวที่รออยู่หลังใบบนสุด (ใบบนสุดอยู่ใน Island) สูงสุด 3 ใบ
    │   ├── TimeLeft.tsx            เวลาที่เหลือ m:ss นับถอยหลังจาก 5:00 (ไม่เกิน ไม่ติดลบ)
    │   ├── AgentCard.tsx           source, agent_label, เวลาที่เหลือ
    │   ├── PendingCount.tsx        "รอไหว้อีก N ตัว" (ตัวสำรองถ้า CardStack ไม่ทัน)
    │   └── index.ts
    ├── meter/
    │   ├── LevelMeter.tsx          4 ช่อง 0–3 + เส้นเป้าตอน ANNOYED
    │   ├── HoldRing.tsx            วงค้างท่า + score ตรงกลาง
    │   ├── SurvivalBar.tsx         โอกาสรอดเมื่อ AI ยึดโลก
    │   └── index.ts
    ├── camera-overlay/
    │   ├── ScanFrame.tsx           มุมกรอบสแกน 4 มุม + ป้าย SCAN มนุษย์
    │   ├── ReasonChip.tsx          เหตุผลที่ไหว้ผิด
    │   └── index.ts
    └── extras/                 # ห้ามเริ่มก่อน P0 เสร็จ
        ├── SurvivalReport.tsx      กราฟระฆังคว่ำ + percentile
        ├── Leaderboard.tsx
        ├── StickerMaker.tsx
        └── PromptPayBypass.tsx     QR ปลอม + ปุ่ม "โอนแล้ว"
```

### ทิศทางของ import

```
app ──► mascot, states, queue, meter, camera-overlay ──► theme
 │
 └──► api ──► mocks (เฉพาะตอน VITE_USE_MOCK=1)
```

- Component ใน `mascot`, `states`, `queue`, `meter`, `camera-overlay` **รับข้อมูลทาง props เท่านั้น** ห้าม import `api` หรือ `store` เอง เพื่อให้ดูด้วย mock ได้ทุกตัว
  - ข้อยกเว้นเดียว: `import type { ... } from '../api/types'` ได้ เพราะเป็นแค่ type หายไปตอน build (ห้าม import ค่าหรือฟังก์ชันจาก `api`)
- มีแค่ `app/` ที่อ่าน store แล้วส่ง props ลงไป
- ข้ามโฟลเดอร์ต้อง import ผ่าน `index.ts` เท่านั้น

### Props กลางที่ทุกคนใช้ (อยู่ใน `api/types.ts`)

```ts
type SessionState = 'IDLE' | 'DEMANDING' | 'WATCHING' | 'PASSED' | 'RETRY'
                  | 'ANNOYED' | 'SULKING' | 'RAGE_QUIT' | 'FORGIVE'

type FleeState = { active: boolean; fleeing: boolean }  // IPC wai:flee (ANNOYED หนีเมาส์)

type QueueItem = {
  id: string
  source: 'claude-code' | 'codex' | 'chatgpt' | 'test' | 'terminal'  // source อื่นที่ไม่รู้จัก → 'terminal'
  kind: 'prompt' | 'subagent'
  agentLabel: string
  createdAt: number        // ใช้คำนวณเวลาที่เหลือจาก timeout 300 วิ
}
```

## 7. กฎการเขียนโค้ด

- React + TypeScript + Vite
- Component ใช้ชื่อแบบ PascalCase และ 1 component ต่อ 1 ไฟล์
- Style ผ่าน token เท่านั้น
- ทุก component ต้องมีวิธีดูมันด้วย mock โดยไม่ต้องพึ่งกล้องหรือ hook
- `WAI_BYPASS=1` ต้องมีป้ายบอกชัดว่า bypass อยู่
- ห้ามติดตั้ง hook แบบ global บนเครื่องตัวเองตอน dev
- ห้ามใส่ key หรือ token ใดๆ ลงในโค้ด

## 8. ลำดับงาน (ตัดจากล่างขึ้นบนถ้าเวลาไม่พอ)

**P0 ต้องมี (ภายใน milestone 50%)**
1. Avatar window + DEMANDING → WATCHING → PASSED
2. Overlay บน webcam: แถบ level, score, วงค้างท่า
3. กองการ์ด (ถ้าไม่ทันใช้ตัวเลข "รออีก N ตัว" แทน)
4. RETRY + ANNOYED + หนีเมาส์

**P1 ถ้ามีเวลา**
5. SULKING, RAGE_QUIT, FORGIVE
6. เหตุผลที่ไหว้ผิด (ต้องรอ Vision)
7. ไหว้แทนการกด Allow/Yes ใน terminal (ต้องให้ Integrations ทำ hook ก่อน)

**Extras (ห้ามเริ่มก่อน P0 เสร็จ)**
8. หน้าอัตราการรอดชีวิต + กราฟระฆังคว่ำ percentile
9. Leaderboard, ไหว้ดีเด่นประจำเดือน
10. Sticker จากรูปไหว้
11. Bypass ด้วย PromptPay: ใช้ QR ปลอมกับปุ่ม "โอนแล้ว" ห้ามรับเงินจริง

## 9. Definition of Done (ต่อ 1 PR)

- [ ] ใช้ token ไม่มี hex ตรงใน component
- [ ] ดูได้ด้วย mock
- [ ] ทดสอบบน mac แล้ว ถ้ามีคนในทีมใช้ Windows ให้ทดสอบด้วย
- [ ] ไม่บังงานของผู้ใช้ และคลิกทะลุพื้นที่โปร่งใสได้
- [ ] แนบ screenshot หรือคลิปสั้นใน PR
