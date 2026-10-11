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
| Avatar | ขอบขวาของจอ | **คงที่ ไม่เปลี่ยนตาม state** | น้องหุ่น, ข้อความ, กองการ์ด ลอยอยู่บนจอ **ไม่มีกรอบของ island** มีแค่เงาบางๆ ขยับขึ้นลงได้แบบ Dynamic Island · **ตัวน้องมีแผ่นพื้นหลังทึบ ~88% พร้อม padding รอบตัว** (ผู้ใช้แจ้งว่าโปร่งเกินไปมองยากบนพื้นจอที่ลาย) พื้นนอกแผ่นยังโปร่งและคลิกทะลุ |
| Webcam | กลางจอ | คงที่ | ภาพกล้องของทีม Vision เราวาด overlay ทับ เช่น แถบ level, วงค้างท่า, กรอบสแกน |
| Debug panel | ที่ไหนก็ได้ (dev เท่านั้น) | - | ปุ่มสลับ state ปลอม |
| หน้าหลัก (Home) | กลางจอ เปิดตอนเริ่มแอป | คงที่ (window พอดีเนื้อหา) | หน้าเดียว ไม่มีแท็บ · ลำดับ: สวิตช์ → ตัวละคร → เสียง → โหมดสังเกต → ปุ่ม **📷 เปิดหน้าต่างกล้อง** (เรียก `window.wai.openCameraView()`; ไม่มี bridge = เปิด `camera-view.html` ในแท็บใหม่) → สติ๊กเกอร์ → สถิติวันนี้ → ลองไหว้ → **กราฟแท่ง 7 วัน** (`meter/DayChart` จาก `stats.days`) · window ปกติ (มีพื้นหลัง) สวิตช์เปิด/ปิด, (ไม่มีรายการ Claude Code/Codex และปุ่ม trust hook ของ Codex ในหน้าหลัก: อยู่ในหน้า ⚙ ตั้งค่า) ปิดแล้วแอปยังอยู่บน menu bar |
| หน้าต่างกล้อง (Camera view) | กลางจอ เปิดเองไม่ได้ ผู้ใช้สั่งเปิดจากปุ่มในหน้าหลัก หรือ tray เมนู "เปิดหน้ากล้อง" | 460×420 ไม่ resize | `camera-view.html` (`CameraViewWindow`): `camera-overlay/ScanView` props-only เต็มหน้าต่าง: `SCAN มนุษย์` + กล่อง level 3→0 + วงค้างท่า · window ปกติ ไม่โปร่ง ไม่ alwaysOnTop (mac `hiddenInset` + แถบลาก 32px) เปิดได้ทีละหน้าต่าง (เปิดซ้ำ = โฟกัสอันเดิม) · logic อยู่ใน hook `useCameraPreview()`: ภาพจาก getUserMedia ของหน้าต่างนี้, level/คะแนนจาก vision:event, ยิง `POST /wai/camera-preview` ทุก 5 วิ (daemon หมดอายุเอง 12 วิ) ปิดหน้าต่าง/ซ่อน = กล้องดับ + heartbeat หยุด · ไม่อัด ไม่ทำสติ๊กเกอร์ ไม่ลง wais.jsonl |

- Window ทั้งหมดยกเว้นหน้าหลักและหน้าต่างกล้องเป็น transparent, frameless และ alwaysOnTop
- พื้นที่โปร่งใสต้องคลิกทะลุได้ ห้ามบังงานของผู้ใช้
  - ทำจริงที่ main: `setIgnoreMouseEvents(true, {forward:true})` · เมาส์ขึ้นบนองค์ประกอบที่มี class `interactive` (เช่นปุ่มข้าม) renderer เรียก `window.wai.setInteractive(true)` ขอรับคลิก ออกแล้วคืน · ปุ่มใหม่ในหน้านี้ต้องใส่ `interactive` ไม่งั้นกดไม่ติด
- ไหว้ผ่านแล้วน้อง **ไม่หายทันที**: ถ้าคิวว่าง daemon ให้ `state: PASSED` + `linger_ms` (~10 วิ ปรับที่ `LINGER_MS` ใน main.mjs) · AvatarWindow พิมพ์ `LINGER_LINES` ทีละบรรทัดทีละตัวอักษร (`SpeechBubble typing`) แล้วหายเอง · ยังมีคิวต่อ = น้องรีแอค PASSED ~2.5 วิ ก่อนขึ้นการ์ดใบถัดไป · คิวว่างแล้วมีใบใหม่เข้า = เลิกคุยทันที · โหมดสังเกต/level 0 ไม่คุยต่อ
- Webcam window เป็นของทีม Vision (MediaPipe รันอยู่ในนั้น) ทีมเราห้ามไปปิดหรือซ่อนมันเอง ให้ส่งคำขอผ่าน main


