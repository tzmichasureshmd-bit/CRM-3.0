/**
 * CRM 3.0 — Broadcasts API
 * GET  /api/v3/broadcasts  — list broadcasts for account
 * POST /api/v3/broadcasts  — create a new broadcast
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
    const { data, error } = await db
      .from('broadcasts')
      .select('*')
      .eq('account_id', user.account_id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return NextResponse.json({ broadcasts: data ?? [] });
  } catch (err) {
    console.error('[broadcasts GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const body = await req.json() as {
      name?: string;
      platform?: string;
      message?: string;
      scheduled_at?: string;
      segment_id?: string;
    };

    if (!body.name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });
    if (!body.platform) return NextResponse.json({ error: 'platform is required' }, { status: 400 });
    if (!body.message?.trim()) return NextResponse.json({ error: 'message is required' }, { status: 400 });

    const { data, error } = await db
      .from('broadcasts')
      .insert({
        account_id: user.account_id,
        name: body.name.trim(),
        platform: body.platform,
        message: body.message.trim(),
        status: body.scheduled_at ? 'scheduled' : 'draft',
        scheduled_at: body.scheduled_at ?? null,
        segment_id: body.segment_id ?? null,
        total_recipients: 0,
        sent_count: 0,
        delivered_count: 0,
        read_count: 0,
      })
      .select('*')
      .single();

    if (error) throw error;
    return NextResponse.json({ broadcast: data }, { status: 201 });
  } catch (err) {
    console.error('[broadcasts POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
