/**
 * CRM 3.0 — AI Business Copilot API
 * POST /api/v3/copilot
 *
 * Auth: FastAPI JWT verified server-side via verifyRequest().
 * Tool-based AI that queries real CRM data. Never invents records.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';
import type { SupabaseClient } from '@supabase/supabase-js';

type DB = SupabaseClient;

async function getHotLeads(db: DB, accountId: string) {
  const { data } = await db.from('contacts').select('id, name, lead_score, lead_score_tier, lead_status, last_customer_reply_at').eq('account_id', accountId).gte('lead_score', 60).order('lead_score', { ascending: false }).limit(10);
  return data ?? [];
}

async function getOverdueFollowups(db: DB, accountId: string) {
  const { data } = await db.from('follow_ups').select('id, title, due_date, status, contacts(name)').eq('account_id', accountId).eq('status', 'pending').lt('due_date', new Date().toISOString()).order('due_date', { ascending: true }).limit(10);
  return data ?? [];
}

async function getDealsAtRisk(db: DB, accountId: string) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data } = await db.from('deals').select('id, title, value, currency, updated_at, status, pipeline_stages(name)').eq('account_id', accountId).eq('status', 'open').lt('updated_at', sevenDaysAgo).order('value', { ascending: false }).limit(10);
  return data ?? [];
}

async function getUnansweredConversations(db: DB, accountId: string) {
  const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString();
  const { data } = await db.from('conversations').select('id, platform, last_message_text, last_message_at, contacts(name)').eq('account_id', accountId).eq('status', 'open').lt('last_message_at', twoHoursAgo).order('last_message_at', { ascending: true }).limit(10);
  return data ?? [];
}

async function getPipelineSummary(db: DB, accountId: string) {
  const { data } = await db.from('deals').select('status, value, currency').eq('account_id', accountId);
  const open = (data ?? []).filter((d) => d.status === 'open');
  const won  = (data ?? []).filter((d) => d.status === 'won');
  const lost = (data ?? []).filter((d) => d.status === 'lost');
  return { open: open.length, won: won.length, lost: lost.length, totalPipeline: open.reduce((s, d) => s + (d.value ?? 0), 0), totalWon: won.reduce((s, d) => s + (d.value ?? 0), 0) };
}

function detectIntent(query: string): string {
  const q = query.toLowerCase();
  if (q.includes('hot lead') || q.includes('high intent') || q.includes('best lead')) return 'hot_leads';
  if (q.includes('follow') || q.includes('overdue') || q.includes('pending')) return 'overdue_followups';
  if (q.includes('deal') || q.includes('risk') || q.includes('stall') || q.includes('pipeline')) return 'deals';
  if (q.includes('unanswer') || q.includes('conversation') || q.includes('inbox') || q.includes('reply')) return 'conversations';
  if (q.includes('revenue') || q.includes('forecast') || q.includes('won')) return 'pipeline';
  return 'general';
}

function formatHotLeads(leads: Record<string, unknown>[]): string {
  if (!leads.length) return 'No hot leads found in your CRM right now.';
  const lines = leads.map((l, i) => `${i + 1}. **${l.name ?? 'Unknown'}** — Score: ${l.lead_score ?? 0}/100 (${l.lead_score_tier ?? 'cold'}) · Status: ${l.lead_status ?? 'new'}`);
  return `Found **${leads.length} hot lead${leads.length > 1 ? 's' : ''}** in your CRM:\n\n${lines.join('\n')}\n\n💡 Contact the top leads within 30 minutes for best conversion rates.`;
}

function formatOverdueFollowups(followups: Record<string, unknown>[]): string {
  if (!followups.length) return "No overdue follow-ups. You're all caught up!";
  const lines = followups.map((f, i) => { const contact = f.contacts as { name?: string } | null; const hoursOverdue = Math.floor((Date.now() - new Date(f.due_date as string).getTime()) / 3_600_000); return `${i + 1}. **${f.title}** — ${contact?.name ?? 'Unknown'} · ${hoursOverdue}h overdue`; });
  return `Found **${followups.length} overdue follow-up${followups.length > 1 ? 's' : ''}**:\n\n${lines.join('\n')}\n\n⚠️ Delayed follow-ups significantly reduce conversion rates.`;
}

function formatDealsAtRisk(deals: Record<string, unknown>[]): string {
  if (!deals.length) return 'No deals at risk. Your pipeline looks healthy!';
  const lines = deals.map((d, i) => { const stage = d.pipeline_stages as { name?: string } | null; const daysStalled = Math.floor((Date.now() - new Date(d.updated_at as string).getTime()) / 86_400_000); return `${i + 1}. **${d.title}** — ${(d.value as number ?? 0).toLocaleString()} ${d.currency ?? 'USD'} · Stage: ${stage?.name ?? 'Unknown'} · ${daysStalled} days stalled`; });
  return `Found **${deals.length} deal${deals.length > 1 ? 's' : ''} at risk**:\n\n${lines.join('\n')}\n\n📞 Recommend scheduling follow-up calls for stalled deals.`;
}

function formatConversations(convs: Record<string, unknown>[]): string {
  if (!convs.length) return 'All conversations have been answered. Great work!';
  const lines = convs.map((c, i) => { const contact = c.contacts as { name?: string } | null; const hoursAgo = Math.floor((Date.now() - new Date(c.last_message_at as string).getTime()) / 3_600_000); return `${i + 1}. **${contact?.name ?? 'Unknown'}** via ${c.platform} · Last message ${hoursAgo}h ago`; });
  return `Found **${convs.length} unanswered conversation${convs.length > 1 ? 's' : ''}**:\n\n${lines.join('\n')}\n\n⚡ Fast response time is the #1 driver of lead conversion.`;
}

function formatPipeline(summary: { open: number; won: number; lost: number; totalPipeline: number; totalWon: number }): string {
  return `**Pipeline Summary:**\n\n• Open deals: ${summary.open} (Total value: ${summary.totalPipeline.toLocaleString()})\n• Won deals: ${summary.won} (Revenue: ${summary.totalWon.toLocaleString()})\n• Lost deals: ${summary.lost}\n• Win rate: ${summary.open + summary.won > 0 ? Math.round((summary.won / (summary.open + summary.won)) * 100) : 0}%`;
}

export async function POST(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { query } = await req.json();
    if (!query?.trim()) return NextResponse.json({ error: 'Query required' }, { status: 400 });

    const intent = detectIntent(query);
    let answer = '';

    switch (intent) {
      case 'hot_leads': { const leads = await getHotLeads(db, user.account_id); answer = formatHotLeads(leads as Record<string, unknown>[]); break; }
      case 'overdue_followups': { const followups = await getOverdueFollowups(db, user.account_id); answer = formatOverdueFollowups(followups as Record<string, unknown>[]); break; }
      case 'deals': { const deals = await getDealsAtRisk(db, user.account_id); answer = formatDealsAtRisk(deals as Record<string, unknown>[]); break; }
      case 'conversations': { const convs = await getUnansweredConversations(db, user.account_id); answer = formatConversations(convs as Record<string, unknown>[]); break; }
      case 'pipeline': { const summary = await getPipelineSummary(db, user.account_id); answer = formatPipeline(summary); break; }
      default: {
        const [leads, followups, deals] = await Promise.all([getHotLeads(db, user.account_id), getOverdueFollowups(db, user.account_id), getDealsAtRisk(db, user.account_id)]);
        answer = `Here's a quick overview of your CRM:\n\n• 🔥 Hot leads: ${leads.length}\n• ⏰ Overdue follow-ups: ${followups.length}\n• ⚠️ Deals at risk: ${deals.length}\n\nAsk me about any of these for details, or try: "Show hot leads", "Which deals are at risk?", "Show overdue follow-ups"`;
      }
    }

    return NextResponse.json({ answer, data_source: 'database', confidence: 'high' });
  } catch (err) {
    console.error('[copilot]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