## สถิติหน้าหลัก (/wai/status ขยาย)

`AppStatus.stats` = `{requests, passed, bypassed, today:{wais,passed,beautiful,tokens}, total:{wais,passed,beautiful,tokens}, bestScore?}` (map จาก `best_score`). daemon เก่าที่ไม่ส่ง today/total ต้องยังแสดงได้: `status.ts` default เป็น 0 / undefined.
หน้าหลักส่วน "วันนี้" โชว์: รอไหว้ (`pending`, hud), ไหว้วันนี้ (`today.wais`, text), ไหว้สวย (`today.beautiful`, blessed), token วันนี้ (`today.tokens`, blessed) + บรรทัดเล็ก token รวม / คะแนนดีสุด. ต้องพอดี window 520x680 ไม่ scroll.

## เสียง HUD (`src/sfx/`)

สังเคราะห์ด้วย WebAudio ทั้งหมด ไม่มีไฟล์เสียง ไม่มี license. ระดับ `off | few | many` เก็บใน localStorage key `waiSfxLevel` (default `few`) ทุก window sync กันผ่าน `storage` event. `policy.ts` เป็น pure function (ทดสอบด้วย `node --experimental-strip-types --test src/sfx/policy.test.mjs`) ห้ามเล่นเสียงตอน IDLE. component `SfxPicker` เป็น props-only. hook `useScoreSound({state, vision, level})` ติดที่ window ที่ต้องการเสียงเท่านั้น (Avatar) ห้ามติดซ้ำหลาย window เพราะจะเล่นซ้อน.

## ตัวละคร (avatars) ผู้ใช้เลือกน้องได้

- built-in มีตัวเดียวคือ `jason` (SVG ใน `src/mascot/assets`) ตัวอื่นเป็นของผู้ใช้เอง อยู่ใน `~/.waikusa/avatars/<name>/<mood>.png` **ไม่ ship ในรีโป** (ลิขสิทธิ์ของภาพเป็นของเจ้าของ) mood ที่รู้จัก: `angry`, `sad`, `confused`, `forgive`, `default` มีแค่บางอันก็ได้ daemon fallback ให้ (mood ที่ขอ → default → confused → ไฟล์ไหนก็ได้)
- daemon (`spikes/popup-hook/avatars.mjs`): `GET /wai/avatars` → `{current, items:[{name,label,kind:'builtin'|'user',moods[]}]}` · `POST /wai/avatar {name}` → `{current}` · `GET /wai/avatar/<name>/<mood>.png` → ไฟล์ภาพ
- `api/avatars.ts`: `listAvatars()`, `setAvatar(name)`, `avatarUrl(name, mood)` (component ห้ามประกอบ URL เอง)
- `QueueSnapshot.avatar?` และ `AppStatus.avatar?` = ชื่อน้องที่เลือกอยู่ (optional ถ้า daemon เก่าไม่ส่ง = `jason`) AvatarWindow อ่านจาก poll คิวเดิม ไม่ต้องยิงเพิ่ม
- `Mascot` รับ `avatar?: string` + `avatarSrc?: string` (URL ที่ app/ แก้ไว้แล้ว ใช้ `avatarMoodFor(state)` จาก `mascot` เลือก mood แล้วส่งให้ `avatarUrl`) ไม่ใส่/`jason` = Jason SVG เดิม รูปโหลดไม่ได้ → กลับไป Jason เอง
- state → mood: DEMANDING/WATCHING/IDLE → `confused` · RETRY/SULKING → `sad` · ANNOYED/RAGE_QUIT → `angry` · PASSED/FORGIVE → `forgive`
- motion ของรูป PNG: **ห้ามวาดใหม่หรือเปลี่ยนสีรูป** ขยับด้วย CSS transform/filter บน `<img>` เท่านั้น (`src/mascot/avatarMotion.css`) เฉพาะตอนมี `.is-active` ที่ parent (ตรงกับกฎ "ห้ามวนตอนไม่มีคำขอ") และ `still` = ไม่ขยับ · ปิดทั้งหมดเมื่อ `prefers-reduced-motion`
  - confused: เด้งเบาๆ + เอียงนิด · sad: ห้อย+แกว่งช้า · angry: `fx-shake` 4px · forgive: กระโดด + แสงนุ่มสี `blessed`
  - ลายเฉพาะตัว (ตามชื่อโฟลเดอร์): `bob` = line boil (SVG filter feTurbulence+feDisplacementMap เปลี่ยน baseFrequency เป็นขั้นๆ ให้เส้นสั่นแบบ pencil test, scale 2–3px) · `miku` = โยกซ้ายขวา ±3° + หายใจ · `teto` = เด้ง + skew นิดๆ · `robot` = หันหัวช้าๆ (translateX+scale) + scanline สี `hud` ทับ, ตอน angry มี overlay สี `danger`
