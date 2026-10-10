# hwAI desktop app (prototype)

โปรแกรม Mac หนึ่งตัวที่รวมสามอย่างไว้ด้วยกัน

1. **daemon** ที่ `127.0.0.1:7777` ทำหน้าที่ด่านไหว้ (`gate.js`, `daemon.js`)
2. **MediaPipe Lab** หน้าต่างควบคุมแบบ native สำหรับกล้องและการตรวจจับไหว้ (`lab/`)
3. **ป๊อปอัพ** น้อง Jason ลอยมุมขวาบนของจอ บอกว่าเอเจนต์ไหนกำลังรอไหว้หรือทำงานอยู่ (`popup/`)

เมนูบาร์มีสวิตช์ **โหมดจริง / โหมดสาธิต**

## โหมด

- **โหมดจริง** (ค่าเริ่มต้น): ทุก prompt และทุก sub-agent ต้องมีเครดิต เครดิตได้จากการไหว้ผ่าน (คะแนน >= เกณฑ์) หนึ่งครั้งต่อหนึ่งคำขอ ถ้าไม่มีเครดิตจะรอในคิว
- **โหมดสาธิต**: รันทุกอย่างทันที ไม่มีการเช็คการไหว้ ใช้ดูว่าเอเจนต์แต่ละตัวทำอะไร

`WAI_BYPASS=1` ตอน dev จะเริ่มเป็นโหมดสาธิต

## รัน

```
cd prototype/hwai-app
npm install
npm start
```

ทดสอบ logic ของด่าน:

```
npm test
```

## ต่อ Claude Code hook (ยังไม่ติดตั้งให้อัตโนมัติ)

`hooks/wai-gate.js` จะรอจนกว่าแอปจะอนุญาต แล้วออกด้วย exit 0 หรือ exit 2 (บล็อก)

ตัวอย่าง `.claude/settings.json` ของโปรเจกต์ (ติดตั้งเฉพาะในโปรเจกต์ ไม่ใช่ global):

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "node prototype/hwai-app/hooks/wai-gate.js prompt", "timeout": 300 }] }
    ],
    "PreToolUse": [
      {
        "matcher": "Task|Agent",
        "hooks": [{ "type": "command", "command": "node prototype/hwai-app/hooks/wai-gate.js subagent", "timeout": 300 }]
      }
    ]
  }
}
```

ระหว่างพัฒนาให้ตั้ง `WAI_BYPASS=1` เสมอ

## API ของ daemon

| เมธอด | path | หน้าที่ |
|---|---|---|
| GET | `/lab/` | หน้าควบคุม MediaPipe Lab |
| GET | `/agents` | รายการเอเจนต์ของป๊อปอัพ |
| GET | `/state` | โหมด เครดิต คิว เกณฑ์คะแนน |
| POST | `/mode` | `{"mode": "real" \| "demo"}` |
| POST | `/settings` | `{"passMinScore": 0-100}` |
| POST | `/wai` | `{"passed", "score"}` ผลการไหว้ ผ่านแล้วได้เครดิต 1 |
| POST | `/events` | `{"type": "start" \| "stop" \| "reset", ...}` เอเจนต์ |
| POST | `/wai/request` | `{"kind": "prompt" \| "subagent", ...}` คืน `{id}` |
| GET | `/wai/wait/:id?timeout=55` | long-poll คืน `allow` หรือ `pending` |

## ข้อจำกัดที่ยังมี

- ไอคอนแถบเมนูบน Windows ยังว่าง ต้องเพิ่มไฟล์รูป
- ยังไม่มีการโกรธหรืองอน (SULKING / RAGE_QUIT) ตาม state machine เต็ม
- ยังไม่ได้ทดสอบ hook กับ Claude Code จริง ทดสอบแล้วเฉพาะ daemon และ hook script ด้วย stdin จำลอง
- ป๊อปอัพยังไม่ได้ทดสอบการลากด้วยเมาส์
