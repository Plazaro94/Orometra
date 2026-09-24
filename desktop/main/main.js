// Proceso principal de Orometra Desktop (Electron).

import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createLedgerClient } from './ledger/client.js';
import { defaultLedgerPath } from './ledger/db.js';
import { registerIpc } from './ipc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

let mainWindow = null;
let analysisWindow = null;
const ledger = createLedgerClient();

function preloadPath() {
  return path.join(ROOT, 'desktop/preload.cjs');
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: 'Orometra Desktop',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow.loadFile(path.join(ROOT, 'desktop/renderer/index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

export function openAnalysisWindow(query = '') {
  if (analysisWindow && !analysisWindow.isDestroyed()) {
    analysisWindow.focus();
    if (query) analysisWindow.loadURL(analysisWindow.getURL().split('?')[0] + query);
    return analysisWindow;
  }
  analysisWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: 'Orometra — Análisis',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  const appHtml = path.join(ROOT, 'app/index.html');
  analysisWindow.loadFile(appHtml, { query: { desktop: '1', ...Object.fromEntries(new URLSearchParams(query.replace(/^\?/, ''))) } });
  analysisWindow.on('closed', () => { analysisWindow = null; });
  return analysisWindow;
}

app.whenReady().then(async () => {
  const dbPath = defaultLedgerPath(app.getPath('userData'));
  await ledger.start(dbPath);
  registerIpc({ ledger, dialog, shell, fs, path, ROOT, openAnalysisWindow, getMainWindow: () => mainWindow });
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  ledger.stop();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  ledger.stop();
});
