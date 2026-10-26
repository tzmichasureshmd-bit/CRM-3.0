import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';
import { getServiceClient } from '@/lib/supabase/service';

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8000';

async function requireSuperAdmin(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return { error: auth };
  const { data } = await getServiceClient()
    .from('profiles').select('is_super_admin').eq('user_id', auth.user.user_id).maybeSingle();
  if (!data?.is_super_admin)
    return { error: NextResponse.json({ error: 'Super admin access required' }, { status: 403 }) };
  return { auth };
}

const tok = (req: NextRequest) => (req.headers.get('authorization') ?? '').replace('Bearer ', '');

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireSuperAdmin(req);
  if (check.error) return check.error;
  const { id } = await params;
  try {
    const r = await fetch(`${BACKEND}/api/v1/super-admin/companies/${id}`, {
      headers: { Authorization: `Bearer ${tok(req)}` },
    });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireSuperAdmin(req);
  if (check.error) return check.error;
  const { id } = await params;
  try {
    const body = await req.text();
    const r = await fetch(`${BACKEND}/api/v1/super-admin/companies/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tok(req)}`, 'Content-Type': 'application/json' },
      body,
    });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
}
