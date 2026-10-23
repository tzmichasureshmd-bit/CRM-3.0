import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

export async function GET(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { data } = await db
      .from('notifications')
      .select('id, title, body, href, read, created_at')
      .eq('account_id', user.account_id)
      .order('created_at', { ascending: false })
      .limit(20);

    return NextResponse.json({ data: data ?? [] });
  } catch {
    // notifications table may not exist yet — return empty, never 500
    return NextResponse.json({ data: [] });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { id } = await req.json() as { id?: string };
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await db.from('notifications').update({ read: true })
      .eq('id', id).eq('account_id', user.account_id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
