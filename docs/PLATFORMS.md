# Platform support

ตรวจโดยอ่านโค้ดและ unit test (สลับค่า platform ที่ฉีดเข้าไป) **ยังไม่เคยรันบน Windows จริง** ช่อง "untested" ต้องมีคนลอง

| ความสามารถ | macOS 13+ | Windows 10/11 | Linux |
|---|---|---|---|
| daemon :7777 + popup + vision | ทดสอบแล้ว | ควรใช้ได้ (untested) | untested |
| ติด/ถอด hook ด้วย `npm run hooks:*` | ทดสอบแล้ว | ควรใช้ได้ (unit test ของ command builder) | ควรใช้ได้ |
| คำสั่ง hook | `WAI_HOOK=1 '~/.waikusa/hook.sh' src` (shim ตั้ง `ELECTRON_RUN_AS_NODE=1`) | Claude: exec form `cmd.exe /d /c call hook.cmd src` · Codex: `commandWindows` ... `; exit $LASTEXITCODE` (untested) | เหมือน mac |
| hook ไม่มี node ในเครื่อง | ใช้ Electron ผ่าน shim | เหมือนกัน (untested) | เหมือนกัน |
| popup บนสุดทุก Space | ใช่ | บนสุดของจอ (ไม่มี Spaces) | untested |
| กรอบหน้าต่างหน้าหลัก | titleBar แบบ hiddenInset | กรอบปกติ ซ่อนเมนูบาร์ | กรอบปกติ |
| tray | ไอคอน + ข้อความ 🙏/💤 บน menu bar | ไอคอน 16px + tooltip (คลิก = หน้าหลัก) | ไอคอน (untested) |
| Dock | ซ่อนไอคอน Dock | ไม่มี | ไม่มี |
| สิทธิ์กล้อง | ขอผ่าน onboarding | OS ถามตอนใช้กล้องครั้งแรก, สถานะอ่านจาก API | OS/เบราว์เซอร์ |
| เปิดตอนเข้าเครื่อง | ผ่าน shortcut `.app` (dev) / API (packaged) | `app.setLoginItemSettings` (untested) | ไม่รองรับ |
| shortcut `.app` (`install-shortcut.sh`) | ใช่ | ไม่มี ใช้ `npm run dev` | ไม่มี |
| ปุ่มเปิด Codex ให้ trust | เปิด Terminal ด้วย osascript | เปิดหน้าต่าง cmd ใหม่ (untested) หา `codex` จาก PATH หรือ `WAI_CODEX_CLI` | แจ้งให้เปิดเอง |
| เล่นเสียง | `afplay` | PowerShell + MediaPlayer (WPF) | `ffplay` / `mpg123` / `paplay` ถ้ามี ไม่มี = เงียบ |
| TTS สำรอง (ไม่มีคีย์ Paxa) | `say -v Kanya` | System.Speech (เสียงไทยต้องลง language pack) | เงียบ |
| `npm run dev`, `npm run setup`, `npm test` | ใช่ | ใช่ (untested) | ใช่ (untested) |
| ส่วนขยายเบราว์เซอร์ | Arc/Chrome/Edge/Brave | Chrome/Edge/Brave | Chromium |
| extras/web (Next.js) | ใช่ | ใช่ (untested) | ใช่ |

## สิ่งที่รู้ว่ายังเสี่ยง

- Windows: ถ้า Claude Code/Codex รัน hook ผ่าน PowerShell ล้วน คำสั่งที่ขึ้นต้นด้วยสตริงในเครื่องหมายคำพูดอาจต้องมี `&` นำหน้า
- Windows: `WAI_RENDERER_URL` แบบไฟล์ต้องเป็น `file:///C:/path/to/dist/`
- Windows: เสียง Paxa เล่นผ่าน MediaPlayer ใช้ได้กับ mp3/wav ที่เพื่อนอัด (WAV 24kHz mono)
- ยังไม่มี installer/แพ็กเกจ (`electron-builder`) ทุกแพลตฟอร์มรันจากซอร์ส
- ภายในโค้ดของ renderer/vision ไม่ได้ตรวจในรอบนี้ (ไม่มีการอ้างถึงระบบไฟล์เฉพาะ OS ที่พบ)
