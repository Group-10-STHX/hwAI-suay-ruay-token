// bridge ให้หน้า renderer เรียก main ได้ (ไม่ผ่าน HTTP กันเว็บอื่นยิงเข้ามาสั่งเปิด Terminal)
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('wai', {
  // VisionEvent ~15 fps จากหน้าต่างกล้อง (vision/worker) ส่งต่อผ่าน main คืนฟังก์ชันเลิกฟัง
  onVisionEvent: (cb) => {
    const h = (_e, d) => cb(d)
    ipcRenderer.on('vision:event', h)
    return () => ipcRenderer.off('vision:event', h)
  },
  // หนีเมาส์ (main ส่งให้ Avatar window เท่านั้น): { active, fleeing } ส่งเฉพาะตอนเปลี่ยน คืนฟังก์ชันเลิกฟัง
  //   active = โหมดหนีเปิด (หัวคิว ANNOYED) · fleeing = window เพิ่งขยับภายใน ~300ms
  onFlee: (cb) => {
    const h = (_e, d) => cb(d)
    ipcRenderer.on('wai:flee', h)
    return () => ipcRenderer.off('wai:flee', h)
  },
  // popup ปกติให้เมาส์ทะลุ (main ตั้ง ignore) · เมาส์อยู่บนปุ่ม (.interactive) ค่อยขอรับคลิก
  setInteractive: (on) => ipcRenderer.send('wai:interactive', Boolean(on)),
  // หน้าหลัก: เปิด/โฟกัสหน้าต่างกล้อง (หน้าต่างเดียว)
  openCameraView: () => ipcRenderer.invoke('wai:open-camera-view'),
  // ง้อด้วยรหัสซอง True Money 500 บาท (mock ล้อเล่น) → {ok, message}
  bribe: (code) => ipcRenderer.invoke('wai:bribe', String(code ?? '').slice(0, 200)),
  // เปิดเว็บอันดับ WAI-NET ในเบราว์เซอร์ kind = rank | tv | me
  openWeb: (kind) => ipcRenderer.invoke('wai:open-web', String(kind)),
  // ค่าไถ่ True Money 1,000 บาท (mock ล้อเล่น) จากหน้าต่าง tribute → {ok, message} · closeTribute = ปิดหน้าต่าง (คำขอยังรอต่อ)
  tribute: (code) => ipcRenderer.invoke('wai:tribute', String(code ?? '').slice(0, 40)),
  closeTribute: () => ipcRenderer.send('wai:tribute-close'),
  // สวดบทแก้โค้ด (Paliscript): yes=true เท่านั้นที่ใช้ได้ (ปุ่ม ไม่ฟัง หนีเมาส์) · closeChant = ปิดหน้าต่าง
  chantAnswer: (yes) => ipcRenderer.invoke('wai:chant-answer', yes === true),
  closeChant: () => ipcRenderer.send('wai:chant-close'),
  openPaliscript: () => ipcRenderer.invoke('wai:open-paliscript'),
  // พูดข้อความที่ขึ้นในฟองของน้อง (main พูดตามตัวอักษร) · เฉพาะ popup
  sayCopy: (text) => ipcRenderer.send('wai:say-copy', String(text ?? '').slice(0, 160)),
  openCodexHooks: () => ipcRenderer.invoke('wai:open-codex-hooks'),
  setup: {
    status: () => ipcRenderer.invoke('wai:setup-status'),
    hooks: (tool, on) => ipcRenderer.invoke('wai:hooks', tool, on),
    camera: () => ipcRenderer.invoke('wai:camera'),
    loginItem: (on) => ipcRenderer.invoke('wai:login-item', on),
    onboarded: (done) => ipcRenderer.invoke('wai:onboarded', done),
  },
})
