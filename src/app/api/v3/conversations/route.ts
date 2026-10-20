import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

export async function GET(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 200);

    let query = db
      .from('conversations')
      .select('id, platform, last_message_text, last_message_at, unread_count, contacts(name)')
      .eq('account_id', user.account_id)
      .order('last_message_at', { ascending: false })
      .limit(limit);

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error('[conversations GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
