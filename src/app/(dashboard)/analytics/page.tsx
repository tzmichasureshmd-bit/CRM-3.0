'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity, Lightbulb, RefreshCw, TriangleAlert, CalendarRange,
} from 'lucide-react';
import type { ColumnType, RangePreset, ReportChart, ReportResponse } from '@/lib/reports-types';
import { ANALYTICS_RANGE_PRESETS } from '@/lib/reports-types';
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

type Gran = 'day' | 'week' | 'month';

const GRANULARITIES: { id: Gran; label: string }[] = [
  { id: 'day', label: 'Daily' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
];

const PAGE_SIZE = 25;
const REALTIME_TABLES = ['contacts', 'deals', 'conversations', 'messages', 'campaigns', 'crm3_content', 'broadcasts'];

/** Pick a sensible default grouping for a given range (user can override). */
function defaultGranularity(preset: RangePreset, from: string, to: string): Gran {
  if (preset === '90d') return 'week';
  if (preset === 'year') return 'month';
  if (preset === 'custom' && from && to) {
    const days = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1;
    return days <= 31 ? 'day' : days <= 120 ? 'week' : 'month';
  }
  return 'day';
}

export default function AnalyticsPage() {
  const [preset, setPreset] = useState<RangePreset>('30d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [granularity, setGranularity] = useState<Gran>('day');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
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

  // Debounce the table search input.
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Build the current query string (shared by fetch + export).
  const buildQuery = useMemo(() => {
    return (pageSize: number, pageNum: number) => {
      const qs = new URLSearchParams({ granularity, pageSize: String(pageSize), page: String(pageNum) });
      if (preset === 'custom' && from && to) { qs.set('from', from); qs.set('to', to); }
      else qs.set('preset', preset);
      if (debouncedSearch) qs.set('q', debouncedSearch);
      if (sort) { qs.set('sort', sort); qs.set('order', order); }
      return qs.toString();
    };
  }, [granularity, preset, from, to, debouncedSearch, sort, order]);

  // Fetch analytics for the active range.
  useEffect(() => {
    let cancelled = false;
    setPending(true);
    setError(null);
    void (async () => {
      try {
        const json = await fetchApi<ReportResponse>(`/api/v3/analytics?${buildQuery(PAGE_SIZE, page)}`);
        if (!cancelled) setData(json);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof SessionExpiredError) setError({ message: err.message, auth: true });
        else if (err instanceof ForbiddenError) setError({ message: err.message, auth: false });
        else setError({ message: err instanceof Error ? err.message : 'Failed to load analytics.', auth: false });
      } finally {
        if (!cancelled) setPending(false);
      }
    })();
    return () => { cancelled = true; };
  }, [buildQuery, page, nonce]);

  // Realtime: auto-refresh on data changes (debounced).
  // Uses anon Supabase client for realtime only — no data is read from it.
  // The actual data fetch goes through the authenticated /api/v3/analytics route.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      setLive(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { setNonce(n => n + 1); setLive(false); }, 1200);
    };
    // Only subscribe if we have a valid account context (prevents cross-tenant noise)
    const accountId = typeof window !== 'undefined'
      ? (() => { try { return JSON.parse(localStorage.getItem('crm_user') ?? '{}').account_id ?? ''; } catch { return ''; } })()
      : '';
    if (!accountId) return;
    const channel = supabase.channel(`crm-analytics-live-${accountId}`);
    REALTIME_TABLES.forEach(table => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `account_id=eq.${accountId}` }, schedule);
    });
    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  const currency = data?.meta.currency ?? 'USD';
  const analysis = data;
  const kpis = analysis?.kpis ?? [];
  const charts = analysis?.charts ?? [];
  const showSkeleton = pending && !analysis;

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
    setGranularity(defaultGranularity(p, fr, t));
  };

  const handleExport = async (format: ExportFormat) => {
    if (!analysis) return;
    let table = analysis.table;
    try {
      const full = await fetchApi<ReportResponse>(`/api/v3/analytics?${buildQuery(2000, 1)}`);
      table = full.table;
    } catch { /* fall back to on-screen page */ }

    if (format === 'csv') exportCSV(analysis, table);
    else if (format === 'xls') exportExcel(analysis, table);
    else if (format === 'pdf') exportPDF(analysis, table);
  };

  return (
    <div className="crm-rpt-page">
      <header className="crm-rpt-header">
        <div>
          <h1 className="crm-rpt-title">Analytics</h1>
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

      <div className="crm-rpt-toolbar">
        <ReportRangePicker preset={preset} from={from} to={to} onApply={applyRange} presets={ANALYTICS_RANGE_PRESETS} />
        <div className="crm-rpt-filters">
          <span className="crm-rpt-card-hint"><CalendarRange size={12} /> Group by</span>
          <div className="crm-rpt-range-presets">
            {GRANULARITIES.map(g => (
              <button
                key={g.id}
                className={`crm-rpt-range-btn${granularity === g.id ? ' is-active' : ''}`}
                onClick={() => { setGranularity(g.id); setPage(1); }}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="crm-rpt-error">
          <TriangleAlert size={14} /> {error.message}
          <div className="crm-rpt-error-actions">
            {error.auth && <button onClick={() => clearSession()}>Sign in</button>}
            <button onClick={() => setNonce(n => n + 1)}>Retry</button>
          </div>
        </div>
      )}

      {showSkeleton ? (
        <div className="crm-rpt-skeleton-grid">
          {[0, 1, 2, 3, 4, 5, 6, 7].map(i => <div key={i} className="crm-rpt-skeleton" />)}
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

          {!showSkeleton && kpis.length === 0 && charts.length === 0 && (
            <div className="crm-rpt-restricted">
              <Activity size={24} />
              <h3>No analytics yet</h3>
              <p>Metrics appear here as soon as your account has contacts, conversations or deals.</p>
            </div>
          )}
        </>
      ) : null}

      <ReportDrilldown
        open={drillRow !== null}
        row={drillRow}
        columns={drillColumns}
        currency={currency}
        title="Channel Performance — Detail"
        onClose={() => setDrillRow(null)}
      />

      <ReportDrilldown
        open={chartDrill !== null}
        row={chartDrill?.datum ?? null}
        columns={chartColumns}
        currency={currency}
        title={chartDrill?.chart.title ?? ''}
        onClose={() => setChartDrill(null)}
      />
    </div>
  );
}
