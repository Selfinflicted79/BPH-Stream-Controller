const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("splash", {
  done: () => ipcRenderer.send("bph:splash-done"),
});
