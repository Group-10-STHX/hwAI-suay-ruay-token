// bridge ให้หน้า renderer เรียก main ได้ (ไม่ผ่าน HTTP กันเว็บอื่นยิงเข้ามาสั่งเปิด Terminal)
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('wai', {
  onVisionEvent: () => () => {}, // ยังไม่มีกล้องใน spike
  openCodexHooks: () => ipcRenderer.invoke('wai:open-codex-hooks'),
  setup: {
    status: () => ipcRenderer.invoke('wai:setup-status'),
    hooks: (tool, on) => ipcRenderer.invoke('wai:hooks', tool, on),
    camera: () => ipcRenderer.invoke('wai:camera'),
    loginItem: (on) => ipcRenderer.invoke('wai:login-item', on),
    onboarded: (done) => ipcRenderer.invoke('wai:onboarded', done),
  },
})
