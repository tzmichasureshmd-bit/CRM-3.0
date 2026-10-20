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

/** Read the CRM JWT from localStorage (browser only). */
function getCrmToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('crm_token');
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

/**
 * Drop-in replacement for bare fetch('/api/v3/...') calls.
 * Automatically attaches the CRM JWT. Returns the raw Response.
 */
export function v3fetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    cache: 'no-store',
    ...init,
    headers: authHeaders(init?.headers),
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
