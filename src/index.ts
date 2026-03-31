import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

import { app, BrowserWindow, globalShortcut, ipcMain, systemPreferences, dialog, screen } from 'electron';
import { exec } from 'child_process';
import { transcribeAudio } from './whisper';
import { typeText } from './typer';
import { loadConfig, saveConfig } from './config';
import { applyFilters } from './filters';

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare const OVERLAY_WINDOW_WEBPACK_ENTRY: string;
declare const OVERLAY_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare const SETTINGS_WINDOW_WEBPACK_ENTRY: string;
declare const SETTINGS_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare const FAB_WINDOW_WEBPACK_ENTRY: string;
declare const FAB_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

let win: BrowserWindow | null = null;
let overlay: BrowserWindow | null = null;
let settingsWin: BrowserWindow | null = null;
let fabWin: BrowserWindow | null = null;
let isRecording = false;
let isProcessing = false;
let previousAppBundleId: string | null = null;
let currentShortcut: string | null = null;

function saveFrontmostApp(): Promise<void> {
  return new Promise((resolve) => {
    exec(
      `osascript -e 'tell application "System Events" to get bundle identifier of first process whose frontmost is true'`,
      (err, stdout) => {
        if (!err && stdout.trim()) {
          previousAppBundleId = stdout.trim();
        }
        resolve();
      }
    );
  });
}

function restoreFocus(): Promise<void> {
  return new Promise((resolve) => {
    if (!previousAppBundleId) {
      resolve();
      return;
    }
    exec(
      `osascript -e 'tell application id "${previousAppBundleId}" to activate'`,
      () => resolve()
    );
  });
}

function broadcastStatus(status: string): void {
  settingsWin?.webContents.send('status-change', status);
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1,
    height: 1,
    show: false,
    frame: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
}

