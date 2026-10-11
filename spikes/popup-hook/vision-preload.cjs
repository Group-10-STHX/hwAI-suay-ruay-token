// bridge ของหน้าต่างกล้องที่ซ่อนอยู่ (vision/worker) คุยกับ main ได้แค่ช่องทางเหล่านี้
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('visionWorker', {
  ready: () => ipcRenderer.send('vision:ready'),
  emit: (event) => ipcRenderer.send('vision:event', event),
  pass: (result) => ipcRenderer.send('vision:pass', result),
  fail: (result) => ipcRenderer.send('vision:fail', result),
  sticker: (s) => ipcRenderer.send('vision:sticker', s), // รูปสติ๊กเกอร์ PNG หลัง vision:pass (seq เดียวกัน)
  sixSeven: (r) => ipcRenderer.send('vision:67', r),
  gif: (g) => ipcRenderer.send('vision:gif', g), // GIF ตอนไหว้ผ่าน (seq เดียวกับ vision:pass) เก็บในเครื่องเท่านั้น
  clip: (clip) => ipcRenderer.send('vision:clip', clip), // dev เท่านั้น
  onControl: (cb) => ipcRenderer.on('vision:control', (_e, msg) => cb(msg)),
  onWai: (cb) => ipcRenderer.on('vision:wai', (_e, msg) => cb(msg)), // {seq, id} หลัง vision:pass ที่บันทึกแล้ว (seed ของสติ๊กเกอร์)
})
