/**
 * Shared fetch helper for all dashboard pages.
 * Automatically prepends BACKEND_URL and adds JWT auth header.
 *
 * @deprecated Use apiFetch from api-client.ts or fetchApi from auth-client.ts instead.
 * This file is kept for backward compatibility only.
 */

import { getCrmToken } from './auth-client';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

export function apiUrl(path: string): string {
  return `${BACKEND}${path}`;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getCrmToken() ?? '';
  const res = await fetch(apiUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('crm:session-expired', {
        detail: { reason: '401_response', url: path, timestamp: new Date().toISOString() }
      }));
    }
    throw new Error('Session expired');
  }
  if (!res.ok) {
    const body = await res.text();
    let msg = `HTTP ${res.status}`;
    try { msg = (JSON.parse(body) as { detail?: string }).detail ?? msg; } catch { /* */ }
    throw new Error(msg);
  }
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}
