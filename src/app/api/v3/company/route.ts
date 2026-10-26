import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8000';

function tok(req: NextRequest) {
  return (req.headers.get('authorization') ?? '').replace('Bearer ', '');
}

export async function GET(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  try {
    const r = await fetch(`${BACKEND}/api/v1/company/profile`, {
      headers: { Authorization: `Bearer ${tok(req)}` },
    });
    if (!r.ok) return NextResponse.json({}, { status: r.status });
    return NextResponse.json(await r.json());
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
}

export async function PATCH(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  try {
    const body = await req.text();
    const r = await fetch(`${BACKEND}/api/v1/company/profile`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tok(req)}`, 'Content-Type': 'application/json' },
      body,
    });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
}
