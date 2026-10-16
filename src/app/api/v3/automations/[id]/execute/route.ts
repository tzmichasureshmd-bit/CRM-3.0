/**
 * CRM 3.0 — Automation Execute / Test API
 * POST /api/v3/automations/[id]/execute
 *
 * Body:
 *   { contactId, conversationId?, mode?: 'simulate' | 'live', triggerData? }
 *
 * - mode 'simulate' (default for tests): validates + previews the run, no side effects.
 * - mode 'live': executes actions for real and records an execution.
 *
 * Security: account_id from session. Automation + contact ownership verified.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { executeAutomation, type AutomationRow } from '@/lib/ai/automation-engine';

async function getAccountId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data } = await supabase.from('profiles').select('account_id').eq('user_id', userId).single();
  return (data?.account_id as string) ?? null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(supabase, user.id);
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 403 });

    const body = await req.json() as {
      contactId?: string;
      conversationId?: string;
      mode?: 'simulate' | 'live';
      triggerData?: Record<string, unknown>;
    };

    const mode = body.mode === 'live' ? 'live' : 'simulate';
    if (!body.contactId) return NextResponse.json({ error: 'contactId is required' }, { status: 400 });

    const { data: automation } = await supabase.from('automations').select('*').eq('id', id).eq('account_id', accountId).single();
    if (!automation) return NextResponse.json({ error: 'Automation not found' }, { status: 404 });

    const { data: contact } = await supabase.from('contacts').select('id').eq('id', body.contactId).eq('account_id', accountId).single();
    if (!contact) return NextResponse.json({ error: 'Contact not found in this account' }, { status: 404 });

    const result = await executeAutomation({
      supabase,
      automation: automation as AutomationRow,
      contactId: body.contactId,
      conversationId: body.conversationId ?? null,
      triggerType: 'manual',
      triggerData: body.triggerData ?? {},
      mode,
    });

    return NextResponse.json({ mode, ...result });
  } catch (err) {
    console.error('[automations execute]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 });
  }
}
