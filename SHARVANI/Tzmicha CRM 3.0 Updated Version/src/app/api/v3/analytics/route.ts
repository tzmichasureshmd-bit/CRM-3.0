/**
 * CRM 3.0 — Analytics API
 * GET /api/v3/analytics?preset=&from=&to=&granularity=&q=&sort=&order=&page=&pageSize=
 *
 * A single, tenant-scoped aggregation endpoint for the Analytics dashboard.
 * Every number is derived from REAL CRM records — there is no mock data.
 *
 * Security:
 *  - Auth via session (supabase.auth.getUser) — query params are never trusted.
 *  - account_id always resolved from the caller's profile.
 *  - Every query is tenant-scoped (account_id) and runs under RLS.
 *
 * Range presets: today | 7d | 30d | 90d | year | custom
 * Granularity:    day | week | month (auto-selected from the range when omitted)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type {
  ReportResponse, ReportKpi, ReportChart, ReportTable, ReportColumn,
  ReportSeries, ValueKind,
} from '@/lib/reports-types';

type SB = Awaited<ReturnType<typeof createClient>>;

const PALETTE = {
  blue: '#4f6df5', violet: '#8b5cf6', green: '#28c99a', amber: '#f4c95d',
  red: '#f46b72', cyan: '#06b6d4', slate: '#8790aa', pink: '#ec78b5',
};

const PLATFORM_COLORS: Record<string, string> = {
  whatsapp: PALETTE.green, instagram: PALETTE.violet, facebook: PALETTE.blue,
  telegram: PALETTE.cyan, email: PALETTE.amber, web: PALETTE.slate,
};

const PLATFORM_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook',
  telegram: 'Telegram', email: 'Email', web: 'Web',
};

const QUALIFIED_STATUSES = ['qualified', 'proposal', 'negotiation'];

// ── tiny helpers ──────────────────────────────────────────────
const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v) || 0 : 0);
const str = (v: unknown): string => (v == null ? '' : String(v));
const dayStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const dayEnd = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const labelDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const labelMonth = (key: string) => new Date(key + '-01T00:00:00Z').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
const pct = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const money = (v: number, currency: string): string => `${Math.round(v).toLocaleString()} ${currency}`;
const titleCase = (v: string): string => (v ? v.charAt(0).toUpperCase() + v.slice(1) : v);
const platformLabel = (p: string): string => PLATFORM_LABELS[p] ?? titleCase(p);

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

type Granularity = 'day' | 'week' | 'month';
interface Range { from: Date; to: Date; preset: string; days: number; granularity: Granularity }

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
  else if (preset === 'year') from = dayStart(new Date(now.getFullYear(), 0, 1));
  else from = dayStart(new Date(now.getTime() - 29 * 86400000)); // default 30d

  if (isNaN(from.getTime())) from = dayStart(new Date(now.getTime() - 29 * 86400000));
  if (isNaN(to.getTime())) to = dayEnd(now);
  if (from > to) { const t = from; from = dayStart(to); to = dayEnd(t); }

  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
  const rawG = url.searchParams.get('granularity');
  const granularity: Granularity =
    rawG === 'day' || rawG === 'week' || rawG === 'month' ? rawG
      : days <= 31 ? 'day' : days <= 120 ? 'week' : 'month';

  return { from, to, preset: fromRaw || toRaw ? 'custom' : (preset ?? '30d'), days, granularity };
}

interface Bucket { key: string; label: string; start: number; end: number; row: Record<string, number> }

/** Ordered time buckets (day / week / month) spanning the active range. */
function makeBuckets(range: Range): Bucket[] {
  const out: Bucket[] = [];
  if (range.granularity === 'day') {
    for (let d = dayStart(range.from); d <= range.to; d = new Date(d.getTime() + 86400000)) {
      out.push({ key: d.toISOString().slice(0, 10), label: labelDay(d.toISOString()), start: d.getTime(), end: dayEnd(d).getTime(), row: {} });
    }
  } else if (range.granularity === 'week') {
    for (let s = dayStart(range.from); s <= range.to; s = new Date(s.getTime() + 7 * 86400000)) {
      const e = new Date(s.getTime() + 7 * 86400000 - 1);
      out.push({ key: s.toISOString().slice(0, 10), label: labelDay(s.toISOString()), start: s.getTime(), end: e.getTime(), row: {} });
    }
  } else {
    const d = new Date(range.from.getFullYear(), range.from.getMonth(), 1);
    while (d <= range.to) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      out.push({ key, label: labelMonth(key), start: d.getTime(), end: next.getTime() - 1, row: {} });
      d.setMonth(d.getMonth() + 1);
    }
  }
  return out;
}

