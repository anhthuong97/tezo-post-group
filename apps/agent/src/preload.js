const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tezo', {
  getSettings:  ()       => ipcRenderer.invoke('get-settings'),
  saveSettings: (data)   => ipcRenderer.invoke('save-settings', data),
  getStatus:    ()       => ipcRenderer.invoke('get-status'),
  startAgent:   ()       => ipcRenderer.invoke('start-agent'),
  stopAgent:    ()       => ipcRenderer.invoke('stop-agent'),
  clearSession: ()       => ipcRenderer.invoke('clear-session'),
  minimize:     ()       => ipcRenderer.invoke('minimize'),
  onStatus: (cb) => ipcRenderer.on('status-update', (_, data) => cb(data)),
});
