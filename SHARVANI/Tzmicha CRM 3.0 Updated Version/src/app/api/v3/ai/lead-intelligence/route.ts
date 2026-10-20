/**
 * CRM 3.0 — AI Lead Intelligence API
 * POST /api/v3/ai/lead-intelligence
 *
 * Analyzes a contact using real CRM data + AI.
 * Returns explainable lead score, intent, sentiment, NBA.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { LeadIntelligence, ScoreFactor } from '@/types/crm3';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { contactId } = await req.json();
    if (!contactId) {
      return NextResponse.json({ error: 'contactId required' }, { status: 400 });
    }

    // ── Get account_id from session (NEVER from request body) ──
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .single();
    const accountId = profile?.account_id;
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 403 });

    // ── Fetch contact data ──────────────────────────────────
    const { data: contact } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .eq('account_id', accountId)
      .single();

    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

    // ── Fetch recent messages ───────────────────────────────
    const { data: conversations } = await supabase
      .from('conversations')
      .select('id, platform, status, unread_count')
      .eq('contact_id', contactId)
      .eq('account_id', accountId)
      .order('updated_at', { ascending: false })
      .limit(5);

    const convIds = (conversations ?? []).map((c) => c.id);
    const { data: messages } = convIds.length
      ? await supabase
          .from('messages')
          .select('content_text, sender_type, created_at')
          .in('conversation_id', convIds)
          .order('created_at', { ascending: false })
          .limit(20)
      : { data: [] };

    // ── Fetch follow-ups ────────────────────────────────────
    const { data: followups } = await supabase
      .from('follow_ups')
      .select('status, due_date')
      .eq('contact_id', contactId)
      .limit(5);

    // ── Fetch deals ─────────────────────────────────────────
    const { data: deals } = await supabase
      .from('deals')
      .select('status, value, stage_id')
      .eq('contact_id', contactId)
      .limit(5);

    // ── Rule-based scoring (explainable, no fake AI) ────────
    const factors: ScoreFactor[] = [];
    let score = 0;

    // Message count factor
    const customerMessages = (messages ?? []).filter((m) => m.sender_type === 'customer');
    if (customerMessages.length >= 5) {
      factors.push({ factor: 'High message count', weight: 15, reason: `${customerMessages.length} customer messages` });
      score += 15;
    } else if (customerMessages.length >= 2) {
      factors.push({ factor: 'Moderate engagement', weight: 8, reason: `${customerMessages.length} customer messages` });
      score += 8;
    }

    // Recency factor
    if (contact.last_customer_reply_at) {
      const hoursSince = (Date.now() - new Date(contact.last_customer_reply_at).getTime()) / 3_600_000;
      if (hoursSince < 2) {
        factors.push({ factor: 'Very recent activity', weight: 20, reason: 'Replied within 2 hours' });
        score += 20;
      } else if (hoursSince < 24) {
        factors.push({ factor: 'Recent activity', weight: 12, reason: 'Replied within 24 hours' });
        score += 12;
      } else if (hoursSince > 168) {
        factors.push({ factor: 'Inactive', weight: -10, reason: 'No reply in 7+ days' });
        score -= 10;
      }
    }

    // Lead status factor
    const statusScores: Record<string, number> = {
      new: 5, contacted: 10, qualified: 25, proposal: 30, negotiation: 35,
    };
    if (contact.lead_status && statusScores[contact.lead_status]) {
      const w = statusScores[contact.lead_status];
      factors.push({ factor: `Lead status: ${contact.lead_status}`, weight: w, reason: 'CRM lead stage' });
      score += w;
    }

    // Source factor
    if (contact.source === 'Meta' || contact.source_platform) {
      factors.push({ factor: 'Paid lead source', weight: 8, reason: 'Came from Meta Lead Ad' });
      score += 8;
    }

    // Deal factor
    const openDeals = (deals ?? []).filter((d) => d.status === 'open');
    if (openDeals.length > 0) {
      factors.push({ factor: 'Active deal', weight: 15, reason: `${openDeals.length} open deal(s)` });
      score += 15;
    }

    // Opt-out penalty
    if (contact.messaging_opt_out) {
      factors.push({ factor: 'Opted out', weight: -30, reason: 'Contact opted out of messaging' });
      score -= 30;
    }

    // Clamp 0-100
    score = Math.max(0, Math.min(100, score));

    // ── Determine intent/sentiment/engagement ───────────────
    const intent =
      score >= 80 ? 'very_high' : score >= 60 ? 'high' : score >= 35 ? 'medium' : 'low';

    const recentTexts = customerMessages.slice(0, 5).map((m) => m.content_text ?? '').join(' ').toLowerCase();
    const positiveWords = ['interested', 'yes', 'please', 'want', 'need', 'price', 'how much', 'available', 'buy', 'purchase'];
    const negativeWords = ['no', 'not interested', 'stop', 'remove', 'cancel', 'unsubscribe'];
    const positiveHits = positiveWords.filter((w) => recentTexts.includes(w)).length;
    const negativeHits = negativeWords.filter((w) => recentTexts.includes(w)).length;
    const sentiment = negativeHits > 0 ? 'negative' : positiveHits >= 2 ? 'positive' : 'neutral';

    const engagement =
      customerMessages.length >= 5 ? 'high' : customerMessages.length >= 2 ? 'medium' : 'low';

    // ── NBA ─────────────────────────────────────────────────
    const overdueFollowup = (followups ?? []).find(
      (f) => f.status === 'pending' && new Date(f.due_date) < new Date()
    );

    let nbaAction = 'Monitor and wait for next interaction';
    let nbaUrgency: 'immediate' | 'today' | 'this_week' | 'low' = 'low';

    if (score >= 80) {
      nbaAction = 'Contact immediately — high buying intent detected';
      nbaUrgency = 'immediate';
    } else if (overdueFollowup) {
      nbaAction = 'Complete overdue follow-up';
      nbaUrgency = 'today';
    } else if (score >= 50) {
      nbaAction = 'Send a personalized follow-up message';
      nbaUrgency = 'today';
    } else if (score >= 30) {
      nbaAction = 'Nurture with relevant content';
      nbaUrgency = 'this_week';
    }

    const intelligence: LeadIntelligence = {
      contact_id: contactId,
      account_id: accountId,
      score,
      intent,
      sentiment,
      engagement,
      score_factors: factors,
      ai_summary: `${contact.name ?? 'This contact'} has a lead score of ${score}/100 with ${intent} intent. ${factors[0]?.reason ?? ''}`,
      next_best_action: {
        id: `nba-${contactId}`,
        account_id: accountId,
        object_type: 'lead',
        object_id: contactId,
        action: nbaAction,
        reason: factors[0]?.reason ?? 'Based on CRM activity',
        urgency: nbaUrgency,
        confidence: score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low',
        created_at: new Date().toISOString(),
      },
      qualification_status:
        score >= 70 ? 'qualified' : score >= 40 ? 'qualifying' : 'unqualified',
      confidence: score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low',
      last_analyzed_at: new Date().toISOString(),
    };

    // ── Persist score back to contacts table ────────────────
    await supabase
      .from('contacts')
      .update({
        lead_score: score,
        lead_score_tier: score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold',
        lead_score_reason: factors[0]?.reason ?? null,
        lead_score_updated_at: new Date().toISOString(),
      })
      .eq('id', contactId)
      .eq('account_id', accountId);

    return NextResponse.json(intelligence);
  } catch (err) {
    console.error('[lead-intelligence]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
