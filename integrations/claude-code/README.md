# integrations/claude-code · hook ไหว้ก่อนทำงาน

`wai-gate.js` กัก prompt หรือ sub-agent ไว้จนกว่าแอป hwAI (`app/main`) จะอนุญาต

- exit 0 = ไหว้ผ่าน ทำงานต่อ
- exit 2 = บล็อก (ข้อความใน stderr จะขึ้นให้ผู้ใช้เห็น)
- ถ้าเปิดแอปไม่ได้ หรือหมดเวลา (ค่าเริ่มต้น 300 วินาที) จะบล็อก
- `WAI_BYPASS=1` ข้ามด่านระหว่างพัฒนา

## ติดตั้ง (เฉพาะในโปรเจกต์ ห้ามติดแบบ global ตอน dev)

`.claude/settings.json` ของโปรเจกต์ที่จะทดสอบ:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "node integrations/claude-code/wai-gate.js prompt", "timeout": 300 }] }
    ],
    "PreToolUse": [
      {
        "matcher": "Task|Agent",
        "hooks": [{ "type": "command", "command": "node integrations/claude-code/wai-gate.js subagent", "timeout": 300 }]
      }
    ]
  }
}
```

ตั้ง `WAI_DAEMON` ถ้า daemon ไม่ได้อยู่ที่ `http://127.0.0.1:7777`

## หมายเหตุ

`spikes/popup-hook/hook.mjs` ของทีมเป็นอีกเวอร์ชันที่ปล่อยผ่านเมื่อ daemon ไม่ตอบ (fail-open) ส่วนตัวนี้บล็อก (fail-closed) ต้องเลือกพฤติกรรมเดียวก่อนใช้จริง
