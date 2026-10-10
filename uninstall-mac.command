#!/usr/bin/env bash
# ดับเบิลคลิกใน Finder เพื่อถอนการติดตั้ง ไหว้กูซะ (mac)
# ปิดแอป → ถอด hook (เฉพาะของเรา) → ลบเปิดตอนเข้าเครื่อง → ลบแอป + ~/.waikusa
# ไม่ลบโฟลเดอร์ repo และไม่ลบ ~/wai-sandbox (อาจมีไฟล์ของนายอยู่)
cd "$(dirname "$0")" || exit 1
SPIKE="$PWD/spikes/popup-hook"

echo "🗑  ถอนการติดตั้ง ไหว้กูซะ"
read -r -p "แน่ใจนะ? (y/N) " yes
[[ "$yes" == "y" || "$yes" == "Y" ]] || { echo "ยกเลิก"; exit 0; }

echo "• ปิดแอป"
pkill -f "popup-hook/node_modules/electron" 2>/dev/null || true

echo "• ถอด hook ของ Claude Code / Codex (ไม่แตะ hook อื่น)"
RUNTIME="$(command -v node || true)"
[[ -z "$RUNTIME" ]] && RUNTIME="$SPIKE/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
if [[ -x "$RUNTIME" ]]; then
  ELECTRON_RUN_AS_NODE=1 HOOKS="$SPIKE/install-hooks.mjs" "$RUNTIME" --input-type=module -e '
    const m = await import(process.env.HOOKS)
    for (const tool of ["claude", "codex"]) for (const scope of ["sandbox", "global"])
      if (m.installed(tool, scope)) console.log("  ถอด", tool, scope, "→", m.uninstall(tool, scope))
  ' || echo "  ⚠️ ถอด hook ไม่สำเร็จ เปิดแอปแล้วถอดใน ⚙ แทน"
else
  echo "  ⚠️ ไม่เจอ node/electron ข้ามขั้นนี้"
fi

echo "• ลบ 'เปิดตอนเข้าเครื่อง'"
osascript -e 'tell application "System Events" to delete (every login item whose name is "ไหว้กูซะ")' >/dev/null 2>&1 || true

echo "• ลบแอปและการตั้งค่า"
bash "$SPIKE/install-shortcut.sh" --uninstall
rm -rf "$HOME/.waikusa"

echo
echo "✅ ถอนเรียบร้อย (backup ของ settings เดิมอยู่ที่ *.wai.bak ข้างไฟล์เดิม)"
read -r -p "กด Enter เพื่อปิดหน้าต่างนี้"
