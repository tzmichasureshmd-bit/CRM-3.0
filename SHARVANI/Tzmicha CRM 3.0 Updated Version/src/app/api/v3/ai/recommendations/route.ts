/**
 * CRM 3.0 — AI Recommendations API
 * GET /api/v3/ai/recommendations
 *
 * Returns AI-generated recommendations from real CRM data.
 * Delegates to command-center logic — no duplicate queries.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles').select('account_id').eq('user_id', user.id).single();
    if (!profile?.account_id) return NextResponse.json({ error: 'Account not found' }, { status: 403 });

    const accountId = profile.account_id as string;
    const now = new Date();

    const [hotLeadsRes, overdueRes, dealsRes, convsRes] = await Promise.all([
      supabase.from('contacts').select('id', { count: 'exact', head: true })
        .eq('account_id', accountId).gte('lead_score', 70),
      supabase.from('follow_ups').select('id', { count: 'exact', head: true })
        .eq('account_id', accountId).eq('status', 'pending').lt('due_date', now.toISOString()),
      supabase.from('deals').select('id', { count: 'exact', head: true })
        .eq('account_id', accountId).eq('status', 'open')
        .lt('updated_at', new Date(now.getTime() - 7 * 86_400_000).toISOString()),
      supabase.from('conversations').select('id', { count: 'exact', head: true })
        .eq('account_id', accountId).eq('status', 'open')
        .lt('last_message_at', new Date(now.getTime() - 2 * 3_600_000).toISOString()),
    ]);

    const recommendations = [];

    if ((hotLeadsRes.count ?? 0) > 0) {
      recommendations.push({
        id: 'hot-leads',
        what: `${hotLeadsRes.count} hot lead${(hotLeadsRes.count ?? 0) > 1 ? 's' : ''} need attention`,
        why: 'High lead scores indicate strong buying intent',
        action_label: 'View Hot Leads',
        action_href: '/leads',
        urgency: 'immediate',
        category: 'lead',
      });
    }
    if ((overdueRes.count ?? 0) > 0) {
      recommendations.push({
        id: 'overdue-followups',
        what: `${overdueRes.count} follow-up${(overdueRes.count ?? 0) > 1 ? 's' : ''} are overdue`,
        why: 'Delayed follow-ups reduce conversion rates significantly',
        action_label: 'View Follow-ups',
        action_href: '/follow-ups',
        urgency: 'today',
        category: 'lead',
      });
    }
    if ((dealsRes.count ?? 0) > 0) {
      recommendations.push({
        id: 'deals-at-risk',
        what: `${dealsRes.count} deal${(dealsRes.count ?? 0) > 1 ? 's' : ''} stalling for 7+ days`,
        why: 'No activity increases deal loss probability',
        action_label: 'View Deals',
        action_href: '/pipelines',
        urgency: 'today',
        category: 'deal',
      });
    }
    if ((convsRes.count ?? 0) > 0) {
      recommendations.push({
        id: 'unanswered-convs',
        what: `${convsRes.count} conversation${(convsRes.count ?? 0) > 1 ? 's' : ''} unanswered 2+ hours`,
        why: 'Fast response time is the #1 driver of lead conversion',
        action_label: 'Open Inbox',
        action_href: '/inbox',
        urgency: 'immediate',
        category: 'lead',
      });
    }

    return NextResponse.json(recommendations);
  } catch (err) {
    console.error('[recommendations]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
