// bridge ของหน้าต่างกล้องที่ซ่อนอยู่ (vision/worker) คุยกับ main ได้แค่ช่องทางเหล่านี้
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('visionWorker', {
  ready: () => ipcRenderer.send('vision:ready'),
  emit: (event) => ipcRenderer.send('vision:event', event),
  pass: (result) => ipcRenderer.send('vision:pass', result),
  onControl: (cb) => ipcRenderer.on('vision:control', (_e, msg) => cb(msg)),
})
