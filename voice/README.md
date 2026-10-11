# เสียงพูดของ hwAI

แอปพูดได้ตามสถานะของ session (IDLE, DEMANDING, WATCHING, PASSED, RETRY, ANNOYED, SULKING, RAGE_QUIT, FORGIVE)
โดยมี 6 บุคลิก (persona) แต่ละตัวมีเสียง Paxa TTS ของตัวเอง

## ไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `personas.json` | 6 บุคลิก: id, ชื่อไทย, คำอธิบาย, `voice` (id เสียง Paxa), `rate` (ความเร็วของ `say` สำรอง) |
| `lines.json` | 20 ประโยคที่ให้เพื่อนอัดเสียงจริง (4 คน x 5) |
| `lines.extra.json` | ประโยคเสริมของ p5/p6 และข้อความ default ต่อสถานะ (ไม่ต้องอัด) |
| `recorder.template.html` / `build-recorder.mjs` | แม่แบบหน้าอัดเสียง + สคริปต์ build |
| `recorder.html` | หน้าอัดเสียงที่ build แล้ว เปิดจาก `file://` ได้เลย |
| `../spikes/popup-hook/voice.mjs` | โมดูลที่พูดจริง |

## บุคลิกและเสียง

| id | ชื่อ | เสียง Paxa |
|---|---|---|
| p1 | ผู้คุมโหด | thongek |
| p2 | น้องงอน | nomyen |
| p3 | ปู่ใจดี | roti (สำเนียงใต้) |
| p4 | หุ่นเย็นชา | yoyo |
| p5 | สาวอีสาน | somtam |
| p6 | พี่เหนือ | khaosoi |
| p7 | ผู้คุมคลั่ง | kaprao (อารมณ์) |
| p8 | สายมีม | khanomchan (อารมณ์) |

## ลำดับการเลือกเสียงต่อหนึ่งประโยค

1. ไฟล์ที่เพื่อนอัด `~/.waikusa/voice/recordings/<persona>/<lineId>.wav` (หรือ `.mp3`)
2. แคช Paxa `~/.waikusa/voice/cache/<voice>/<sha1(text)>.mp3`
3. เรียก Paxa แล้วเก็บลงแคช (ประโยคเดิมไม่สังเคราะห์ซ้ำ)
4. `say -v Kanya -r <rate>` ของ macOS
5. เงียบ (ไม่ error)

สถานะที่บุคลิกนั้นไม่มีประโยค จะใช้สถานะใกล้เคียงก่อน แล้วค่อยใช้ข้อความ default

## เพื่อนอัดเสียงยังไง

1. เปิด `voice/recorder.html` ด้วย Chrome หรือ Safari (กดอนุญาตไมค์)
2. เลือก "ผมคือคนที่ 1..4" จะเห็น 5 ประโยคของตัวเอง
3. กด ● อัด, พูดประโยคที่ขึ้นหน้าจอ, กด ■ หยุด, กด ▶ ฟัง
   ไม่พอใจให้ "อัดใหม่" พอใจแล้วกด "✓ ใช้"
4. กด "ดาวน์โหลดทั้งหมด" ได้ `hwai-voice-recordings.zip`
5. แตก zip แล้วย้ายโฟลเดอร์ `p1/ p2/ ...` ไปไว้ที่ `~/.waikusa/voice/recordings/`
   ผลลัพธ์เช่น `~/.waikusa/voice/recordings/p1/p1-demanding-1.wav`

ไฟล์เสียงเป็น WAV 16-bit mono 24 kHz ถ้าแก้ `lines.json` ให้รัน `node voice/build-recorder.mjs` ใหม่

## งบตัวอักษรและแคช

- Paxa คิดเครดิตตามตัวอักษร บัญชีนี้มีประมาณ 10,000 ตัวอักษร
- นับตัวอักษรสะสมไว้ที่ `~/.waikusa/voice/budget.json` ค่าเริ่มต้นเพดาน 6000 ตัว
  (ปรับได้ด้วย option `budgetChars` ของ `createVoice`) เกินเพดานแล้วจะไม่เรียก API และใช้ `say` แทน
