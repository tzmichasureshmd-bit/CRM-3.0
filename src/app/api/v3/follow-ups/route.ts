/**
 * CRM 3.0 — Follow-ups API
 * GET  /api/v3/follow-ups  — list follow-ups for account
 * POST /api/v3/follow-ups  — create a new follow-up
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function getAccountId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('profiles').select('account_id').eq('user_id', userId).single();
  return (data?.account_id as string) ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(supabase, user.id);
    if (!accountId) return NextResponse.json({ error: 'No account' }, { status: 403 });

    const url = new URL(req.url);
    const status = url.searchParams.get('status') ?? 'pending';

    let query = supabase
      .from('follow_ups')
      .select('*, contacts(name)')
      .eq('account_id', accountId)
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
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(supabase, user.id);
    if (!accountId) return NextResponse.json({ error: 'No account' }, { status: 403 });

    const body = await req.json() as {
      title?: string;
      due_date?: string;
      contact_id?: string;
      notes?: string;
      priority?: string;
    };

    if (!body.title?.trim()) return NextResponse.json({ error: 'title is required' }, { status: 400 });
    if (!body.due_date) return NextResponse.json({ error: 'due_date is required' }, { status: 400 });

    const { data, error } = await supabase
      .from('follow_ups')
      .insert({
        account_id: accountId,
        user_id: user.id,
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
