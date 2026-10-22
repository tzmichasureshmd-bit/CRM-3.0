/**
 * CRM 3.0 — Automation Execute / Test API
 * POST /api/v3/automations/[id]/execute
 *
 * Body:
 *   { contactId, conversationId?, mode?: 'simulate' | 'live', triggerData? }
 *
 * Auth: FastAPI JWT via verifyRequest(). account_id always from token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';
import { executeAutomation, type AutomationRow } from '@/lib/ai/automation-engine';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { id } = await params;

    const body = await req.json() as {
      contactId?: string;
      conversationId?: string;
      mode?: 'simulate' | 'live';
      triggerData?: Record<string, unknown>;
    };

    const mode = body.mode === 'live' ? 'live' : 'simulate';
    if (!body.contactId) return NextResponse.json({ error: 'contactId is required' }, { status: 400 });

    const { data: automation } = await db.from('automations').select('*').eq('id', id).eq('account_id', user.account_id).single();
    if (!automation) return NextResponse.json({ error: 'Automation not found' }, { status: 404 });

    const { data: contact } = await db.from('contacts').select('id').eq('id', body.contactId).eq('account_id', user.account_id).single();
    if (!contact) return NextResponse.json({ error: 'Contact not found in this account' }, { status: 404 });

    const result = await executeAutomation({
      supabase: db,
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
