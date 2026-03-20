import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('voiceKeyboard', {
  onStartRecording: (callback: () => void) => {
    ipcRenderer.removeAllListeners('start-recording');
    ipcRenderer.on('start-recording', callback);
  },
  onStopRecording: (callback: () => void) => {
    ipcRenderer.removeAllListeners('stop-recording');
    ipcRenderer.on('stop-recording', callback);
  },
  onCancelRecording: (callback: () => void) => {
    ipcRenderer.removeAllListeners('cancel-recording');
    ipcRenderer.on('cancel-recording', callback);
  },
  sendAudio: (audioBuffer: ArrayBuffer) => {
    ipcRenderer.send('audio-ready', audioBuffer);
  },
  sendAudioLevel: (level: number) => {
    ipcRenderer.send('audio-level', level);
  },
  onAudioResult: (callback: (result: { success: boolean; text?: string; error?: string }) => void) => {
    ipcRenderer.removeAllListeners('audio-result');
    ipcRenderer.on('audio-result', (_event, result) => callback(result));
  },
});
