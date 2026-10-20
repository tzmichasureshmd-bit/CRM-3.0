/**
 * CRM 3.0 — Revenue Intelligence API
 * GET /api/v3/revenue-intelligence
 *
 * Two modes on one endpoint:
 *   1. Rich revenue-intelligence sections — `?report=<tab>` where tab ∈
 *      overview | trends | pipeline | forecast | winloss | breakdowns | deals.
 *      Returns the shared report shape (kpis / charts / table / notes / insights).
 *   2. Legacy widget contract — `?view=overview` (used by the dashboard
 *      Revenue Trend and Lead Sources cards). Kept for backward compatibility.
 *
 * Security:
 *   - Auth via session (supabase.auth.getUser) — never trust query params.
 *   - account_id always resolved from the caller's profile; every query is
 *     tenant-scoped (account_id) and runs under RLS.
 *
 * No fabricated numbers. There is no payment / invoice / transaction table in
 * this workspace, so "collected revenue" is intentionally NOT shown — only
 * booked (won deal) value is reported, with an explicit note.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { ReportColumn, ReportKpi, ReportRange, ReportSeries, ReportTable, ValueKind } from '@/lib/reports-types';
import type { RevenueResponse, RevenueTab } from '@/lib/revenue-types';
import { REVENUE_TABS } from '@/lib/revenue-types';

type SB = Awaited<ReturnType<typeof createClient>>;

// ── palette ───────────────────────────────────────────────────
const PALETTE = {
  blue: '#4f6df5', violet: '#8b5cf6', green: '#28c99a', amber: '#f4c95d',
  red: '#f46b72', cyan: '#06b6d4', slate: '#8790aa', pink: '#ec78b5',
};

// ── tiny helpers ──────────────────────────────────────────────
const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v) || 0 : 0);
const str = (v: unknown): string => (v == null ? '' : String(v));
const dayStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const dayEnd = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const dayKey = (iso: string) => dayStart(new Date(iso)).toISOString().slice(0, 10);
const monthKey = (iso: string) => new Date(iso).toISOString().slice(0, 7);
const labelDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const labelMonth = (key: string) => new Date(key + '-01T00:00:00Z').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
const daysBetween = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));

/** The relationship join may arrive as an object or a 1-element array. */
function rel(v: unknown): Record<string, unknown> | null {
  if (Array.isArray(v)) return (v[0] as Record<string, unknown>) ?? null;
  if (v && typeof v === 'object') return v as Record<string, unknown>;
  return null;
}

// ── context + range ───────────────────────────────────────────
interface Ctx { accountId: string; role: string; currency: string; accountName: string }

async function getCtx(supabase: SB, userId: string): Promise<Ctx | null> {
  const { data: profile } = await supabase
    .from('profiles').select('account_id, role').eq('user_id', userId).single();
  if (!profile?.account_id) return null;
  const { data: account } = await supabase
    .from('accounts').select('name, currency').eq('id', profile.account_id).single();
  return {
    accountId: profile.account_id as string,
    role: (profile.role as string) ?? 'agent',
    currency: (account?.currency as string) ?? 'USD',
    accountName: (account?.name as string) ?? '',
  };
}

interface Range { from: Date; to: Date; preset: string; days: number }

function parseRange(url: URL): Range {
  const now = new Date();
  const fromRaw = url.searchParams.get('from');
  const toRaw = url.searchParams.get('to');
  const preset = url.searchParams.get('preset');

  let to = toRaw ? dayEnd(new Date(toRaw)) : dayEnd(now);
  let from: Date;
  if (fromRaw) from = dayStart(new Date(fromRaw));
  else if (preset === 'today') from = dayStart(now);
  else if (preset === '7d') from = dayStart(new Date(now.getTime() - 6 * 86400000));
  else if (preset === '90d') from = dayStart(new Date(now.getTime() - 89 * 86400000));
  else from = dayStart(new Date(now.getTime() - 29 * 86400000)); // default 30d

  if (isNaN(from.getTime())) from = dayStart(new Date(now.getTime() - 29 * 86400000));
  if (isNaN(to.getTime())) to = dayEnd(now);
  if (from > to) { const t = from; from = dayStart(to); to = dayEnd(t); }

  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
  return { from, to, preset: fromRaw || toRaw ? 'custom' : (preset ?? '30d'), days };
}

/** Previous period of equal length, immediately before the current range. */
function previousRange(range: Range): Range {
  const span = range.to.getTime() - range.from.getTime();
  const to = new Date(range.from.getTime() - 1);
  const from = new Date(to.getTime() - span);
  return { from: dayStart(from), to: dayEnd(to), preset: range.preset, days: range.days };
}

const inRange = (iso: unknown, range: Range): boolean => {
  if (!iso) return false;
  const t = new Date(str(iso)).getTime();
  return !isNaN(t) && t >= range.from.getTime() && t <= range.to.getTime();
};

// ── buckets ───────────────────────────────────────────────────
type Gran = 'day' | 'month' | 'quarter';

function quarterOf(d: Date): { key: string; label: string } {
  const q = Math.floor(d.getMonth() / 3) + 1;
  return { key: `${d.getFullYear()}-Q${q}`, label: `Q${q} ${String(d.getFullYear()).slice(2)}` };
}

function buildBuckets(range: Range, gran: Gran): { key: string; label: string; row: Record<string, number> }[] {
  const out: { key: string; label: string; row: Record<string, number> }[] = [];
  if (gran === 'day') {
    for (let d = dayStart(range.from); d <= range.to; d = new Date(d.getTime() + 86400000)) {
      out.push({ key: d.toISOString().slice(0, 10), label: labelDay(d.toISOString()), row: {} });
    }
  } else if (gran === 'month') {
    const d = new Date(range.from.getFullYear(), range.from.getMonth(), 1);
    while (d <= range.to) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      out.push({ key, label: labelMonth(key), row: {} });
      d.setMonth(d.getMonth() + 1);
    }
  } else {
    const d = new Date(range.from.getFullYear(), Math.floor(range.from.getMonth() / 3) * 3, 1);
    while (d <= range.to) {
      const { key, label } = quarterOf(d);
      out.push({ key, label, row: {} });
      d.setMonth(d.getMonth() + 3);
    }
  }
  return out;
}

function bucketIndex(range: Range, gran: Gran, iso: string): number | null {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  const key = gran === 'day' ? dayKey(iso) : gran === 'month' ? monthKey(iso) : quarterOf(new Date(iso)).key;
  const idx = buildBuckets(range, gran).findIndex(b => b.key === key);
  return idx >= 0 ? idx : null;
}

function autoGran(range: Range): Gran {
  if (range.days <= 31) return 'day';
  if (range.days <= 366 * 2) return 'month';
  return 'quarter';
}

// ── payload helpers ───────────────────────────────────────────
function series(key: string, label: string, color: string): ReportSeries { return { key, label, color }; }
function kpi(key: string, label: string, value: number | string, kind: ValueKind, hint?: string, tone?: ReportKpi['tone']): ReportKpi {
  return { key, label, value, kind, hint, tone };
}
function rangeMeta(range: Range): ReportRange {
  return { from: range.from.toISOString(), to: range.to.toISOString(), preset: range.preset, days: range.days, granularity: range.days <= 31 ? 'day' : 'month' };
}

