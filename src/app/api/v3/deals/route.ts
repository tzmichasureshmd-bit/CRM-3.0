/**
 * CRM 3.0 — Deals API
 * GET  /api/v3/deals — list deals for account
 *
 * Auth: FastAPI JWT verified server-side via verifyRequest().
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

export async function GET(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100'), 500);

    let query = db
      .from('deals')
      .select('id, title, value, currency, stage_id, status, created_at')
      .eq('account_id', user.account_id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error('[deals GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
