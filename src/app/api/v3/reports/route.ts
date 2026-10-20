/**
 * CRM 3.0 — Reports API
 * GET /api/v3/reports?report=<id>&from=&to=&preset=&q=&status=&platform=&sort=&order=&page=&pageSize=
 *
 * One endpoint that aggregates REAL CRM data into reports:
 *   overview | contacts | sales | campaigns | broadcasts | conversations | conversion | agents
 *
 * Security:
 *  - Auth via session (supabase.auth.getUser) — never trust query params.
 *  - account_id always resolved from the caller's profile.
 *  - Every query is tenant-scoped (account_id) and runs under RLS.
 *  - The "agents" report is restricted to owner/admin roles.
 *
 * No fabricated values: empty datasets produce empty charts + explanatory notes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';
import { getServiceClient } from '@/lib/supabase/service';
import type {
  ReportId, ReportResponse, ReportKpi, ReportChart, ReportTable, ReportColumn,
  ReportSeries, ValueKind,
} from '@/lib/reports-types';
import { REPORT_IDS } from '@/lib/reports-types';

type SB = ReturnType<typeof getServiceClient>;

const PALETTE = {
  blue: '#4f6df5', violet: '#8b5cf6', green: '#28c99a', amber: '#f4c95d',
  red: '#f46b72', cyan: '#06b6d4', slate: '#8790aa', pink: '#ec78b5',
};

const PLATFORM_COLORS: Record<string, string> = {
  whatsapp: PALETTE.green, instagram: PALETTE.violet, facebook: PALETTE.blue,
  telegram: PALETTE.cyan, email: PALETTE.amber, web: PALETTE.slate,
};

const LEAD_STAGES = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won'] as const;
const PIPELINE_LABELS: Record<string, string> = {
  new: 'New', contacted: 'Contacted', qualified: 'Qualified', proposal: 'Proposal',
  negotiation: 'Negotiation', won: 'Won', lost: 'Lost',
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

interface Ctx { accountId: string; role: string; currency: string; accountName: string }

async function getCtx(supabase: SB, accountId: string, role: string): Promise<Ctx> {
  const { data: account } = await supabase
    .from('accounts').select('name, currency').eq('id', accountId).single();
  return {
    accountId,
    role,
    currency: (account?.currency as string) ?? 'USD',
    accountName: (account?.name as string) ?? '',
  };
}

interface Range { from: Date; to: Date; preset: string; days: number; granularity: 'day' | 'month' }

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
  return { from, to, preset: fromRaw || toRaw ? 'custom' : (preset ?? '30d'), days, granularity: days <= 31 ? 'day' : 'month' };
}

/** Ordered time buckets spanning the range. */
function buildBuckets(range: Range): { key: string; label: string; row: Record<string, number> }[] {
  const out: { key: string; label: string; row: Record<string, number> }[] = [];
  if (range.granularity === 'day') {
    for (let d = dayStart(range.from); d <= range.to; d = new Date(d.getTime() + 86400000)) {
      const key = d.toISOString().slice(0, 10);
      out.push({ key, label: labelDay(d.toISOString()), row: {} });
    }
  } else {
    const d = new Date(range.from.getFullYear(), range.from.getMonth(), 1);
    while (d <= range.to) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      out.push({ key, label: labelMonth(key), row: {} });
      d.setMonth(d.getMonth() + 1);
    }
  }
  return out;
}

function bucketIndex(range: Range, iso: string): number | null {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  const key = range.granularity === 'day' ? dayKey(iso) : monthKey(iso);
  const list = buildBuckets(range);
  const idx = list.findIndex(b => b.key === key);
  return idx >= 0 ? idx : null;
}

const inRange = (iso: unknown, range: Range): boolean => {
  if (!iso) return false;
  const t = new Date(str(iso)).getTime();
  return !isNaN(t) && t >= range.from.getTime() && t <= range.to.getTime();
};

function series(key: string, label: string, color: string): ReportSeries { return { key, label, color }; }

function kpi(key: string, label: string, value: number | string, kind: ValueKind, hint?: string, tone?: ReportKpi['tone']): ReportKpi {
  return { key, label, value, kind, hint, tone };
}

/** In-memory search → sort → paginate for a table dataset. */
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
  return {
    columns,
    rows: rows.slice(start, start + opts.pageSize),
    total, page: opts.page, pageSize: opts.pageSize, sort: sortKey,
    order: opts.order ?? 'desc',
  };
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

interface Filters {
  status: string | null; platform: string | null; tier: string | null;
  source: string | null; stage: string | null; campaign: string | null;
  agent: string | null; trigger: string | null;
}

function readFilters(url: URL): Filters {
  const g = (k: string) => url.searchParams.get(k) || null;
  return {
    status: g('status'), platform: g('platform'), tier: g('tier'),
    source: g('source'), stage: g('stage'), campaign: g('campaign'),
    agent: g('agent'), trigger: g('trigger'),
  };
}

/** Equal-length window immediately preceding the active range. */
function previousRange(range: Range): Range {
  const span = range.to.getTime() - range.from.getTime();
  const pTo = new Date(range.from.getTime() - 1);
  const pFrom = new Date(pTo.getTime() - span);
  const days = Math.max(1, Math.round((pTo.getTime() - pFrom.getTime()) / 86400000) + 1);
  return { from: pFrom, to: pTo, preset: 'prev', days, granularity: days <= 31 ? 'day' : 'month' };
}

const compareFlag = (url: URL): boolean => url.searchParams.get('compare') === '1' || url.searchParams.get('compare') === 'true';

function deltaPct(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return Math.round(((cur - prev) / prev) * 100);
}

/** Attach previous-period value + delta to a KPI (no-op when comparison is off). */
function compareKpi(k: ReportKpi, prevValue: number, compare: boolean): ReportKpi {
  if (!compare) return k;
  return { ...k, prevValue, deltaPct: deltaPct(Number(k.value) || 0, prevValue) };
}

function prevMeta(range: Range, compare: boolean): { prev_range?: { from: string; to: string } | null } {
  if (!compare) return {};
  const p = previousRange(range);
  return { prev_range: { from: p.from.toISOString(), to: p.to.toISOString() } };
}

function empty(report: ReportId, range: Range, currency: string, notes: string[], extra?: Partial<ReportResponse>): ReportResponse {
  return {
    report, range: { from: range.from.toISOString(), to: range.to.toISOString(), preset: range.preset, days: range.days, granularity: range.granularity },
    generated_at: new Date().toISOString(),
    kpis: [], charts: [], table: null, notes,
    meta: { currency },
    ...extra,
  };
}

// ── Column presets ────────────────────────────────────────────
const CONTACT_COLUMNS: ReportColumn[] = [
  { key: 'name', label: 'Contact', type: 'text' },
  { key: 'company', label: 'Company', type: 'text' },
  { key: 'source', label: 'Source', type: 'text' },
  { key: 'lead_status', label: 'Status', type: 'badge' },
  { key: 'lead_score', label: 'Score', type: 'score', align: 'right' },
  { key: 'lead_score_tier', label: 'Tier', type: 'badge', align: 'center' },
  { key: 'created_at', label: 'Created', type: 'date', align: 'right' },
];

const DEAL_COLUMNS: ReportColumn[] = [
  { key: 'title', label: 'Deal', type: 'text' },
  { key: 'contact_name', label: 'Contact', type: 'text' },
  { key: 'stage', label: 'Stage', type: 'text' },
  { key: 'status', label: 'Status', type: 'badge' },
  { key: 'value', label: 'Value', type: 'currency', align: 'right' },
  { key: 'created_at', label: 'Created', type: 'date', align: 'right' },
];