function createOverlay(): void {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.size;

  overlay = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    roundedCorners: false,
    type: 'panel',
    webPreferences: {
      preload: OVERLAY_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlay.setIgnoreMouseEvents(true);
  overlay.setVisibleOnAllWorkspaces(true);
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.loadURL(OVERLAY_WINDOW_WEBPACK_ENTRY);
}

function createFab(): void {
  const display = screen.getPrimaryDisplay();
  const { x: workAreaX, y: workAreaY, width: workAreaWidth, height: workAreaHeight } = display.workArea;
  const fabSize = 44;

  fabWin = new BrowserWindow({
    width: fabSize,
    height: fabSize,
    // Use work area so the FAB stays visible above the Dock/menu bar.
    x: Math.round(workAreaX + workAreaWidth / 2 - fabSize / 2),
    y: Math.round(workAreaY + workAreaHeight - fabSize - 12),
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    roundedCorners: false,
    type: 'panel',
    webPreferences: {
      preload: FAB_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  fabWin.setVisibleOnAllWorkspaces(true);
  fabWin.setAlwaysOnTop(true, 'floating');
  fabWin.loadURL(FAB_WINDOW_WEBPACK_ENTRY);

  fabWin.once('ready-to-show', () => {
    fabWin?.showInactive();
  });
}

function createSettingsWindow(): void {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }

  const display = screen.getPrimaryDisplay();
  const { x: workAreaX, y: workAreaY, width: workAreaWidth, height: workAreaHeight } = display.workArea;
  const panelWidth = 340;
  const panelHeight = 480;

  // Position above the FAB, within work area (above dock)
  const x = Math.round(workAreaX + workAreaWidth / 2 - panelWidth / 2);
  const y = Math.round(workAreaY + workAreaHeight - panelHeight - 60);

  settingsWin = new BrowserWindow({
    width: panelWidth,
    height: panelHeight,
    x,
    y,
    show: false,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: true,
    vibrancy: 'menu',
    visualEffectState: 'active',
    webPreferences: {
      preload: SETTINGS_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWin.loadURL(SETTINGS_WINDOW_WEBPACK_ENTRY);

  settingsWin.once('ready-to-show', () => {
    settingsWin?.show();
    settingsWin?.focus();
  });

  settingsWin.on('closed', () => {
    settingsWin = null;
  });

  const status = isRecording ? 'recording' : isProcessing ? 'transcribing' : 'idle';
  settingsWin.webContents.once('did-finish-load', () => {
    broadcastStatus(status);
  });
}

function toggleSettingsWindow(): void {
  if (settingsWin && !settingsWin.isDestroyed()) {
    if (settingsWin.isVisible()) {
      settingsWin.close();
      settingsWin = null;
    } else {
      settingsWin.show();
      settingsWin.focus();
    }
  } else {
    createSettingsWindow();
  }
}

function showOverlay(state: 'recording' | 'transcribing'): void {
  if (!overlay) return;
  overlay.showInactive();
  overlay.webContents.send('overlay-state', state);
}

function hideOverlay(): void {
  if (overlay) overlay.hide();
}

async function checkMicrophonePermission(): Promise<boolean> {
  const status = systemPreferences.getMediaAccessStatus('microphone');
  if (status === 'granted') return true;

  if (status === 'not-determined') {
    return await systemPreferences.askForMediaAccess('microphone');
  }

  dialog.showErrorBox(
    'Microphone Permission Required',
    'Voice Keyboard needs microphone access. Please grant it in System Settings > Privacy & Security > Microphone.'
  );
  return false;
}

app.whenReady().then(async () => {
  if (app.dock) app.dock.hide();

  const micAllowed = await checkMicrophonePermission();
  if (!micAllowed) {
    app.quit();
    return;
  }

  createWindow();
  createOverlay();
  createFab();

  function registerEscape(): void {
    if (!globalShortcut.isRegistered('Escape')) {
      globalShortcut.register('Escape', () => {
        if (isRecording) {
          isRecording = false;
          hideOverlay();
          broadcastStatus('idle');
          win?.webContents.send('cancel-recording');
          previousAppBundleId = null;
          globalShortcut.unregister('Escape');
        }
      });
    }
  }

  function registerShortcutWithEscape(accelerator: string): boolean {
    if (currentShortcut) {
      globalShortcut.unregister(currentShortcut);
    }

    const registered = globalShortcut.register(accelerator, async () => {
      if (isProcessing) return;

      if (!isRecording) {
        await saveFrontmostApp();

        isRecording = true;
        showOverlay('recording');
        broadcastStatus('recording');
        win?.webContents.send('start-recording');
        registerEscape();

        await restoreFocus();
      } else {
        isRecording = false;
        hideOverlay();
        broadcastStatus('idle');
        win?.webContents.send('stop-recording');
        if (globalShortcut.isRegistered('Escape')) {
          globalShortcut.unregister('Escape');
        }
      }
    });

    if (registered) {
      currentShortcut = accelerator;
    } else {
      console.error(`Failed to register global shortcut: ${accelerator}`);
      currentShortcut = null;
    }
    return registered;
  }

  const config = loadConfig();
  registerShortcutWithEscape(config.shortcut || 'F19');

  // Relay audio level from recorder to overlay
  ipcMain.on('audio-level', (_event, level: number) => {
    overlay?.webContents.send('audio-level', level);
  });

  ipcMain.on('audio-ready', async (event, audioBuffer: ArrayBuffer) => {
    if (isProcessing) return;
    isProcessing = true;
    broadcastStatus('transcribing');
    showOverlay('transcribing');
    try {
      let text = await transcribeAudio(Buffer.from(audioBuffer));
      if (text?.trim()) {
        text = await applyFilters(text.trim());
        await restoreFocus();
        await new Promise((r) => setTimeout(r, 150));
        await typeText(text);
      }
      event.sender.send('audio-result', { success: true, text });
    } catch (err: any) {
      console.error('Transcription/filter error:', err);
      event.sender.send('audio-result', { success: false, error: err.message });
    } finally {
      isProcessing = false;
      previousAppBundleId = null;
      broadcastStatus('idle');
      hideOverlay();
    }
  });

  // FAB click -> open settings
  ipcMain.on('open-settings', () => {
    toggleSettingsWindow();
  });

  // Settings IPC
  ipcMain.handle('get-config', () => {
    return loadConfig();
  });

  ipcMain.handle('save-config', (_event, newConfig: any) => {
    const oldConfig = loadConfig();
    saveConfig(newConfig);
    if (newConfig.apiKey) {
      process.env.OPENAI_API_KEY = newConfig.apiKey;
    }
    // Re-register shortcut if it changed
    if (newConfig.shortcut && newConfig.shortcut !== oldConfig.shortcut) {
      const ok = registerShortcutWithEscape(newConfig.shortcut);
      return { shortcutRegistered: ok };
    }
    return { shortcutRegistered: true };
  });

  ipcMain.on('app-quit', () => {
    app.quit();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('before-quit', () => {
  (app as any).isQuitting = true;
});

app.on('window-all-closed', () => {
  // Don't quit - we're a menu bar app
});
