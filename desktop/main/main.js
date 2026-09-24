// Proceso principal de Orometra Desktop (Electron).

import { app, BrowserWindow, ipcMain, dialog, shell, session } from 'electron';
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

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

function preloadPath() {
  return path.join(ROOT, 'desktop/preload.cjs');
}

function windowPrefs() {
  return {
    preload: preloadPath(),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  };
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: 'Orometra Desktop',
    webPreferences: windowPrefs(),
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
    webPreferences: windowPrefs(),
  });
  const appHtml = path.join(ROOT, 'app/index.html');
  analysisWindow.loadFile(appHtml, { query: { desktop: '1', ...Object.fromEntries(new URLSearchParams(query.replace(/^\?/, ''))) } });
  analysisWindow.on('closed', () => { analysisWindow = null; });
  return analysisWindow;
}

app.whenReady().then(async () => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    headers['Content-Security-Policy'] = [CSP];
    callback({ responseHeaders: headers });
  });

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
