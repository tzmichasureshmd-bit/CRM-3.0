import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

const AUTH_STATE = path.join(__dirname, 'e2e', 'auth-state.json');

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'e2e/results.json' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'off',
    storageState: AUTH_STATE,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
