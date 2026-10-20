import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

export async function GET(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { searchParams } = new URL(req.url);
    const status   = searchParams.get('status');
    const platform = searchParams.get('platform');

    let q = db.from('crm3_content').select('*').eq('account_id', user.account_id).order('created_at', { ascending: false });
    if (status)   q = q.eq('status', status);
    if (platform) q = q.eq('platform', platform);

    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error('[content GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const body = await req.json();
    const { data, error } = await db.from('crm3_content').insert({
      ...body,
      account_id: user.account_id,
      user_id: user.user_id,
      status: body.status ?? 'draft',
    }).select().single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('[content POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
