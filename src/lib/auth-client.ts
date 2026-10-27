/**
 * CRM 3.0 — /api/v3/* fetch helper
 *
 * All /api/v3/* routes authenticate via the FastAPI JWT stored in
 * localStorage (crm_token), verified server-side by verifyRequest().
 *
 * Use fetchApi() for typed JSON calls.
 * Use v3fetch() as a drop-in replacement for bare fetch('/api/v3/...').
 */

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

// ── TOKEN MANAGEMENT ──────────────────────────────────────────

/** Parse JWT payload without verification (client-side only). */
function parseJWT(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Check if JWT is expired (with 2-minute buffer). */
export function isTokenExpired(token: string): boolean {
  const payload = parseJWT(token);
  if (!payload || typeof payload.exp !== 'number') return true;
  const bufferSeconds = 2 * 60; // 2-minute buffer — was 5min which triggered too early
  return Math.floor(Date.now() / 1000) >= (payload.exp - bufferSeconds);
}

/** Get seconds until token expires (returns 0 if expired/invalid). */
export function getTokenExpirySeconds(token: string): number {
  const payload = parseJWT(token);
  if (!payload || typeof payload.exp !== 'number') return 0;
  const seconds = payload.exp - Math.floor(Date.now() / 1000);
  return Math.max(0, seconds);
}

/**
 * CONSOLIDATED TOKEN ACCESSOR (use this everywhere).
 * Validates token structure and returns null if invalid/expired.
 */
export function getCrmToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('crm_token');
  if (!token) return null;
  
  // Validate structure
  const payload = parseJWT(token);
  if (!payload) {
    console.warn('[auth] Invalid JWT structure, clearing token');
    clearAllTokens();
    // Fire session-expired so the renewal modal appears instead of silently failing
    window.dispatchEvent(new CustomEvent('crm:session-expired', {
      detail: { reason: 'malformed_token', timestamp: new Date().toISOString() }
    }));
    return null;
  }
  
  return token;
}

/**
 * Clear ALL auth-related tokens and user data.
 * Use this for all logout/sign-out paths.
 */
export function clearAllTokens(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('crm_token');
  localStorage.removeItem('crm_user');
  localStorage.removeItem('crm_partial_token');
}

/** 
 * Clear the CRM session and redirect to login.
 * @deprecated Use clearAllTokens() + redirect separately for more control.
 */
export function clearSession(): void {
  clearAllTokens();
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}

/**
 * Check if current session is expired and fire event if so.
 * Call this on page load / route changes.
 * Returns true if session is valid, false if expired.
 */
export function checkSessionExpiry(): boolean {
  if (typeof window === 'undefined') return true;
  
  const token = getCrmToken();
  if (!token) return false;
  
  if (isTokenExpired(token)) {
    window.dispatchEvent(new CustomEvent('crm:session-expired', {
      detail: { reason: 'expiry', checked_at: new Date().toISOString() }
    }));
    return false;
  }
  
  return true;
}

/** Build headers with Authorization: Bearer <token> attached. */
function authHeaders(extra?: HeadersInit): HeadersInit {
  const token = getCrmToken();
  const base: Record<string, string> = {};
  if (token) base['Authorization'] = `Bearer ${token}`;
  if (extra) {
    const entries = extra instanceof Headers
      ? Array.from(extra.entries())
      : Object.entries(extra as Record<string, string>);
    for (const [k, v] of entries) base[k] = v;
  }
  return base;
}

// Global flag — prevents multiple simultaneous 401s from firing crm:session-expired more than once
let _sessionExpiredFired = false;

/**
 * Drop-in replacement for bare fetch('/api/v3/...') calls.
 * Automatically attaches the CRM JWT.
 * On 401, fires crm:session-expired event ONCE — shows renewal modal, never redirects.
 */
export function v3fetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    cache: 'no-store',
    ...init,
    headers: authHeaders(init?.headers),
  }).then(res => {
    if (res.status === 401 && typeof window !== 'undefined' && !_sessionExpiredFired) {
      _sessionExpiredFired = true;
      // Reset after 3 seconds so future real expirations still work
      setTimeout(() => { _sessionExpiredFired = false; }, 3000);
      window.dispatchEvent(new CustomEvent('crm:session-expired', {
        detail: { 
          reason: '401_response', 
          url: input,
          timestamp: new Date().toISOString() 
        }
      }));
    }
    return res;
  });
}

/**
 * Typed JSON fetch for /api/v3/* routes.
 * Throws SessionExpiredError / ForbiddenError / ApiError.
 */
export async function fetchApi<T = unknown>(input: string, init?: RequestInit): Promise<T> {
  const res = await v3fetch(input, init);

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
