/**
 * CRM 3.0 — Command Center API
 * GET /api/v3/command-center
 *
 * Returns real intelligence from CRM 3.0 tables.
 * NO fake data. NO mock statistics.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type {
  CommandCenterState,
  HotLeadItem,
  OverdueFollowupItem,
  DealAtRiskItem,
  ImportantConversationItem,
  AIRecommendation,
  TeamWorkloadItem,
} from '@/types/crm3';

export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();

    // ── Auth check ──────────────────────────────────────────
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // ── Get account_id ──────────────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .single();

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'No account' }, { status: 400 });
    }

    const accountId = profile.account_id;
    const now = new Date();

    // ── 1. Hot Leads (lead_score >= 70, not yet won/lost) ───
    const { data: hotLeadsRaw } = await supabase
      .from('contacts')
      .select('id, name, lead_score, lead_score_tier, lead_score_reason, last_customer_reply_at, source, telegram_chat_id, instagram_user_id')
      .eq('account_id', accountId)
      .gte('lead_score', 70)
      .not('lead_status', 'in', '("won","lost")')
      .order('lead_score', { ascending: false })
      .limit(10);

    const hotLeads: HotLeadItem[] = (hotLeadsRaw ?? []).map((c) => ({
      contact_id: c.id,
      contact_name: c.name ?? 'Unknown',
      score: c.lead_score ?? 0,
      intent: c.lead_score >= 90 ? 'very_high' : c.lead_score >= 75 ? 'high' : 'medium',
      reason: c.lead_score_reason ?? 'High engagement score',
      last_activity: c.last_customer_reply_at ?? '',
      recommended_action: 'Contact within 30 minutes',
      channel: c.telegram_chat_id ? 'telegram' : c.instagram_user_id ? 'instagram' : 'whatsapp',
    }));

    // ── 2. Overdue Follow-ups ───────────────────────────────
    const { data: overdueRaw } = await supabase
      .from('follow_ups')
      .select('id, contact_id, title, due_date, user_id, contacts(name)')
      .eq('account_id', accountId)
      .eq('status', 'pending')
      .lt('due_date', now.toISOString())
      .order('due_date', { ascending: true })
      .limit(10);

    const overdueFollowups: OverdueFollowupItem[] = (overdueRaw ?? []).map((f) => {
      const dueDate = new Date(f.due_date);
      const overdueHours = Math.floor((now.getTime() - dueDate.getTime()) / 3_600_000);
      return {
        followup_id: f.id,
        contact_id: f.contact_id,
        contact_name: (f.contacts as { name?: string } | null)?.name ?? 'Unknown',
        due_date: f.due_date,
        overdue_hours: overdueHours,
        assigned_to: f.user_id,
        title: f.title,
      };
    });

    // ── 3. Deals at Risk (open, no activity > 7 days) ──────
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
    const { data: dealsRaw } = await supabase
      .from('deals')
      .select('id, title, value, currency, updated_at, pipeline_stages(name)')
      .eq('account_id', accountId)
      .eq('status', 'open')
      .lt('updated_at', sevenDaysAgo)
      .order('value', { ascending: false })
      .limit(8);

    const dealsAtRisk: DealAtRiskItem[] = (dealsRaw ?? []).map((d) => {
      const daysStalled = Math.floor(
        (now.getTime() - new Date(d.updated_at).getTime()) / 86_400_000
      );
      return {
        deal_id: d.id,
        deal_title: d.title,
        value: d.value ?? 0,
        currency: d.currency ?? 'USD',
        days_stalled: daysStalled,
        stage: (d.pipeline_stages as { name?: string } | null)?.name ?? 'Unknown',
        risk_reason: `No activity for ${daysStalled} days`,
        recommended_action: 'Schedule a follow-up call',
      };
    });

    // ── 4. Important Conversations (unanswered > 2h) ───────
    const twoHoursAgo = new Date(now.getTime() - 2 * 3_600_000).toISOString();
    const { data: convRaw } = await supabase
      .from('conversations')
      .select('id, platform, last_message_text, last_message_at, contacts(name, lead_score)')
      .eq('account_id', accountId)
      .eq('status', 'open')
      .lt('last_message_at', twoHoursAgo)
      .order('last_message_at', { ascending: true })
      .limit(8);

    const importantConversations: ImportantConversationItem[] = (convRaw ?? []).map((c) => {
      const contact = c.contacts as { name?: string; lead_score?: number } | null;
      const unansweredHours = Math.floor(
        (now.getTime() - new Date(c.last_message_at).getTime()) / 3_600_000
      );
      const score = contact?.lead_score ?? 0;
      return {
        conversation_id: c.id,
        contact_name: contact?.name ?? 'Unknown',
        channel: c.platform,
        last_message: c.last_message_text ?? '',
        unanswered_hours: unansweredHours,
        intent: score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low',
        priority: unansweredHours > 24 ? 'high' : unansweredHours > 8 ? 'medium' : 'low',
      };
    });

    // ── 5. Team Workload ────────────────────────────────────
    const { data: teamRaw } = await supabase
      .from('profiles')
      .select('user_id, full_name, avatar_url')
      .eq('account_id', accountId)
      .limit(20);

    const teamWorkload: TeamWorkloadItem[] = await Promise.all(
      (teamRaw ?? []).map(async (member) => {
        const [{ count: openConvs }, { count: assignedLeads }, { count: overdueCount }] =
          await Promise.all([
            supabase
              .from('conversations')
              .select('id', { count: 'exact', head: true })
              .eq('account_id', accountId)
              .eq('assigned_agent_id', member.user_id)
              .eq('status', 'open'),
            supabase
              .from('contacts')
              .select('id', { count: 'exact', head: true })
              .eq('account_id', accountId)
              .not('lead_status', 'in', '("won","lost","new")'),
            supabase
              .from('follow_ups')
              .select('id', { count: 'exact', head: true })
              .eq('account_id', accountId)
              .eq('user_id', member.user_id)
              .eq('status', 'pending')
              .lt('due_date', now.toISOString()),
          ]);

        return {
          user_id: member.user_id,
          name: member.full_name,
          avatar_url: member.avatar_url ?? undefined,
          open_conversations: openConvs ?? 0,
          assigned_leads: assignedLeads ?? 0,
          overdue_followups: overdueCount ?? 0,
          avg_response_time_min: 0, // computed separately if needed
        };
      })
    );

    // ── 6. AI Recommendations (rule-based, real data) ──────
    const recommendations: AIRecommendation[] = [];

    if (hotLeads.length > 0) {
      recommendations.push({
        id: 'hot-leads',
        what: `${hotLeads.length} hot lead${hotLeads.length > 1 ? 's' : ''} need attention`,
        why: 'High lead scores indicate strong buying intent',
        action_label: 'View Hot Leads',
        action_href: '/crm?filter=hot',
        urgency: 'immediate',
        category: 'lead',
      });
    }

    if (overdueFollowups.length > 0) {
      recommendations.push({
        id: 'overdue-followups',
        what: `${overdueFollowups.length} follow-up${overdueFollowups.length > 1 ? 's' : ''} are overdue`,
        why: 'Delayed follow-ups reduce conversion rates significantly',
        action_label: 'View Follow-ups',
        action_href: '/automations/followups',
        urgency: 'today',
        category: 'lead',
      });
    }

    if (dealsAtRisk.length > 0) {
      const totalAtRisk = dealsAtRisk.reduce((s, d) => s + d.value, 0);
      recommendations.push({
        id: 'deals-at-risk',
        what: `${dealsAtRisk.length} deals worth ${totalAtRisk.toLocaleString()} are stalling`,
        why: 'No activity for 7+ days increases deal loss probability',
        action_label: 'View Deals',
        action_href: '/pipelines',
        urgency: 'today',
        category: 'deal',
      });
    }

    if (importantConversations.length > 0) {
      recommendations.push({
        id: 'unanswered-convs',
        what: `${importantConversations.length} conversations unanswered for 2+ hours`,
        why: 'Fast response time is the #1 driver of lead conversion',
        action_label: 'Open Inbox',
        action_href: '/inbox',
        urgency: 'immediate',
        category: 'lead',
      });
    }

    const state: CommandCenterState = {
      hot_leads: hotLeads,
      overdue_followups: overdueFollowups,
      deals_at_risk: dealsAtRisk,
      important_conversations: importantConversations,
      ai_recommendations: recommendations,
      team_workload: teamWorkload,
      automation_health: [], // populated by automation health check
      revenue_opportunities: [],
      generated_at: now.toISOString(),
    };

    return NextResponse.json(state);
  } catch (err) {
    console.error('[command-center]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
