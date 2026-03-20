import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('settingsBridge', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config: any) => ipcRenderer.invoke('save-config', config),
  quit: () => ipcRenderer.send('app-quit'),
  onStatusChange: (callback: (status: string) => void) => {
    ipcRenderer.removeAllListeners('status-change');
    ipcRenderer.on('status-change', (_event, status) => callback(status));
  },
});