// ── GET ───────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const ctx = await getCtx(db, user.account_id, user.role);
    const url = new URL(req.url);
    const report = (url.searchParams.get('report') ?? 'overview') as ReportId;
    if (!REPORT_IDS.includes(report)) {
      return NextResponse.json({ error: `Unknown report "${report}"` }, { status: 400 });
    }

    const range = parseRange(url);
    const paging = readPaging(url);
    const filters = readFilters(url);
    const compare = compareFlag(url);
    const prev = previousRange(range);

    switch (report) {
      case 'overview':     return NextResponse.json(await overviewReport(db, ctx, range, filters, compare, prev));
      case 'contacts':     return NextResponse.json(await contactsReport(db, ctx, range, paging, filters, compare, prev));
      case 'sales':        return NextResponse.json(await salesReport(db, ctx, range, paging, filters, compare, prev));
      case 'campaigns':    return NextResponse.json(await campaignsReport(db, ctx, range, paging, filters, compare, prev));
      case 'broadcasts':   return NextResponse.json(await broadcastsReport(db, ctx, range, paging, filters, compare, prev));
      case 'conversations':return NextResponse.json(await conversationsReport(db, ctx, range, paging, filters, compare, prev));
      case 'automations':  return NextResponse.json(await automationsReport(db, ctx, range, paging, filters, compare, prev));
      case 'conversion':   return NextResponse.json(await conversionReport(db, ctx, range, filters, compare, prev));
      case 'agents':       return NextResponse.json(await agentsReport(db, ctx, range, paging, filters, compare, prev));
    }
  } catch (err) {
    console.error('[reports]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ── Overview ──────────────────────────────────────────────────
async function overviewReport(supabase: SB, ctx: Ctx, range: Range, _filters: Filters, compare: boolean, prev: Range): Promise<ReportResponse> {
  const [contactsRes, dealsRes, convsRes, contentRes, bcastRes] = await Promise.all([
    supabase.from('contacts').select('id, lead_score, lead_score_tier, lead_status, source, created_at').eq('account_id', ctx.accountId).limit(5000),
    supabase.from('deals').select('id, value, status, created_at, updated_at, close_date').eq('account_id', ctx.accountId).limit(5000),
    supabase.from('conversations').select('id, platform, status, created_at').eq('account_id', ctx.accountId).limit(5000),
    supabase.from('crm3_content').select('id, status, platform, leads_generated, revenue_attributed').eq('account_id', ctx.accountId).limit(2000),
    supabase.from('broadcasts').select('id, status, sent_count, delivered_count, read_count, total_recipients').eq('account_id', ctx.accountId).limit(2000),
  ]);

  const contacts = (contactsRes.data ?? []) as Record<string, unknown>[];
  const deals = (dealsRes.data ?? []) as Record<string, unknown>[];
  const convs = (convsRes.data ?? []) as Record<string, unknown>[];
  const content = (contentRes.data ?? []) as Record<string, unknown>[];
  const bcasts = (bcastRes.data ?? []) as Record<string, unknown>[];

  const won = deals.filter(d => d.status === 'won');
  const open = deals.filter(d => d.status === 'open');
  const wonRevenue = won.reduce((s, d) => s + num(d.value), 0);
  const wonInRange = won.filter(d => inRange(d.updated_at ?? d.close_date ?? d.created_at, range));
  const wonRevenueInRange = wonInRange.reduce((s, d) => s + num(d.value), 0);
  const newContacts = contacts.filter(c => inRange(c.created_at, range));
  const openConvs = convs.filter(c => c.status === 'open');
  const attributedRevenue = content.reduce((s, c) => s + num(c.revenue_attributed), 0);
  const totalRecipients = bcasts.reduce((s, b) => s + num(b.total_recipients), 0);
  const totalRead = bcasts.reduce((s, b) => s + num(b.read_count), 0);

  const wonRevenuePrev = won.filter(d => inRange(d.updated_at ?? d.close_date ?? d.created_at, prev)).reduce((s, d) => s + num(d.value), 0);
  const newContactsPrev = contacts.filter(c => inRange(c.created_at, prev)).length;

  const buckets = buildBuckets(range);
  wonInRange.forEach(d => { const i = bucketIndex(range, str(d.updated_at ?? d.close_date ?? d.created_at)); if (i != null) buckets[i].row.revenue = (buckets[i].row.revenue ?? 0) + num(d.value); });
  newContacts.forEach(c => { const i = bucketIndex(range, str(c.created_at)); if (i != null) buckets[i].row.contacts = (buckets[i].row.contacts ?? 0) + 1; });
  convs.filter(c => inRange(c.created_at, range)).forEach(c => { const i = bucketIndex(range, str(c.created_at)); if (i != null) buckets[i].row.conversations = (buckets[i].row.conversations ?? 0) + 1; });

  const trend = buckets.map(b => ({ label: b.label, revenue: Math.round(b.row.revenue ?? 0), contacts: b.row.contacts ?? 0, conversations: b.row.conversations ?? 0 }));

  const bySource: Record<string, number> = {};
  newContacts.forEach(c => { const s = str(c.source) || 'Direct'; bySource[s] = (bySource[s] ?? 0) + 1; });
  const sourceData = Object.entries(bySource).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);

  const byTier: Record<string, number> = { hot: 0, warm: 0, cold: 0 };
  contacts.forEach(c => { const t = str(c.lead_score_tier); if (t in byTier) byTier[t]++; });
  const tierData = [
    { name: 'Hot', value: byTier.hot, color: PALETTE.red },
    { name: 'Warm', value: byTier.warm, color: PALETTE.amber },
    { name: 'Cold', value: byTier.cold, color: PALETTE.slate },
  ];

  const byPlatform: Record<string, number> = {};
  convs.forEach(c => { const p = str(c.platform) || 'unknown'; byPlatform[p] = (byPlatform[p] ?? 0) + 1; });
  const platformData = Object.entries(byPlatform).map(([name, value]) => ({ name, value, color: PLATFORM_COLORS[name] ?? PALETTE.slate }));

  const stageData = LEAD_STAGES.map((s, i) => ({
    name: PIPELINE_LABELS[s],
    count: contacts.filter(c => c.lead_status === s).length,
    color: [PALETTE.blue, PALETTE.cyan, PALETTE.violet, PALETTE.amber, PALETTE.pink, PALETTE.green][i],
  }));

  const notes: string[] = [];
  if (deals.length === 0) notes.push('No deals yet — revenue metrics will populate once deals are created.');
  if (contacts.length === 0) notes.push('No contacts yet — lead metrics will populate once contacts are added.');
  if (content.length === 0) notes.push('Content attribution is empty — attributed revenue shows only real records.');
  if (bcastRes.error) notes.push(`Broadcast metrics could not be loaded: ${bcastRes.error.message}`);

  // Rule-based business insights — every line is derived from the records above.
  const insights: string[] = [];
  if (sourceData.length > 0) {
    insights.push(`${sourceData[0].name} is the top acquisition source with ${sourceData[0].value} new lead${sourceData[0].value === 1 ? '' : 's'} in range.`);
  }
  if (contacts.length > 0) {
    const hotPct = Math.round((byTier.hot / contacts.length) * 100);
    insights.push(`${byTier.hot} of ${contacts.length} contacts are hot leads (${hotPct}% of the base).`);
  }
  const lostDeals = deals.filter(d => d.status === 'lost').length;
  const decided = won.length + lostDeals;
  if (decided > 0) {
    insights.push(`Win rate is ${Math.round((won.length / decided) * 100)}% across ${decided} closed deal${decided === 1 ? '' : 's'}.`);
  }
  if (newContacts.length > newContactsPrev) {
    insights.push(`New leads are up ${newContacts.length - newContactsPrev} vs the previous period — acquisition is accelerating.`);
  } else if (newContacts.length < newContactsPrev) {
    insights.push(`New leads are down ${newContactsPrev - newContacts.length} vs the previous period.`);
  } else if (newContacts.length > 0) {
    insights.push('New lead volume is flat vs the previous period.');
  }
  const openStalled = open.filter(d => Date.now() - new Date(str(d.updated_at ?? d.created_at)).getTime() > 30 * 86400000);
  if (openStalled.length > 0) {
    insights.push(`${openStalled.length} open deal${openStalled.length === 1 ? '' : 's'} have not moved in 30+ days — worth a follow-up.`);
  }
  if (totalRecipients > 0) {
    insights.push(`Broadcasts reached ${totalRecipients} recipients with a ${Math.round((totalRead / totalRecipients) * 100)}% read rate.`);
  }
  if (attributedRevenue > 0) {
    insights.push(`Attributed content revenue totals ${Math.round(attributedRevenue).toLocaleString()} ${ctx.currency}.`);
  }
  if (open.length > 0) {
    insights.push(`Weighted open pipeline (by stage) is ${Math.round(open.reduce((s, d) => s + num(d.value), 0)).toLocaleString()} ${ctx.currency} across ${open.length} deals.`);
  }

  const charts: ReportChart[] = [
    {
      key: 'trend', title: `Revenue, contacts & conversations (${range.granularity === 'day' ? 'daily' : 'monthly'})`, type: 'area', xKey: 'label', height: 220,
      series: [series('revenue', 'Revenue', PALETTE.green), series('contacts', 'New contacts', PALETTE.blue), series('conversations', 'New conversations', PALETTE.violet)],
      data: trend,
    },
    { key: 'sources', title: 'New leads by source', type: 'bar', xKey: 'name', height: Math.max(200, sourceData.length * 34), orientation: 'horizontal', series: [series('value', 'Leads', PALETTE.blue)], data: sourceData },
    { key: 'tiers', title: 'Lead quality', type: 'pie', xKey: 'name', height: 200, series: [series('value', 'Contacts', PALETTE.blue)], data: tierData },
    { key: 'platforms', title: 'Conversations by channel', type: 'pie', xKey: 'name', height: 200, series: [series('value', 'Conversations', PALETTE.violet)], data: platformData },
    { key: 'funnel', title: 'Lead pipeline by stage', type: 'bar', xKey: 'name', height: 200, series: [series('count', 'Contacts', PALETTE.violet)], data: stageData },
  ];

  return {
    report: 'overview',
    range: { from: range.from.toISOString(), to: range.to.toISOString(), preset: range.preset, days: range.days, granularity: range.granularity },
    generated_at: new Date().toISOString(),
    kpis: [
      kpi('contacts', 'Total Contacts', contacts.length, 'number', `${newContacts.length} new in range`, 'blue'),
      compareKpi(kpi('new_contacts', 'New Leads', newContacts.length, 'number', 'created in range', 'cyan'), newContactsPrev, compare),
      kpi('revenue', 'Won Revenue', Math.round(wonRevenue), 'currency', `${won.length} deals won`, 'green'),
      compareKpi(kpi('revenue_range', 'Revenue in Range', Math.round(wonRevenueInRange), 'currency', `${wonInRange.length} deals won`, 'green'), Math.round(wonRevenuePrev), compare),
      kpi('pipeline', 'Open Pipeline', Math.round(open.reduce((s, d) => s + num(d.value), 0)), 'currency', `${open.length} open deals`, 'violet'),
      kpi('open_convs', 'Open Conversations', openConvs.length, 'number', `${convs.length} total`, 'cyan'),
      kpi('attributed', 'Attributed Revenue', Math.round(attributedRevenue), 'currency', `${content.length} content pieces`, 'amber'),
      kpi('broadcast', 'Broadcast Read Rate', totalRecipients > 0 ? Math.round((totalRead / totalRecipients) * 100) : 0, 'percent', `${totalRead}/${totalRecipients} read`, 'slate'),
    ],
    charts,
    table: null,
    notes,
    insights,
    ...prevMeta(range, compare),
    meta: { currency: ctx.currency, account_name: ctx.accountName, row_count: deals.length },
  };
}

// ── Contacts / leads ──────────────────────────────────────────
async function contactsReport(
  supabase: SB, ctx: Ctx, range: Range,
  paging: ReturnType<typeof readPaging>,
  filters: Filters, compare: boolean, prev: Range,
): Promise<ReportResponse> {
  const { data } = await supabase
    .from('contacts')
    .select('id, name, email, phone, company, source, lead_status, lead_score, lead_score_tier, tags, opt_out, created_at')
    .eq('account_id', ctx.accountId)
    .limit(5000);
  const all = (data ?? []) as Record<string, unknown>[];

  const matched = all.filter(c =>
    (!filters.status || str(c.lead_status) === filters.status) &&
    (!filters.tier || str(c.lead_score_tier) === filters.tier) &&
    (!filters.source || (str(c.source) || 'Direct') === filters.source));

  const inR = matched.filter(c => inRange(c.created_at, range));
  const prevInR = matched.filter(c => inRange(c.created_at, prev));
  const hot = inR.filter(c => c.lead_score_tier === 'hot').length;
  const hotPrev = prevInR.filter(c => c.lead_score_tier === 'hot').length;
  const qualified = inR.filter(c => ['qualified', 'proposal', 'negotiation', 'won'].includes(str(c.lead_status))).length;
  const qualifiedPrev = prevInR.filter(c => ['qualified', 'proposal', 'negotiation', 'won'].includes(str(c.lead_status))).length;
  const optedOut = inR.filter(c => c.opt_out === true).length;
  const optedOutPrev = prevInR.filter(c => c.opt_out === true).length;
  const avgScore = inR.length ? Math.round(inR.reduce((s, c) => s + num(c.lead_score), 0) / inR.length) : 0;
  const avgScorePrev = prevInR.length ? Math.round(prevInR.reduce((s, c) => s + num(c.lead_score), 0) / prevInR.length) : 0;

  const buckets = buildBuckets(range);
  inR.forEach(c => { const i = bucketIndex(range, str(c.created_at)); if (i != null) buckets[i].row.count = (buckets[i].row.count ?? 0) + 1; });
  const trend = buckets.map(b => ({ label: b.label, count: b.row.count ?? 0 }));

  const bySource: Record<string, number> = {};
  inR.forEach(c => { const s = str(c.source) || 'Direct'; bySource[s] = (bySource[s] ?? 0) + 1; });
  const sourceData = Object.entries(bySource).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  const sourceOptions = [...new Set(all.map(c => str(c.source) || 'Direct'))].sort().map(s => ({ value: s, label: s }));

  const byTier: Record<string, number> = { hot: 0, warm: 0, cold: 0 };
  inR.forEach(c => { const t = str(c.lead_score_tier); if (t in byTier) byTier[t]++; });
  const tierData = [
    { name: 'Hot', value: byTier.hot, color: PALETTE.red },
    { name: 'Warm', value: byTier.warm, color: PALETTE.amber },
    { name: 'Cold', value: byTier.cold, color: PALETTE.slate },
  ];

  const tableAll = inR.map(c => ({ ...c, tags_count: Array.isArray(c.tags) ? (c.tags as unknown[]).length : 0 }));

  const table = buildTable(tableAll, CONTACT_COLUMNS, {
    ...paging, searchKeys: ['name', 'email', 'phone', 'company', 'source'],
  });

  const notes: string[] = [];
  if (all.length === 0) notes.push('No contacts in this account yet.');
  else if (matched.length < all.length) notes.push('Filters are applied to the KPIs, charts and table on this report.');

  return {
    report: 'contacts',
    range: { from: range.from.toISOString(), to: range.to.toISOString(), preset: range.preset, days: range.days, granularity: range.granularity },
    generated_at: new Date().toISOString(),
    kpis: [
      kpi('total', 'Contacts (in range)', inR.length, 'number', `of ${all.length} total`, 'blue'),
      compareKpi(kpi('hot', 'Hot Leads', hot, 'number', 'score tier: hot', 'red'), hotPrev, compare),
      compareKpi(kpi('qualified', 'Qualified+', qualified, 'number', 'qualified → won', 'green'), qualifiedPrev, compare),
      compareKpi(kpi('avg_score', 'Avg Lead Score', avgScore, 'number', '0–100', 'violet'), avgScorePrev, compare),
      compareKpi(kpi('opt_out', 'Opted Out', optedOut, 'number', 'do-not-contact', 'slate'), optedOutPrev, compare),
    ],
    charts: [
      { key: 'trend', title: `New contacts (${range.granularity === 'day' ? 'daily' : 'monthly'})`, type: 'area', xKey: 'label', height: 200, series: [series('count', 'New contacts', PALETTE.blue)], data: trend },
      { key: 'tiers', title: 'Lead quality', type: 'pie', xKey: 'name', height: 200, series: [series('value', 'Contacts', PALETTE.blue)], data: tierData },
      { key: 'sources', title: 'Leads by source', type: 'bar', xKey: 'name', height: 220, series: [series('value', 'Leads', PALETTE.violet)], data: sourceData },
    ],
    table,
    notes,
    drilldown: '/contacts',
    ...prevMeta(range, compare),
    filter_options: { source: sourceOptions },
    meta: { currency: ctx.currency, account_name: ctx.accountName, row_count: tableAll.length },
  };
}

// ── Sales & revenue ───────────────────────────────────────────
async function salesReport(
  supabase: SB, ctx: Ctx, range: Range,
  paging: ReturnType<typeof readPaging>,
  filters: Filters, compare: boolean, prev: Range,
): Promise<ReportResponse> {
  const [dealsRes, stagesRes] = await Promise.all([
    supabase.from('deals').select('id, title, value, currency, status, stage_id, contact_id, close_date, created_at, updated_at, contacts(name), pipeline_stages(name, color)').eq('account_id', ctx.accountId).limit(5000),
    supabase.from('pipeline_stages').select('id, name, color, position').eq('account_id', ctx.accountId).order('position').limit(200),
  ]);
  const allDeals = (dealsRes.data ?? []) as Record<string, unknown>[];
  const stages = (stagesRes.data ?? []) as Record<string, unknown>[];

  const deals = allDeals.filter(d =>
    (!filters.status || str(d.status) === filters.status) &&
    (!filters.stage || str(d.stage_id) === filters.stage));

  const open = deals.filter(d => d.status === 'open');
  const won = deals.filter(d => d.status === 'won');
  const lost = deals.filter(d => d.status === 'lost');
  const wonInRange = won.filter(d => inRange(d.updated_at ?? d.close_date ?? d.created_at, range));
  const wonInPrev = won.filter(d => inRange(d.updated_at ?? d.close_date ?? d.created_at, prev));
  const lostInRange = lost.filter(d => inRange(d.updated_at ?? d.close_date ?? d.created_at, range));
  const wonRevenue = wonInRange.reduce((s, d) => s + num(d.value), 0);
  const winRate = won.length + lost.length > 0 ? Math.round((won.length / (won.length + lost.length)) * 100) : 0;
  const avgDeal = won.length ? Math.round(won.reduce((s, d) => s + num(d.value), 0) / won.length) : 0;

  const buckets = buildBuckets(range);
  wonInRange.forEach(d => { const i = bucketIndex(range, str(d.updated_at ?? d.close_date ?? d.created_at)); if (i != null) buckets[i].row.won = (buckets[i].row.won ?? 0) + num(d.value); });
  const createdInRange = deals.filter(d => inRange(d.created_at, range));
  createdInRange.forEach(d => { const i = bucketIndex(range, str(d.created_at)); if (i != null) buckets[i].row.created = (buckets[i].row.created ?? 0) + 1; });
  const trend = buckets.map(b => ({ label: b.label, won: Math.round(b.row.won ?? 0), created: b.row.created ?? 0 }));

  const byStatus = [
    { name: 'Open', value: open.reduce((s, d) => s + num(d.value), 0), count: open.length, color: PALETTE.blue },
    { name: 'Won', value: won.reduce((s, d) => s + num(d.value), 0), count: won.length, color: PALETTE.green },
    { name: 'Lost', value: lost.reduce((s, d) => s + num(d.value), 0), count: lost.length, color: PALETTE.red },
  ];

  const stageData = stages.map((st, i) => {
    const sd = open.filter(d => d.stage_id === st.id);
    return { name: str(st.name), value: sd.reduce((s, d) => s + num(d.value), 0), count: sd.length, color: str(st.color) || PALETTE.blue, _i: i };
  });

  // Deal counts by stage and status — kept separate from currency values.
  const stageStatusData = stages.map(st => {
    const inStage = deals.filter(d => d.stage_id === st.id);
    return {
      name: str(st.name),
      open: inStage.filter(d => d.status === 'open').length,
      won: inStage.filter(d => d.status === 'won').length,
      lost: inStage.filter(d => d.status === 'lost').length,
    };
  });

  const tableDeals = deals.filter(d => inRange(d.created_at, range) || inRange(d.updated_at, range));
  const stageOptions = stages.map(st => ({ value: str(st.id), label: str(st.name) }));
  const tableAll = tableDeals.map(d => ({
    id: d.id,
    title: str(d.title),
    contact_name: str((d.contacts as Record<string, unknown> | null)?.name) || '—',
    stage: str((d.pipeline_stages as Record<string, unknown> | null)?.name) || '—',
    status: str(d.status),
    value: num(d.value),
    currency: str(d.currency) || ctx.currency,
    close_date: d.close_date ?? null,
    created_at: d.created_at,
    updated_at: d.updated_at,
  }));

  const table = buildTable(tableAll, DEAL_COLUMNS, { ...paging, searchKeys: ['title', 'contact_name', 'stage', 'status'] });

  const notes: string[] = [];
  if (allDeals.length === 0) notes.push('No deals yet — sales metrics will populate once deals are created.');
  if (stages.length === 0) notes.push('No pipeline stages configured — define stages to see pipeline value by stage.');
  else if (deals.length < allDeals.length) notes.push('Filters are applied to the KPIs, charts and table on this report.');

  return {
    report: 'sales',
    range: { from: range.from.toISOString(), to: range.to.toISOString(), preset: range.preset, days: range.days, granularity: range.granularity },
    generated_at: new Date().toISOString(),
    kpis: [
      compareKpi(kpi('revenue', 'Won Revenue', Math.round(wonRevenue), 'currency', `${wonInRange.length} deals won in range`, 'green'), Math.round(wonInPrev.reduce((s, d) => s + num(d.value), 0)), compare),
      compareKpi(kpi('won_count', 'Deals Won', wonInRange.length, 'number', 'in range', 'cyan'), wonInPrev.length, compare),
      kpi('pipeline', 'Open Pipeline', Math.round(open.reduce((s, d) => s + num(d.value), 0)), 'currency', `${open.length} open deals`, 'blue'),
      kpi('win_rate', 'Win Rate', winRate, 'percent', `${won.length} won / ${lost.length} lost`, 'violet'),
      kpi('avg_deal', 'Avg Deal Value', avgDeal, 'currency', 'across won deals', 'amber'),
      compareKpi(kpi('lost', 'Lost Value', Math.round(lostInRange.reduce((s, d) => s + num(d.value), 0)), 'currency', `${lostInRange.length} lost deals`, 'red'), Math.round(lost.filter(d => inRange(d.updated_at ?? d.close_date ?? d.created_at, prev)).reduce((s, d) => s + num(d.value), 0)), compare),
    ],
    charts: [
      { key: 'trend', title: `Won revenue & new deals (${range.granularity === 'day' ? 'daily' : 'monthly'})`, type: 'area', xKey: 'label', height: 220, series: [series('won', 'Won revenue', PALETTE.green), series('created', 'New deals', PALETTE.blue)], data: trend },
      { key: 'status', title: 'Deal value by status', type: 'bar', xKey: 'name', height: 200, series: [series('value', 'Value', PALETTE.blue)], data: byStatus },
      { key: 'stage_status', title: 'Deals by stage & status (count)', type: 'stackedBar', xKey: 'name', height: 220, series: [series('open', 'Open', PALETTE.blue), series('won', 'Won', PALETTE.green), series('lost', 'Lost', PALETTE.red)], data: stageStatusData },
      { key: 'stages', title: 'Open pipeline by stage (value)', type: 'bar', xKey: 'name', height: 220, series: [series('value', 'Value', PALETTE.violet)], data: stageData },
    ],
    table,
    notes,
    drilldown: '/pipeline-crm',
    ...prevMeta(range, compare),
    filter_options: { stage: stageOptions },
    meta: { currency: ctx.currency, account_name: ctx.accountName, row_count: tableAll.length },
  };
}

// ── Campaigns & content ───────────────────────────────────────
async function campaignsReport(
  supabase: SB, ctx: Ctx, range: Range,
  paging: ReturnType<typeof readPaging>,
  filters: Filters, compare: boolean, prev: Range,
): Promise<ReportResponse> {
  const [campRes, contentRes] = await Promise.all([
    supabase.from('campaigns').select('id, name, status, platform, created_at').eq('account_id', ctx.accountId).limit(1000),
    supabase.from('crm3_content').select('id, title, campaign_id, platform, status, published_at, leads_generated, qualified_leads, deals_attributed, revenue_attributed, reach, impressions, engagement, clicks, created_at').eq('account_id', ctx.accountId).limit(2000),
  ]);
  const allCampaigns = (campRes.data ?? []) as Record<string, unknown>[];
  const allContent = (contentRes.data ?? []) as Record<string, unknown>[];

  const content = allContent.filter(c =>
    (!filters.platform || str(c.platform) === filters.platform) &&
    (!filters.status || str(c.status) === filters.status) &&
    (!filters.campaign || str(c.campaign_id) === filters.campaign));
  const campaigns = filters.campaign ? allCampaigns.filter(c => str(c.id) === filters.campaign) : allCampaigns;
  const campaignOptions = allCampaigns.map(c => ({ value: str(c.id), label: str(c.name) }));

  const contentInRange = content.filter(c => inRange(c.created_at, range));
  const contentPrev = content.filter(c => inRange(c.created_at, prev));
  const totalLeads = contentInRange.reduce((s, c) => s + num(c.leads_generated), 0);
  const totalLeadsPrev = contentPrev.reduce((s, c) => s + num(c.leads_generated), 0);
  const totalRevenue = contentInRange.reduce((s, c) => s + num(c.revenue_attributed), 0);
  const totalRevenuePrev = contentPrev.reduce((s, c) => s + num(c.revenue_attributed), 0);
  const published = contentInRange.filter(c => c.status === 'published').length;
  const publishedPrev = contentPrev.filter(c => c.status === 'published').length;

  const byStatus: Record<string, number> = {};
  content.forEach(c => { const s = str(c.status) || 'draft'; byStatus[s] = (byStatus[s] ?? 0) + 1; });
  const statusData = Object.entries(byStatus).map(([name, value]) => ({ name, value }));

  const byPlatform: Record<string, number> = {};
  content.forEach(c => { const p = str(c.platform) || 'unknown'; byPlatform[p] = (byPlatform[p] ?? 0) + 1; });
  const platformData = Object.entries(byPlatform).map(([name, value]) => ({ name, value, color: PLATFORM_COLORS[name] ?? PALETTE.slate }));

  const buckets = buildBuckets(range);
  contentInRange.forEach(c => { const i = bucketIndex(range, str(c.created_at)); if (i != null) buckets[i].row.revenue = (buckets[i].row.revenue ?? 0) + num(c.revenue_attributed); });
  const trend = buckets.map(b => ({ label: b.label, revenue: Math.round(b.row.revenue ?? 0) }));

  const tableAll = campaigns.filter(c => inRange(c.created_at, range) || contentInRange.some(k => k.campaign_id === c.id)).map(c => {
    const kids = content.filter(k => k.campaign_id === c.id);
    return {
      id: c.id,
      name: str(c.name),
      status: str(c.status),
      platform: str(c.platform) || '—',
      content_count: kids.length,
      leads: kids.reduce((s, k) => s + num(k.leads_generated), 0),
      revenue: kids.reduce((s, k) => s + num(k.revenue_attributed), 0),
      created_at: c.created_at,
    };
  });

  const table = buildTable(tableAll, [
    { key: 'name', label: 'Campaign', type: 'text' },
    { key: 'status', label: 'Status', type: 'badge' },
    { key: 'platform', label: 'Platform', type: 'text' },
    { key: 'content_count', label: 'Content', type: 'number', align: 'right' },
    { key: 'leads', label: 'Leads', type: 'number', align: 'right' },
    { key: 'revenue', label: 'Revenue', type: 'currency', align: 'right' },
    { key: 'created_at', label: 'Created', type: 'date', align: 'right' },
  ], { ...paging, searchKeys: ['name', 'status', 'platform'] });

  const notes: string[] = [];
  if (allCampaigns.length === 0) notes.push('No campaigns yet.');
  if (allContent.length === 0) notes.push('No content yet — campaign performance uses Content Studio metrics.');
  if (totalRevenue === 0 && content.length > 0) notes.push('No attributed revenue recorded on content yet.');
  if (content.length < allContent.length) notes.push('Filters are applied to the KPIs, charts and table on this report.');

  return {
    report: 'campaigns',
    range: { from: range.from.toISOString(), to: range.to.toISOString(), preset: range.preset, days: range.days, granularity: range.granularity },
    generated_at: new Date().toISOString(),
    kpis: [
      kpi('campaigns', 'Campaigns', campaigns.length, 'number', `${campaigns.filter(c => c.status === 'active').length} active`, 'blue'),
      compareKpi(kpi('content', 'Content Pieces', contentInRange.length, 'number', `of ${content.length} total`, 'violet'), contentPrev.length, compare),
      compareKpi(kpi('published', 'Published', published, 'number', 'in range', 'green'), publishedPrev, compare),
      compareKpi(kpi('leads', 'Leads Generated', totalLeads, 'number', 'from content in range', 'cyan'), totalLeadsPrev, compare),
      compareKpi(kpi('revenue', 'Attributed Revenue', Math.round(totalRevenue), 'currency', 'from content in range', 'amber'), Math.round(totalRevenuePrev), compare),
    ],
    charts: [
      { key: 'trend', title: `Attributed revenue (${range.granularity === 'day' ? 'daily' : 'monthly'})`, type: 'area', xKey: 'label', height: 200, series: [series('revenue', 'Revenue', PALETTE.green)], data: trend },
      { key: 'status', title: 'Content by status', type: 'bar', xKey: 'name', height: 200, series: [series('value', 'Pieces', PALETTE.violet)], data: statusData },
      { key: 'platform', title: 'Content by platform', type: 'pie', xKey: 'name', height: 200, series: [series('value', 'Pieces', PALETTE.blue)], data: platformData },
    ],
    table,
    notes,
    drilldown: '/campaigns',
    ...prevMeta(range, compare),
    filter_options: { campaign: campaignOptions },
    meta: { currency: ctx.currency, account_name: ctx.accountName, row_count: tableAll.length },
  };
}

// ── Broadcasts ────────────────────────────────────────────────
async function broadcastsReport(
  supabase: SB, ctx: Ctx, range: Range,
  paging: ReturnType<typeof readPaging>,
  filters: Filters, compare: boolean, prev: Range,
): Promise<ReportResponse> {
  const { data, error } = await supabase
    .from('broadcasts')
    .select('id, name, platform, status, total_recipients, sent_count, delivered_count, read_count, failed_count, scheduled_at, sent_at, created_at')
    .eq('account_id', ctx.accountId)
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) {
    return empty('broadcasts', range, ctx.currency,
      [`Broadcasts data could not be loaded: ${error.message}`],
      { meta: { currency: ctx.currency, account_name: ctx.accountName } });
  }
  const all = (data ?? []) as Record<string, unknown>[];

  const matched = all.filter(b =>
    (!filters.status || str(b.status) === filters.status) &&
    (!filters.platform || str(b.platform) === filters.platform));
  const inR = matched.filter(b => inRange(b.created_at, range));
  const prevInR = matched.filter(b => inRange(b.created_at, prev));
  const sum = (rows: Record<string, unknown>[], k: string) => rows.reduce((s, b) => s + num(b[k]), 0);
  const recipients = sum(inR, 'total_recipients');
  const sent = sum(inR, 'sent_count');
  const delivered = sum(inR, 'delivered_count');
  const read = sum(inR, 'read_count');
  const failed = sum(inR, 'failed_count');

  const byStatus: Record<string, number> = {};
  inR.forEach(b => { const s = str(b.status) || 'draft'; byStatus[s] = (byStatus[s] ?? 0) + 1; });
  const statusData = Object.entries(byStatus).map(([name, value]) => ({ name, value }));

  const funnelData = [
    { name: 'Recipients', value: recipients, color: PALETTE.blue },
    { name: 'Sent', value: sent, color: PALETTE.cyan },
    { name: 'Delivered', value: delivered, color: PALETTE.violet },
    { name: 'Read', value: read, color: PALETTE.green },
    { name: 'Failed', value: failed, color: PALETTE.red },
  ];

  const tableAll = inR.map(b => ({
    id: b.id, name: str(b.name), platform: str(b.platform), status: str(b.status),
    total_recipients: num(b.total_recipients), sent_count: num(b.sent_count),
    delivered_count: num(b.delivered_count), read_count: num(b.read_count), failed_count: num(b.failed_count),
    sent_at: b.sent_at ?? b.scheduled_at ?? null, created_at: b.created_at,
  }));

  const table = buildTable(tableAll, [
    { key: 'name', label: 'Broadcast', type: 'text' },
    { key: 'platform', label: 'Platform', type: 'text' },
    { key: 'status', label: 'Status', type: 'badge' },
    { key: 'total_recipients', label: 'Recipients', type: 'number', align: 'right' },
    { key: 'sent_count', label: 'Sent', type: 'number', align: 'right' },
    { key: 'delivered_count', label: 'Delivered', type: 'number', align: 'right' },
    { key: 'read_count', label: 'Read', type: 'number', align: 'right' },
    { key: 'failed_count', label: 'Failed', type: 'number', align: 'right' },
    { key: 'created_at', label: 'Created', type: 'date', align: 'right' },
  ], { ...paging, searchKeys: ['name', 'platform', 'status'] });

  const notes: string[] = [];
  if (all.length === 0) notes.push('No broadcasts yet.');
  if (recipients === 0 && all.length > 0) notes.push('Broadcasts have no recipient counts recorded yet.');
  if (matched.length < all.length) notes.push('Filters are applied to the KPIs, charts and table on this report.');

  const prevSent = sum(prevInR, 'sent_count');
  const prevDelivered = sum(prevInR, 'delivered_count');
  const prevRead = sum(prevInR, 'read_count');
  const deliveryRate = sent > 0 ? Math.round((delivered / sent) * 100) : 0;
  const deliveryRatePrev = prevSent > 0 ? Math.round((prevDelivered / prevSent) * 100) : 0;
  const readRate = delivered > 0 ? Math.round((read / delivered) * 100) : (sent > 0 ? Math.round((read / sent) * 100) : 0);
  const readRatePrev = prevDelivered > 0 ? Math.round((prevRead / prevDelivered) * 100) : (prevSent > 0 ? Math.round((prevRead / prevSent) * 100) : 0);

  return {
    report: 'broadcasts',
    range: { from: range.from.toISOString(), to: range.to.toISOString(), preset: range.preset, days: range.days, granularity: range.granularity },
    generated_at: new Date().toISOString(),
    kpis: [
      compareKpi(kpi('broadcasts', 'Broadcasts', inR.length, 'number', `of ${all.length} total`, 'blue'), prevInR.length, compare),
      compareKpi(kpi('recipients', 'Recipients', recipients, 'number', 'in range', 'violet'), sum(prevInR, 'total_recipients'), compare),
      compareKpi(kpi('delivery', 'Delivery Rate', deliveryRate, 'percent', `${delivered} delivered`, 'cyan'), deliveryRatePrev, compare),
      compareKpi(kpi('read', 'Read Rate', readRate, 'percent', `${read} read`, 'green'), readRatePrev, compare),
      compareKpi(kpi('failed', 'Failed', failed, 'number', 'in range', 'red'), sum(prevInR, 'failed_count'), compare),
    ],
    charts: [
      { key: 'status', title: 'Broadcasts by status', type: 'pie', xKey: 'name', height: 200, series: [series('value', 'Broadcasts', PALETTE.blue)], data: statusData },
      { key: 'funnel', title: 'Delivery funnel', type: 'bar', xKey: 'name', height: 220, series: [series('value', 'Count', PALETTE.cyan)], data: funnelData },
    ],
    table,
    notes,
    drilldown: '/broadcasts',
    ...prevMeta(range, compare),
    meta: { currency: ctx.currency, account_name: ctx.accountName, row_count: tableAll.length },
  };
}

