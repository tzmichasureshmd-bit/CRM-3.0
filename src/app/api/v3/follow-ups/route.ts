/**
 * CRM 3.0 — Follow-ups API
 * GET  /api/v3/follow-ups  — list follow-ups for account
 * POST /api/v3/follow-ups  — create a new follow-up
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
    const status = url.searchParams.get('status') ?? 'pending';

    let query = db
      .from('follow_ups')
      .select('*, contacts(name)')
      .eq('account_id', user.account_id)
      .order('due_date', { ascending: true })
      .limit(100);

    if (status !== 'all') query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ follow_ups: data ?? [] });
  } catch (err) {
    console.error('[follow-ups GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const body = await req.json() as {
      title?: string;
      due_date?: string;
      contact_id?: string;
      notes?: string;
      priority?: string;
    };

    if (!body.title?.trim()) return NextResponse.json({ error: 'title is required' }, { status: 400 });
    if (!body.due_date) return NextResponse.json({ error: 'due_date is required' }, { status: 400 });

    const { data, error } = await db
      .from('follow_ups')
      .insert({
        account_id: user.account_id,
        user_id: user.user_id,
        title: body.title.trim(),
        due_date: body.due_date,
        contact_id: body.contact_id ?? null,
        notes: body.notes?.trim() ?? null,
        priority: body.priority ?? 'normal',
        status: 'pending',
      })
      .select('*, contacts(name)')
      .single();

    if (error) throw error;
    return NextResponse.json({ follow_up: data }, { status: 201 });
  } catch (err) {
    console.error('[follow-ups POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
