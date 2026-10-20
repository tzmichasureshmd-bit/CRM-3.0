import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

export async function POST(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    await db
      .from('notifications')
      .update({ read: true })
      .eq('account_id', user.account_id)
      .eq('read', false);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
