#!/usr/bin/env bash
# ดับเบิลคลิกใน Finder เพื่อติดตั้ง ไหว้กูซะ (mac)
# สร้าง ~/Applications/ไหว้กูซะ.app แล้วเปิดให้เลย
cd "$(dirname "$0")" || exit 1
set -e

echo "🙏 ติดตั้ง ไหว้กูซะ"
echo
if ! command -v node >/dev/null 2>&1; then
  echo "❌ ไม่เจอ Node.js ลงก่อนที่ https://nodejs.org (เลือก LTS) แล้วดับเบิลคลิกไฟล์นี้ใหม่"
  read -r -p "กด Enter เพื่อปิด"
  exit 1
fi

bash spikes/popup-hook/install-shortcut.sh

echo
echo "✅ เสร็จ กำลังเปิดแอป… (ครั้งต่อไปกด Cmd+Space แล้วพิมพ์ 'ไหว้กูซะ')"
open "$HOME/Applications/ไหว้กูซะ.app"
read -r -p "กด Enter เพื่อปิดหน้าต่างนี้"
