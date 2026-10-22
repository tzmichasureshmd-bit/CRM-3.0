/**
 * CRM 3.0 — Password Change API
 * POST /api/v3/profile/password
 *
 * Proxies to FastAPI PATCH /api/v1/auth/password.
 * Requires the CRM JWT (same token used for all v3 routes).
 * FastAPI increments token_version, invalidating all old sessions.
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json() as { password?: string };
    if (!body.password || body.password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:8000';
    const res = await fetch(`${backendUrl}/api/v1/auth/password`, {
      method: 'PATCH',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: body.password }),
    });

    const data = await res.json() as Record<string, unknown>;
    if (!res.ok) {
      return NextResponse.json({ error: (data.detail as string) ?? 'Failed to update password' }, { status: res.status });
    }
    return NextResponse.json({ message: 'Password updated. Please sign in again.' });
  } catch (err) {
    console.error('[profile/password POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
