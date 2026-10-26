import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8000';

function getToken(req: NextRequest) {
  return (req.headers.get('authorization') ?? '').replace('Bearer ', '');
}
function backendHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { id } = await params;
  try {
    const body = await req.text();
    const r = await fetch(`${BACKEND}/api/v1/employees/${id}`, {
      method: 'PATCH', headers: backendHeaders(getToken(req)), body,
    });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { id } = await params;
  try {
    const r = await fetch(`${BACKEND}/api/v1/employees/${id}`, {
      method: 'DELETE', headers: backendHeaders(getToken(req)),
    });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
}
