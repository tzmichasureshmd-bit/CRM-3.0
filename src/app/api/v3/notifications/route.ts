import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

export async function GET(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { data, error } = await db
      .from('notifications')
      .select('id, title, body, href, read, created_at')
      .eq('account_id', user.account_id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) return NextResponse.json({ data: [] });
    return NextResponse.json({ data: data ?? [] });
  } catch {
    return NextResponse.json({ data: [] });
  }
}
