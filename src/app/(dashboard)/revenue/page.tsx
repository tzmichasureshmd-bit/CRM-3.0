'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Layers, LayoutDashboard, Lightbulb, PieChart, Receipt, RefreshCw, Sparkles,
  TrendingUp, TriangleAlert, Trophy, type LucideIcon,
} from 'lucide-react';
import type { ColumnType, RangePreset, ReportChart } from '@/lib/reports-types';
import type { RevenueResponse, RevenueTab } from '@/lib/revenue-types';
import { createClient } from '@/lib/supabase/client';
import { fetchApi, SessionExpiredError, ForbiddenError, clearSession } from '@/lib/auth-client';
import { exportCSV, exportExcel, exportPDF } from '@/lib/report-export';
import { kindForKey } from '@/components/reports/theme';
import { ReportKpiCard } from '@/components/reports/ReportKpiCard';
import { ReportChartCard } from '@/components/reports/ReportChartCard';
import { ReportDataTable } from '@/components/reports/ReportDataTable';
import { ReportRangePicker } from '@/components/reports/ReportRangePicker';
import { ReportExportMenu, type ExportFormat } from '@/components/reports/ReportExportMenu';
import { ReportDrilldown } from '@/components/reports/ReportDrilldown';

const TABS: { id: RevenueTab; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'trends', label: 'Trends', icon: TrendingUp },
  { id: 'pipeline', label: 'Pipeline & Aging', icon: Layers },
  { id: 'forecast', label: 'Forecast', icon: Sparkles },
  { id: 'winloss', label: 'Win / Loss', icon: Trophy },
  { id: 'breakdowns', label: 'Breakdowns', icon: PieChart },
  { id: 'deals', label: 'Deals', icon: Receipt },
];

const TITLES: Record<RevenueTab, string> = {
  overview: 'Revenue Overview',
  trends: 'Revenue Trends',
  pipeline: 'Pipeline & Aging',
  forecast: 'Revenue Forecast',
  winloss: 'Win / Loss Analysis',
  breakdowns: 'Revenue Breakdowns',
  deals: 'Deals',
};

const PIPELINE_HEALTH = ['on track', 'overdue', 'stalled'].map(v => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }));
const DEAL_STATUS = ['open', 'won', 'lost'].map(v => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }));

const PAGE_SIZE = 25;
const REALTIME_TABLES = ['deals', 'pipeline_stages', 'contacts', 'crm3_attribution', 'campaigns'];

type Granularity = 'month' | 'quarter';

/** Where a KPI card should take the user when clicked. */
const KPI_TARGETS: Record<string, { tab: RevenueTab; status?: string; health?: string }> = {
  won_revenue: { tab: 'deals', status: 'won' },
  won_value: { tab: 'deals', status: 'won' },
  open_pipeline: { tab: 'pipeline' },
  weighted: { tab: 'pipeline' },
  avg_deal: { tab: 'deals' },
  win_rate: { tab: 'winloss' },
  lead_to_deal: { tab: 'deals' },
  deal_to_win: { tab: 'winloss' },
  lost_value: { tab: 'deals', status: 'lost' },
  revenue: { tab: 'deals', status: 'won' },
  avg_period: { tab: 'trends' },
  best: { tab: 'trends' },
  growth: { tab: 'trends' },
  deals: { tab: 'deals' },
  avg_age: { tab: 'pipeline' },
  overdue: { tab: 'pipeline', health: 'overdue' },
  stalled: { tab: 'pipeline', health: 'stalled' },
  run_rate: { tab: 'forecast' },
  next_month: { tab: 'forecast' },
  three_month: { tab: 'forecast' },
  open: { tab: 'pipeline' },
  period_win_rate: { tab: 'winloss' },
  avg_cycle: { tab: 'winloss' },
  won: { tab: 'deals', status: 'won' },
  avg: { tab: 'deals' },
  lost: { tab: 'deals', status: 'lost' },
  sources: { tab: 'breakdowns' },
  top_source: { tab: 'breakdowns' },
  attributed: { tab: 'breakdowns' },
  stages: { tab: 'breakdowns' },
  campaigns: { tab: 'breakdowns' },
};

interface UiError { message: string; auth: boolean }

