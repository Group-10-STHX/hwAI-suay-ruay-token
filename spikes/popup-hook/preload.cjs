// bridge ให้หน้า renderer เรียก main ได้ (ไม่ผ่าน HTTP กันเว็บอื่นยิงเข้ามาสั่งเปิด Terminal)
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('wai', {
  // VisionEvent ~15 fps จากหน้าต่างกล้อง (vision/worker) ส่งต่อผ่าน main คืนฟังก์ชันเลิกฟัง
  onVisionEvent: (cb) => {
    const h = (_e, d) => cb(d)
    ipcRenderer.on('vision:event', h)
    return () => ipcRenderer.off('vision:event', h)
  },
  openCodexHooks: () => ipcRenderer.invoke('wai:open-codex-hooks'),
  setup: {
    status: () => ipcRenderer.invoke('wai:setup-status'),
    hooks: (tool, on) => ipcRenderer.invoke('wai:hooks', tool, on),
    camera: () => ipcRenderer.invoke('wai:camera'),
    loginItem: (on) => ipcRenderer.invoke('wai:login-item', on),
    onboarded: (done) => ipcRenderer.invoke('wai:onboarded', done),
  },
})
