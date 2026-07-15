const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('poster', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  pickServiceAccount: () => ipcRenderer.invoke('pick-service-account'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
});
