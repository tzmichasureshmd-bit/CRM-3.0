import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8000';

export async function GET(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '');
  try {
    const r = await fetch(`${BACKEND}/api/v1/employees/invitations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return NextResponse.json([]);
    return NextResponse.json(await r.json());
  } catch { return NextResponse.json([]); }
}