- ลบ `budget.json` เพื่อรีเซ็ตตัวนับ ลบโฟลเดอร์ `cache/` เพื่อบังคับสังเคราะห์ใหม่ (เสียเครดิตอีก)
- ข้อผิดพลาด 401/402 จะปิด Paxa ตลอด session, 429/5xx/เครือข่ายล่ม จะพัก 60 วินาที
- `prewarm()` สังเคราะห์ทุกประโยคที่ยังไม่มีแคชล่วงหน้า (ประมาณ 600 ตัวอักษรสำหรับทั้ง 28 ประโยค)

## อารมณ์ในเสียง (emotion tags)

- ใช้ได้เฉพาะเสียง `khanomchan` (หญิง) และ `kaprao` (ชาย) ซึ่งเป็นเสียงทดลอง เสียงอื่นไม่อ่านแท็ก
  (แต่ยังคิดเงินตัวอักษรของแท็ก) โมดูลจึงส่งแท็กเฉพาะสองเสียงนี้เท่านั้น
- ฟิลด์ใน `lines*.json` (เลือกอย่างใดอย่างหนึ่ง):
  - `"emotion": "angry"` หรือ `"angry:0.9"` ใส่แท็กไว้หน้าประโยค
  - `"emotionText": "[laughing] ฮ่า ๆ [excited] ไหว้ใหม่"` เขียนแท็กแทรกเองกลางประโยคได้ (`text` ยังเป็นข้อความล้วน)
  - `"speed": 1.1` ความเร็ว 0.5-1.5 (ปัดทีละ 0.05) ตั้งที่ persona ก็ได้
- ชื่อแท็ก: neutral calm normal plain | happy excited cheerful joyful amazed laughing |
  sad crying sorrowful gloomy disappointed | angry shouting furious annoyed frustrated |
  afraid scared fearful nervous terrified anxious ใส่น้ำหนักได้เช่น `[sad:0.6]` หรือ `[sad:50%]`
  โทนค้างจนกว่าจะเจอแท็กใหม่ ชื่อที่ไม่รู้จัก (เช่น `[laughs]`) จะถูกตัดทิ้งก่อนส่ง เพราะ API ตอบ 400
- เสียงที่เพื่อนอัดและ `say` สำรองใช้ข้อความล้วนที่ตัดแท็กแล้วเสมอ
- ค่าใช้จ่าย: แท็กนับเป็นตัวอักษรที่ถูกคิดเงิน ประโยคมีแท็กยาวขึ้นราว 8-15 ตัว
  และแคชแยกตามเสียง+ความเร็ว+ข้อความจริง

## เปลี่ยนเสียง

แก้ฟิลด์ `voice` ของ persona ใน `personas.json` เป็น id เสียงอื่นของ Paxa
(เช่น khanomkrok, nomyen, tako, foithong, massaman, thongek, panang, oliang, larb, khaosoi, roti)
แคชแยกตามชื่อเสียง จึงไม่ชนกัน ส่วนความเร็วของ `say` สำรองปรับที่ `rate`

## ความลับ

คีย์ Paxa อยู่ที่ `~/.waikusa/secrets.json` ฟิลด์ `paxa_api_key` (นอก repo) โมดูลอ่านตอนรันเท่านั้น
ห้ามใส่คีย์ในไฟล์ใน repo, log หรือ test

## ห้องอัดเสียงหลังบ้าน (backoffice) `/admin/voice`

หน้าเว็บให้เพื่อนอัดเสียงจริงทุกประโยคที่น้องพูด (ไม่ใช่แค่ 20 ประโยคใน `recorder.html`) เปิดตอน daemon รันอยู่:
`http://127.0.0.1:7777/admin/voice` (ต้องเป็น `127.0.0.1` หรือ `localhost` เพื่อให้ Chrome/Safari ยอมให้ใช้ไมค์)

