/**
 * CRM 3.0 — Segment Membership API
 * POST /api/v3/segments/[id]/membership
 * Add or remove contacts from a static segment.
 * Body: { action: 'add' | 'remove', contact_ids: string[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    const { data: segment } = await supabase
      .from('crm3_segments')
      .select('id, type')
      .eq('id', id)
      .eq('account_id', accountId)
      .single();

    if (!segment) return NextResponse.json({ error: 'Segment not found' }, { status: 404 });
    if (segment.type !== 'manual') {
      return NextResponse.json({ error: 'Membership management is only available for static segments' }, { status: 400 });
    }

    const body = await req.json() as { action?: string; contact_ids?: string[] };
    if (!body.action || !body.contact_ids || !Array.isArray(body.contact_ids)) {
      return NextResponse.json({ error: 'action and contact_ids required' }, { status: 400 });
    }

    const action = body.action;
    const contactIds = body.contact_ids;

    if (action === 'add') {
      const rows = contactIds.map((cid) => ({
        account_id: accountId,
        segment_id: id,
        contact_id: cid,
        added_by: user.id,
      }));
      const { error } = await supabase.from('static_segment_memberships').upsert(rows, { onConflict: 'segment_id,contact_id' });
      if (error) throw error;

      // Update segment contact_count
      const { count } = await supabase
        .from('static_segment_memberships')
        .select('*', { count: 'exact', head: true })
        .eq('segment_id', id);
      await supabase
        .from('crm3_segments')
        .update({ contact_count: count ?? 0, updated_at: new Date().toISOString() })
        .eq('id', id);

      return NextResponse.json({ added: rows.length, contact_count: count ?? 0 });
    }

    if (action === 'remove') {
      const { error } = await supabase
        .from('static_segment_memberships')
        .delete()
        .eq('segment_id', id)
        .in('contact_id', contactIds);
      if (error) throw error;

      const { count } = await supabase
        .from('static_segment_memberships')
        .select('*', { count: 'exact', head: true })
        .eq('segment_id', id);
      await supabase
        .from('crm3_segments')
        .update({ contact_count: count ?? 0, updated_at: new Date().toISOString() })
        .eq('id', id);

      return NextResponse.json({ removed: contactIds.length, contact_count: count ?? 0 });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('[segments membership]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
