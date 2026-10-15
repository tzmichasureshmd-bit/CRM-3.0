/**
 * CRM 3.0 — Duplicate Automation
 * POST /api/v3/automations/[id]/duplicate
 * Copies an automation + its steps as a new draft.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function getAccountId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data } = await supabase.from('profiles').select('account_id').eq('user_id', userId).single();
  return (data?.account_id as string) ?? null;
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(supabase, user.id);
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 403 });

    const { data: source } = await supabase.from('automations').select('*').eq('id', id).eq('account_id', accountId).single();
    if (!source) return NextResponse.json({ error: 'Automation not found' }, { status: 404 });

    const { data: automation, error } = await supabase
      .from('automations')
      .insert({
        account_id: accountId,
        created_by: user.id,
        name: `${source.name} (Copy)`,
        description: source.description,
        trigger_type: source.trigger_type,
        trigger_config: source.trigger_config ?? {},
        is_active: false,
        status: 'draft',
        ai_enabled: source.ai_enabled ?? false,
        execution_count: 0,
        success_count: 0,
        failure_count: 0,
        workflow_version: 1,
      })
      .select()
      .single();

    if (error || !automation) return NextResponse.json({ error: error?.message ?? 'Failed to duplicate' }, { status: 500 });

    const { data: steps } = await supabase
      .from('automation_steps')
      .select('step_type,position,config,parent_step_id,branch')
      .eq('automation_id', id)
      .order('position', { ascending: true });

    if (steps && steps.length > 0) {
      const rows = steps.map(s => ({
        automation_id: automation.id,
        step_type: s.step_type,
        position: s.position,
        config: s.config,
        parent_step_id: null,
        branch: s.branch,
      }));
      await supabase.from('automation_steps').insert(rows);
    }

    return NextResponse.json({ automation }, { status: 201 });
  } catch (err) {
    console.error('[automations duplicate]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