function buildTable(
  all: Record<string, unknown>[],
  columns: ReportColumn[],
  opts: { q?: string | null; sort?: string | null; order?: 'asc' | 'desc'; page: number; pageSize: number; searchKeys: string[] },
): ReportTable {
  let rows = all;
  const q = (opts.q ?? '').trim().toLowerCase();
  if (q) rows = rows.filter(r => opts.searchKeys.some(k => str(r[k]).toLowerCase().includes(q)));

  const sortKey = opts.sort && columns.some(c => c.key === opts.sort) ? opts.sort : null;
  if (sortKey) {
    const dir = opts.order === 'asc' ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return str(av).localeCompare(str(bv), undefined, { numeric: true }) * dir;
    });
  }
  const total = rows.length;
  const start = Math.max(0, (opts.page - 1) * opts.pageSize);
  return { columns, rows: rows.slice(start, start + opts.pageSize), total, page: opts.page, pageSize: opts.pageSize, sort: sortKey, order: opts.order ?? 'desc' };
}

function readPaging(url: URL) {
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1') || 1);
  const rawSize = parseInt(url.searchParams.get('pageSize') ?? '25') || 25;
  const pageSize = Math.min(2000, Math.max(5, rawSize));
  const sort = url.searchParams.get('sort');
  const order = (url.searchParams.get('order') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';
  const q = url.searchParams.get('q');
  return { page, pageSize, sort, order, q };
}

// ── deal model ────────────────────────────────────────────────
interface Deal {
  id: string;
  title: string;
  value: number;
  currency: string;
  status: 'open' | 'won' | 'lost' | string;
  stage_id: string;
  contact_id: string;
  contact_name: string;
  source: string;
  company: string;
  close_date: string;
  created_at: string;
  updated_at: string;
}

function mapDeal(r: Record<string, unknown>): Deal {
  const c = rel(r.contacts);
  return {
    id: str(r.id),
    title: str(r.title) || 'Untitled deal',
    value: num(r.value),
    currency: str(r.currency) || 'USD',
    status: str(r.status) || 'open',
    stage_id: str(r.stage_id),
    contact_id: str(r.contact_id),
    contact_name: c ? str(c.name) || 'Unknown' : 'Unknown',
    source: c ? str(c.source) || 'Direct' : 'Direct',
    company: c ? str(c.company) : '',
    close_date: str(r.close_date),
    created_at: str(r.created_at),
    updated_at: str(r.updated_at),
  };
}

/** The date revenue is recognised: last update (when it was won) → close date → created. */
function revenueDate(d: Deal): string {
  return d.updated_at || d.close_date || d.created_at;
}

function ageDays(d: Deal): number {
  return daysBetween(new Date(d.created_at), new Date());
}

function isOverdue(d: Deal): boolean {
  return d.status === 'open' && !!d.close_date && new Date(d.close_date).getTime() < dayStart(new Date()).getTime();
}

function isStalled(d: Deal): boolean {
  if (d.status !== 'open') return false;
  const ref = d.updated_at || d.created_at;
  return daysBetween(new Date(ref), new Date()) >= 30;
}

// frontier loader
async function loadRevenue(supabase: SB, ctx: Ctx) {
  const [dealsRes, stagesRes, contactsRes] = await Promise.all([
    supabase.from('deals')
      .select('id, title, value, currency, status, stage_id, contact_id, close_date, created_at, updated_at, contacts(name, source, company)')
      .eq('account_id', ctx.accountId).limit(5000),
    supabase.from('pipeline_stages').select('id, name, color, position').eq('account_id', ctx.accountId).order('position').limit(200),
    supabase.from('contacts').select('id, source, created_at').eq('account_id', ctx.accountId).limit(5000),
  ]);
  return {
    deals: ((dealsRes.data ?? []) as Record<string, unknown>[]).map(mapDeal),
    stages: (stagesRes.data ?? []) as Record<string, unknown>[],
    contacts: (contactsRes.data ?? []) as Record<string, unknown>[],
  };
}

type Base = Awaited<ReturnType<typeof loadRevenue>>;

// ── GET ───────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const ctx = await getCtx(supabase, user.id);
    if (!ctx) return NextResponse.json({ error: 'Account not found' }, { status: 403 });

    const url = new URL(req.url);
    const reportParam = url.searchParams.get('report');
    if (reportParam) {
      const tab = (REVENUE_TABS.includes(reportParam as RevenueTab) ? reportParam : 'overview') as RevenueTab;
      return NextResponse.json(await revenueReport(supabase, ctx, url, tab));
    }

    return legacyGet(supabase, ctx, url);
  } catch (err) {
    console.error('[revenue-intelligence]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ── Rich revenue-intelligence handler ─────────────────────────
async function revenueReport(supabase: SB, ctx: Ctx, url: URL, tab: RevenueTab): Promise<RevenueResponse> {
  const range = parseRange(url);
  const base = await loadRevenue(supabase, ctx);
  const paging = readPaging(url);
  const statusFilter = url.searchParams.get('status');

  switch (tab) {
    case 'trends':     return trendsReport(base, ctx, range, url);
    case 'pipeline':   return pipelineReport(base, ctx, range, paging, { statusFilter });
    case 'forecast':   return forecastReport(base, ctx, range);
    case 'winloss':    return winLossReport(base, ctx, range, url);
    case 'breakdowns': return await breakdownsReport(supabase, base, ctx, range, paging);
    case 'deals':      return dealsReport(base, ctx, range, paging, { statusFilter });
    case 'overview':
    default:           return overviewReport(base, ctx, range);
  }
}

function shell(tab: RevenueTab, ctx: Ctx, range: Range, parts: Partial<RevenueResponse>): RevenueResponse {
  return {
    report: tab,
    range: rangeMeta(range),
    generated_at: new Date().toISOString(),
    kpis: [], charts: [], table: null, notes: [], insights: [],
    meta: { currency: ctx.currency, account_name: ctx.accountName },
    ...parts,
  };
}

/** Shared snapshot + period metrics used by several tabs. */
function metrics(deals: Deal[], range: Range) {
  const wonAll = deals.filter(d => d.status === 'won');
  const lostAll = deals.filter(d => d.status === 'lost');
  const openAll = deals.filter(d => d.status === 'open');

  const wonInRange = wonAll.filter(d => inRange(revenueDate(d), range));
  const lostInRange = lostAll.filter(d => inRange(revenueDate(d), range));
  const createdInRange = deals.filter(d => inRange(d.created_at, range));

  const wonRevenue = wonAll.reduce((s, d) => s + d.value, 0);
  const wonRevenueRange = wonInRange.reduce((s, d) => s + d.value, 0);
  const lostValue = lostAll.reduce((s, d) => s + d.value, 0);
  const openValue = openAll.reduce((s, d) => s + d.value, 0);

  const closedCount = wonAll.length + lostAll.length;
  const winRate = closedCount > 0 ? Math.round((wonAll.length / closedCount) * 100) : 0;
  const avgDeal = wonAll.length > 0 ? Math.round(wonRevenue / wonAll.length) : 0;
  const weightedPipeline = Math.round(openValue * (winRate / 100));

  const currencySet = new Set(deals.map(d => str(d.currency)).filter(Boolean));

  return {
    wonAll, lostAll, openAll, wonInRange, lostInRange, createdInRange,
    wonRevenue, wonRevenueRange, lostValue, openValue,
    winRate, avgDeal, weightedPipeline, currencySet,
    closedCount,
  };
}

// ── Overview ──────────────────────────────────────────────────
function overviewReport(base: Base, ctx: Ctx, range: Range): RevenueResponse {
  const { deals, stages, contacts } = base;
  const m = metrics(deals, range);
  const prev = metrics(deals, previousRange(range));

  const gran = autoGran(range);
  const buckets = buildBuckets(range, gran);
  m.wonInRange.forEach(d => { const i = bucketIndex(range, gran, revenueDate(d)); if (i != null) buckets[i].row.revenue = (buckets[i].row.revenue ?? 0) + d.value; });
  m.createdInRange.forEach(d => { const i = bucketIndex(range, gran, d.created_at); if (i != null) buckets[i].row.created = (buckets[i].row.created ?? 0) + 1; });
  const trend = buckets.map(b => ({ label: b.label, revenue: Math.round(b.row.revenue ?? 0), deals: b.row.created ?? 0 }));

  const byStatus = [
    { name: 'Open', value: Math.round(m.openValue), count: m.openAll.length, color: PALETTE.blue },
    { name: 'Won', value: Math.round(m.wonRevenue), count: m.wonAll.length, color: PALETTE.green },
    { name: 'Lost', value: Math.round(m.lostValue), count: m.lostAll.length, color: PALETTE.red },
  ];

  const stageData = stages.map(st => {
    const sd = m.openAll.filter(d => d.stage_id === str(st.id));
    return { name: str(st.name), value: Math.round(sd.reduce((s, d) => s + d.value, 0)), count: sd.length, color: str(st.color) || PALETTE.blue };
  }).filter(s => s.count > 0 || s.value > 0);

  // conversions
  const contactIdsWithDeals = new Set(deals.map(d => d.contact_id).filter(Boolean));
  const totalContacts = contacts.length;
  const withDeals = contacts.filter(c => contactIdsWithDeals.has(str(c.id))).length;
  const leadToDeal = totalContacts > 0 ? Math.round((withDeals / totalContacts) * 100) : 0;
  const dealToWin = deals.length > 0 ? Math.round((m.wonAll.length / deals.length) * 100) : 0;

  const deltaPct = prev.wonRevenueRange > 0 ? Math.round(((m.wonRevenueRange - prev.wonRevenueRange) / prev.wonRevenueRange) * 100) : null;
  const deltaHint = deltaPct == null ? undefined : `${deltaPct >= 0 ? '+' : ''}${deltaPct}% vs prev`;

  const overdue = m.openAll.filter(isOverdue).length;
  const stalled = m.openAll.filter(isStalled).length;
  const avgMonthly = m.wonRevenue > 0 && deals.length > 0
    ? Math.round(m.wonRevenue / Math.max(1, monthsSpan(deals.filter(d => d.status === 'won'))))
    : 0;
  const coverage = avgMonthly > 0 ? (m.openValue / avgMonthly) : 0;

  const notes: string[] = [];
  if (deals.length === 0) notes.push('No deals yet — revenue analytics will populate once deals are created.');
  if (m.currencySet.size > 1) notes.push(`Deals span multiple currencies (${[...m.currencySet].join(', ')}); totals are summed without FX conversion.`);
  notes.push('Collected / paid revenue is not shown: this workspace has no payment, invoice or transaction records. Figures reflect booked (won) deal value only.');

  const insights: string[] = [];
  if (m.closedCount > 0) {
    insights.push(`Win rate is ${m.winRate}% across ${m.wonAll.length} won and ${m.lostAll.length} lost deals.`);
  }
  if (deltaPct != null) {
    insights.push(`Won revenue in this period is ${deltaPct >= 0 ? 'up' : 'down'} ${Math.abs(deltaPct)}% versus the previous period of equal length.`);
  }
  if (m.openAll.length > 0) {
    insights.push(`Open pipeline holds ${fmt(cur(ctx), m.openValue)} across ${m.openAll.length} deals — a win-probability-weighted ${fmt(cur(ctx), m.weightedPipeline)}.`);
    if (coverage > 0) insights.push(`Pipeline coverage is ~${coverage.toFixed(1)} months of average won revenue.`);
  }
  if (overdue > 0) insights.push(`${overdue} open deal${overdue === 1 ? '' : 's'} are past their expected close date.`);
  if (stalled > 0) insights.push(`${stalled} open deal${stalled === 1 ? '' : 's'} have not been updated in 30+ days.`);
  if (m.wonAll.length > 0) insights.push(`Average won deal size is ${fmt(cur(ctx), m.avgDeal)}.`);

  return shell('overview', ctx, range, {
    kpis: [
      kpi('won_revenue', 'Won Revenue', Math.round(m.wonRevenueRange), 'currency', deltaHint ?? `${m.wonInRange.length} deals won`, 'green'),
      kpi('open_pipeline', 'Open Pipeline', Math.round(m.openValue), 'currency', `${m.openAll.length} open · current`, 'blue'),
      kpi('weighted', 'Weighted Pipeline', m.weightedPipeline, 'currency', `@ ${m.winRate}% win rate`, 'violet'),
      kpi('avg_deal', 'Avg Deal Size', m.avgDeal, 'currency', 'across won deals', 'amber'),
      kpi('win_rate', 'Win Rate', m.winRate, 'percent', `${m.wonAll.length}W / ${m.lostAll.length}L`, 'cyan'),
      kpi('lead_to_deal', 'Lead → Deal', leadToDeal, 'percent', `${withDeals}/${totalContacts} contacts`, 'blue'),
      kpi('deal_to_win', 'Deal → Win', dealToWin, 'percent', `won / all deals`, 'green'),
      kpi('lost_value', 'Lost Value', Math.round(m.lostValue), 'currency', `${m.lostAll.length} lost deals`, 'red'),
    ],
    charts: [
      { key: 'trend', title: `Won revenue & new deals (${gran === 'day' ? 'daily' : gran === 'month' ? 'monthly' : 'quarterly'})`, type: 'area', xKey: 'label', height: 240, series: [series('revenue', 'Won revenue', PALETTE.green), series('deals', 'New deals', PALETTE.blue)], data: trend },
      { key: 'status', title: 'Deal value by status', type: 'bar', xKey: 'name', height: 210, series: [series('value', 'Value', PALETTE.violet)], data: byStatus },
      { key: 'stages', title: 'Open pipeline by stage', type: 'bar', xKey: 'name', height: 210, series: [series('value', 'Open value', PALETTE.blue)], data: stageData },
    ],
    notes,
    insights,
    drilldown: '/pipeline-crm',
    meta: { currency: ctx.currency, account_name: ctx.accountName, row_count: deals.length },
  });
}

// ── Trends ────────────────────────────────────────────────────
function trendsReport(base: Awaited<ReturnType<typeof loadRevenue>>, ctx: Ctx, range: Range, url: URL): RevenueResponse {
  const { deals } = base;
  const m = metrics(deals, range);
  const gParam = url.searchParams.get('g');
  const gran: Gran = (gParam === 'quarter' ? 'quarter' : 'month');

  const buckets = buildBuckets(range, gran);
  m.wonInRange.forEach(d => { const i = bucketIndex(range, gran, revenueDate(d)); if (i != null) { buckets[i].row.revenue = (buckets[i].row.revenue ?? 0) + d.value; buckets[i].row.won = (buckets[i].row.won ?? 0) + 1; } });
  m.createdInRange.forEach(d => { const i = bucketIndex(range, gran, d.created_at); if (i != null) buckets[i].row.created = (buckets[i].row.created ?? 0) + 1; });

  const trend = buckets.map(b => ({
    label: b.label,
    revenue: Math.round(b.row.revenue ?? 0),
    deals: b.row.won ?? 0,
    created: b.row.created ?? 0,
    avg: b.row.won ? Math.round((b.row.revenue ?? 0) / b.row.won) : 0,
  }));

  const withRev = trend.filter(t => t.revenue > 0);
  const best = withRev.length ? withRev.reduce((a, b) => (b.revenue > a.revenue ? b : a)) : null;
  const first = withRev[0]?.revenue ?? 0;
  const last = withRev[withRev.length - 1]?.revenue ?? 0;
  const growth = first > 0 ? Math.round(((last - first) / first) * 100) : null;

  const table = buildTable(trend as unknown as Record<string, unknown>[], [
    { key: 'label', label: 'Period', type: 'text' },
    { key: 'revenue', label: 'Won Revenue', type: 'currency', align: 'right' },
    { key: 'deals', label: 'Deals Won', type: 'number', align: 'right' },
    { key: 'created', label: 'Deals Created', type: 'number', align: 'right' },
    { key: 'avg', label: 'Avg Deal', type: 'currency', align: 'right' },
  ], { page: 1, pageSize: 2000, sort: null, order: 'asc', q: null, searchKeys: ['label'] });

  const notes: string[] = [];
  if (m.wonInRange.length === 0) notes.push('No deals were won in the selected range.');

  const insights: string[] = [];
  if (best) insights.push(`Strongest ${gran} is ${best.label} with ${fmt(cur(ctx), best.revenue)} in won revenue.`);
  if (growth != null) insights.push(`Won revenue changed ${growth >= 0 ? '+' : ''}${growth}% from the first to the last active ${gran} in range.`);

  return shell('trends', ctx, range, {
    kpis: [
      kpi('revenue', 'Won Revenue (range)', Math.round(m.wonRevenueRange), 'currency', `${m.wonInRange.length} deals`, 'green'),
      kpi('avg_period', 'Avg / Period', withRev.length ? Math.round(m.wonRevenueRange / withRev.length) : 0, 'currency', `${withRev.length} active ${gran}s`, 'blue'),
      kpi('best', 'Best Period', best ? best.revenue : 0, 'currency', best?.label ?? '—', 'violet'),
      kpi('growth', 'Period Growth', growth ?? 0, 'percent', 'first → last active', growth != null && growth < 0 ? 'red' : 'cyan'),
      kpi('deals', 'Deals Created', m.createdInRange.length, 'number', 'in range', 'amber'),
    ],
    charts: [
      { key: 'trend', title: `Won revenue (${gran}ly)`, type: 'area', xKey: 'label', height: 260, series: [series('revenue', 'Won revenue', PALETTE.green)], data: trend },
      { key: 'deals', title: `Deals won vs created (${gran}ly)`, type: 'bar', xKey: 'label', height: 240, series: [series('deals', 'Won', PALETTE.green), series('created', 'Created', PALETTE.blue)], data: trend },
    ],
    table,
    notes,
    insights,
    drilldown: '/pipeline-crm',
    meta: { currency: ctx.currency, account_name: ctx.accountName, row_count: m.wonInRange.length },
  });
}

// ── Pipeline & aging ──────────────────────────────────────────
function pipelineReport(
  base: Awaited<ReturnType<typeof loadRevenue>>, ctx: Ctx, range: Range,
  paging: ReturnType<typeof readPaging>, filters: { statusFilter: string | null },
): RevenueResponse {
  const { deals, stages } = base;
  const m = metrics(deals, range);
  const open = m.openAll;

  const stageData = stages.map(st => {
    const sd = open.filter(d => d.stage_id === str(st.id));
    return { name: str(st.name), value: Math.round(sd.reduce((s, d) => s + d.value, 0)), count: sd.length, color: str(st.color) || PALETTE.blue };
  });

  const AGE_BUCKETS = [
    { name: '0–15d', min: 0, max: 15, color: PALETTE.blue },
    { name: '16–30d', min: 16, max: 30, color: PALETTE.cyan },
    { name: '31–60d', min: 31, max: 60, color: PALETTE.violet },
    { name: '61–90d', min: 61, max: 90, color: PALETTE.amber },
    { name: '90d+', min: 91, max: Infinity, color: PALETTE.red },
  ];
  const ageData = AGE_BUCKETS.map(b => {
    const inB = open.filter(d => { const a = ageDays(d); return a >= b.min && a <= b.max; });
    return { name: b.name, count: inB.length, value: Math.round(inB.reduce((s, d) => s + d.value, 0)), color: b.color };
  });

  const avgAge = open.length ? Math.round(open.reduce((s, d) => s + ageDays(d), 0) / open.length) : 0;
  const overdue = open.filter(isOverdue).length;
  const stalled = open.filter(isStalled).length;

  const rows = open.map(d => {
    const st = stages.find(s => str(s.id) === d.stage_id);
    const a = ageDays(d);
    const bucket = AGE_BUCKETS.find(b => a >= b.min && a <= b.max)?.name ?? '90d+';
    return {
      id: d.id, title: d.title, contact_name: d.contact_name,
      stage: st ? str(st.name) : '—', value: d.value,
      close_date: d.close_date || null, age_days: a, age_bucket: bucket,
      health: isOverdue(d) ? 'overdue' : isStalled(d) ? 'stalled' : 'on track',
      updated_at: d.updated_at,
    };
  });

  const filtered = filters.statusFilter
    ? rows.filter(r => r.health === filters.statusFilter)
    : rows;

  const table = buildTable(filtered as unknown as Record<string, unknown>[], [
    { key: 'title', label: 'Deal', type: 'text' },
    { key: 'contact_name', label: 'Contact', type: 'text' },
    { key: 'stage', label: 'Stage', type: 'text' },
    { key: 'value', label: 'Value', type: 'currency', align: 'right' },
    { key: 'close_date', label: 'Close Date', type: 'date', align: 'right' },
    { key: 'age_days', label: 'Age (d)', type: 'number', align: 'right' },
    { key: 'age_bucket', label: 'Age Bucket', type: 'badge', align: 'center' },
    { key: 'health', label: 'Health', type: 'badge', align: 'center' },
  ], { ...paging, searchKeys: ['title', 'contact_name', 'stage', 'health', 'age_bucket'] });

  const notes: string[] = [];
  if (open.length === 0) notes.push('No open deals in the pipeline.');
  if (stages.length === 0) notes.push('No pipeline stages configured — define stages to see value by stage.');

  const insights: string[] = [];
  insights.push(`${open.length} open deals worth ${fmt(cur(ctx), m.openValue)}; average age is ${avgAge} days.`);
  if (overdue > 0) insights.push(`${overdue} deal${overdue === 1 ? '' : 's'} are past the expected close date.`);
  if (stalled > 0) insights.push(`${stalled} deal${stalled === 1 ? '' : 's'} have stalled (no update in 30+ days).`);

  return shell('pipeline', ctx, range, {
    kpis: [
      kpi('open_value', 'Open Pipeline', Math.round(m.openValue), 'currency', `${open.length} open deals`, 'blue'),
      kpi('weighted', 'Weighted Pipeline', m.weightedPipeline, 'currency', `@ ${m.winRate}% win rate`, 'violet'),
      kpi('avg_age', 'Avg Deal Age', avgAge, 'number', 'days since created', 'cyan'),
      kpi('overdue', 'Overdue', overdue, 'number', 'past close date', overdue > 0 ? 'red' : 'slate'),
      kpi('stalled', 'Stalled', stalled, 'number', 'no update 30d+', stalled > 0 ? 'amber' : 'slate'),
    ],
    charts: [
      { key: 'stages', title: 'Open pipeline value by stage', type: 'bar', xKey: 'name', height: 230, series: [series('value', 'Open value', PALETTE.blue)], data: stageData },
      { key: 'age', title: 'Open deals by age', type: 'bar', xKey: 'name', height: 230, series: [series('count', 'Deals', PALETTE.violet)], data: ageData },
    ],
    table,
    notes,
    insights,
    drilldown: '/pipeline-crm',
    meta: { currency: ctx.currency, account_name: ctx.accountName, row_count: filtered.length },
  });
}

// ── Forecast ──────────────────────────────────────────────────
function forecastReport(base: Awaited<ReturnType<typeof loadRevenue>>, ctx: Ctx, range: Range): RevenueResponse {
  const { deals } = base;
  const m = metrics(deals, range);

  // Monthly won revenue over the lookback window (at least 6 months).
  const months = Math.max(6, Math.min(12, Math.ceil(range.days / 30)));
  const monthly = buildBuckets(monthRange(months), 'month').map(b => ({ key: b.key, label: b.label, revenue: 0 as number }));
  m.wonAll.forEach(d => {
    const key = monthKey(revenueDate(d));
    const found = monthly.find(mo => mo.key === key);
    if (found) found.revenue += d.value;
  });

  const activeMonths = monthly.filter(mo => mo.revenue > 0);
  const avgMonthly = activeMonths.length ? Math.round(monthly.reduce((s, mo) => s + mo.revenue, 0) / monthly.length) : 0;

  // Linear trend over the last up-to-3 months.
  const tail = monthly.slice(-3);
  const trendStep = tail.length >= 2
    ? (tail[tail.length - 1].revenue - tail[0].revenue) / (tail.length - 1)
    : 0;

  const historyLen = monthly.filter(mo => mo.revenue > 0).length;
  const confidence = historyLen >= 6 ? 'high' : historyLen >= 3 ? 'medium' : 'low';

  const projRows = Array.from({ length: 3 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() + i + 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const projected = Math.max(0, Math.round(avgMonthly + trendStep * (i + 1)));
    return { month: labelMonth(key), projected, confidence, run_rate: avgMonthly, weighted: m.weightedPipeline };
  });

  const chartData = [
    ...monthly.map(mo => ({ label: mo.label, actual: Math.round(mo.revenue), projection: null as number | null })),
    ...projRows.map((p, i) => ({ label: i === 0 ? `${p.month} (proj)` : `${p.month} (proj)`, actual: null as number | null, projection: p.projected })),
  ];

  const nextMonth = projRows[0]?.projected ?? 0;
  const threeMonth = projRows.reduce((s, p) => s + p.projected, 0);

  const table = buildTable(projRows as unknown as Record<string, unknown>[], [
    { key: 'month', label: 'Month', type: 'text' },
    { key: 'projected', label: 'Projected', type: 'currency', align: 'right' },
    { key: 'run_rate', label: 'Run-rate Avg', type: 'currency', align: 'right' },
    { key: 'confidence', label: 'Confidence', type: 'badge', align: 'center' },
  ], { page: 1, pageSize: 200, sort: null, order: 'asc', q: null, searchKeys: ['month'] });

  const notes: string[] = [
    'Forecast method: 3-month projection blended from the trailing monthly run-rate plus a linear trend over the last active months. It is a statistical estimate, not a commitment.',
  ];
  if (historyLen < 3) notes.push('Limited won-deal history (fewer than 3 active months) — treat the projection as low confidence.');
  if (m.openAll.length > 0) notes.push(`Weighted pipeline (${fmt(cur(ctx), m.weightedPipeline)}) is shown separately and assumes the historical ${m.winRate}% win rate.`);

  const insights: string[] = [];
  if (avgMonthly > 0) insights.push(`Trailing monthly run-rate is ${fmt(cur(ctx), avgMonthly)} based on ${historyLen} active month${historyLen === 1 ? '' : 's'}.`);
  insights.push(`Next month is projected at ${fmt(cur(ctx), nextMonth)} (confidence: ${confidence}).`);
  if (m.openAll.length > 0) insights.push(`Open pipeline contributes a weighted ${fmt(cur(ctx), m.weightedPipeline)} toward future revenue.`);

  return shell('forecast', ctx, range, {
    kpis: [
      kpi('run_rate', 'Monthly Run-rate', avgMonthly, 'currency', `${historyLen} active months`, 'blue'),
      kpi('next_month', 'Next Month', nextMonth, 'currency', `confidence: ${confidence}`, 'green'),
      kpi('three_month', 'Next 3 Months', threeMonth, 'currency', 'projected total', 'violet'),
      kpi('weighted', 'Weighted Pipeline', m.weightedPipeline, 'currency', `@ ${m.winRate}% win rate`, 'amber'),
      kpi('open', 'Open Deals', m.openAll.length, 'number', fmt(cur(ctx), m.openValue), 'cyan'),
    ],
    charts: [
      { key: 'forecast', title: 'Revenue history & 3-month projection', type: 'line', xKey: 'label', height: 260, series: [series('actual', 'Actual', PALETTE.green), series('projection', 'Projected', PALETTE.violet)], data: chartData },
    ],
    table,
    notes,
    insights,
    drilldown: '/pipeline-crm',
    meta: { currency: ctx.currency, account_name: ctx.accountName, row_count: projRows.length },
  });
}

function monthRange(months: number): Range {
  const to = dayEnd(new Date());
  const from = dayStart(new Date());
  from.setMonth(from.getMonth() - (months - 1));
  from.setDate(1);
  return { from, to, preset: `${months}m`, days: daysBetween(from, to) };
}

// ── Win / Loss ────────────────────────────────────────────────
function winLossReport(base: Awaited<ReturnType<typeof loadRevenue>>, ctx: Ctx, range: Range, url: URL): RevenueResponse {
  const { deals } = base;
  const m = metrics(deals, range);
  const gParam = url.searchParams.get('g');
  const gran: Gran = gParam === 'day' ? 'day' : gParam === 'quarter' ? 'quarter' : 'month';

  const buckets = buildBuckets(range, gran);
  m.wonInRange.forEach(d => { const i = bucketIndex(range, gran, revenueDate(d)); if (i != null) { buckets[i].row.won = (buckets[i].row.won ?? 0) + 1; buckets[i].row.wonValue = (buckets[i].row.wonValue ?? 0) + d.value; } });
  m.lostInRange.forEach(d => { const i = bucketIndex(range, gran, revenueDate(d)); if (i != null) { buckets[i].row.lost = (buckets[i].row.lost ?? 0) + 1; buckets[i].row.lostValue = (buckets[i].row.lostValue ?? 0) + d.value; } });

  const trend = buckets.map(b => {
    const won = b.row.won ?? 0, lost = b.row.lost ?? 0;
    return {
      label: b.label,
      won, lost,
      won_value: Math.round(b.row.wonValue ?? 0),
      lost_value: Math.round(b.row.lostValue ?? 0),
      win_rate: (won + lost) > 0 ? Math.round((won / (won + lost)) * 100) : 0,
    };
  });

  const wonWithCycle = m.wonAll.filter(d => d.created_at && revenueDate(d));
  const avgCycle = wonWithCycle.length
    ? Math.round(wonWithCycle.reduce((s, d) => s + daysBetween(new Date(d.created_at), new Date(revenueDate(d))), 0) / wonWithCycle.length)
    : 0;

  const periodWinRate = (m.wonInRange.length + m.lostInRange.length) > 0
    ? Math.round((m.wonInRange.length / (m.wonInRange.length + m.lostInRange.length)) * 100)
    : 0;

  const table = buildTable(trend as unknown as Record<string, unknown>[], [
    { key: 'label', label: 'Period', type: 'text' },
    { key: 'won', label: 'Won', type: 'number', align: 'right' },
    { key: 'lost', label: 'Lost', type: 'number', align: 'right' },
    { key: 'win_rate', label: 'Win Rate', type: 'percent', align: 'right' },
    { key: 'won_value', label: 'Won Value', type: 'currency', align: 'right' },
    { key: 'lost_value', label: 'Lost Value', type: 'currency', align: 'right' },
  ], { page: 1, pageSize: 2000, sort: null, order: 'asc', q: null, searchKeys: ['label'] });

  const notes: string[] = [];
  if (m.closedCount === 0) notes.push('No won or lost deals recorded yet.');
  notes.push('Lost reasons are not captured in this workspace, so loss analysis is limited to counts and value.');

  const insights: string[] = [];
  insights.push(`All-time win rate is ${m.winRate}% (${m.wonAll.length} won / ${m.lostAll.length} lost).`);
  if (m.wonInRange.length + m.lostInRange.length > 0) insights.push(`Period win rate is ${periodWinRate}% across ${m.wonInRange.length + m.lostInRange.length} closed deals in range.`);
  if (avgCycle > 0) insights.push(`Average time to win is ${avgCycle} days from deal creation.`);

  return shell('winloss', ctx, range, {
    kpis: [
      kpi('win_rate', 'Win Rate', m.winRate, 'percent', `${m.wonAll.length}W / ${m.lostAll.length}L all-time`, 'green'),
      kpi('won_value', 'Won Value', Math.round(m.wonRevenue), 'currency', `${m.wonAll.length} deals`, 'green'),
      kpi('lost_value', 'Lost Value', Math.round(m.lostValue), 'currency', `${m.lostAll.length} deals`, 'red'),
      kpi('avg_cycle', 'Avg Cycle', avgCycle, 'number', 'days to win', 'cyan'),
      kpi('period_win_rate', 'Period Win Rate', periodWinRate, 'percent', `${m.wonInRange.length + m.lostInRange.length} closed in range`, 'violet'),
    ],
    charts: [
      { key: 'winloss', title: `Won vs lost deals (${gran}ly)`, type: 'bar', xKey: 'label', height: 240, series: [series('won', 'Won', PALETTE.green), series('lost', 'Lost', PALETTE.red)], data: trend },
      { key: 'winrate', title: `Win rate over time (${gran}ly)`, type: 'line', xKey: 'label', height: 240, series: [series('win_rate', 'Win rate', PALETTE.cyan)], data: trend },
    ],
    table,
    notes,
    insights,
    drilldown: '/pipeline-crm',
    meta: { currency: ctx.currency, account_name: ctx.accountName, row_count: trend.length },
  });
}

// ── Breakdowns ────────────────────────────────────────────────
async function breakdownsReport(
  supabase: SB, base: Awaited<ReturnType<typeof loadRevenue>>, ctx: Ctx, range: Range,
  paging: ReturnType<typeof readPaging>,
): Promise<RevenueResponse> {
  const { deals, stages } = base;
  const m = metrics(deals, range);

  // Revenue by source (from the contact on each won deal).
  const bySource = new Map<string, { source: string; deals: number; revenue: number }>();
  m.wonAll.forEach(d => {
    const s = d.source || 'Direct';
    const ex = bySource.get(s) ?? { source: s, deals: 0, revenue: 0 };
    ex.deals++; ex.revenue += d.value;
    bySource.set(s, ex);
  });
  const sourceRows = [...bySource.values()].map(r => ({ ...r, avg: r.deals ? Math.round(r.revenue / r.deals) : 0 })).sort((a, b) => b.revenue - a.revenue);
  const sourceChart = sourceRows.slice(0, 8).map(r => ({ name: r.source, value: Math.round(r.revenue) }));

  // Revenue by stage (from won deals).
  const stageRows = stages.map(st => {
    const sd = m.wonAll.filter(d => d.stage_id === str(st.id));
    return { name: str(st.name), value: Math.round(sd.reduce((s, d) => s + d.value, 0)), count: sd.length, color: str(st.color) || PALETTE.green };
  }).filter(s => s.count > 0);

  // Attributed revenue by campaign (only from crm3_attribution — single source, no double counting).
  const [attrRes, campRes] = await Promise.all([
    supabase.from('crm3_attribution').select('campaign_id, revenue_amount, is_won').eq('account_id', ctx.accountId).eq('is_won', true).limit(5000),
    supabase.from('campaigns').select('id, name').eq('account_id', ctx.accountId).limit(500),
  ]);
  const attr = (attrRes.data ?? []) as Record<string, unknown>[];
  const campaigns = (campRes.data ?? []) as Record<string, unknown>[];
  const byCampaign = new Map<string, number>();
  attr.forEach(a => {
    const cid = str(a.campaign_id) || 'unattributed';
    byCampaign.set(cid, (byCampaign.get(cid) ?? 0) + num(a.revenue_amount));
  });
  const campaignChart = [...byCampaign.entries()]
    .map(([cid, value]) => ({ name: campaigns.find(c => str(c.id) === cid) ? str(campaigns.find(c => str(c.id) === cid)!.name) : 'Unattributed', value: Math.round(value) }))
    .sort((a, b) => b.value - a.value).slice(0, 8);
  const attributedTotal = attr.reduce((s, a) => s + num(a.revenue_amount), 0);

  const table = buildTable(sourceRows as unknown as Record<string, unknown>[], [
    { key: 'source', label: 'Source', type: 'text' },
    { key: 'deals', label: 'Won Deals', type: 'number', align: 'right' },
    { key: 'revenue', label: 'Revenue', type: 'currency', align: 'right' },
    { key: 'avg', label: 'Avg Deal', type: 'currency', align: 'right' },
  ], { ...paging, searchKeys: ['source'] });

  const notes: string[] = [];
  if (m.wonAll.length === 0) notes.push('No won deals yet — source and stage breakdowns will populate once deals are won.');
  if (attr.length === 0) notes.push('No attribution records — campaign revenue will populate once deals are attributed to campaigns.');
  notes.push('Per-agent revenue is not available: deals and contacts have no owner/assignee field in this workspace.');

  const insights: string[] = [];
  if (sourceRows.length) insights.push(`Top source by won revenue is “${sourceRows[0].source}” at ${fmt(cur(ctx), sourceRows[0].revenue)}.`);
  if (attributedTotal > 0) insights.push(`${fmt(cur(ctx), attributedTotal)} of won revenue is attributed to campaigns.`);

  return shell('breakdowns', ctx, range, {
    kpis: [
      kpi('sources', 'Revenue Sources', sourceRows.length, 'number', 'with won deals', 'blue'),
      kpi('top_source', 'Top Source', sourceRows[0]?.source ?? '—', 'text', sourceRows.length ? fmt(cur(ctx), sourceRows[0].revenue) : '', 'green'),
      kpi('attributed', 'Attributed Revenue', Math.round(attributedTotal), 'currency', `${attr.length} attribution records`, 'amber'),
      kpi('stages', 'Won Stages', stageRows.length, 'number', 'stages with wins', 'violet'),
      kpi('campaigns', 'Campaigns w/ Rev', campaignChart.length, 'number', 'by attribution', 'cyan'),
    ],
    charts: [
      { key: 'source', title: 'Won revenue by source', type: 'bar', xKey: 'name', height: 230, series: [series('value', 'Revenue', PALETTE.green)], data: sourceChart },
      { key: 'stage', title: 'Won revenue by stage', type: 'bar', xKey: 'name', height: 230, series: [series('value', 'Revenue', PALETTE.violet)], data: stageRows },
      { key: 'campaign', title: 'Attributed revenue by campaign', type: 'bar', xKey: 'name', height: 230, series: [series('value', 'Attributed', PALETTE.amber)], data: campaignChart },
    ],
    table,
    notes,
    insights,
    drilldown: '/campaigns',
    meta: { currency: ctx.currency, account_name: ctx.accountName, row_count: sourceRows.length },
  });
}

// ── Deals ─────────────────────────────────────────────────────
function dealsReport(
  base: Awaited<ReturnType<typeof loadRevenue>>, ctx: Ctx, range: Range,
  paging: ReturnType<typeof readPaging>, filters: { statusFilter: string | null },
): RevenueResponse {
  const { deals, stages } = base;

  let rows = deals.filter(d => inRange(d.created_at, range) || inRange(revenueDate(d), range));
  if (filters.statusFilter) rows = rows.filter(d => d.status === filters.statusFilter);
  rows = [...rows].sort((a, b) => new Date(revenueDate(b)).getTime() - new Date(revenueDate(a)).getTime());

  const all = rows.map(d => {
    const st = stages.find(s => str(s.id) === d.stage_id);
    return {
      id: d.id, title: d.title, contact_name: d.contact_name, source: d.source,
      stage: st ? str(st.name) : '—', status: d.status, value: d.value,
      close_date: d.close_date || null, created_at: d.created_at, revenue_date: revenueDate(d),
    };
  });

  const table = buildTable(all as unknown as Record<string, unknown>[], [
    { key: 'title', label: 'Deal', type: 'text' },
    { key: 'contact_name', label: 'Contact', type: 'text' },
    { key: 'source', label: 'Source', type: 'text' },
    { key: 'stage', label: 'Stage', type: 'text' },
    { key: 'status', label: 'Status', type: 'badge' },
    { key: 'value', label: 'Value', type: 'currency', align: 'right' },
    { key: 'close_date', label: 'Close Date', type: 'date', align: 'right' },
    { key: 'created_at', label: 'Created', type: 'date', align: 'right' },
  ], { ...paging, searchKeys: ['title', 'contact_name', 'source', 'stage', 'status'] });

  const won = rows.filter(d => d.status === 'won');

  const notes: string[] = [];
  if (deals.length === 0) notes.push('No deals yet.');

  return shell('deals', ctx, range, {
    kpis: [
      kpi('deals', 'Deals', rows.length, 'number', 'in range', 'blue'),
      kpi('won', 'Won', won.length, 'number', 'in range', 'green'),
      kpi('won_value', 'Won Value', Math.round(won.reduce((s, d) => s + d.value, 0)), 'currency', 'in range', 'green'),
      kpi('avg', 'Avg Deal', won.length ? Math.round(won.reduce((s, d) => s + d.value, 0) / won.length) : 0, 'currency', 'won in range', 'amber'),
      kpi('lost', 'Lost', rows.filter(d => d.status === 'lost').length, 'number', 'in range', 'red'),
    ],
    charts: [],
    table,
    notes,
    insights: [],
    drilldown: '/pipeline-crm',
    meta: { currency: ctx.currency, account_name: ctx.accountName, row_count: all.length },
  });
}

// ── formatting helpers for insights ───────────────────────────
function cur(ctx: Ctx): string { return ctx.currency; }
function fmt(currency: string, v: number): string {
  const symbols: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', INR: '₹', JPY: '¥' };
  const sym = symbols[currency] ?? (currency ? currency + ' ' : '$');
  if (Math.abs(v) >= 1000000) return `${sym}${(v / 1000000).toFixed(1)}M`;
  if (Math.abs(v) >= 1000) return `${sym}${(v / 1000).toFixed(1)}K`;
  return `${sym}${Math.round(v)}`;
}

function monthsSpan(wonDeals: Deal[]): number {
  if (wonDeals.length === 0) return 1;
  const dates = wonDeals.map(d => new Date(revenueDate(d)).getTime()).filter(t => !isNaN(t));
  if (dates.length === 0) return 1;
  const min = Math.min(...dates), max = Math.max(...dates);
  const buckets = (max - min) / (30 * 86400000);
  return Math.max(1, Math.round(buckets));
}

// ─────────────────────────────────────────────────────────────
// Legacy widget contract (view=overview) — unchanged behaviour
// ─────────────────────────────────────────────────────────────
async function legacyGet(supabase: SB, ctx: Ctx, url: URL): Promise<NextResponse> {
  const view     = url.searchParams.get('view') ?? 'overview';
  const dateFrom = url.searchParams.get('date_from');
  const dateTo   = url.searchParams.get('date_to');
  const months   = parseInt(url.searchParams.get('months') ?? '6');

  let dealQuery = supabase
    .from('deals')
    .select('id, title, value, currency, status, created_at, updated_at, contact_id')
    .eq('account_id', ctx.accountId);
  if (dateFrom) dealQuery = dealQuery.gte('created_at', dateFrom);
  if (dateTo)   dealQuery = dealQuery.lte('created_at', dateTo);
  const { data: dealsRaw } = await dealQuery.limit(1000);
  const deals = (dealsRaw as DealRow[]) ?? [];

  const { data: contactsRaw } = await supabase
    .from('contacts')
    .select('id, lead_score_tier, source, lead_status, created_at')
    .eq('account_id', ctx.accountId)
    .limit(1000);
  const contacts = (contactsRaw as ContactRow[]) ?? [];

  const currency = ctx.currency;
  const open  = deals.filter(d => d.status === 'open');
  const won   = deals.filter(d => d.status === 'won');
  const lost  = deals.filter(d => d.status === 'lost');

  const totalRevenue  = won.reduce((s, d) => s + (d.value ?? 0), 0);
  const pipelineValue = open.reduce((s, d) => s + (d.value ?? 0), 0);
  const lostValue     = lost.reduce((s, d) => s + (d.value ?? 0), 0);
  const winRate       = (won.length + lost.length) > 0 ? Math.round((won.length / (won.length + lost.length)) * 100) : 0;
  const avgDealValue  = won.length > 0 ? Math.round(totalRevenue / won.length) : 0;
  const weightedPipeline = Math.round(pipelineValue * (winRate / 100));

  if (view === 'overview') {
    const monthlyRevenue = buildMonthlyData(won, months);
    const monthlyDeals   = buildMonthlyDealCounts(deals, months);
    const tierBreakdown = {
      hot:  contacts.filter(c => c.lead_score_tier === 'hot').length,
      warm: contacts.filter(c => c.lead_score_tier === 'warm').length,
      cold: contacts.filter(c => c.lead_score_tier === 'cold').length,
    };
    const sourceMap: Record<string, number> = {};
    contacts.forEach(c => { const s = c.source ?? 'Direct'; sourceMap[s] = (sourceMap[s] ?? 0) + 1; });
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

  if (view === 'forecast') {
    const monthlyRevenue = buildMonthlyData(won, 6);
    const avgMonthly = monthlyRevenue.length > 0 ? monthlyRevenue.reduce((s, m) => s + m.revenue, 0) / monthlyRevenue.length : 0;
    const lastThree = monthlyRevenue.slice(-3);
    const trend = lastThree.length >= 2 ? (lastThree[lastThree.length - 1].revenue - lastThree[0].revenue) / lastThree.length : 0;
    const forecast = Array.from({ length: 3 }, (_, i) => {
      const d = new Date(); d.setMonth(d.getMonth() + i + 1);
      const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const projected = Math.max(0, Math.round(avgMonthly + trend * (i + 1)));
      return { label, projected, confidence: i === 0 ? 'high' : i === 1 ? 'medium' : 'low' };
    });
    const pipelineByStage = [
      { stage: 'Open', count: open.length, value: pipelineValue, color: '#4f6df5' },
      { stage: 'Won', count: won.length, value: totalRevenue, color: '#28c99a' },
      { stage: 'Lost', count: lost.length, value: lostValue, color: '#f46b72' },
    ];
    return NextResponse.json({ forecast, pipeline_by_stage: pipelineByStage, weighted_pipeline: weightedPipeline, avg_monthly_revenue: Math.round(avgMonthly), trend_direction: trend > 0 ? 'up' : trend < 0 ? 'down' : 'flat', currency });
  }

  if (view === 'win_loss') {
    const monthlyWinLoss = buildMonthlyWinLoss(deals, months);
    const winRateByMonth = monthlyWinLoss.map(m => ({ label: m.label, win_rate: (m.won + m.lost) > 0 ? Math.round((m.won / (m.won + m.lost)) * 100) : 0, won: m.won, lost: m.lost }));
    const wonWithDates = won.filter(d => d.created_at && d.updated_at);
    const avgCycleDays = wonWithDates.length > 0
      ? Math.round(wonWithDates.reduce((s, d) => s + (new Date(d.updated_at).getTime() - new Date(d.created_at).getTime()) / 86400000, 0) / wonWithDates.length)
      : 0;
    return NextResponse.json({ win_rate: winRate, avg_deal_value: avgDealValue, avg_cycle_days: avgCycleDays, total_won: won.length, total_lost: lost.length, won_value: totalRevenue, lost_value: lostValue, win_rate_by_month: winRateByMonth, currency });
  }

  if (view === 'cohort') {
    const cohortData = buildCohortData(contacts, months);
    return NextResponse.json({ cohort: cohortData });
  }

  return NextResponse.json({ error: 'Unknown view' }, { status: 400 });
}

// ── Legacy helpers ────────────────────────────────────────────
interface DealRow {
  id: string; title: string | null; value: number | null; currency: string | null;
  status: string | null; created_at: string; updated_at: string; contact_id: string | null;
}
interface ContactRow {
  id: string; lead_score_tier: string | null; source: string | null;
  lead_status: string | null; created_at: string;
}

function buildMonthlyData(wonDeals: DealRow[], months: number) {
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - (months - 1 - i));
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const revenue = wonDeals.filter(deal => { const dd = new Date(deal.updated_at ?? deal.created_at); return dd.getMonth() === d.getMonth() && dd.getFullYear() === d.getFullYear(); }).reduce((s, deal) => s + (deal.value ?? 0), 0);
    return { label, revenue };
  });
}

