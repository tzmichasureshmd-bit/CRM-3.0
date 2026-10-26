import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8000';
const tok = (req: NextRequest) => (req.headers.get('authorization') ?? '').replace('Bearer ', '');

export async function GET(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { searchParams } = new URL(req.url);
  const mine = searchParams.get('mine') === '1';
  const path = mine ? '/api/v1/join-requests/mine' : '/api/v1/join-requests';
  try {
    const r = await fetch(`${BACKEND}${path}`, { headers: { Authorization: `Bearer ${tok(req)}` } });
    if (!r.ok) return NextResponse.json([]);
    return NextResponse.json(await r.json());
  } catch { return NextResponse.json([]); }
}

export async function POST(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  try {
    const body = await req.text();
    const r = await fetch(`${BACKEND}/api/v1/join-requests`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok(req)}`, 'Content-Type': 'application/json' },
      body,
    });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
}