- หน้าหลักมีแถว "ตัวละคร" ปุ่ม thumbnail (รูป mood `confused`) บรรทัดเดียว ต้องไม่ทำให้ window 400x680 scroll
- โหมด mock (`VITE_USE_MOCK=1`): มี jason + น้องปลอม 2 ตัววาดด้วย CSS (`avatarUrl` คืน `mock:<name>`, `AvatarImage` วาด stub ให้)

## สติ๊กเกอร์ล่าสุด (หน้าหลัก)

- ตอนไหว้ผ่านจริง กล้อง (vision/worker) ตัดฉากหลังเป็น PNG โปร่งใส + ขอบขาว เก็บใน `~/.waikusa/stickers/<waiId>.png` เฉพาะในเครื่อง (อัปโหลดเฉพาะเมื่อผู้ใช้เปิด `web.upload_stickers`) โหมดสังเกตกับ bypass ไม่ทำสติ๊กเกอร์
- daemon: `GET /wai/stickers` → `{items:[{id,file,at,score,level}], style}` ใหม่สุดก่อน 24 ใบ · `GET /wai/sticker/<file>.png` · `POST /wai/sticker-style {style}` · `style` = `'photo' | 'cartoon' | 'comic' | 'pixel' | 'neon' | 'kawaii'` (ค่าอื่น = 400, ค่าเริ่มต้น `photo`) รายการเดียวกันใน `api/types.ts` `STICKER_STYLES`, `vision/worker/sticker.js`, `spikes/popup-hook/stickers.mjs` · ดูหน้าตาแต่ละแบบ: `docs/variants/stickers/index.html` (สร้างด้วย `node scripts/sticker-preview.mjs`)
- `api/stickers.ts`: `listStickers()`, `stickerUrl(file)`, `setStickerStyle(style)` (component ห้ามประกอบ URL เอง) · mock คืนรายการว่าง
- หน้าหลัก: แถบ thumbnail แนวนอน 6 ใบล่าสุด **สูงไม่เกิน 72px รวมตัวเลือกสไตล์** และ **ซ่อนทั้งแถบเมื่อไม่มีสติ๊กเกอร์** (ผู้ใช้บ่นเรื่องความสูงหน้าต่าง) ตัวเลือกสไตล์เป็น `<select>` เล็กบรรทัดเดียว (6 แบบไม่พอที่สำหรับปุ่มสลับ): `รูปถ่าย · การ์ตูน · คอมิก · พิกเซล · นีออน · คาวาอี้` · สีของสไตล์นีออนเป็นพารามิเตอร์ของ worker (ค่าเริ่มต้นตรงกับ token `bg`/`hud`/`blessed`) ไม่มี hex ใน renderer
- component `StickerStrip` เป็น props-only (`items`, `style`, `urlFor`, `onStyle`) สีจาก `tokens.ts` เท่านั้น

## หน้าหลักหลายร่าง (home variants · `src/app/home-variants/`)

หน้าหลักมีร่างให้เลือก 3 แบบ + ร่างปัจจุบัน (default) เลือกได้ตอนรันโดย **ไม่แตะ default**