function bucketIndex(buckets: Bucket[], iso: unknown): number | null {
  if (!iso) return null;
  const t = new Date(str(iso)).getTime();
  if (isNaN(t)) return null;
  for (let i = 0; i < buckets.length; i++) {
    if (t >= buckets[i].start && t <= buckets[i].end) return i;
  }
  return null;
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

/** Equal-length window immediately preceding the active range. */
function previousRange(range: Range): Range {
  const span = range.to.getTime() - range.from.getTime();
  const pTo = new Date(range.from.getTime() - 1);
  const pFrom = new Date(pTo.getTime() - span);
  const days = Math.max(1, Math.round((pTo.getTime() - pFrom.getTime()) / 86400000) + 1);
  return { from: pFrom, to: pTo, preset: 'prev', days, granularity: range.granularity };
}

function deltaPct(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return Math.round(((cur - prev) / prev) * 100);
}

/** Attach previous-period value + delta to a KPI so cards can show real % change. */
function compareKpi(k: ReportKpi, prevValue: number): ReportKpi {
  return { ...k, prevValue, deltaPct: deltaPct(Number(k.value) || 0, prevValue) };
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

/** In-memory search → sort → paginate for the channel-performance table. */
function buildTable(
  all: Record<string, unknown>[],
  columns: ReportColumn[],
  opts: { q?: string | null; sort?: string | null; order: 'asc' | 'desc'; page: number; pageSize: number; searchKeys: string[] },
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
    columns, rows: rows.slice(start, start + opts.pageSize),
    total, page: opts.page, pageSize: opts.pageSize, sort: sortKey, order: opts.order,
  };
}

const CHANNEL_COLUMNS: ReportColumn[] = [
  { key: 'platform', label: 'Channel', type: 'text' },
  { key: 'conversations', label: 'Conversations', type: 'number', align: 'right' },
  { key: 'inbound', label: 'Inbound', type: 'number', align: 'right' },
  { key: 'outbound', label: 'Outbound', type: 'number', align: 'right' },
  { key: 'messages', label: 'Messages', type: 'number', align: 'right' },
  { key: 'share', label: 'Share', type: 'percent', align: 'right' },
];

const GRAN_LABEL: Record<Granularity, string> = { day: 'daily', week: 'weekly', month: 'monthly' };

// ── GET ───────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const ctx = await getCtx(supabase, user.id);
    if (!ctx) return NextResponse.json({ error: 'Account not found' }, { status: 403 });

    const url = new URL(req.url);
    const range = parseRange(url);
    const paging = readPaging(url);
    const prev = previousRange(range);

    return NextResponse.json(await analyticsReport(supabase, ctx, range, prev, paging));
  } catch (err) {
    console.error('[analytics]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

async function analyticsReport(
  supabase: SB, ctx: Ctx, range: Range, prev: Range,
  paging: ReturnType<typeof readPaging>,
): Promise<ReportResponse> {
  const [contactsRes, convsRes, msgsRes, dealsRes, stagesRes, campaignsRes, contentRes, bcastRes] = await Promise.all([
    supabase.from('contacts').select('id, source, lead_status, lead_score_tier, lead_score, created_at').eq('account_id', ctx.accountId).limit(5000),
    supabase.from('conversations').select('id, platform, status, created_at').eq('account_id', ctx.accountId).limit(5000),
    supabase.from('messages').select('id, conversation_id, sender_type, status, created_at').eq('account_id', ctx.accountId).gte('created_at', prev.from.toISOString()).lte('created_at', range.to.toISOString()).limit(5000),
    supabase.from('deals').select('id, value, status, stage_id, close_date, created_at, updated_at').eq('account_id', ctx.accountId).limit(5000),
    supabase.from('pipeline_stages').select('id, name, color, position').eq('account_id', ctx.accountId).order('position').limit(200),
    supabase.from('campaigns').select('id, name, status, platform, created_at').eq('account_id', ctx.accountId).limit(1000),
    supabase.from('crm3_content').select('id, campaign_id, platform, status, leads_generated, qualified_leads, deals_attributed, revenue_attributed, created_at').eq('account_id', ctx.accountId).limit(2000),
    supabase.from('broadcasts').select('id, status, sent_count, delivered_count, read_count, total_recipients, created_at').eq('account_id', ctx.accountId).limit(2000),
  ]);

  const contacts = (contactsRes.data ?? []) as Record<string, unknown>[];
  const convs = (convsRes.data ?? []) as Record<string, unknown>[];
  const msgs = (msgsRes.data ?? []) as Record<string, unknown>[];
  const deals = (dealsRes.data ?? []) as Record<string, unknown>[];
  const stages = (stagesRes.data ?? []) as Record<string, unknown>[];
  const campaigns = (campaignsRes.data ?? []) as Record<string, unknown>[];
  const content = (contentRes.data ?? []) as Record<string, unknown>[];
  const bcasts = (bcastRes.data ?? []) as Record<string, unknown>[];

  const stageName = new Map<string, string>();
  stages.forEach(s => stageName.set(str(s.id), str(s.name)));
  const campaignName = new Map<string, string>();
  campaigns.forEach(c => campaignName.set(str(c.id), str(c.name)));
  const convPlatform = new Map<string, string>();
  convs.forEach(c => convPlatform.set(str(c.id), str(c.platform) || 'unknown'));

  // ── range-scoped slices ─────────────────────────────────────
  const contactsInR = contacts.filter(c => inRange(c.created_at, range));
  const contactsPrev = contacts.filter(c => inRange(c.created_at, prev));
  const convsInR = convs.filter(c => inRange(c.created_at, range));
  const convsPrev = convs.filter(c => inRange(c.created_at, prev));
  const msgsInR = msgs.filter(m => inRange(m.created_at, range));
  const msgsPrev = msgs.filter(m => inRange(m.created_at, prev));
  const contentInR = content.filter(c => inRange(c.created_at, range));
  const contentPrev = content.filter(c => inRange(c.created_at, prev));
  const bcastsInR = bcasts.filter(b => inRange(b.created_at, range));

  const won = deals.filter(d => d.status === 'won');
  const lost = deals.filter(d => d.status === 'lost');
  const open = deals.filter(d => d.status === 'open');
  const dealDate = (d: Record<string, unknown>) => d.updated_at ?? d.close_date ?? d.created_at;
  const wonInR = won.filter(d => inRange(dealDate(d), range));
  const wonPrev = won.filter(d => inRange(dealDate(d), prev));
  const lostInR = lost.filter(d => inRange(dealDate(d), range));

  const totalRevenueAllTime = won.reduce((s, d) => s + num(d.value), 0);
  const revenueInR = wonInR.reduce((s, d) => s + num(d.value), 0);
  const revenuePrev = wonPrev.reduce((s, d) => s + num(d.value), 0);

  // ── WhatsApp-specific message counts ────────────────────────
  const isWa = (m: Record<string, unknown>) => convPlatform.get(str(m.conversation_id)) === 'whatsapp';
  const waInR = msgsInR.filter(isWa);
  const waPrev = msgsPrev.filter(isWa);
  const inbound = (arr: Record<string, unknown>[]) => arr.filter(m => str(m.sender_type) === 'contact').length;

  // ── lead metrics ────────────────────────────────────────────
  const hotInR = contactsInR.filter(c => str(c.lead_score_tier) === 'hot').length;
  const wonContactsInR = contactsInR.filter(c => str(c.lead_status) === 'won').length;
  const wonContactsPrev = contactsPrev.filter(c => str(c.lead_status) === 'won').length;
  const conversionRate = pct(wonContactsInR, contactsInR.length);
  const conversionPrev = pct(wonContactsPrev, contactsPrev.length);

  // ── content / campaign performance ──────────────────────────
  const contentLeads = contentInR.reduce((s, c) => s + num(c.leads_generated), 0);
  const contentLeadsPrev = contentPrev.reduce((s, c) => s + num(c.leads_generated), 0);
  const contentRevenue = contentInR.reduce((s, c) => s + num(c.revenue_attributed), 0);

  // ── time buckets ────────────────────────────────────────────
  const buckets = makeBuckets(range);
  const add = (i: number | null, key: string, v = 1) => { if (i != null) buckets[i].row[key] = (buckets[i].row[key] ?? 0) + v; };

  contactsInR.forEach(c => {
    const i = bucketIndex(buckets, c.created_at);
    add(i, 'new');
    const st = str(c.lead_status);
    if (QUALIFIED_STATUSES.includes(st)) add(i, 'qualified');
    if (st === 'won') add(i, 'won');
    if (st === 'lost') add(i, 'lost');
  });
  convsInR.forEach(c => add(bucketIndex(buckets, c.created_at), 'conversations'));
  msgsInR.forEach(m => add(bucketIndex(buckets, m.created_at), str(m.sender_type) === 'contact' ? 'inbound' : 'outbound'));
  wonInR.forEach(d => add(bucketIndex(buckets, dealDate(d)), 'revenue', num(d.value)));

  const growthData = buckets.map(b => ({ label: b.label, contacts: b.row.new ?? 0 }));
  const leadData = buckets.map(b => ({ label: b.label, new: b.row.new ?? 0, qualified: b.row.qualified ?? 0, won: b.row.won ?? 0, lost: b.row.lost ?? 0 }));
  const convoData = buckets.map(b => ({ label: b.label, inbound: b.row.inbound ?? 0, outbound: b.row.outbound ?? 0 }));
  const revenueData = buckets.map(b => ({ label: b.label, revenue: Math.round(b.row.revenue ?? 0) }));

  // ── breakdowns ──────────────────────────────────────────────
  const bySource: Record<string, number> = {};
  contactsInR.forEach(c => { const s = str(c.source) || 'Direct'; bySource[s] = (bySource[s] ?? 0) + 1; });
  const sourceData = Object.entries(bySource).map(([name, leads]) => ({ name, leads })).sort((a, b) => b.leads - a.leads).slice(0, 8);

  let hot = 0, warm = 0, cold = 0;
  contactsInR.forEach(c => {
    const t = str(c.lead_score_tier);
    if (t === 'hot') hot++; else if (t === 'warm') warm++; else if (t === 'cold') cold++;
  });
  const qualityData = [
    { name: 'Hot', contacts: hot, color: PALETTE.red },
    { name: 'Warm', contacts: warm, color: PALETTE.amber },
    { name: 'Cold', contacts: cold, color: PALETTE.slate },
  ].filter(d => d.contacts > 0);

  // Pipeline value by stage (open deals only — real, tenant-scoped)
  const stageValue = stages.map(st => {
    const inStage = open.filter(d => str(d.stage_id) === str(st.id));
    return { name: str(st.name) || 'Stage', value: Math.round(inStage.reduce((s, d) => s + num(d.value), 0)), deals: inStage.length, color: str(st.color) || PALETTE.violet };
  }).filter(s => s.value > 0 || s.deals > 0);

  const dealStatusData = [
    { name: 'Open', deals: open.length, color: PALETTE.blue },
    { name: 'Won', deals: wonInR.length, color: PALETTE.green },
    { name: 'Lost', deals: lostInR.length, color: PALETTE.red },
  ].filter(d => d.deals > 0);

  // Channel performance
  const channelMap: Record<string, { conversations: number; inbound: number; outbound: number; messages: number }> = {};
  const ensureChannel = (p: string) => (channelMap[p] ??= { conversations: 0, inbound: 0, outbound: 0, messages: 0 });
  convsInR.forEach(c => { ensureChannel(str(c.platform) || 'unknown').conversations++; });
  msgsInR.forEach(m => {
    const p = convPlatform.get(str(m.conversation_id)) ?? 'unknown';
    const ch = ensureChannel(p);
    ch.messages++;
    if (str(m.sender_type) === 'contact') ch.inbound++; else ch.outbound++;
  });
  const totalMessages = msgsInR.length;
  const channelRows = Object.entries(channelMap)
    .map(([p, v]) => ({ platform: platformLabel(p), raw: p, ...v, share: pct(v.messages, totalMessages) }))
    .sort((a, b) => b.messages - a.messages);
  const channelData = channelRows.map(r => ({ name: r.platform, conversations: r.conversations, color: PLATFORM_COLORS[r.raw] ?? PALETTE.slate }));

  // Content performance
  const byContentPlatform: Record<string, number> = {};
  const byContentStatus: Record<string, number> = {};
  contentInR.forEach(c => {
    const p = str(c.platform) || 'unknown';
    byContentPlatform[p] = (byContentPlatform[p] ?? 0) + 1;
    const s = str(c.status) || 'unknown';
    byContentStatus[s] = (byContentStatus[s] ?? 0) + 1;
  });
  const contentPlatformData = Object.entries(byContentPlatform).map(([name, content]) => ({ name: platformLabel(name), content, color: PLATFORM_COLORS[name] ?? PALETTE.slate }));
  const contentStatusData = Object.entries(byContentStatus).map(([name, content]) => ({ name: titleCase(name.replace(/_/g, ' ')), content })).sort((a, b) => b.content - a.content);

  const byCampaignLeads: Record<string, number> = {};
  contentInR.forEach(c => {
    const cid = str(c.campaign_id);
    if (!cid) return;
    byCampaignLeads[cid] = (byCampaignLeads[cid] ?? 0) + num(c.leads_generated);
  });
  const campaignLeadData = Object.entries(byCampaignLeads)
    .map(([id, leads]) => ({ name: campaignName.get(id) || 'Untitled campaign', leads }))
    .filter(d => d.leads > 0).sort((a, b) => b.leads - a.leads).slice(0, 8);

  // Broadcast funnel (only when the table actually holds records)
  const bSent = bcastsInR.reduce((s, b) => s + num(b.sent_count), 0);
  const bDelivered = bcastsInR.reduce((s, b) => s + num(b.delivered_count), 0);
  const bRead = bcastsInR.reduce((s, b) => s + num(b.read_count), 0);
  const bRecipients = bcastsInR.reduce((s, b) => s + num(b.total_recipients), 0);
  const hasBroadcastData = bcastsInR.length > 0 && bRecipients > 0;

  // ── KPIs ────────────────────────────────────────────────────
  const kpis: ReportKpi[] = [
    kpi('contacts', 'Total Contacts', contacts.length, 'number', `${contactsInR.length} new in range`, 'blue'),
    compareKpi(kpi('leads', 'Total Leads', contactsInR.length, 'number', `${hotInR} hot leads`, 'red'), contactsPrev.length),
    compareKpi(kpi('conversations', 'Total Conversations', convsInR.length, 'number', `${convsInR.filter(c => str(c.status) === 'open').length} open`, 'violet'), convsPrev.length),
    compareKpi(kpi('whatsapp_messages', 'WhatsApp Messages', waInR.length, 'number', `${inbound(waInR)} in / ${waInR.length - inbound(waInR)} out`, 'green'), waPrev.length),
    compareKpi(kpi('campaign_perf', 'Campaign Performance', contentLeads, 'number', `${campaigns.length} campaigns · ${contentInR.length} content`, 'amber'), contentLeadsPrev),
    compareKpi(kpi('conversion_rate', 'Conversion Rate', conversionRate, 'percent', `${wonContactsInR}/${contactsInR.length} leads won`, 'cyan'), conversionPrev),
    compareKpi(kpi('deals_won', 'Deals Won', wonInR.length, 'number', money(revenueInR, ctx.currency), 'green'), wonPrev.length),
  ];
  if (totalRevenueAllTime > 0) {
    kpis.push(compareKpi(kpi('revenue', 'Revenue', Math.round(revenueInR), 'currency', `${wonInR.length} deals won in range`, 'green'), Math.round(revenuePrev)));
  }

  // ── Charts ──────────────────────────────────────────────────
  const charts: ReportChart[] = [
    {
      key: 'growth', title: `Contacts growth (${GRAN_LABEL[range.granularity]})`, type: 'area', xKey: 'label', height: 220,
      series: [series('contacts', 'New contacts', PALETTE.blue)], data: growthData,
    },
    {
      key: 'leads', title: `Lead analytics (${GRAN_LABEL[range.granularity]})`, type: 'line', xKey: 'label', height: 220,
      series: [series('new', 'New', PALETTE.blue), series('qualified', 'Qualified', PALETTE.violet), series('won', 'Won', PALETTE.green), series('lost', 'Lost', PALETTE.red)],
      data: leadData,
    },
    {
      key: 'sources', title: 'Leads by source', type: 'bar', xKey: 'name', height: Math.max(200, sourceData.length * 34),
      orientation: 'horizontal', series: [series('leads', 'Leads', PALETTE.violet)], data: sourceData,
    },
    {
      key: 'quality', title: 'Lead quality', type: 'pie', xKey: 'name', height: 220,
      series: [series('contacts', 'Contacts', PALETTE.blue)], data: qualityData,
    },
    {
      key: 'pipeline', title: 'Pipeline value by stage', type: 'bar', xKey: 'name', height: Math.max(200, stageValue.length * 36),
      orientation: 'horizontal', series: [series('value', 'Open value', PALETTE.green)], data: stageValue,
    },
    {
      key: 'deal_status', title: 'Deals by outcome', type: 'pie', xKey: 'name', height: 220,
      series: [series('deals', 'Deals', PALETTE.blue)], data: dealStatusData,
    },
    {
      key: 'conversations', title: `Conversation analytics (${GRAN_LABEL[range.granularity]})`, type: 'area', xKey: 'label', height: 220,
      series: [series('inbound', 'Inbound', PALETTE.cyan), series('outbound', 'Outbound', PALETTE.violet)], data: convoData,
    },
    {
      key: 'channels', title: 'Conversations by channel', type: 'bar', xKey: 'name', height: 220,
      series: [series('conversations', 'Conversations', PALETTE.cyan)], data: channelData,
    },
  ];

  if (contentPlatformData.length > 0) {
    charts.push({ key: 'content_platform', title: 'Content by channel', type: 'pie', xKey: 'name', height: 220, series: [series('content', 'Content', PALETTE.amber)], data: contentPlatformData });
  }
  if (contentStatusData.length > 0) {
    charts.push({ key: 'content_status', title: 'Content by status', type: 'bar', xKey: 'name', height: 220, series: [series('content', 'Content', PALETTE.amber)], data: contentStatusData });
  }
  if (campaignLeadData.length > 0) {
    charts.push({ key: 'campaign_leads', title: 'Leads generated by campaign', type: 'bar', xKey: 'name', height: Math.max(200, campaignLeadData.length * 36), orientation: 'horizontal', series: [series('leads', 'Leads', PALETTE.violet)], data: campaignLeadData });
  }
  if (totalRevenueAllTime > 0) {
    charts.push({ key: 'revenue', title: `Revenue (${GRAN_LABEL[range.granularity]})`, type: 'area', xKey: 'label', height: 220, series: [series('revenue', 'Revenue', PALETTE.green)], data: revenueData });
  }
  if (hasBroadcastData) {
    charts.push({
      key: 'broadcast_funnel', title: 'Broadcast delivery funnel', type: 'bar', xKey: 'name', height: 220,
      series: [series('recipients', 'Recipients', PALETTE.blue)],
      data: [
        { name: 'Recipients', recipients: Math.round(bRecipients) },
        { name: 'Sent', recipients: Math.round(bSent) },
        { name: 'Delivered', recipients: Math.round(bDelivered) },
        { name: 'Read', recipients: Math.round(bRead) },
      ],
    });
  }

  // ── Channel-performance table ───────────────────────────────
  const tableAll = channelRows.map(r => ({
    platform: r.platform, conversations: r.conversations, inbound: r.inbound, outbound: r.outbound, messages: r.messages, share: r.share,
  }));
  const table = tableAll.length > 0
    ? buildTable(tableAll, CHANNEL_COLUMNS, { ...paging, searchKeys: ['platform'] })
    : null;

  // ── Notes (honest empty states) ─────────────────────────────
  const notes: string[] = [];
  if (contacts.length === 0) notes.push('No contacts yet — lead and conversion metrics will populate once contacts are added.');
  if (convs.length === 0) notes.push('No conversations yet — conversation and channel metrics will populate once messages arrive.');
  if (deals.length === 0) notes.push('No deals yet — pipeline and revenue metrics will populate once deals are created.');
  if (content.length === 0) notes.push('No published content yet — campaign performance shows only real records.');
  if (bcastRes.error) notes.push(`Broadcast metrics are unavailable for this account.`);
  else if (bcasts.length === 0) notes.push('No broadcasts yet — the delivery funnel appears once a broadcast is sent.');

  // ── Business insights (deterministic, never invented) ───────
  const insights: string[] = [];
  if (sourceData.length > 0 && contactsInR.length > 0) {
    insights.push(`${sourceData[0].name} is the top lead source with ${sourceData[0].leads} lead${sourceData[0].leads === 1 ? '' : 's'} (${pct(sourceData[0].leads, contactsInR.length)}% of new leads).`);
  }
  if (contactsInR.length > 0 && hotInR > 0) {
    insights.push(`${pct(hotInR, contactsInR.length)}% of new leads are hot (score tier) — prioritise them for outreach.`);
  }
  const leadsDelta = deltaPct(contactsInR.length, contactsPrev.length);
  if (leadsDelta !== null && contactsPrev.length > 0) {
    if (leadsDelta > 0) insights.push(`New leads are up ${leadsDelta}% versus the previous period — acquisition is accelerating.`);
    else if (leadsDelta < 0) insights.push(`New leads are down ${Math.abs(leadsDelta)}% versus the previous period.`);
    else insights.push('New lead volume is flat versus the previous period.');
  }
  const decided = wonInR.length + lostInR.length;
  if (decided > 0) {
    insights.push(`Win rate is ${pct(wonInR.length, decided)}% across ${decided} closed deal${decided === 1 ? '' : 's'} in range.`);
  }
  if (channelRows.length > 0) {
    insights.push(`${channelRows[0].platform} is the most active channel with ${channelRows[0].conversations} conversation${channelRows[0].conversations === 1 ? '' : 's'} in range.`);
  }
  if (contactsInR.length > 0) {
    insights.push(`Lead-to-customer conversion is ${conversionRate}% (${wonContactsInR} of ${contactsInR.length} new leads won).`);
  }
  const stalled = open.filter(d => Date.now() - new Date(str(d.updated_at ?? d.created_at)).getTime() > 30 * 86400000);
  if (stalled.length > 0) {
    insights.push(`${stalled.length} open deal${stalled.length === 1 ? '' : 's'} worth ${money(stalled.reduce((s, d) => s + num(d.value), 0), ctx.currency)} have not moved in 30+ days.`);
  }
  if (contentLeads > 0) {
    insights.push(`Campaign content generated ${contentLeads} lead${contentLeads === 1 ? '' : 's'} in range${contentRevenue > 0 ? ` and ${money(contentRevenue, ctx.currency)} attributed revenue` : ''}.`);
  }
  if (hasBroadcastData) {
    insights.push(`Broadcasts reached ${Math.round(bRecipients)} recipients with a ${pct(bRead, bDelivered || bSent || bRecipients)}% read rate.`);
  }
  if (open.length > 0) {
    insights.push(`Open pipeline totals ${money(open.reduce((s, d) => s + num(d.value), 0), ctx.currency)} across ${open.length} deal${open.length === 1 ? '' : 's'}.`);
  }

  return {
    report: 'analytics',
    range: { from: range.from.toISOString(), to: range.to.toISOString(), preset: range.preset, days: range.days, granularity: range.granularity },
    generated_at: new Date().toISOString(),
    kpis, charts, table, notes, insights,
    prev_range: { from: prev.from.toISOString(), to: prev.to.toISOString() },
    meta: { currency: ctx.currency, account_name: ctx.accountName, row_count: contacts.length },
  };
}