// ── Conversations (WhatsApp & social) ─────────────────────────
async function conversationsReport(
  supabase: SB, ctx: Ctx, range: Range,
  paging: ReturnType<typeof readPaging>,
  filters: Filters, compare: boolean, prev: Range,
): Promise<ReportResponse> {
  const [convRes, msgRes] = await Promise.all([
    supabase.from('conversations').select('id, contact_id, platform, status, priority, unread_count, last_message_text, last_message_at, ai_intent, ai_sentiment, ai_lead_score, created_at, contacts(name)').eq('account_id', ctx.accountId).limit(5000),
    supabase.from('messages').select('id, conversation_id, sender_type, status, created_at').eq('account_id', ctx.accountId).gte('created_at', prev.from.toISOString()).lte('created_at', range.to.toISOString()).limit(5000),
  ]);
  const convs = (convRes.data ?? []) as Record<string, unknown>[];
  const msgList = (msgRes.data ?? []) as Record<string, unknown>[];

  const matched = convs.filter(c =>
    (!filters.platform || str(c.platform) === filters.platform) &&
    (!filters.status || str(c.status) === filters.status));
  const inR = matched.filter(c => inRange(c.created_at, range));
  const prevInR = matched.filter(c => inRange(c.created_at, prev));
  const open = inR.filter(c => c.status === 'open').length;
  const openPrev = prevInR.filter(c => c.status === 'open').length;
  const resolved = inR.filter(c => c.status === 'resolved').length;
  const resolvedPrev = prevInR.filter(c => c.status === 'resolved').length;

  const msgs = msgList.filter(m => inRange(m.created_at, range));
  const msgsPrev = msgList.filter(m => inRange(m.created_at, prev));

  const byPlatform: Record<string, number> = {};
  inR.forEach(c => { const p = str(c.platform) || 'unknown'; byPlatform[p] = (byPlatform[p] ?? 0) + 1; });
  const platformData = Object.entries(byPlatform).map(([name, value]) => ({ name, value, color: PLATFORM_COLORS[name] ?? PALETTE.slate }));

  const byStatus: Record<string, number> = {};
  inR.forEach(c => { const s = str(c.status) || 'open'; byStatus[s] = (byStatus[s] ?? 0) + 1; });
  const statusData = Object.entries(byStatus).map(([name, value]) => ({ name, value }));

  const byIntent: Record<string, number> = {};
  inR.forEach(c => { const i = str(c.ai_intent); if (i) byIntent[i] = (byIntent[i] ?? 0) + 1; });
  const intentData = Object.entries(byIntent).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);

  const buckets = buildBuckets(range);
  msgs.forEach(m => {
    const i = bucketIndex(range, str(m.created_at)); if (i == null) return;
    if (str(m.sender_type) === 'contact') buckets[i].row.inbound = (buckets[i].row.inbound ?? 0) + 1;
    else buckets[i].row.outbound = (buckets[i].row.outbound ?? 0) + 1;
  });
  const messageTrend = buckets.map(b => ({ label: b.label, inbound: b.row.inbound ?? 0, outbound: b.row.outbound ?? 0 }));
  const inbound = msgs.filter(m => str(m.sender_type) === 'contact').length;
  const inboundPrev = msgsPrev.filter(m => str(m.sender_type) === 'contact').length;
  const outbound = msgs.length - inbound;
  const failedMsgs = msgs.filter(m => str(m.status) === 'failed').length;

  // Response time: average gap between a conversation's first inbound message and the next outbound reply.
  const convIds = new Set(inR.map(c => str(c.id)));
  const sortedMsgs = [...msgs]
    .filter(m => convIds.has(str(m.conversation_id)))
    .sort((a, b) => new Date(str(a.created_at)).getTime() - new Date(str(b.created_at)).getTime());
  const firstIn = new Map<string, number>();
  const firstReply = new Map<string, number>();
  for (const m of sortedMsgs) {
    const cid = str(m.conversation_id);
    const t = new Date(str(m.created_at)).getTime();
    if (!cid || isNaN(t)) continue;
    if (str(m.sender_type) === 'contact') { if (!firstIn.has(cid)) firstIn.set(cid, t); }
    else if (firstIn.has(cid) && !firstReply.has(cid)) firstReply.set(cid, t);
  }
  const responders = [...firstIn.keys()].filter(cid => firstReply.has(cid));
  const avgResponseMs = responders.length
    ? Math.round(responders.reduce((s, cid) => s + (firstReply.get(cid)! - firstIn.get(cid)!), 0) / responders.length)
    : 0;

  const tableAll = inR.map(c => ({
    id: c.id,
    contact_name: str((c.contacts as Record<string, unknown> | null)?.name) || 'Unknown',
    platform: str(c.platform),
    status: str(c.status),
    priority: str(c.priority) || 'normal',
    ai_intent: str(c.ai_intent) || '—',
    ai_sentiment: str(c.ai_sentiment) || '—',
    ai_lead_score: num(c.ai_lead_score),
    unread_count: num(c.unread_count),
    last_message_at: c.last_message_at ?? c.created_at,
    created_at: c.created_at,
  }));

  const table = buildTable(tableAll, [
    { key: 'contact_name', label: 'Contact', type: 'text' },
    { key: 'platform', label: 'Channel', type: 'badge' },
    { key: 'status', label: 'Status', type: 'badge' },
    { key: 'priority', label: 'Priority', type: 'badge' },
    { key: 'ai_intent', label: 'Intent', type: 'text' },
    { key: 'ai_sentiment', label: 'Sentiment', type: 'text' },
    { key: 'ai_lead_score', label: 'AI Score', type: 'score', align: 'right' },
    { key: 'unread_count', label: 'Unread', type: 'number', align: 'right' },
    { key: 'last_message_at', label: 'Last Message', type: 'date', align: 'right' },
  ], { ...paging, searchKeys: ['contact_name', 'platform', 'status', 'ai_intent', 'ai_sentiment'] });

  const notes: string[] = [];
  if (convs.length === 0) notes.push('No conversations yet.');
  if (msgs.length === 0) notes.push('No messages in the selected date range.');
  if (responders.length === 0 && inbound > 0) notes.push('Response time needs at least one inbound message followed by an outbound reply in range.');
  if (msgList.length >= 5000) notes.push('Message metrics are capped at the 5,000 most recent messages in range.');
  if (matched.length < convs.length) notes.push('Filters are applied to the KPIs, charts and table on this report.');

  return {
    report: 'conversations',
    range: { from: range.from.toISOString(), to: range.to.toISOString(), preset: range.preset, days: range.days, granularity: range.granularity },
    generated_at: new Date().toISOString(),
    kpis: [
      compareKpi(kpi('total', 'Conversations', inR.length, 'number', `of ${convs.length} total`, 'blue'), prevInR.length, compare),
      compareKpi(kpi('open', 'Open', open, 'number', 'awaiting reply', 'amber'), openPrev, compare),
      compareKpi(kpi('resolved', 'Resolved', resolved, 'number', 'closed in range', 'green'), resolvedPrev, compare),
      compareKpi(kpi('inbound', 'Inbound Messages', inbound, 'number', `${outbound} outbound`, 'violet'), inboundPrev, compare),
      kpi('avg_response', 'Avg First Response', avgResponseMs, 'duration', responders.length ? `${responders.length} conversations` : 'no replies yet', 'cyan'),
      compareKpi(kpi('failed', 'Failed Messages', failedMsgs, 'number', 'delivery failures', failedMsgs > 0 ? 'red' : 'slate'), msgsPrev.filter(m => str(m.status) === 'failed').length, compare),
    ],
    charts: [
      { key: 'messages', title: `Messages (${range.granularity === 'day' ? 'daily' : 'monthly'})`, type: 'area', xKey: 'label', height: 220, series: [series('inbound', 'Inbound', PALETTE.blue), series('outbound', 'Outbound', PALETTE.violet)], data: messageTrend },
      { key: 'platform', title: 'Conversations by channel', type: 'pie', xKey: 'name', height: 200, series: [series('value', 'Conversations', PALETTE.violet)], data: platformData },
      { key: 'status', title: 'Conversations by status', type: 'bar', xKey: 'name', height: 200, series: [series('value', 'Conversations', PALETTE.blue)], data: statusData },
      { key: 'intent', title: 'AI-detected intent', type: 'bar', xKey: 'name', height: 200, series: [series('value', 'Conversations', PALETTE.cyan)], data: intentData },
    ],
    table,
    notes,
    drilldown: '/inbox',
    ...prevMeta(range, compare),
    meta: { currency: ctx.currency, account_name: ctx.accountName, row_count: tableAll.length },
  };
}

