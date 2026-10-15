const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('aervyx', {
  openFile: () => ipcRenderer.invoke('file:open'),
  saveFile: (payload) => ipcRenderer.invoke('file:save', payload),
  restartApp: () => ipcRenderer.invoke('app:restart'),
  openFolder: (folder) => ipcRenderer.invoke('folder:open', folder),
  setAlwaysOnTop: (value) => ipcRenderer.invoke('window:always-on-top', value),
  getRobloxTestInfo: () => ipcRenderer.invoke('roblox-test:get-info'),
  sendRobloxTestCommand: (command) => ipcRenderer.invoke('roblox-test:submit', command),
  onRobloxTestStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('roblox-test:status', listener);
    return () => ipcRenderer.removeListener('roblox-test:status', listener);
  },
});
