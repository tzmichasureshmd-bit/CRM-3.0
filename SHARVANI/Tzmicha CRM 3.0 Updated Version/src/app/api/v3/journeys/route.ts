/**
 * CRM 3.0 — Journeys API
 * GET  /api/v3/journeys — list journeys
 * POST /api/v3/journeys — create journey
 * Security: account_id always from session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function getAccountId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('profiles').select('account_id').eq('user_id', userId).single();
  return (data?.account_id as string) ?? null;
}

const VALID_TRIGGERS = [
  'manual','contact_created','lead_created','conversation_started',
  'message_received','deal_created','deal_stage_changed','deal_won',
  'appointment_created','customer_inactive','ai_score_threshold',
  'intent_detected','content_interaction',
];

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const accountId = await getAccountId(supabase, user.id);
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 403 });

    const { data, error } = await supabase
      .from('crm3_journeys')
      .select('id, name, description, status, trigger_type, entry_count, active_count, completed_count, conversion_rate, created_at, updated_at')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ journeys: data ?? [] });
  } catch (err) {
    console.error('[journeys GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const accountId = await getAccountId(supabase, user.id);
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 403 });

    const body = await req.json() as {
      name?: string;
      description?: string;
      trigger_type?: string;
      trigger_config?: Record<string, unknown>;
      nodes?: unknown[];
      edges?: unknown[];
    };

    if (!body.name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });
    if (body.trigger_type && !VALID_TRIGGERS.includes(body.trigger_type)) {
      return NextResponse.json({ error: `Invalid trigger_type` }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('crm3_journeys')
      .insert({
        account_id:     accountId,
        created_by:     user.id,
        name:           body.name.trim(),
        description:    body.description ?? null,
        trigger_type:   body.trigger_type ?? 'manual',
        trigger_config: body.trigger_config ?? {},
        nodes:          body.nodes ?? [],
        edges:          body.edges ?? [],
        status:         'draft',
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ journey: data }, { status: 201 });
  } catch (err) {
    console.error('[journeys POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