- `HomeWindow.tsx` เป็นแค่ dispatcher: ที่เดียวที่อ่าน api/hook (status, stickers, avatars (`app/useAvatars.ts`), sfx, onboarding) แล้วส่ง `HomeProps` (`home-variants/model.ts`) ลงร่าง ร่างทุกตัว **props-only** ห้าม import `api` เอง (ยกเว้น type และค่าคงที่ใน `api/types` เช่น `STICKER_STYLES`)
- ไฟล์: `HomeDefault.tsx` (ร่างเดิม ห้ามเปลี่ยนหน้าตาโดยไม่บอก) · `HomeA.tsx` Compact HUD · `HomeB.tsx` Mascot-first · `HomeC.tsx` Dashboard · `shared.tsx` ชิ้นร่วม (Shell, Header, Footer, StatCell, StyleSelect, TogglePill, AvatarRow, MonitorChip, TestButton) · `rank.ts` สูตร level/โอกาสรอด (pure) · `variant.ts` เลือกร่าง · `home.css` motion ของร่าง
- ร่างเดิมสูง ~640 ที่กว้าง 400 และถ้า window เตี้ยกว่าเนื้อหา แถวที่ `overflow:hidden` (สวิตช์ `.fx-scanline`, แถบสติ๊กเกอร์) จะโดนบีบจน hidden (grid item ที่ overflow ไม่ visible มี min-height 0) ร่างใหม่เลี่ยงด้วย root ที่สูงตามเนื้อหา ไม่ใส่ `height:100%`
- สลับร่าง: `home.html?variant=a|b|c` → จำไว้ใน localStorage key `wai-home-variant` (origin เดียวกับ Electron จึงมีผลกับแอปด้วย) · `?variant=default` ล้างค่า · ไม่มี query = อ่าน localStorage · ไม่มีค่า = ร่างเดิม · ตอนอยู่ในร่าง a/b/c มีชิป `ร่าง A` ที่ header กดแล้ววน a→b→c→default (default ไม่มีชิปนี้)
- ขนาด: กว้าง 400 เนื้อหาสูง **≤ 600 ไม่ scroll** (main วัด `#root > div` แล้วปรับความสูง window 360–900 ตาม ดังนั้น root ของร่างต้องสูงตามเนื้อหา ไม่ใช่ `height:100%`; ร่างตั้งพื้นหลัง `--bg` ให้ `<html>` เองตอน mount เพราะ global.css ทำพื้นโปร่ง) · padding บน ≥ 36 เว้นที่ให้ปุ่ม traffic light (`hiddenInset`)
- ทุกร่างต้องมี: สวิตช์เปิด/ปิดใหญ่ · เลือกตัวละคร (ทุกตัวจาก `/wai/avatars`) · เสียง (ปิด/น้อย/เยอะ) · โหมดสังเกต · สถิติวันนี้ 4 ค่า + รวม/ดีสุด · ปุ่มลองไหว้ · ⚙ ตั้งค่า · สติ๊กเกอร์ล่าสุด (ซ่อนเมื่อไม่มี) · โน้ต "ปิดหน้านี้ได้ แอปยังอยู่บน menu bar"
- Motion: class เดิม `.fx-boot` `.is-active` (เปิดอยู่) `.has-pending` (มีคิว) ที่ root เหมือน default · animation ใหม่ใน `home.css` ต้องเป็น one-shot หรือวนเฉพาะใต้ `.has-pending`/`.is-active` และปิดใน `prefers-reduced-motion`
  - HomeB: น้องใช้ `Mascot size="hero"` (168px) state จากสวิตช์: ปิด → `SULKING` · เปิด ไม่มีคิว → `IDLE` (นิ่ง ตามกฎไม่วนตอนว่าง) · มีคิว → `DEMANDING` · กดน้อง = `fx-poke` one-shot + สุ่มประโยคจาก `HOME_SPEECH.poke` ประโยคของน้องบนหน้าหลักทั้งหมดอยู่ใน `states/copy.ts` (`HOME_SPEECH`) เหมือนประโยคอื่นของน้อง
  - HomeB: สติ๊กเกอร์เป็นกอง polaroid ซ้อนเอียง (กรอบ `text` บน `bg`) ไม่เกิน 4 ใบ อยู่ในฉากเดียวกับน้อง
