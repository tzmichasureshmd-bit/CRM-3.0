/* eslint-disable @typescript-eslint/no-require-imports */
'use strict';

const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');

const APP_URL = process.env.TZMICHA_CRM_URL || 'https://crm.tzmicha.com';
const APP_ORIGIN = new URL(APP_URL).origin;

function isExternalUrl(rawUrl) {
  try {
    return new URL(rawUrl).origin !== APP_ORIGIN;
  } catch {
    return true;
  }
}

function openExternalSafely(rawUrl) {
  const parsed = new URL(rawUrl);
  if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
    shell.openExternal(rawUrl);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    title: 'Tzmicha CRM',
    backgroundColor: '#020617',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // Keep the window title stable.
  win.on('page-title-updated', (event) => {
    event.preventDefault();
    win.setTitle('Tzmicha CRM');
  });

  // window.open() / target=_blank from the CRM -> open in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) {
      openExternalSafely(url);
    }
    return { action: 'deny' };
  });

  // Top-level navigation away from the CRM -> system browser instead.
  win.webContents.on('will-navigate', (event, url) => {
    if (isExternalUrl(url)) {
      event.preventDefault();
      openExternalSafely(url);
    }
  });

  // Allow what the CRM legitimately needs (mic for voice notes, clipboard),
  // deny everything else.
  win.webContents.session.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const allowed = new Set([
        'media',
        'clipboard-read',
        'clipboard-sanitized-write',
        'fullscreen',
      ]);
      callback(allowed.has(permission));
    }
  );

  win.loadURL(APP_URL);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
