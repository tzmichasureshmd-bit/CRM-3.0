import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8000';

function backendHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function getToken(req: NextRequest) {
  return (req.headers.get('authorization') ?? '').replace('Bearer ', '');
}

export async function GET(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  try {
    const r = await fetch(`${BACKEND}/api/v1/employees`, { headers: backendHeaders(getToken(req)) });
    if (!r.ok) return NextResponse.json([]);
    return NextResponse.json(await r.json());
  } catch { return NextResponse.json([]); }
}

export async function POST(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  try {
    const body = await req.text();
    const r = await fetch(`${BACKEND}/api/v1/employees`, {
      method: 'POST', headers: backendHeaders(getToken(req)), body,
    });
    const data = await r.json();
    return NextResponse.json(data, { status: r.status });
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
}
