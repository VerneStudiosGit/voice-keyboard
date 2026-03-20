import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('overlayBridge', {
  onStateChange: (callback: (event: IpcRendererEvent, state: string) => void) => {
    ipcRenderer.removeAllListeners('overlay-state');
    ipcRenderer.on('overlay-state', callback);
  },
  onAudioLevel: (callback: (event: IpcRendererEvent, level: number) => void) => {
    ipcRenderer.removeAllListeners('audio-level');
    ipcRenderer.on('audio-level', callback);
  },
});
