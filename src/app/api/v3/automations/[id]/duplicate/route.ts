/**
 * CRM 3.0 — Duplicate Automation
 * POST /api/v3/automations/[id]/duplicate
 * Copies an automation + its steps as a new draft.
 * Auth: FastAPI JWT via verifyRequest(). account_id always from token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { id } = await params;

    const { data: source } = await db.from('automations').select('*').eq('id', id).eq('account_id', user.account_id).single();
    if (!source) return NextResponse.json({ error: 'Automation not found' }, { status: 404 });

    const { data: automation, error } = await db
      .from('automations')
      .insert({
        account_id: user.account_id,
        created_by: user.user_id,
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

    const { data: steps } = await db
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
      await db.from('automation_steps').insert(rows);
    }

    return NextResponse.json({ automation }, { status: 201 });
  } catch (err) {
    console.error('[automations duplicate]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
