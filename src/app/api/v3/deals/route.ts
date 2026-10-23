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
    if (error) {
      console.error('[deals GET] DB error:', error.message);
      return NextResponse.json({ data: [] });
    }
    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error('[deals GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const body = await req.json() as Record<string, unknown>;
    if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }
    const { data, error } = await db
      .from('deals')
      .insert({
        account_id: user.account_id,
        title: (body.title as string).trim(),
        value: typeof body.value === 'number' ? body.value : null,
        currency: typeof body.currency === 'string' ? body.currency : 'USD',
        stage_id: typeof body.stage_id === 'string' ? body.stage_id : null,
        contact_id: typeof body.contact_id === 'string' ? body.contact_id : null,
        status: typeof body.status === 'string' ? body.status : 'open',
        notes: typeof body.notes === 'string' ? body.notes : null,
      })
      .select('*, contacts(name)')
      .single();
    if (error) throw error;
    return NextResponse.json({ deal: data }, { status: 201 });
  } catch (err) {
    console.error('[deals POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
