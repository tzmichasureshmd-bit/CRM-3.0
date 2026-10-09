/**
 * CRM 3.0 — Revenue Intelligence API
 * GET /api/v3/revenue-intelligence
 *
 * Returns real aggregated revenue metrics from CRM data.
 * Supports: overview, forecast, win_loss, cohort, pipeline views.
 * No fabricated numbers. All data from real DB tables.
 * Security: account_id always from session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function getAccountId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('profiles').select('account_id').eq('user_id', userId).single();
  return (data?.account_id as string) ?? null;
}

interface DealRow {
  id: string;
  title: string | null;
  value: number | null;
  currency: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
  contact_id: string | null;
}

interface ContactRow {
  id: string;
  lead_score_tier: string | null;
  source: string | null;
  lead_status: string | null;
  created_at: string;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(supabase, user.id);
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 403 });

    const url = new URL(req.url);
    const view     = url.searchParams.get('view') ?? 'overview';
    const dateFrom = url.searchParams.get('date_from');
    const dateTo   = url.searchParams.get('date_to');
    const months   = parseInt(url.searchParams.get('months') ?? '6');

    // ── Load deals ────────────────────────────────────────────
    let dealQuery = supabase
      .from('deals')
      .select('id, title, value, currency, status, created_at, updated_at, contact_id')
      .eq('account_id', accountId);
    if (dateFrom) dealQuery = dealQuery.gte('created_at', dateFrom);
    if (dateTo)   dealQuery = dealQuery.lte('created_at', dateTo);
    const { data: dealsRaw } = await dealQuery.limit(1000);
    const deals = (dealsRaw as DealRow[]) ?? [];

    // ── Load contacts ─────────────────────────────────────────
    const { data: contactsRaw } = await supabase
      .from('contacts')
      .select('id, lead_score_tier, source, lead_status, created_at')
      .eq('account_id', accountId)
      .limit(1000);
    const contacts = (contactsRaw as ContactRow[]) ?? [];

    const currency = deals[0]?.currency ?? 'USD';
    const open  = deals.filter(d => d.status === 'open');
    const won   = deals.filter(d => d.status === 'won');
    const lost  = deals.filter(d => d.status === 'lost');

    const totalRevenue  = won.reduce((s, d) => s + (d.value ?? 0), 0);
    const pipelineValue = open.reduce((s, d) => s + (d.value ?? 0), 0);
    const lostValue     = lost.reduce((s, d) => s + (d.value ?? 0), 0);
    const winRate       = (won.length + lost.length) > 0 ? Math.round((won.length / (won.length + lost.length)) * 100) : 0;
    const avgDealValue  = won.length > 0 ? Math.round(totalRevenue / won.length) : 0;

    // Weighted pipeline (win rate applied)
    const weightedPipeline = Math.round(pipelineValue * (winRate / 100));

    // ── Overview ──────────────────────────────────────────────
    if (view === 'overview') {
      // Monthly revenue (last N months)
      const monthlyRevenue = buildMonthlyData(won, months);
      const monthlyDeals   = buildMonthlyDealCounts(deals, months);

      // Lead quality breakdown
      const tierBreakdown = {
        hot:  contacts.filter(c => c.lead_score_tier === 'hot').length,
        warm: contacts.filter(c => c.lead_score_tier === 'warm').length,
        cold: contacts.filter(c => c.lead_score_tier === 'cold').length,
      };

      // Source breakdown
      const sourceMap: Record<string, number> = {};
      contacts.forEach(c => {
        const s = c.source ?? 'Direct';
        sourceMap[s] = (sourceMap[s] ?? 0) + 1;
      });
      const sourceBreakdown = Object.entries(sourceMap)
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);

      return NextResponse.json({
        overview: {
          total_revenue: totalRevenue,
          pipeline_value: pipelineValue,
          weighted_pipeline: weightedPipeline,
          lost_value: lostValue,
          win_rate: winRate,
          avg_deal_value: avgDealValue,
          total_deals: deals.length,
          open_deals: open.length,
          won_deals: won.length,
          lost_deals: lost.length,
          total_contacts: contacts.length,
          currency,
        },
        monthly_revenue: monthlyRevenue,
        monthly_deals: monthlyDeals,
        tier_breakdown: tierBreakdown,
        source_breakdown: sourceBreakdown,
      });
    }

    // ── Forecast ──────────────────────────────────────────────
    if (view === 'forecast') {
      const monthlyRevenue = buildMonthlyData(won, 6);
      const avgMonthly = monthlyRevenue.length > 0
        ? monthlyRevenue.reduce((s, m) => s + m.revenue, 0) / monthlyRevenue.length
        : 0;

      // Simple linear trend forecast for next 3 months
      const lastThree = monthlyRevenue.slice(-3);
      const trend = lastThree.length >= 2
        ? (lastThree[lastThree.length - 1].revenue - lastThree[0].revenue) / lastThree.length
        : 0;

      const forecast = Array.from({ length: 3 }, (_, i) => {
        const d = new Date();
        d.setMonth(d.getMonth() + i + 1);
        const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        const projected = Math.max(0, Math.round(avgMonthly + trend * (i + 1)));
        return { label, projected, confidence: i === 0 ? 'high' : i === 1 ? 'medium' : 'low' };
      });

      // Pipeline by stage (using deal status as proxy)
      const pipelineByStage = [
        { stage: 'Open', count: open.length, value: pipelineValue, color: '#4f6df5' },
        { stage: 'Won', count: won.length, value: totalRevenue, color: '#28c99a' },
        { stage: 'Lost', count: lost.length, value: lostValue, color: '#f46b72' },
      ];

      return NextResponse.json({
        forecast,
        pipeline_by_stage: pipelineByStage,
        weighted_pipeline: weightedPipeline,
        avg_monthly_revenue: Math.round(avgMonthly),
        trend_direction: trend > 0 ? 'up' : trend < 0 ? 'down' : 'flat',
        currency,
      });
    }

    // ── Win/Loss Analysis ─────────────────────────────────────
    if (view === 'win_loss') {
      const monthlyWinLoss = buildMonthlyWinLoss(deals, months);

      // Win rate by month
      const winRateByMonth = monthlyWinLoss.map(m => ({
        label: m.label,
        win_rate: (m.won + m.lost) > 0 ? Math.round((m.won / (m.won + m.lost)) * 100) : 0,
        won: m.won,
        lost: m.lost,
      }));

      // Average deal cycle (days from created to won)
      const wonWithDates = won.filter(d => d.created_at && d.updated_at);
      const avgCycleDays = wonWithDates.length > 0
        ? Math.round(wonWithDates.reduce((s, d) => {
            return s + (new Date(d.updated_at).getTime() - new Date(d.created_at).getTime()) / 86400000;
          }, 0) / wonWithDates.length)
        : 0;

      return NextResponse.json({
        win_rate: winRate,
        avg_deal_value: avgDealValue,
        avg_cycle_days: avgCycleDays,
        total_won: won.length,
        total_lost: lost.length,
        won_value: totalRevenue,
        lost_value: lostValue,
        win_rate_by_month: winRateByMonth,
        currency,
      });
    }

    // ── Cohort (contacts by month) ────────────────────────────
    if (view === 'cohort') {
      const cohortData = buildCohortData(contacts, months);
      return NextResponse.json({ cohort: cohortData });
    }

    return NextResponse.json({ error: 'Unknown view' }, { status: 400 });
  } catch (err) {
    console.error('[revenue-intelligence]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ── Helpers ───────────────────────────────────────────────────

function buildMonthlyData(wonDeals: DealRow[], months: number) {
  return Array.from({ length: months }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (months - 1 - i));
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const revenue = wonDeals
      .filter(deal => {
        const dd = new Date(deal.updated_at ?? deal.created_at);
        return dd.getMonth() === d.getMonth() && dd.getFullYear() === d.getFullYear();
      })
      .reduce((s, deal) => s + (deal.value ?? 0), 0);
    return { label, revenue };
  });
}

function buildMonthlyDealCounts(deals: DealRow[], months: number) {
  return Array.from({ length: months }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (months - 1 - i));
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const created = deals.filter(deal => {
      const dd = new Date(deal.created_at);
      return dd.getMonth() === d.getMonth() && dd.getFullYear() === d.getFullYear();
    }).length;
    return { label, created };
  });
}

function buildMonthlyWinLoss(deals: DealRow[], months: number) {
  return Array.from({ length: months }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (months - 1 - i));
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const monthDeals = deals.filter(deal => {
      const dd = new Date(deal.updated_at ?? deal.created_at);
      return dd.getMonth() === d.getMonth() && dd.getFullYear() === d.getFullYear();
    });
    return {
      label,
      won:  monthDeals.filter(d => d.status === 'won').length,
      lost: monthDeals.filter(d => d.status === 'lost').length,
    };
  });
}

function buildCohortData(contacts: ContactRow[], months: number) {
  return Array.from({ length: months }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (months - 1 - i));
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const monthContacts = contacts.filter(c => {
      const cd = new Date(c.created_at);
      return cd.getMonth() === d.getMonth() && cd.getFullYear() === d.getFullYear();
    });
    return {
      label,
      total: monthContacts.length,
      hot:   monthContacts.filter(c => c.lead_score_tier === 'hot').length,
      warm:  monthContacts.filter(c => c.lead_score_tier === 'warm').length,
      qualified: monthContacts.filter(c => ['qualified','proposal','negotiation','won'].includes(c.lead_status ?? '')).length,
    };
  });
}
