# SPIKE: hook → popup → skip

พิสูจน์ว่าส่ง prompt ใน Claude Code แล้ว popup เด้ง กดข้ามแล้ว AI ทำงานต่อ
**ยังไม่มีกล้อง** ใช้ปุ่ม "ข้าม (dev)" แทนการไหว้ · ดักแค่ `UserPromptSubmit` (ยังไม่ดัก subagent)
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
| ไม่กดจนครบ 290 วิ | exit 2 "หมดเวลาไหว้" (hook timeout ตั้ง 300 วิ เพราะ default ของ UserPromptSubmit แค่ 30) |

## เพิ่มจาก contract (spike เท่านั้น)
- `POST /wai/skip/:id` แทนการไหว้
- `GET /wai/wait/:id` ตอบ `202 {pending:true}` เมื่อครบ 55 วิแล้วยังไม่ไหว้ hook วนถามใหม่
- `GET /wai/queue` ตอบ `{items, state, fail_count, bypass}`

## ข้อควรรู้จาก docs ของ Claude Code
- tool แตก subagent ชื่อ `Agent` แล้ว (เดิม `Task`) ใช้ matcher `Task|Agent`
- hook หมดเวลา = prompt ผ่านไปเลย ถ้าจะบล็อกต้องใส่ `onFailure: "block"`
