import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8000';

export async function GET(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '');
  try {
    const r = await fetch(`${BACKEND}/api/v1/billing`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '');
  try {
    const body = await req.text();
    const r = await fetch(`${BACKEND}/api/v1/billing/plan`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body,
    });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
