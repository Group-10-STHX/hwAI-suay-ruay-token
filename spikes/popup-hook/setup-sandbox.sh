#!/usr/bin/env bash
# สร้างโฟลเดอร์ทดลองนอก repo แล้วติด hook ไว้เฉพาะในนั้น (ห้ามติดแบบ global)
set -euo pipefail
HOOK="$(cd "$(dirname "$0")" && pwd)/hook.mjs"
DIR="${1:-$HOME/wai-sandbox}"
mkdir -p "$DIR/.claude"
cat > "$DIR/.claude/settings.local.json" <<JSON
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [ { "type": "command", "command": "node '$HOOK'", "timeout": 300 } ] }
    ]
  }
}
JSON
echo "ติด hook แล้วที่ $DIR/.claude/settings.local.json"
echo "ทดสอบ: cd '$DIR' && claude"
