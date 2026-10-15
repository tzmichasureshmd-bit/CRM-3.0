/* eslint-disable @typescript-eslint/no-require-imports */
'use strict';

// Minimal, sandboxed preload. contextIsolation is on, node integration is
// off, so the CRM never touches Node APIs — it only learns it is running
// inside the native shell, which keeps the app's UI honest.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('tzmichaNative', {
  platform: process.platform,
  isNative: true,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
});
