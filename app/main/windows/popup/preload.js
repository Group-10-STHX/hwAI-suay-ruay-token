// Bridge between the renderer and the main process. Only the calls listed here are exposed.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("popup", {
  onData: (callback) => {
    ipcRenderer.on("popup:data", (_event, payload) => callback(payload));
  },
  setHeight: (h) => ipcRenderer.send("popup:height", h),
  quit: () => ipcRenderer.send("popup:quit"),
});