// ── Lead conversion & pipeline ────────────────────────────────
async function conversionReport(supabase: SB, ctx: Ctx, range: Range, filters: Filters, compare: boolean, prev: Range): Promise<ReportResponse> {
  const [contactsRes, stagesRes, dealsRes] = await Promise.all([
    supabase.from('contacts').select('id, lead_status, lead_score_tier, source, created_at').eq('account_id', ctx.accountId).limit(5000),
    supabase.from('pipeline_stages').select('id, name, color, position').eq('account_id', ctx.accountId).order('position').limit(200),
    supabase.from('deals').select('id, stage_id, value, status, created_at').eq('account_id', ctx.accountId).limit(5000),
  ]);
  const allContacts = (contactsRes.data ?? []) as Record<string, unknown>[];
  const stages = (stagesRes.data ?? []) as Record<string, unknown>[];
  const dealsInR = ((dealsRes.data ?? []) as Record<string, unknown>[]).filter(d => inRange(d.created_at, range));

  const contacts = allContacts.filter(c => !filters.source || (str(c.source) || 'Direct') === filters.source);
  const sourceOptions = [...new Set(allContacts.map(c => str(c.source) || 'Direct'))].sort().map(s => ({ value: s, label: s }));
  const inR = contacts.filter(c => inRange(c.created_at, range));
  const prevInR = contacts.filter(c => inRange(c.created_at, prev));
  const total = inR.length;
  const funnel = LEAD_STAGES.map((s, i) => {
    const count = inR.filter(c => c.lead_status === s).length;
    return { name: PIPELINE_LABELS[s], value: count, color: [PALETTE.blue, PALETTE.cyan, PALETTE.violet, PALETTE.amber, PALETTE.pink, PALETTE.green][i] };
  });
  const won = inR.filter(c => c.lead_status === 'won').length;
  const wonPrev = prevInR.filter(c => c.lead_status === 'won').length;
  const lost = inR.filter(c => c.lead_status === 'lost').length;
  const lostPrev = prevInR.filter(c => c.lead_status === 'lost').length;
  const conversionRate = total > 0 ? Math.round((won / total) * 100) : 0;
  const conversionRatePrev = prevInR.length > 0 ? Math.round((wonPrev / prevInR.length) * 100) : 0;
  const qualifiedCount = inR.filter(c => ['qualified', 'proposal', 'negotiation', 'won'].includes(str(c.lead_status))).length;
  const qualifiedPrev = prevInR.filter(c => ['qualified', 'proposal', 'negotiation', 'won'].includes(str(c.lead_status))).length;

  const stageData = stages.map(st => ({
    name: str(st.name),
    value: dealsInR.filter(d => d.stage_id === st.id).length,
    color: str(st.color) || PALETTE.blue,
  }));

  const statusRows = [...LEAD_STAGES, 'lost' as const].map(s => ({
    stage: PIPELINE_LABELS[s],
    status: s,
    count: inR.filter(c => c.lead_status === s).length,
    share: total > 0 ? Math.round((inR.filter(c => c.lead_status === s).length / total) * 100) : 0,
  }));

  const table = {
    columns: [
      { key: 'stage', label: 'Stage', type: 'text' } as ReportColumn,
      { key: 'count', label: 'Contacts', type: 'number', align: 'right' } as ReportColumn,
      { key: 'share', label: '% of leads', type: 'percent', align: 'right' } as ReportColumn,
    ],
    rows: statusRows as unknown as Record<string, unknown>[],
    total: statusRows.length, page: 1, pageSize: statusRows.length, sort: null, order: 'desc' as const,
  };

  const notes: string[] = [];
  if (total === 0) notes.push('No leads created in the selected range.');
  if (stages.length === 0) notes.push('No pipeline stages configured for a deal-stage breakdown.');
  if (contacts.length < allContacts.length) notes.push('Filters are applied to the KPIs, charts and table on this report.');

  return {
    report: 'conversion',
    range: { from: range.from.toISOString(), to: range.to.toISOString(), preset: range.preset, days: range.days, granularity: range.granularity },
    generated_at: new Date().toISOString(),
    kpis: [
      compareKpi(kpi('total', 'Leads Created', total, 'number', 'in range', 'blue'), prevInR.length, compare),
      compareKpi(kpi('qualified', 'Qualified+', qualifiedCount, 'number', 'qualified → won', 'violet'), qualifiedPrev, compare),
      compareKpi(kpi('won', 'Won', won, 'number', 'converted', 'green'), wonPrev, compare),
      compareKpi(kpi('conversion', 'Conversion Rate', conversionRate, 'percent', 'won / leads', 'cyan'), conversionRatePrev, compare),
      compareKpi(kpi('lost', 'Lost', lost, 'number', 'disqualified', 'red'), lostPrev, compare),
    ],
    charts: [
      { key: 'funnel', title: 'Lead conversion funnel', type: 'bar', xKey: 'name', height: 240, series: [series('value', 'Leads', PALETTE.blue)], data: funnel },
      { key: 'stages', title: 'Pipeline stages', type: 'bar', xKey: 'name', height: 200, series: [series('value', 'Deals', PALETTE.violet)], data: stageData },
    ],
    table,
    notes,
    drilldown: '/leads',
    ...prevMeta(range, compare),
    filter_options: { source: sourceOptions },
    meta: { currency: ctx.currency, account_name: ctx.accountName, row_count: total },
  };
}