export default function RevenueIntelligencePage() {
  const [tab, setTab] = useState<RevenueTab>('overview');
  const [preset, setPreset] = useState<RangePreset>('90d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [granularity, setGranularity] = useState<Granularity>('month');
  const [healthFilter, setHealthFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState<string | null>(null);
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<RevenueResponse | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<UiError | null>(null);
  const [live, setLive] = useState(false);
  const [nonce, setNonce] = useState(0);

  const [drillRow, setDrillRow] = useState<Record<string, unknown> | null>(null);
  const [chartDrill, setChartDrill] = useState<{ datum: Record<string, unknown>; chart: ReportChart } | null>(null);

  // Intent passed to the tab-reset effect so KPI clicks can carry a filter.
  const intentRef = useRef<{ status?: string; health?: string } | null>(null);

  // Reset view state when switching tabs (honouring a pending KPI intent).
  useEffect(() => {
    setSearch(''); setDebouncedSearch(''); setSort(null); setOrder('desc'); setPage(1);
    if (intentRef.current) {
      setHealthFilter(intentRef.current.health ?? '');
      setStatusFilter(intentRef.current.status ?? '');
      intentRef.current = null;
    } else {
      setHealthFilter(''); setStatusFilter('');
    }
  }, [tab]);

  // Debounce search.
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch the active section.
  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ report: tab, pageSize: String(PAGE_SIZE), page: String(page) });
    if (preset === 'custom' && from && to) { qs.set('from', from); qs.set('to', to); }
    else qs.set('preset', preset);
    if (tab === 'trends' || tab === 'winloss') qs.set('g', granularity);
    if (debouncedSearch) qs.set('q', debouncedSearch);
    if (sort) { qs.set('sort', sort); qs.set('order', order); }
    if (tab === 'pipeline' && healthFilter) qs.set('status', healthFilter);
    if (tab === 'deals' && statusFilter) qs.set('status', statusFilter);

    setPending(true);
    setError(null);
    void (async () => {
      try {
        const json = await fetchApi<RevenueResponse>(`/api/v3/revenue-intelligence?${qs.toString()}`);
        if (!cancelled) setData(json);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof SessionExpiredError) setError({ message: err.message, auth: true });
        else if (err instanceof ForbiddenError) setError({ message: err.message, auth: false });
        else setError({ message: err instanceof Error ? err.message : 'Failed to load revenue intelligence.', auth: false });
      } finally {
        if (!cancelled) setPending(false);
      }
    })();

    return () => { cancelled = true; };
  }, [tab, preset, from, to, granularity, debouncedSearch, sort, order, page, healthFilter, statusFilter, nonce]);

  // Realtime auto-refresh (debounced).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      setLive(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { setNonce(n => n + 1); setLive(false); }, 1200);
    };
    const channel = supabase.channel('crm-revenue-live');
    REALTIME_TABLES.forEach(table => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, schedule);
    });
    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  const currency = data?.meta.currency ?? 'USD';
  const showSkeleton = pending && (!data || data.report !== tab);
  const analysis = data && data.report === tab ? data : null;
  const title = TITLES[tab];

  const subtitle = analysis?.meta.account_name
    ? `${analysis.meta.account_name} · updated ${new Date(analysis.generated_at).toLocaleTimeString()}`
    : `updated ${new Date().toLocaleTimeString()}`;

  const handleSort = (key: string) => {
    if (sort === key) setOrder(o => (o === 'asc' ? 'desc' : 'asc'));
    else { setSort(key); setOrder('desc'); }
    setPage(1);
  };

  const applyRange = (p: RangePreset, f: string, t: string) => {
    setPreset(p); setFrom(f); setTo(t); setPage(1);
  };

  const handleKpiClick = (key: string) => {
    const target = KPI_TARGETS[key];
    if (!target) return;
    if (target.tab === tab) {
      if (target.status !== undefined) setStatusFilter(target.status);
      if (target.health !== undefined) setHealthFilter(target.health);
      setPage(1);
    } else {
      intentRef.current = { status: target.status, health: target.health };
      setTab(target.tab);
    }
  };

  const handleExport = async (format: ExportFormat) => {
    if (!analysis) return;
    let table = analysis.table;
    try {
      const qs = new URLSearchParams({ report: tab, pageSize: '2000', page: '1' });
      if (preset === 'custom' && from && to) { qs.set('from', from); qs.set('to', to); }
      else qs.set('preset', preset);
      if (tab === 'trends' || tab === 'winloss') qs.set('g', granularity);
      if (debouncedSearch) qs.set('q', debouncedSearch);
      if (sort) { qs.set('sort', sort); qs.set('order', order); }
      if (tab === 'pipeline' && healthFilter) qs.set('status', healthFilter);
      if (tab === 'deals' && statusFilter) qs.set('status', statusFilter);
      const full = await fetchApi<RevenueResponse>(`/api/v3/revenue-intelligence?${qs.toString()}`);
      table = full.table;
    } catch { /* fall back to on-screen page */ }

    if (format === 'csv') exportCSV(analysis, table);
    else if (format === 'xls') exportExcel(analysis, table);
    else if (format === 'pdf') exportPDF(analysis, table);
  };

  const kpis = useMemo(() => analysis?.kpis ?? [], [analysis]);
  const charts = analysis?.charts ?? [];
  const insights = analysis?.insights ?? [];
  const drillColumns = analysis?.table?.columns ?? [];
  const chartColumns = chartDrill
    ? ([
        { key: chartDrill.chart.xKey, label: 'Category', type: 'text' as ColumnType },
        ...chartDrill.chart.series.map(s => ({ key: s.key, label: s.label, type: kindForKey(s.key) as ColumnType })),
      ])
    : [];

  const showGranularity = tab === 'trends' || tab === 'winloss';

  const goToLogin = () => {
    clearSession();
  };

  return (
    <div className="crm-rpt-page">
      <header className="crm-rpt-header">
        <div>
          <h1 className="crm-rpt-title">Revenue Intelligence</h1>
          <p className="crm-rpt-subtitle">
            {subtitle}
            {live && <span className="crm-rpt-live"><i /> live</span>}
          </p>
        </div>
        <div className="crm-rpt-header-actions">
          <button className="crm-rpt-refresh" onClick={() => setNonce(n => n + 1)} disabled={pending}>
            <RefreshCw size={13} className={pending ? 'crm-rpt-spin' : undefined} /> Refresh
          </button>
          <ReportExportMenu onExport={handleExport} disabled={!analysis} />
        </div>
      </header>

      <nav className="crm-rpt-tabs">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              className={`crm-rpt-tab${tab === t.id ? ' is-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </nav>

      <div className="crm-rpt-toolbar">
        <ReportRangePicker preset={preset} from={from} to={to} onApply={applyRange} />
        <div className="crm-rpt-filters">
          {showGranularity && (
            <div className="crm-ri-seg">
              {(['month', 'quarter'] as Granularity[]).map(g => (
                <button
                  key={g}
                  className={`crm-ri-seg-btn${granularity === g ? ' is-active' : ''}`}
                  onClick={() => setGranularity(g)}
                >
                  {g === 'month' ? 'Monthly' : 'Quarterly'}
                </button>
              ))}
            </div>
          )}
          {tab === 'pipeline' && (
            <select value={healthFilter} onChange={e => { setHealthFilter(e.target.value); setPage(1); }}>
              <option value="">All open deals</option>
              {PIPELINE_HEALTH.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          {tab === 'deals' && (
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
              <option value="">All statuses</option>
              {DEAL_STATUS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
        </div>
      </div>

      {error && (
        <div className="crm-rpt-error">
          <TriangleAlert size={14} /> {error.message}
          <div className="crm-rpt-error-actions">
            {error.auth && <button onClick={goToLogin}>Sign in</button>}
            <button onClick={() => setNonce(n => n + 1)}>Retry</button>
          </div>
        </div>
      )}

      {showSkeleton ? (
        <div className="crm-rpt-skeleton-grid">
          {[0, 1, 2, 3].map(i => <div key={i} className="crm-rpt-skeleton" />)}
        </div>
      ) : analysis ? (
        <>
          {analysis.notes.length > 0 && (
            <div className="crm-rpt-notes">
              {analysis.notes.map((n, i) => <div key={i} className="crm-rpt-note"><TriangleAlert size={12} /> {n}</div>)}
            </div>
          )}

          {kpis.length > 0 && (
            <div className="crm-rpt-kpi-grid" style={{ opacity: pending ? 0.6 : 1 }}>
              {kpis.map(k => (
                <ReportKpiCard
                  key={k.key}
                  kpi={k}
                  currency={currency}
                  onClick={KPI_TARGETS[k.key] ? () => handleKpiClick(k.key) : undefined}
                />
              ))}
            </div>
          )}

          {tab === 'overview' && insights.length > 0 && (
            <section className="crm-ri-insights">
              <div className="crm-ri-insights-head">
                <Lightbulb size={14} /> Insights
                <span className="crm-ri-insights-tag">rule-based · transparent</span>
              </div>
              <ul className="crm-ri-insights-list">
                {insights.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </section>
          )}

          {charts.length > 0 && (
            <div className="crm-rpt-chart-grid" style={{ opacity: pending ? 0.6 : 1 }}>
              {charts.map(c => (
                <div key={c.key} className={charts.length === 1 ? 'crm-rpt-chart-full' : undefined}>
                  <ReportChartCard chart={c} currency={currency} onSelect={(datum, chart) => setChartDrill({ datum, chart })} />
                </div>
              ))}
            </div>
          )}

          {analysis.table && (
            <div style={{ opacity: pending ? 0.6 : 1 }}>
              <ReportDataTable
                table={analysis.table}
                currency={currency}
                search={search}
                onSearch={setSearch}
                onSort={handleSort}
                onPage={setPage}
                onRowClick={setDrillRow}
              />
            </div>
          )}
        </>
      ) : null}

      <ReportDrilldown
        open={drillRow !== null}
        row={drillRow}
        columns={drillColumns}
        currency={currency}
        title={`${title} — Detail`}
        href={analysis?.drilldown}
        onClose={() => setDrillRow(null)}
      />

      <ReportDrilldown
        open={chartDrill !== null}
        row={chartDrill?.datum ?? null}
        columns={chartColumns}
        currency={currency}
        title={chartDrill?.chart.title ?? ''}
        href={analysis?.drilldown}
        onClose={() => setChartDrill(null)}
      />
    </div>
  );
}
