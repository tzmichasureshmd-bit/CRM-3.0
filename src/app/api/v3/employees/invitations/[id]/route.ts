import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8000';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { id } = await params;
  const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '');
  try {
    const r = await fetch(`${BACKEND}/api/v1/employees/invitations/${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
}
