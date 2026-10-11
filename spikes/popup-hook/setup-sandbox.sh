#!/usr/bin/env bash
# ติด hook (Claude Code + Codex) ในโฟลเดอร์ทดลองเท่านั้น ห้ามติดแบบ global · ใช้ CLI ข้ามแพลตฟอร์มของ install-hooks.mjs
# ใช้: bash setup-sandbox.sh [โฟลเดอร์]   (ไม่ใส่ = ~/wai-sandbox) · ถอด: node install-hooks.mjs uninstall sandbox
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DIR="${1:-sandbox}"
node "$HERE/install-hooks.mjs" install "$DIR" both
echo "Claude Code: cd '${1:-$HOME/wai-sandbox}' && claude"
