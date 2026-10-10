"use strict";

// Lets the mini page size its own window to fit its content.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hwaiWin", {
  setHeight: (h) => ipcRenderer.send("mini:height", h),
});
