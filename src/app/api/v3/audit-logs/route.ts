import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8000';

export async function GET(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  try {
    const { searchParams } = new URL(req.url);
    const params = new URLSearchParams();
    if (searchParams.get('action')) params.set('action', searchParams.get('action')!);
    params.set('limit',  searchParams.get('limit')  ?? '50');
    params.set('offset', searchParams.get('offset') ?? '0');
    const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '');
    const r = await fetch(`${BACKEND}/api/v1/audit-logs?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return NextResponse.json([]);
    return NextResponse.json(await r.json());
  } catch { return NextResponse.json([]); }
}
