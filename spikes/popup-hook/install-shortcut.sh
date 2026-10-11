#!/usr/bin/env bash
# สร้าง ~/Applications/ไหว้กูซะ.app กดเปิดจาก Spotlight / Launchpad ได้ (mac เท่านั้น)
# แอปนี้ชี้มาที่โฟลเดอร์ repo นี้ ถ้าย้าย repo ให้รันสคริปต์นี้ใหม่
# ถอนการติดตั้ง: bash install-shortcut.sh --uninstall
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "สคริปต์นี้สร้างแอป .app สำหรับ macOS เท่านั้น · Windows/Linux ใช้: node scripts/dev.mjs (ที่ root ของ repo) — ดู README.md" >&2
  exit 1
fi

APP="$HOME/Applications/ไหว้กูซะ.app"
if [[ "${1:-}" == "--uninstall" ]]; then
  rm -rf "$APP" && echo "ลบ $APP แล้ว"
  exit 0
fi

SPIKE="$(cd "$(dirname "$0")" && pwd)"
RENDERER="$(cd "$SPIKE/../../app/renderer" && pwd)"
NODE_BIN="$(dirname "$(command -v node)")" # แอป GUI ไม่ได้ PATH ของ shell ต้องจำไว้ตอนติดตั้ง

echo "ติดตั้ง dependency..."
npm --prefix "$SPIKE" install --silent
npm --prefix "$RENDERER" install --silent

mkdir -p "$APP/Contents/MacOS"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>ไหว้กูซะ</string>
  <key>CFBundleIdentifier</key><string>com.group10sthx.waikusa.launcher</string>
  <key>CFBundleExecutable</key><string>launch</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSUIElement</key><true/>
</dict></plist>
PLIST

cat > "$APP/Contents/MacOS/launch" <<LAUNCH
#!/usr/bin/env bash
export PATH="$NODE_BIN:/usr/bin:/bin"
LOG="\$HOME/Library/Logs/wai-kusa.log"
{
  echo "=== \$(date) ==="
  # build หน้าตาทุกครั้งที่เปิด (ไม่กี่วิ) จะได้ตรงกับโค้ดล่าสุดใน repo
  npm --prefix "$RENDERER" run build
} >> "\$LOG" 2>&1
WAI_RENDERER_URL="file://$RENDERER/dist/" exec "$SPIKE/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" "$SPIKE" >> "\$LOG" 2>&1
LAUNCH
chmod +x "$APP/Contents/MacOS/launch"

echo "เสร็จ: $APP"
echo "เปิด: Cmd+Space พิมพ์ 'ไหว้กูซะ' · log อยู่ที่ ~/Library/Logs/wai-kusa.log"
