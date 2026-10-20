import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

export async function GET(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { data, error } = await db
      .from('pipeline_stages')
      .select('id, name, position, color')
      .eq('account_id', user.account_id)
      .order('position', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error('[pipeline-stages GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
