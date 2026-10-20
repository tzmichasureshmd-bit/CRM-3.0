/**
 * CRM 3.0 — AI Business Copilot API
 * POST /api/v3/copilot
 *
 * Tool-based AI that queries real CRM data.
 * Never invents records. Clearly labels data source.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ── Tool implementations (explicit, scoped to account) ────────

async function getHotLeads(supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never, accountId: string) {
  const { data } = await supabase
    .from('contacts')
    .select('id, name, lead_score, lead_score_tier, lead_status, last_customer_reply_at')
    .eq('account_id', accountId)
    .gte('lead_score', 60)
    .order('lead_score', { ascending: false })
    .limit(10);
  return data ?? [];
}

async function getOverdueFollowups(supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never, accountId: string) {
  const { data } = await supabase
    .from('follow_ups')
    .select('id, title, due_date, status, contacts(name)')
    .eq('account_id', accountId)
    .eq('status', 'pending')
    .lt('due_date', new Date().toISOString())
    .order('due_date', { ascending: true })
    .limit(10);
  return data ?? [];
}

async function getDealsAtRisk(supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never, accountId: string) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data } = await supabase
    .from('deals')
    .select('id, title, value, currency, updated_at, status, pipeline_stages(name)')
    .eq('account_id', accountId)
    .eq('status', 'open')
    .lt('updated_at', sevenDaysAgo)
    .order('value', { ascending: false })
    .limit(10);
  return data ?? [];
}

async function getUnansweredConversations(supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never, accountId: string) {
  const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString();
  const { data } = await supabase
    .from('conversations')
    .select('id, platform, last_message_text, last_message_at, contacts(name)')
    .eq('account_id', accountId)
    .eq('status', 'open')
    .lt('last_message_at', twoHoursAgo)
    .order('last_message_at', { ascending: true })
    .limit(10);
  return data ?? [];
}

async function getPipelineSummary(supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never, accountId: string) {
  const { data } = await supabase
    .from('deals')
    .select('status, value, currency')
    .eq('account_id', accountId);

  const open = (data ?? []).filter((d) => d.status === 'open');
  const won = (data ?? []).filter((d) => d.status === 'won');
  const lost = (data ?? []).filter((d) => d.status === 'lost');
  const totalPipeline = open.reduce((s, d) => s + (d.value ?? 0), 0);
  const totalWon = won.reduce((s, d) => s + (d.value ?? 0), 0);

  return { open: open.length, won: won.length, lost: lost.length, totalPipeline, totalWon };
}

// ── Intent routing ────────────────────────────────────────────

function detectIntent(query: string): string {
  const q = query.toLowerCase();
  if (q.includes('hot lead') || q.includes('high intent') || q.includes('best lead')) return 'hot_leads';
  if (q.includes('follow') || q.includes('overdue') || q.includes('pending')) return 'overdue_followups';
  if (q.includes('deal') || q.includes('risk') || q.includes('stall') || q.includes('pipeline')) return 'deals';
  if (q.includes('unanswer') || q.includes('conversation') || q.includes('inbox') || q.includes('reply')) return 'conversations';
  if (q.includes('pipeline') || q.includes('revenue') || q.includes('forecast') || q.includes('won')) return 'pipeline';
  if (q.includes('contact first') || q.includes('who should') || q.includes('priority')) return 'hot_leads';
  return 'general';
}

// ── Format helpers ────────────────────────────────────────────

function formatHotLeads(leads: Record<string, unknown>[]): string {
  if (!leads.length) return 'No hot leads found in your CRM right now.';
  const lines = leads.map((l, i) =>
    `${i + 1}. **${l.name ?? 'Unknown'}** — Score: ${l.lead_score ?? 0}/100 (${l.lead_score_tier ?? 'cold'}) · Status: ${l.lead_status ?? 'new'}`
  );
  return `Found **${leads.length} hot lead${leads.length > 1 ? 's'  : ''}** in your CRM:\n\n${lines.join('\n')}\n\n💡 Contact the top leads within 30 minutes for best conversion rates.`;
}

function formatOverdueFollowups(followups: Record<string, unknown>[]): string {
  if (!followups.length) return 'No overdue follow-ups. You\'re all caught up!';
  const lines = followups.map((f, i) => {
    const contact = f.contacts as { name?: string } | null;
    const dueDate = new Date(f.due_date as string);
    const hoursOverdue = Math.floor((Date.now() - dueDate.getTime()) / 3_600_000);
    return `${i + 1}. **${f.title}** — ${contact?.name ?? 'Unknown'} · ${hoursOverdue}h overdue`;
  });
  return `Found **${followups.length} overdue follow-up${followups.length > 1 ? 's' : ''}**:\n\n${lines.join('\n')}\n\n⚠️ Delayed follow-ups significantly reduce conversion rates.`;
}

function formatDealsAtRisk(deals: Record<string, unknown>[]): string {
  if (!deals.length) return 'No deals at risk. Your pipeline looks healthy!';
  const lines = deals.map((d, i) => {
    const stage = d.pipeline_stages as { name?: string } | null;
    const daysStalled = Math.floor((Date.now() - new Date(d.updated_at as string).getTime()) / 86_400_000);
    return `${i + 1}. **${d.title}** — ${(d.value as number ?? 0).toLocaleString()} ${d.currency ?? 'USD'} · Stage: ${stage?.name ?? 'Unknown'} · ${daysStalled} days stalled`;
  });
  return `Found **${deals.length} deal${deals.length > 1 ? 's' : ''} at risk**:\n\n${lines.join('\n')}\n\n📞 Recommend scheduling follow-up calls for stalled deals.`;
}

function formatConversations(convs: Record<string, unknown>[]): string {
  if (!convs.length) return 'All conversations have been answered. Great work!';
  const lines = convs.map((c, i) => {
    const contact = c.contacts as { name?: string } | null;
    const hoursAgo = Math.floor((Date.now() - new Date(c.last_message_at as string).getTime()) / 3_600_000);
    return `${i + 1}. **${contact?.name ?? 'Unknown'}** via ${c.platform} · Last message ${hoursAgo}h ago`;
  });
  return `Found **${convs.length} unanswered conversation${convs.length > 1 ? 's' : ''}**:\n\n${lines.join('\n')}\n\n⚡ Fast response time is the #1 driver of lead conversion.`;
}

function formatPipeline(summary: { open: number; won: number; lost: number; totalPipeline: number; totalWon: number }): string {
  return `**Pipeline Summary:**\n\n• Open deals: ${summary.open} (Total value: ${summary.totalPipeline.toLocaleString()})\n• Won deals: ${summary.won} (Revenue: ${summary.totalWon.toLocaleString()})\n• Lost deals: ${summary.lost}\n• Win rate: ${summary.open + summary.won > 0 ? Math.round((summary.won / (summary.open + summary.won)) * 100) : 0}%`;
}

// ── Main handler ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .single();

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'No account' }, { status: 400 });
    }

    const { query } = await req.json();
    if (!query?.trim()) {
      return NextResponse.json({ error: 'Query required' }, { status: 400 });
    }

    const accountId = profile.account_id;
    const intent = detectIntent(query);

    let answer = '';
    let dataSource = 'database';

    switch (intent) {
      case 'hot_leads': {
        const leads = await getHotLeads(supabase, accountId);
        answer = formatHotLeads(leads as Record<string, unknown>[]);
        break;
      }
      case 'overdue_followups': {
        const followups = await getOverdueFollowups(supabase, accountId);
        answer = formatOverdueFollowups(followups as Record<string, unknown>[]);
        break;
      }
      case 'deals': {
        const deals = await getDealsAtRisk(supabase, accountId);
        answer = formatDealsAtRisk(deals as Record<string, unknown>[]);
        break;
      }
      case 'conversations': {
        const convs = await getUnansweredConversations(supabase, accountId);
        answer = formatConversations(convs as Record<string, unknown>[]);
        break;
      }
      case 'pipeline': {
        const summary = await getPipelineSummary(supabase, accountId);
        answer = formatPipeline(summary);
        break;
      }
      default: {
        // General: pull a quick overview
        const [leads, followups, deals] = await Promise.all([
          getHotLeads(supabase, accountId),
          getOverdueFollowups(supabase, accountId),
          getDealsAtRisk(supabase, accountId),
        ]);
        answer = `Here's a quick overview of your CRM:\n\n• 🔥 Hot leads: ${leads.length}\n• ⏰ Overdue follow-ups: ${followups.length}\n• ⚠️ Deals at risk: ${deals.length}\n\nAsk me about any of these for details, or try: "Show hot leads", "Which deals are at risk?", "Show overdue follow-ups"`;
        dataSource = 'database';
      }
    }

    return NextResponse.json({ answer, data_source: dataSource, confidence: 'high' });
  } catch (err) {
    console.error('[copilot]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
