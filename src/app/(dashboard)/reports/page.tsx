'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight, Bot, DollarSign, LayoutDashboard, Lightbulb, Megaphone, MessageSquare, RefreshCw,
  Send, TrendingUp, TriangleAlert, Users, Workflow, type LucideIcon,
} from 'lucide-react';
import type { ColumnType, RangePreset, ReportChart, ReportId, ReportResponse } from '@/lib/reports-types';
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

const TABS: { id: ReportId; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'contacts', label: 'Contacts & Leads', icon: Users },
  { id: 'sales', label: 'Sales & Revenue', icon: DollarSign },
  { id: 'campaigns', label: 'Campaigns', icon: Megaphone },
  { id: 'broadcasts', label: 'Broadcasts', icon: Send },
  { id: 'conversations', label: 'Conversations', icon: MessageSquare },
  { id: 'automations', label: 'Automations', icon: Workflow },
  { id: 'conversion', label: 'Conversion', icon: TrendingUp },
  { id: 'agents', label: 'Agent Performance', icon: Bot },
];

const TITLES: Record<ReportId, string> = {
  overview: 'Overview', contacts: 'Contacts & Leads', sales: 'Sales & Revenue',
  campaigns: 'Campaigns', broadcasts: 'Broadcasts', conversations: 'Conversations',
  automations: 'Automations', conversion: 'Lead Conversion', agents: 'Agent Performance',
};

const STATUS_OPTIONS: Partial<Record<ReportId, { value: string; label: string }[]>> = {
  contacts: ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'].map(v => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })),
  sales: ['open', 'won', 'lost'].map(v => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })),
  broadcasts: ['draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled'].map(v => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })),
  conversations: ['open', 'pending', 'resolved', 'closed'].map(v => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })),
  automations: ['draft', 'active', 'paused', 'archived', 'error'].map(v => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })),
};

const TIER_OPTIONS = ['hot', 'warm', 'cold'].map(v => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }));
const PLATFORM_OPTIONS = ['whatsapp', 'instagram', 'facebook', 'telegram', 'email', 'web'].map(v => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }));

const PAGE_SIZE = 25;
const REALTIME_TABLES = ['contacts', 'deals', 'conversations', 'messages', 'campaigns', 'crm3_content', 'broadcasts', 'automations', 'crm3_automation_executions', 'crm3_ai_agents', 'crm3_ai_agent_runs'];

