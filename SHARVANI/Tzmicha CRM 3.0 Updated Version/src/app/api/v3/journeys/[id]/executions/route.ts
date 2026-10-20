/**
 * GET /api/v3/journeys/[id]/executions
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).single();
    if (!profile?.account_id) return NextResponse.json({ error: 'Account not found' }, { status: 403 });
    const accountId = profile.account_id as string;

    const { data: journey } = await supabase.from('crm3_journeys').select('id').eq('id', id).eq('account_id', accountId).single();
    if (!journey) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20'), 50);

    const { data, error } = await supabase
      .from('crm3_journey_executions')
      .select('id, contact_id, status, triggered_by, nodes_executed, error_message, started_at, completed_at, duration_ms')
      .eq('journey_id', id)
      .eq('account_id', accountId)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ executions: data ?? [] });
  } catch (err) {
    console.error('[journeys executions]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
