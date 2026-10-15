/**
 * CRM 3.0 — Appointments API
 * GET  /api/v3/appointments  — list appointments for account
 * POST /api/v3/appointments  — create a new appointment
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
      .from('appointments')
      .select('*, contacts(name)')
      .eq('account_id', accountId)
      .order('scheduled_at', { ascending: true })
      .limit(50);

    if (error) throw error;
    return NextResponse.json({ appointments: data ?? [] });
  } catch (err) {
    console.error('[appointments GET]', err);
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
      scheduled_at?: string;
      duration_minutes?: number;
      contact_id?: string;
      notes?: string;
      meeting_url?: string;
    };

    if (!body.title?.trim()) return NextResponse.json({ error: 'title is required' }, { status: 400 });
    if (!body.scheduled_at) return NextResponse.json({ error: 'scheduled_at is required' }, { status: 400 });

    const { data, error } = await supabase
      .from('appointments')
      .insert({
        account_id: accountId,
        title: body.title.trim(),
        scheduled_at: body.scheduled_at,
        duration_minutes: body.duration_minutes ?? 30,
        contact_id: body.contact_id ?? null,
        notes: body.notes?.trim() ?? null,
        meeting_url: body.meeting_url?.trim() ?? null,
        status: 'scheduled',
      })
      .select('*, contacts(name)')
      .single();

    if (error) throw error;
    return NextResponse.json({ appointment: data }, { status: 201 });
  } catch (err) {
    console.error('[appointments POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
