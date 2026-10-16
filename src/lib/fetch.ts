/**
 * Shared fetch helper for all dashboard pages.
 * Automatically prepends BACKEND_URL and adds JWT auth header.
 */

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('crm_token') ?? '';
}

export function apiUrl(path: string): string {
  // path should start with /api/v1/...
  return `${BACKEND}${path}`;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const res = await fetch(apiUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    let msg = `HTTP ${res.status}`;
    try { msg = (JSON.parse(body) as { detail?: string }).detail ?? msg; } catch { /* */ }
    throw new Error(msg);
  }
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}
