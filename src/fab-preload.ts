import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('fabBridge', {
  openSettings: () => ipcRenderer.send('open-settings'),
});