- HomeC คิดจาก `AppStatus` ที่มีอยู่แล้วเท่านั้น **ห้ามขอ field ใหม่จาก daemon**: level/ชื่อตำแหน่ง = ตาราง `LEVELS` ใน `rank.ts` จาก `stats.total.tokens` · สตรีค = นับในเครื่องนี้ (localStorage `wai-home-streak`: วันไหน `today.wais > 0` นับต่อ) ติดป้าย "เครื่องนี้" · โอกาสรอด = สูตรเล่นๆ `survivalOdds()` จาก pass rate, ไหว้สวย, token, คะแนนดีสุด, bypass, คิวค้าง, สวิตช์ปิด ต้องมีป้าย "คิดเล่นๆ" เสมอ
- โชว์ 3 ร่าง: `npm run dev:mock -- --port 5191` แล้วเปิด `docs/variants/home/index.html` (iframe 400px ชี้ไปที่ vite) หรือดูภาพนิ่ง `docs/variants/home/{a,b,c}.png` (ถ่ายด้วย `scripts/shoot-home-variants.mjs` ต้องมี playwright-core + Chrome for Testing ในเครื่อง ดูหัวไฟล์)

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
| `surfaceRaised` | `#1E1E26` | ชั้นที่ยกขึ้นจาก `surface` (ลิ้นชักตั้งค่า, รางคันโยก, พื้นหลังสถิติในร่างหน้าหลัก) |

สีโปร่ง/ไล่ระดับให้ใช้ `color-mix(in srgb, var(--token) N%, transparent)` จาก token เดิม ไม่เพิ่ม hex ใหม่

ขนาดตัวอักษรเพิ่มใน `fontSize`: `micro` 11 (ป้ายกำกับใต้ตัวเลข), `stat` 22 (ตัวเลขสถิติหน้าหลัก), `title` 26 (ชื่อแอปในร่างหน้าหลักแบบกะทัดรัด) ขั้นต่ำสำหรับจอโปรเจกเตอร์ยังใช้กับ Avatar/overlay เท่านั้น หน้าหลักเป็น window ปกติ

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
- หน้าหลัก (ฟีลโลกล่มสลาย ใช้สีทีม แดง/ทอง): เนื้อหา render ลงจากบนลงล่างเป็นคลื่นช้าๆ ตอนเปิดหน้า (`.fx-render`, one-shot, ลำดับด้วย `--i`) · ตัวอักษรกะพริบ (`.fx-flicker`, one-shot ตอนเปิดและทุกครั้งที่ค่าเปลี่ยน) · แถบ render หนา 280px กวาดลง 4 รอบตอนเปิดหน้า (`.fx-boot`) พร้อมทั้งหน้าจอกะพริบแบบ CRT · ตอนมีคำขอรอไหว้ ตัวอักษร หน้าจอ และแถบกวาดกะพริบวนต่อ **ทุก 4 วินาที** (กะพริบ ~1.5 วิ แล้วพัก) · ตอนมีคำขอรอไหว้ (`.has-pending`) แถบกวาดลงถี่ๆ วนต่อได้ เพราะมีคำขอ จึงไม่ขัดกฎด้านบน · ปิดทั้งหมดเมื่อผู้ใช้ปิด motion

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
│   ├── CameraViewWindow.tsx    หน้าต่างกล้อง (main-camera-view.tsx, camera-view.html, useCameraPreview.ts)
    │   ├── AvatarWindow.tsx        ประกอบ Island + CardStack
    │   ├── CameraOverlayWindow.tsx ประกอบ ScanFrame + LevelMeter + HoldRing + ReasonChip
    │   ├── DebugPanel.tsx          ปุ่มสลับ scenario
    │   └── store.tsx               React context + useReducer เก็บ queue, sessionState, vision, flee (+ นับจำนวนครั้งที่หนี)
    ├── api/
    │   ├── types.ts                QueueItem, SessionState, VisionEvent, WaiReason, FleeState
    │   ├── queue.ts                poll GET /wai/queue ทุก 500ms
    │   ├── avatars.ts              listAvatars, setAvatar, avatarUrl (ตัวละครของผู้ใช้)
    │   ├── stickers.ts             listStickers, stickerUrl, setStickerStyle (สติ๊กเกอร์ตอนไหว้ผ่าน)
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
- โหมดสังเกต (`monitor`): daemon จับคำขอจริงทุกช่องทางแต่ไม่บังคับไหว้ ขึ้นการ์ดสั้นๆ แล้วปล่อยผ่านเอง ไม่เปิดกล้อง ไม่นับเป็นการไหว้ ต้องมีป้าย "โหมดสังเกต ไม่ต้องไหว้" บน popup และสวิตช์ในหน้าหลัก (`GET /wai/queue`/`/wai/status` มี `monitor`, `POST /wai/monitor {monitor}`)
- Source เพิ่ม `claude-web` (claude.ai) และ `gemini-web` (gemini.google.com) จาก extension ของเบราว์เซอร์ ใช้ชื่อเป็นตัวหนังสือ ห้ามใช้โลโก้ (สีใช้สีเดิมในไฟล์ tokens)
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
