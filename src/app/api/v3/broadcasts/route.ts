/**
 * CRM 3.0 — Broadcasts API
 * GET  /api/v3/broadcasts  — list broadcasts for account
 * POST /api/v3/broadcasts  — create a new broadcast
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function getAccountId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('profiles').select('account_id').eq('user_id', userId).single();
  return (data?.account_id as string) ?? null;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(supabase, user.id);
    if (!accountId) return NextResponse.json({ error: 'No account' }, { status: 403 });

    const { data, error } = await supabase
      .from('broadcasts')
      .select('*')
      .eq('account_id', accountId)
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
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(supabase, user.id);
    if (!accountId) return NextResponse.json({ error: 'No account' }, { status: 403 });

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

    const { data, error } = await supabase
      .from('broadcasts')
      .insert({
        account_id: accountId,
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
