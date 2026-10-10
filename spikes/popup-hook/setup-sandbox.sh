#!/usr/bin/env bash
# สร้างโฟลเดอร์ทดลองนอก repo แล้วติด hook ไว้เฉพาะในนั้น (ห้ามติดแบบ global)
set -euo pipefail
HOOK="$(cd "$(dirname "$0")" && pwd)/hook.mjs"
NODE="$(command -v node)" # path เต็ม เพราะแอป GUI ไม่ได้ PATH ของ shell
DIR="${1:-$HOME/wai-sandbox}"
mkdir -p "$DIR/.claude"
cat > "$DIR/.claude/settings.local.json" <<JSON
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [ { "type": "command", "command": "'$NODE' '$HOOK' claude-code", "timeout": 300 } ] }
    ]
  }
}
JSON
# Codex: hooks.json ระดับโปรเจกต์ (Codex โหลดเมื่อโปรเจกต์ trusted และ hook ผ่าน review แล้ว)
mkdir -p "$DIR/.codex"
cat > "$DIR/.codex/hooks.json" <<JSON
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [ { "type": "command", "command": "'$NODE' '$HOOK' codex", "timeout": 300 } ] }
    ]
  }
}
JSON
echo "ติด hook แล้ว: $DIR/.claude/settings.local.json + $DIR/.codex/hooks.json"
echo "Claude Code: cd '$DIR' && claude"
echo "Codex: เปิดโฟลเดอร์ $DIR ในแอป Codex (trust โปรเจกต์ + อนุมัติ hook ก่อน)"