export default function ReportsPage() {
  const [report, setReport] = useState<ReportId>('overview');
  const [preset, setPreset] = useState<RangePreset>('30d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [compare, setCompare] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [campaignFilter, setCampaignFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [triggerFilter, setTriggerFilter] = useState('');
  const [sort, setSort] = useState<string | null>(null);
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ReportResponse | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<{ message: string; auth: boolean } | null>(null);
  const [live, setLive] = useState(false);
  const [nonce, setNonce] = useState(0);

  const [drillRow, setDrillRow] = useState<Record<string, unknown> | null>(null);
  const [chartDrill, setChartDrill] = useState<{ datum: Record<string, unknown>; chart: ReportChart } | null>(null);

  // Reset view state when switching reports.
  useEffect(() => {
    setSearch(''); setDebouncedSearch(''); setSort(null); setOrder('desc'); setPage(1);
    setStatusFilter(''); setPlatformFilter(''); setTierFilter(''); setSourceFilter('');
    setStageFilter(''); setCampaignFilter(''); setAgentFilter(''); setTriggerFilter('');
  }, [report]);

  // Debounce search input.
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Build the current query string (shared by fetch + export).
  const buildQuery = useMemo(() => {
    return (pageSize: number, pageNum: number) => {
      const qs = new URLSearchParams({ report, pageSize: String(pageSize), page: String(pageNum) });
      if (preset === 'custom' && from && to) { qs.set('from', from); qs.set('to', to); }
      else qs.set('preset', preset);
      if (compare) qs.set('compare', '1');
      if (debouncedSearch) qs.set('q', debouncedSearch);
      if (sort) { qs.set('sort', sort); qs.set('order', order); }
      if (statusFilter) qs.set('status', statusFilter);
      if (platformFilter) qs.set('platform', platformFilter);
      if (tierFilter) qs.set('tier', tierFilter);
      if (sourceFilter) qs.set('source', sourceFilter);
      if (stageFilter) qs.set('stage', stageFilter);
      if (campaignFilter) qs.set('campaign', campaignFilter);
      if (agentFilter) qs.set('agent', agentFilter);
      if (triggerFilter) qs.set('trigger', triggerFilter);
      return qs.toString();
    };
  }, [report, preset, from, to, compare, debouncedSearch, sort, order, statusFilter, platformFilter, tierFilter, sourceFilter, stageFilter, campaignFilter, agentFilter, triggerFilter]);

  // Fetch the active report.
  useEffect(() => {
    let cancelled = false;
    setPending(true);
    setError(null);
    void (async () => {
      try {
        const json = await fetchApi<ReportResponse>(`/api/v3/reports?${buildQuery(PAGE_SIZE, page)}`);
        if (!cancelled) setData(json);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof SessionExpiredError) setError({ message: err.message, auth: true });
        else if (err instanceof ForbiddenError) setError({ message: err.message, auth: false });
        else setError({ message: err instanceof Error ? err.message : 'Failed to load report.', auth: false });
      } finally {
        if (!cancelled) setPending(false);
      }
    })();

    return () => { cancelled = true; };
  }, [buildQuery, page, nonce]);

  // Realtime: auto-refresh on data changes (debounced).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      setLive(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { setNonce(n => n + 1); setLive(false); }, 1200);
    };
    const channel = supabase.channel('crm-reports-live');
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
  const showSkeleton = pending && (!data || data.report !== report);
  const analysis = data && data.report === report ? data : null;

  const statusOptions = STATUS_OPTIONS[report] ?? [];
  const f = analysis?.filter_options ?? null;
  const showPlatform = report === 'conversations' || report === 'campaigns' || report === 'broadcasts';
  const showTier = report === 'contacts';
  const showSource = report === 'contacts' || report === 'conversion';
  const showStage = report === 'sales';
  const showCampaign = report === 'campaigns';
  const showAgent = report === 'agents';
  const showTrigger = report === 'automations';

  const title = TITLES[report];
  const subtitle = analysis?.meta.account_name
    ? `${analysis.meta.account_name} · updated ${new Date(analysis.generated_at).toLocaleTimeString()}`
    : `updated ${new Date().toLocaleTimeString()}`;

  const drillColumns = analysis?.table?.columns ?? [];
  const chartColumns = chartDrill
    ? ([
        { key: chartDrill.chart.xKey, label: 'Category', type: 'text' as ColumnType },
        ...chartDrill.chart.series.map(s => ({ key: s.key, label: s.label, type: kindForKey(s.key) as ColumnType })),
      ])
    : [];

  const handleSort = (key: string) => {
    if (sort === key) setOrder(o => (o === 'asc' ? 'desc' : 'asc'));
    else { setSort(key); setOrder('desc'); }
    setPage(1);
  };

  const applyRange = (p: RangePreset, fr: string, t: string) => {
    setPreset(p); setFrom(fr); setTo(t); setPage(1);
    if (p === 'custom') setSort(null);
  };

  const handleExport = async (format: ExportFormat) => {
    if (!analysis) return;
    let table = analysis.table;
    try {
      const full = await fetchApi<ReportResponse>(`/api/v3/reports?${buildQuery(2000, 1)}`);
      table = full.table;
    } catch { /* fall back to on-screen page */ }

    if (format === 'csv') exportCSV(analysis, table);
    else if (format === 'xls') exportExcel(analysis, table);
    else if (format === 'pdf') exportPDF(analysis, table);
  };

  const kpis = useMemo(() => analysis?.kpis ?? [], [analysis]);
  const charts = analysis?.charts ?? [];

  return (
    <div className="crm-rpt-page">
      <header className="crm-rpt-header">
        <div>
          <h1 className="crm-rpt-title">Reports</h1>
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
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`crm-rpt-tab${report === tab.id ? ' is-active' : ''}`}
              onClick={() => setReport(tab.id)}
            >
              <Icon size={14} /> {tab.label}
            </button>
          );
        })}
      </nav>

      <div className="crm-rpt-toolbar">
        <ReportRangePicker preset={preset} from={from} to={to} onApply={applyRange} />
        <div className="crm-rpt-filters">
          <button
            className={`crm-rpt-compare${compare ? ' is-active' : ''}`}
            onClick={() => setCompare(v => !v)}
            title="Compare with the previous period of equal length"
          >
            <ArrowLeftRight size={12} /> Compare
          </button>
          {statusOptions.length > 0 && (
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
              <option value="">All statuses</option>
              {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          {showPlatform && (
            <select value={platformFilter} onChange={e => { setPlatformFilter(e.target.value); setPage(1); }}>
              <option value="">All channels</option>
              {PLATFORM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          {showTier && (
            <select value={tierFilter} onChange={e => { setTierFilter(e.target.value); setPage(1); }}>
              <option value="">All tiers</option>
              {TIER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          {showSource && (f?.source?.length ?? 0) > 0 && (
            <select value={sourceFilter} onChange={e => { setSourceFilter(e.target.value); setPage(1); }}>
              <option value="">All sources</option>
              {f!.source!.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          {showStage && (f?.stage?.length ?? 0) > 0 && (
            <select value={stageFilter} onChange={e => { setStageFilter(e.target.value); setPage(1); }}>
              <option value="">All stages</option>
              {f!.stage!.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          {showCampaign && (f?.campaign?.length ?? 0) > 0 && (
            <select value={campaignFilter} onChange={e => { setCampaignFilter(e.target.value); setPage(1); }}>
              <option value="">All campaigns</option>
              {f!.campaign!.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          {showAgent && (f?.agent?.length ?? 0) > 0 && (
            <select value={agentFilter} onChange={e => { setAgentFilter(e.target.value); setPage(1); }}>
              <option value="">All agents</option>
              {f!.agent!.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          {showTrigger && (f?.trigger?.length ?? 0) > 0 && (
            <select value={triggerFilter} onChange={e => { setTriggerFilter(e.target.value); setPage(1); }}>
              <option value="">All triggers</option>
              {f!.trigger!.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
        </div>
      </div>

      {error && (
        <div className="crm-rpt-error">
          <TriangleAlert size={14} /> {error.message}
          <div className="crm-rpt-error-actions">
            {error.auth && <button onClick={() => { void clearSession().finally(() => window.location.replace('/login')); }}>Sign in</button>}
            <button onClick={() => setNonce(n => n + 1)}>Retry</button>
          </div>
        </div>
      )}

      {showSkeleton ? (
        <div className="crm-rpt-skeleton-grid">
          {[0, 1, 2, 3].map(i => <div key={i} className="crm-rpt-skeleton" />)}
        </div>
      ) : analysis?.restricted ? (
        <div className="crm-rpt-restricted">
          <Bot size={24} />
          <h3>{title}</h3>
          {analysis.notes.map((n, i) => <p key={i}>{n}</p>)}
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
              {kpis.map(k => <ReportKpiCard key={k.key} kpi={k} currency={currency} />)}
            </div>
          )}

          {(analysis.insights?.length ?? 0) > 0 && (
            <section className="crm-ri-insights">
              <div className="crm-ri-insights-head">
                <Lightbulb size={14} /> Business Insights
                <span className="crm-ri-insights-tag">rule-based · from live data</span>
              </div>
              <ul className="crm-ri-insights-list">
                {analysis.insights!.map((s, i) => <li key={i}>{s}</li>)}
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
