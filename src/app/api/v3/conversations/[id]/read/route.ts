import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { id } = await ctx.params;
    const { error } = await db
      .from('conversations')
      .update({ unread_count: 0 })
      .eq('id', id)
      .eq('account_id', user.account_id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[conversations read]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
