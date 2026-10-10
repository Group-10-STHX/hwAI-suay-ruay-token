# app/main · hwAI desktop app (Lead #1)

แอป Electron ตัวเดียวที่รวม

1. **daemon** ที่ `127.0.0.1:7777` ทำหน้าที่ด่านไหว้ (`gate.js`, `daemon.js`)
2. **mini window** หน้าต่างหลักขนาดเล็ก มี Jason, กล้อง, ระดับไหว้, เครดิต/คิว, เอเจนต์ และหน้าตั้งค่า (`windows/mini/`)
3. **ป๊อปอัพ** Jason ลอยมุมขวาบนของจอ หนึ่งตัวต่อหนึ่งเอเจนต์ (`windows/popup/`)
4. **แชตผ่านด่าน** หน้าต่าง claude.ai / chatgpt.com ที่กักการส่งไว้จนไหว้ผ่าน (`windows/chat/`)
5. **เมนูบาร์** สลับโหมดจริง/สาธิต เปิดหน้าต่างต่างๆ และออก

ไฟล์ที่ใช้ร่วมจากโฟลเดอร์ทีมอื่น

| โฟลเดอร์ | ใช้ทำอะไร |
|---|---|
| `vision/lab/` | MediaPipe Lab และ heuristic ไหว้ (`vision.js`) daemon เสิร์ฟที่ `/lab/` และ mini import จากที่นี่ |
| `characters/jason/` | รูป Jason (`/assets/jason/`) และ `logos.json` |
| `integrations/claude-code/` | hook ของ Claude Code ที่เรียก daemon |

หน้าต่างใน `windows/` เป็น HTML ธรรมดา ยังไม่ได้ย้ายไปใช้ React ของ `app/renderer` ถ้าทีม Front จะรับไปทำต่อ ให้คุยเรื่อง props กับ `app/main` ก่อน

## โหมด

- **โหมดจริง** (ค่าเริ่มต้น): ทุก prompt และ sub-agent ต้องไหว้ผ่าน 1 ครั้งต่อ 1 คำขอ ถ้าไม่มีเครดิตจะรอในคิว การไหว้จะนับเฉพาะตอนมีงานรอ
- **โหมดสาธิต**: ปล่อยผ่านทุกอย่าง ไว้ดูว่าเอเจนต์แต่ละตัวทำอะไร

`WAI_BYPASS=1` ตอนเปิดแอปจะเริ่มเป็นโหมดสาธิต

## รัน

```
cd app/main
npm install
npm start
```

ทดสอบ logic ของด่านและ prefs:

```
npm test
```

ส่งเหตุการณ์จำลอง (เอเจนต์หลัก + sub-agent):

```
python3 app/main/tools/sim.py
```

## API ของ daemon

| เมธอด | path | หน้าที่ |
|---|---|---|
| GET | `/mini/` | หน้าต่าง mini |
| GET | `/lab/` | MediaPipe Lab (จาก `vision/lab/`) |
| GET / POST | `/prefs` | ธีม, สีหลัก, ขนาด Jason, กล่องข้อความ, ลอยบนสุด, กล้อง, เวลาค้างท่า |
| GET | `/agents` | รายการเอเจนต์ของป๊อปอัพ |
| GET | `/state` | โหมด เครดิต คิว เกณฑ์คะแนน เอเจนต์ |
| POST | `/mode` | `{"mode": "real" \| "demo"}` |
| POST | `/settings` | `{"passMinScore": 0-100}` |
| POST | `/wai` | `{"passed", "score"}` ผลการไหว้ ผ่านแล้วได้เครดิต 1 |
| POST | `/events` | `{"type": "start" \| "stop" \| "reset", ...}` เอเจนต์ |
| POST | `/wai/request` | `{"kind": "prompt" \| "subagent", ...}` คืน `{id}` |
| GET | `/wai/wait/:id?timeout=55` | long-poll คืน `allow`, `pending` หรือ `deny` |

## ข้อจำกัดที่ยังมี

- **ชนพอร์ต 7777 กับ `spikes/popup-hook`** ทั้งสองตัวรันพร้อมกันไม่ได้ และ API ต่างกัน ต้องตกลงว่าจะใช้ตัวไหนแล้วรวม API ใน CLAUDE.md
- ไอคอนแถบเมนูบน Windows ยังว่าง
- ยังไม่มีการโกรธ/งอนเต็มรูปแบบ (SULKING / RAGE_QUIT)
- หน้าแชตยังไม่ได้ทดสอบกับบัญชีที่ล็อกอินจริง
