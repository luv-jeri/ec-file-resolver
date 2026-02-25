import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),
  getLogs: () => ipcRenderer.invoke('get-logs'),
  getResolutionHistory: () => ipcRenderer.invoke('get-resolution-history'),
});