// ── Agent performance (permission-gated) ──────────────────────
async function agentsReport(
  supabase: SB, ctx: Ctx, range: Range,
  paging: ReturnType<typeof readPaging>,
  filters: Filters, compare: boolean, prev: Range,
): Promise<ReportResponse> {
  if (!['owner', 'admin'].includes(ctx.role)) {
    return empty('agents', range, ctx.currency, ['Agent performance reports are available to account owners and admins.'], { restricted: true });
  }

  const [agentsRes, runsRes] = await Promise.all([
    supabase.from('crm3_ai_agents').select('id, name, type, enabled, status, execution_count, success_count, failure_count, last_run_at, created_at').eq('account_id', ctx.accountId).limit(500),
    supabase.from('crm3_ai_agent_runs').select('id, agent_id, status, triggered_by, tokens_used, duration_ms, started_at, completed_at').eq('account_id', ctx.accountId).gte('started_at', prev.from.toISOString()).lte('started_at', range.to.toISOString()).limit(5000),
  ]);
  const allAgents = (agentsRes.data ?? []) as Record<string, unknown>[];
  const agents = filters.agent ? allAgents.filter(a => str(a.id) === filters.agent) : allAgents;
  const allRuns = (runsRes.data ?? []) as Record<string, unknown>[];
  const runs = allRuns.filter(r => (!filters.agent || str(r.agent_id) === filters.agent) && inRange(r.started_at, range));
  const prevRuns = allRuns.filter(r => (!filters.agent || str(r.agent_id) === filters.agent) && inRange(r.started_at, prev));

  const completed = runs.filter(r => r.status === 'completed').length;
  const failed = runs.filter(r => r.status === 'failed').length;
  const pending = runs.filter(r => r.status === 'awaiting_approval').length;
  const successRate = runs.length > 0 ? Math.round((completed / runs.length) * 100) : 0;
  const successRatePrev = prevRuns.length > 0 ? Math.round((prevRuns.filter(r => r.status === 'completed').length / prevRuns.length) * 100) : 0;
  const tokens = runs.reduce((s, r) => s + num(r.tokens_used), 0);
  const tokensPrev = prevRuns.reduce((s, r) => s + num(r.tokens_used), 0);

  const byStatus: Record<string, number> = {};
  runs.forEach(r => { const s = str(r.status) || 'running'; byStatus[s] = (byStatus[s] ?? 0) + 1; });
  const statusData = Object.entries(byStatus).map(([name, value]) => ({ name, value }));

  const buckets = buildBuckets(range);
  runs.forEach(r => { const i = bucketIndex(range, str(r.started_at)); if (i != null) buckets[i].row.runs = (buckets[i].row.runs ?? 0) + 1; });
  const runTrend = buckets.map(b => ({ label: b.label, runs: b.row.runs ?? 0 }));

  const tableAll = agents.map(a => {
    const ar = runs.filter(r => r.agent_id === a.id);
    const ac = ar.filter(r => r.status === 'completed').length;
    return {
      id: a.id,
      name: str(a.name),
      type: str(a.type),
      enabled: a.enabled === true,
      status: str(a.status),
      runs: ar.length,
      completed: ac,
      failed: ar.filter(r => r.status === 'failed').length,
      awaiting_approval: ar.filter(r => r.status === 'awaiting_approval').length,
      success_rate: ar.length > 0 ? Math.round((ac / ar.length) * 100) : 0,
      tokens_used: ar.reduce((s, r) => s + num(r.tokens_used), 0),
      last_run_at: a.last_run_at ?? null,
    };
  });

  const table = buildTable(tableAll, [
    { key: 'name', label: 'Agent', type: 'text' },
    { key: 'type', label: 'Type', type: 'badge' },
    { key: 'enabled', label: 'Enabled', type: 'badge', align: 'center' },
    { key: 'runs', label: 'Runs', type: 'number', align: 'right' },
    { key: 'completed', label: 'Completed', type: 'number', align: 'right' },
    { key: 'failed', label: 'Failed', type: 'number', align: 'right' },
    { key: 'success_rate', label: 'Success', type: 'percent', align: 'right' },
    { key: 'tokens_used', label: 'Tokens', type: 'number', align: 'right' },
    { key: 'last_run_at', label: 'Last Run', type: 'date', align: 'right' },
  ], { ...paging, searchKeys: ['name', 'type', 'status'] });

  const tokensByAgent = tableAll.map(a => ({ name: a.name, value: a.tokens_used })).sort((a, b) => b.value - a.value).slice(0, 8);
  const agentOptions = allAgents.map(a => ({ value: str(a.id), label: str(a.name) }));

  const notes: string[] = [];
  if (allAgents.length === 0) notes.push('No AI agents yet.');
  if (runs.length === 0) notes.push('No agent runs in the selected range.');
  if (agents.length < allAgents.length) notes.push('Filtered to a single agent.');

  return {
    report: 'agents',
    range: { from: range.from.toISOString(), to: range.to.toISOString(), preset: range.preset, days: range.days, granularity: range.granularity },
    generated_at: new Date().toISOString(),
    kpis: [
      kpi('agents', 'Agents', agents.length, 'number', `${agents.filter(a => a.enabled === true).length} enabled`, 'blue'),
      compareKpi(kpi('runs', 'Runs', runs.length, 'number', 'in range', 'violet'), prevRuns.length, compare),
      compareKpi(kpi('success', 'Success Rate', successRate, 'percent', `${completed} completed`, 'green'), successRatePrev, compare),
      compareKpi(kpi('failed', 'Failed', failed, 'number', `${pending} awaiting approval`, failed > 0 ? 'red' : 'slate'), prevRuns.filter(r => r.status === 'failed').length, compare),
      compareKpi(kpi('tokens', 'Tokens Used', tokens, 'number', 'in range', 'amber'), tokensPrev, compare),
    ],
    charts: [
      { key: 'trend', title: `Agent runs (${range.granularity === 'day' ? 'daily' : 'monthly'})`, type: 'area', xKey: 'label', height: 200, series: [series('runs', 'Runs', PALETTE.violet)], data: runTrend },
      { key: 'status', title: 'Runs by status', type: 'pie', xKey: 'name', height: 200, series: [series('value', 'Runs', PALETTE.blue)], data: statusData },
      { key: 'tokens', title: 'Tokens by agent', type: 'bar', xKey: 'name', height: 200, series: [series('value', 'Tokens', PALETTE.amber)], data: tokensByAgent },
    ],
    table,
    notes,
    drilldown: '/agents',
    ...prevMeta(range, compare),
    filter_options: { agent: agentOptions },
    meta: { currency: ctx.currency, account_name: ctx.accountName, row_count: tableAll.length },
  };
}

