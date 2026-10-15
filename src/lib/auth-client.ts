/**
 * CRM 3.0 — Browser auth + API helper
 *
 * The Next.js API routes (/api/v3/*) authenticate the caller with the Supabase
 * session that lives in the auth cookies. This helper guarantees the browser
 * keeps a valid Supabase session and gives pages a single fetch wrapper that:
 *   - transparently refreshes an expired access token and retries once,
 *   - classifies 401 (session) / 403 (forbidden) / other errors so the UI can
 *     react correctly instead of showing a misleading "session expired" message.
 *
 * It never disables auth, weakens RLS or exposes secrets — it only uses the
 * public anon key through the standard @supabase/ssr browser client.
 */

import type { Session } from '@supabase/supabase-js';

export class SessionExpiredError extends Error {
  constructor(message = 'Your session has expired. Please sign in again.') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'You do not have permission to view this data.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message?: string) {
    super(message ?? `Request failed (${status})`);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function browserClient() {
  const { createClient } = await import('@/lib/supabase/client');
  return createClient();
}

/** Mirror the Supabase session into the legacy localStorage keys other pages use. */
export function syncStoredUser(session: Session): void {
  if (typeof window === 'undefined') return;
  const u = session.user;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  localStorage.setItem('crm_token', session.access_token);
  localStorage.setItem('crm_user', JSON.stringify({
    user_id: u.id,
    account_id: meta.account_id ?? '',
    role: meta.role ?? 'owner',
    email: u.email ?? '',
    full_name: (meta.full_name as string) ?? (u.email ? u.email.split('@')[0] : ''),
  }));
}

/**
 * Ensure the browser holds a usable Supabase session. Refreshes the access
 * token when possible and re-syncs the legacy token. Returns true when a
 * session is available.
 */
export async function ensureSession(): Promise<boolean> {
  try {
    const supabase = await browserClient();
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data.session) { syncStoredUser(data.session); return true; }
    const { data: existing } = await supabase.auth.getSession();
    if (existing.session) { syncStoredUser(existing.session); return true; }
  } catch { /* network / storage errors fall through to false */ }
  return false;
}

/** Clear the local session (Supabase cookies + legacy keys). */
export async function clearSession(): Promise<void> {
  try {
    const supabase = await browserClient();
    await supabase.auth.signOut();
  } catch { /* ignore */ }
  if (typeof window !== 'undefined') {
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
  }
}

/**
 * Fetch a /api/v3/* route with automatic session refresh + retry.
 * Throws SessionExpiredError / ForbiddenError / ApiError so callers can render
 * the right state instead of a single generic message.
 */
export async function fetchApi<T = unknown>(input: string, init?: RequestInit): Promise<T> {
  const run = () => fetch(input, { cache: 'no-store', ...init });

  let res = await run();
  if (res.status === 401) {
    const refreshed = await ensureSession();
    if (refreshed) res = await run();
  }

  if (res.status === 401) throw new SessionExpiredError();
  if (res.status === 403) {
    let msg: string | undefined;
    try { msg = (await res.json())?.error; } catch { /* not json */ }
    throw new ForbiddenError(msg);
  }
  if (!res.ok) {
    let msg: string | undefined;
    try { msg = (await res.json())?.error; } catch { /* not json */ }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}
