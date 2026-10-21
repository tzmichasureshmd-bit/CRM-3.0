/**
 * Playwright globalSetup — CRM 3.0
 *
 * Runs once before all tests. Logs in via the CRM API and writes
 * localStorage state to e2e/auth-state.json so every authenticated
 * test starts already signed in — no test.skip() guards needed.
 *
 * Required env vars:
 *   E2E_EMAIL     — test account email
 *   E2E_PASSWORD  — test account password
 *   PLAYWRIGHT_BASE_URL — defaults to http://localhost:3000
 *
 * If credentials are missing, writes an empty state file and
 * authenticated tests will redirect to /login (expected behaviour
 * for the unauthenticated-redirect test).
 */

import { chromium, type FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const STATE_FILE = path.join(__dirname, 'auth-state.json');
const BACKEND   = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

export default async function globalSetup(_config: FullConfig) {
  const email    = process.env.E2E_EMAIL    ?? '';
  const password = process.env.E2E_PASSWORD ?? '';

  if (!email || !password) {
    console.log('[globalSetup] No E2E_EMAIL/E2E_PASSWORD — writing empty auth state');
    fs.writeFileSync(STATE_FILE, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  // Call the CRM login API directly — faster than driving the UI
  let token = '';
  let userId = '';
  let accountId = '';

  try {
    const res = await fetch(`${BACKEND}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[globalSetup] Login failed ${res.status}: ${body}`);
      fs.writeFileSync(STATE_FILE, JSON.stringify({ cookies: [], origins: [] }));
      return;
    }

    const data = await res.json() as {
      access_token: string;
      user_id: string;
      account_id: string;
      full_name: string;
      email: string;
      role: string;
    };

    token     = data.access_token;
    userId    = data.user_id;
    accountId = data.account_id;
    console.log(`[globalSetup] Logged in as ${data.email} (${data.role})`);
  } catch (err) {
    console.error('[globalSetup] Login request failed:', err);
    fs.writeFileSync(STATE_FILE, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  // Inject token into browser localStorage via a headless page
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page    = await context.newPage();

  await page.goto(`${baseURL}/login`);
  await page.evaluate(
    ({ token, userId, accountId, email }) => {
      localStorage.setItem('crm_token', token);
      localStorage.setItem('crm_user', JSON.stringify({
        user_id: userId,
        account_id: accountId,
        email,
      }));
    },
    { token, userId, accountId, email }
  );

  await context.storageState({ path: STATE_FILE });
  await browser.close();
  console.log(`[globalSetup] Auth state written to ${STATE_FILE}`);
}
