/**
 * CRM 3.0 — Contacts API
 * GET  /api/v3/contacts  — list contacts for account
 * POST /api/v3/contacts  — create a new contact
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
    const search = url.searchParams.get('search') ?? '';
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100'), 200);

    let query = supabase
      .from('contacts')
      .select('*', { count: 'exact' })
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);

    const { data, count, error } = await query;
    if (error) throw error;
    return NextResponse.json({ contacts: data ?? [], total: count ?? 0 });
  } catch (err) {
    console.error('[contacts GET]', err);
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
      phone?: string;
      email?: string;
      company?: string;
      source?: string;
      lead_status?: string;
      tags?: string[];
      notes?: string;
    };

    if (!body.name?.trim() && !body.phone?.trim() && !body.email?.trim()) {
      return NextResponse.json({ error: 'At least one of name, phone, or email is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('contacts')
      .insert({
        account_id: accountId,
        name: body.name?.trim() ?? null,
        phone: body.phone?.trim() ?? null,
        email: body.email?.trim() ?? null,
        company: body.company?.trim() ?? null,
        source: body.source?.trim() ?? null,
        lead_status: body.lead_status ?? 'new',
        tags: body.tags ?? [],
        notes: body.notes?.trim() ?? null,
      })
      .select('*')
      .single();

    if (error) throw error;
    return NextResponse.json({ contact: data }, { status: 201 });
  } catch (err) {
    console.error('[contacts POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