- `node voice/build-lines-all.mjs` สร้าง `voice/lines.all.json` จาก `copy.ts` (SPEECH, SPEECH_HINT, REASON_TEXT),
  `lines.json`, `lines.extra.json` (รวม defaults) รันใหม่ทุกครั้งที่แก้ข้อความ
  - id: `copy-speech-<STATE>`, `copy-hint-<STATE>`, `copy-reason-<REASON>`, `default-<STATE>`, ส่วนประโยคตัวละครใช้ id เดิม
  - `plainText` ตัดแท็กอารมณ์ออกแล้ว (หน้าอัดโชว์ข้อความนี้) ฟิลด์ `recorder` ที่เป็น 0 จะถูกแจกให้คน 1..4 หมุนเวียน
  - ประโยคที่ข้อความซ้ำกันและอยู่โฟลเดอร์เดียวกัน (เช่น `copy-speech-WATCHING` = `copy-speech-DEMANDING`) มี `dupOf`
    อัดครั้งเดียว daemon คัดลอกไฟล์ให้ทุก id ให้เอง
- ไฟล์เสียงเก็บที่ `~/.waikusa/voice/recordings/<persona>/<id>.wav` (ประโยคตัวละคร) และ
  `~/.waikusa/voice/recordings/_app/<id>.wav` (ข้อความของแอป) WAV 16-bit mono 24 kHz, ตัดเงียบหัวท้าย, ปรับ peak ราว -3 dBFS
- โหมด "พี่เลี้ยง": ประโยคใหญ่ทีละอัน Space = อัด/หยุด, Enter = ใช้อันนี้, ลูกศรซ้ายขวา = ก่อนหน้า/ถัดไป
- ปุ่ม "ลองฟังในแอป" เรียก `POST /wai/voice/play?id=` ให้ daemon เล่นผ่านเส้นทางเสียงจริงของแอป

API (โมดูล `spikes/popup-hook/voice-admin.mjs`):

| เมธอด | พาธ | หน้าที่ |
| --- | --- | --- |
| GET | `/admin/voice`, `/admin/voice/<index.html\|admin.js\|admin.css>` | หน้าเว็บ (whitelist ชื่อไฟล์) |
| GET | `/wai/voice/lines` | รายการทั้งหมด + สถานะ + ความคืบหน้ารายคน |
| GET / POST / DELETE | `/wai/voice/recording?id=` | ฟัง / อัปโหลด WAV (raw body) / ลบ |
| POST | `/wai/voice/play?id=` | สั่ง daemon เล่นไฟล์ที่อัดแล้ว |

ความปลอดภัย: daemon ฟังที่ 127.0.0.1 แต่เว็บไหนก็ยิงมาที่ localhost ได้ จึงบังคับให้ทุกคำขอที่ไม่ใช่ GET ต้องมี header
`X-Wai-Admin: 1` (หน้าแอดมินส่งให้เอง) เว็บอื่นเติม header แบบกำหนดเองข้าม origin ไม่ได้โดยไม่ผ่าน preflight และ
โมดูลนี้ไม่ส่ง CORS header ใด ๆ จึงไม่มีทางผ่าน นอกจากนี้ตรวจ Host ต้องเป็น 127.0.0.1/localhost กัน DNS rebinding
และตรวจ id ตรงกับรายการแบบ exact match + `^[A-Za-z0-9_-]{1,80}$`, WAV ไม่เกิน 4 MB / 20 วินาที, เขียนไฟล์แบบ temp แล้ว rename

ทดสอบ: `node --test spikes/popup-hook/test/voice-admin.test.mjs`

## อีสเตอร์เอ้ก 67 ("Six Seven")

ตอนเกมท่า 6-7 เริ่ม น้องร้องเป็นภาษาอังกฤษ "Six Seven" เป็นท่อนๆ ด้วยบุคลิก p8 (เสียง `khanomchan` ที่อ่านแท็กอารมณ์ได้): `[excited] Siiix... Seven!` → `[shouting] Six! Seven! Six! Seven!` (เร็ว 1.15) → `[laughing] Six Seven! Do it now!` ทำท่าสำเร็จได้ `[excited:1] Six Seven! Six Seven! Yeah!` · ท่อนละอารมณ์/ความเร็ว (ค่าอยู่ใน `main.mjs` `SIXSEVEN_CALL` / `SIXSEVEN_WIN`) · ไม่มี Paxa ใช้เสียงระบบ Samantha · เสียงดังกว่าปกติ 2.2 เท่า
