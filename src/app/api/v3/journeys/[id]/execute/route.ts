/**
 * POST /api/v3/journeys/[id]/execute
 * Runs the journey execution engine for a contact.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { executeJourney } from '@/lib/ai/journey-engine';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).single();
    if (!profile?.account_id) return NextResponse.json({ error: 'Account not found' }, { status: 403 });
    const accountId = profile.account_id as string;

    const body = await req.json() as { contact_id?: string };
    if (!body.contact_id) return NextResponse.json({ error: 'contact_id required' }, { status: 400 });

    const result = await executeJourney(id, body.contact_id, accountId, user.id, supabase, 'manual');

    const status = result.status === 'failed' && !result.executionId ? 400 : 200;
    return NextResponse.json(result, { status });
  } catch (err) {
    console.error('[journeys execute]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
