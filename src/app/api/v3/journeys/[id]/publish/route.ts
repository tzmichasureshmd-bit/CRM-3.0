/**
 * POST /api/v3/journeys/[id]/publish
 * Validates and activates a journey.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).single();
    if (!profile?.account_id) return NextResponse.json({ error: 'Account not found' }, { status: 403 });
    const accountId = profile.account_id as string;

    const { data: journey } = await supabase
      .from('crm3_journeys')
      .select('id, nodes, edges, status')
      .eq('id', id)
      .eq('account_id', accountId)
      .single();

    if (!journey) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Validate: must have at least a trigger and one other node
    const nodes = (journey.nodes as { type: string }[]) ?? [];
    if (nodes.length < 2) {
      return NextResponse.json({ error: 'Journey must have at least 2 nodes to publish' }, { status: 400 });
    }
    const hasTrigger = nodes.some(n => n.type === 'trigger');
    if (!hasTrigger) {
      return NextResponse.json({ error: 'Journey must have a trigger node' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('crm3_journeys')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ journey: data });
  } catch (err) {
    console.error('[journeys publish]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