function buildMonthlyDealCounts(deals: DealRow[], months: number) {
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - (months - 1 - i));
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const created = deals.filter(deal => { const dd = new Date(deal.created_at); return dd.getMonth() === d.getMonth() && dd.getFullYear() === d.getFullYear(); }).length;
    return { label, created };
  });
}

function buildMonthlyWinLoss(deals: DealRow[], months: number) {
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - (months - 1 - i));
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const monthDeals = deals.filter(deal => { const dd = new Date(deal.updated_at ?? deal.created_at); return dd.getMonth() === d.getMonth() && dd.getFullYear() === d.getFullYear(); });
    return { label, won: monthDeals.filter(d => d.status === 'won').length, lost: monthDeals.filter(d => d.status === 'lost').length };
  });
}

function buildCohortData(contacts: ContactRow[], months: number) {
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - (months - 1 - i));
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const monthContacts = contacts.filter(c => { const cd = new Date(c.created_at); return cd.getMonth() === d.getMonth() && cd.getFullYear() === d.getFullYear(); });
    return {
      label,
      total: monthContacts.length,
      hot: monthContacts.filter(c => c.lead_score_tier === 'hot').length,
      warm: monthContacts.filter(c => c.lead_score_tier === 'warm').length,
      qualified: monthContacts.filter(c => ['qualified', 'proposal', 'negotiation', 'won'].includes(c.lead_status ?? '')).length,
    };
  });
}