// ── Automation executions (trigger → run → success rate) ──────
async function automationsReport(
  supabase: SB, ctx: Ctx, range: Range,
  paging: ReturnType<typeof readPaging>,
  filters: Filters, compare: boolean, prev: Range,
): Promise<ReportResponse> {
  const [autoRes, execRes] = await Promise.all([
    supabase.from('automations').select('id, name, status, is_active, trigger_type, ai_enabled, success_count, failure_count, last_run_at, created_at').eq('account_id', ctx.accountId).limit(1000),
    supabase.from('crm3_automation_executions').select('id, automation_id, status, trigger_type, started_at, completed_at, created_at').eq('account_id', ctx.accountId).gte('started_at', prev.from.toISOString()).lte('started_at', range.to.toISOString()).limit(5000),
  ]);
  if (execRes.error) {
    return empty('automations', range, ctx.currency,
      [`Automation executions could not be loaded: ${execRes.error.message}`],
      { meta: { currency: ctx.currency, account_name: ctx.accountName } });
  }
  const allAutos = (autoRes.data ?? []) as Record<string, unknown>[];
  const autos = allAutos.filter(a =>
    (!filters.status || str(a.status) === filters.status) &&
    (!filters.trigger || str(a.trigger_type) === filters.trigger));
  const autoIds = new Set(autos.map(a => str(a.id)));

  const allExecs = (execRes.data ?? []) as Record<string, unknown>[];
  const scoped = allExecs.filter(e => (!filters.status && !filters.trigger) || autoIds.has(str(e.automation_id)));
  const execs = scoped.filter(e => inRange(e.started_at, range));
  const execsPrev = scoped.filter(e => inRange(e.started_at, prev));

  const completed = execs.filter(e => e.status === 'completed').length;
  const failed = execs.filter(e => e.status === 'failed').length;
  const running = execs.filter(e => ['running', 'pending', 'waiting'].includes(str(e.status))).length;
  const successRate = execs.length > 0 ? Math.round((completed / execs.length) * 100) : 0;
  const completedPrev = execsPrev.filter(e => e.status === 'completed').length;
  const successRatePrev = execsPrev.length > 0 ? Math.round((completedPrev / execsPrev.length) * 100) : 0;

  const byStatus: Record<string, number> = {};
  execs.forEach(e => { const s = str(e.status) || 'running'; byStatus[s] = (byStatus[s] ?? 0) + 1; });
  const statusData = Object.entries(byStatus).map(([name, value]) => ({ name, value }));

  const byTrigger: Record<string, number> = {};
  execs.forEach(e => { const t = str(e.trigger_type) || 'unknown'; byTrigger[t] = (byTrigger[t] ?? 0) + 1; });
  const triggerData = Object.entries(byTrigger).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  const triggerOptions = [...new Set(allAutos.map(a => str(a.trigger_type)).filter(Boolean))].sort().map(t => ({ value: t, label: t.replace(/_/g, ' ') }));

  const buckets = buildBuckets(range);
  execs.forEach(e => { const i = bucketIndex(range, str(e.started_at)); if (i != null) buckets[i].row.runs = (buckets[i].row.runs ?? 0) + 1; });
  const runTrend = buckets.map(b => ({ label: b.label, runs: b.row.runs ?? 0 }));

  const perAuto = autos.map(a => {
    const ar = execs.filter(e => str(e.automation_id) === str(a.id));
    const ac = ar.filter(e => e.status === 'completed').length;
    return {
      id: a.id,
      name: str(a.name),
      status: str(a.status),
      active: a.is_active === true,
      trigger_type: str(a.trigger_type) || '—',
      executions: ar.length,
      completed: ac,
      failed: ar.filter(e => e.status === 'failed').length,
      success_rate: ar.length > 0 ? Math.round((ac / ar.length) * 100) : 0,
      last_run_at: a.last_run_at ?? null,
    };
  }).sort((a, b) => b.executions - a.executions);

  const table = buildTable(perAuto, [
    { key: 'name', label: 'Automation', type: 'text' },
    { key: 'status', label: 'Status', type: 'badge' },
    { key: 'active', label: 'Active', type: 'badge', align: 'center' },
    { key: 'trigger_type', label: 'Trigger', type: 'text' },
    { key: 'executions', label: 'Executions', type: 'number', align: 'right' },
    { key: 'completed', label: 'Completed', type: 'number', align: 'right' },
    { key: 'failed', label: 'Failed', type: 'number', align: 'right' },
    { key: 'success_rate', label: 'Success', type: 'percent', align: 'right' },
    { key: 'last_run_at', label: 'Last Run', type: 'date', align: 'right' },
  ], { ...paging, searchKeys: ['name', 'status', 'trigger_type'] });

  const byAuto = perAuto.filter(a => a.executions > 0).slice(0, 8).map(a => ({ name: a.name, value: a.executions }));

  const notes: string[] = [];
  if (allAutos.length === 0) notes.push('No automations yet — execution metrics will populate once workflows run.');
  else if (execs.length === 0) notes.push('No automation executions in the selected range.');
  if (autos.length < allAutos.length) notes.push('Filters are applied to the KPIs, charts and table on this report.');

  return {
    report: 'automations',
    range: { from: range.from.toISOString(), to: range.to.toISOString(), preset: range.preset, days: range.days, granularity: range.granularity },
    generated_at: new Date().toISOString(),
    kpis: [
      kpi('automations', 'Automations', autos.length, 'number', `${autos.filter(a => str(a.status) === 'active').length} active`, 'blue'),
      compareKpi(kpi('executions', 'Executions', execs.length, 'number', 'in range', 'violet'), execsPrev.length, compare),
      compareKpi(kpi('success', 'Success Rate', successRate, 'percent', `${completed} completed`, 'green'), successRatePrev, compare),
      kpi('running', 'In Progress', running, 'number', 'pending / running / waiting', 'amber'),
      compareKpi(kpi('failed', 'Failed', failed, 'number', 'in range', failed > 0 ? 'red' : 'slate'), execsPrev.filter(e => e.status === 'failed').length, compare),
    ],
    charts: [
      { key: 'trend', title: `Executions (${range.granularity === 'day' ? 'daily' : 'monthly'})`, type: 'area', xKey: 'label', height: 200, series: [series('runs', 'Executions', PALETTE.violet)], data: runTrend },
      { key: 'status', title: 'Executions by status', type: 'pie', xKey: 'name', height: 200, series: [series('value', 'Executions', PALETTE.blue)], data: statusData },
      { key: 'automation', title: 'Executions by automation', type: 'bar', xKey: 'name', height: 200, series: [series('value', 'Executions', PALETTE.green)], data: byAuto },
      { key: 'trigger', title: 'Executions by trigger', type: 'bar', xKey: 'name', height: 200, series: [series('value', 'Executions', PALETTE.cyan)], data: triggerData },
    ],
    table,
    notes,
    drilldown: '/automations',
    ...prevMeta(range, compare),
    filter_options: { trigger: triggerOptions },
    meta: { currency: ctx.currency, account_name: ctx.accountName, row_count: perAuto.length },
  };
}
