/**
 * CRM 3.0 — Next Best Action API
 * POST /api/v3/ai/next-best-action
 * Auth: FastAPI JWT via verifyRequest(). account_id always from token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

export async function POST(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db: supabase } = auth;
  const accountId = user.account_id;

  try {
    const body = await req.json() as { objectType?: string; objectId?: string };
    const { objectType, objectId } = body;
    if (!objectType || !objectId) {
      return NextResponse.json({ error: 'objectType and objectId required' }, { status: 400 });
    }

    if (objectType === 'lead' || objectType === 'customer') {
      const { data: contact } = await supabase
        .from('contacts')
        .select('id, name, lead_score, lead_score_tier, lead_status, last_customer_reply_at')
        .eq('id', objectId)
        .eq('account_id', accountId)
        .single();

      if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

      const score = (contact.lead_score as number) ?? 0;
      let action = 'Monitor and wait for next interaction';
      let urgency: 'immediate' | 'today' | 'this_week' | 'low' = 'low';

      if (score >= 80) { action = 'Contact immediately — high buying intent'; urgency = 'immediate'; }
      else if (score >= 60) { action = 'Send a personalised follow-up today'; urgency = 'today'; }
      else if (score >= 35) { action = 'Nurture with relevant content this week'; urgency = 'this_week'; }

      return NextResponse.json({
        id: `nba-${objectId}`,
        account_id: accountId,
        object_type: objectType,
        object_id: objectId,
        action,
        reason: `Lead score: ${score}/100 (${contact.lead_score_tier ?? 'cold'})`,
        urgency,
        confidence: score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low',
        created_at: new Date().toISOString(),
      });
    }

    if (objectType === 'deal') {
      const { data: deal } = await supabase
        .from('deals')
        .select('id, title, value, status, updated_at')
        .eq('id', objectId)
        .eq('account_id', accountId)
        .single();

      if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 });

      const daysStalled = Math.floor(
        (Date.now() - new Date(deal.updated_at as string).getTime()) / 86_400_000
      );
      const urgency: 'immediate' | 'today' | 'this_week' | 'low' =
        daysStalled > 14 ? 'immediate' : daysStalled > 7 ? 'today' : daysStalled > 3 ? 'this_week' : 'low';

      return NextResponse.json({
        id: `nba-deal-${objectId}`,
        account_id: accountId,
        object_type: 'deal',
        object_id: objectId,
        action: daysStalled > 7 ? 'Schedule a follow-up call — deal is stalling' : 'Check in with the prospect',
        reason: `No activity for ${daysStalled} days`,
        urgency,
        confidence: 'high',
        created_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({ error: `Unsupported objectType: ${objectType}` }, { status: 400 });
  } catch (err) {
    console.error('[next-best-action]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
