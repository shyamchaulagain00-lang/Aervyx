"use strict";

// electron/preload.cjs
var { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("aervyx", { openFile: () => ipcRenderer.invoke("file:open"), saveFile: (payload) => ipcRenderer.invoke("file:save", payload), restartApp: () => ipcRenderer.invoke("app:restart"), openFolder: (folder) => ipcRenderer.invoke("folder:open", folder), setAlwaysOnTop: (value) => ipcRenderer.invoke("window:always-on-top", value) });
