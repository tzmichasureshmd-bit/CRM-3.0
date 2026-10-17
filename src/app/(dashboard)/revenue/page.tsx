'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, DollarSign, Users, Target, BarChart3,
  RefreshCw, ArrowUpRight, Sparkles, Link2, Filter,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';

// ── Types ─────────────────────────────────────────────────────
interface Overview {
  total_leads: number;
  qualified_leads: number;
  total_deals: number;
  won_deals: number;
  attributed_revenue: number;
  pipeline_value: number;
  conversion_rate: number;
  qualification_rate: number;
  deal_rate: number;
}

interface ContentRow {
  id: string;
  title: string;
  platform: string;
  status: string;
  published_at: string | null;
  leads_generated: number;
  qualified_leads: number;
  deals_attributed: number;
  revenue_attributed: number;
  reach: number | null;
  impressions: number | null;
  engagement: number | null;
  ai_generated: boolean;
  attribution_records: number;
}

interface SourceRow {
  source: string;
  leads: number;
  hot: number;
  qualified: number;
  deals: number;
  revenue: number;
}

interface TimelineRow {
  id: string;
  created_at: string;
  contact_id: string | null;
  content_id: string | null;
  deal_id: string | null;
  revenue_amount: number | null;
  is_won: boolean;
  attribution_method: string;
  attribution_confidence: string;
  source: string | null;
  channel: string | null;
  lead_created_at: string | null;
  deal_won_at: string | null;
}

// ── Constants ─────────────────────────────────────────────────
const PLATFORM_COLORS: Record<string, string> = {
  instagram: '#e1306c', facebook: '#1877f2', whatsapp: '#25d366',
  telegram: '#0088cc', email: '#8b5cf6',
};

const SOURCE_COLORS = ['#4f6df5', '#8b5cf6', '#28c99a', '#f4c95d', '#f46b72', '#06b6d4'];

const DATE_RANGES = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: 'All', days: 0 },
] as const;

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── KPI Card ──────────────────────────────────────────────────
function KPICard({ label, value, sub, color, icon }: {
  label: string; value: string; sub?: string; color: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="crm-glass-soft" style={{ padding: '14px 16px', borderRadius: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
          {icon}
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 750, color: 'var(--crm-text)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Content Performance Table ─────────────────────────────────
function ContentTable({ rows }: { rows: ContentRow[] }) {
  if (rows.length === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--crm-text-muted)' }}>
        <Sparkles size={28} style={{ margin: '0 auto 10px', opacity: 0.2 }} />
        <p style={{ margin: 0, fontSize: 13 }}>No content with attribution data yet</p>
        <p style={{ margin: '4px 0 0', fontSize: 11, opacity: 0.7 }}>Create and publish content in Content Studio to see performance</p>
      </div>
    );
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(130,145,190,0.12)' }}>
            {['Content', 'Platform', 'Reach', 'Leads', 'Qualified', 'Deals', 'Revenue', 'Conv%'].map(h => (
              <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Content' ? 'left' : 'right', fontSize: 10, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const conv = row.leads_generated > 0 ? Math.round((row.deals_attributed / row.leads_generated) * 100) : 0;
            const platColor = PLATFORM_COLORS[row.platform] ?? '#8790aa';
            return (
              <tr key={row.id} style={{ borderBottom: '1px solid rgba(130,145,190,0.06)' }}>
                <td style={{ padding: '10px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    {row.ai_generated && <Sparkles size={10} color="#8b5cf6" />}
                    <span style={{ fontWeight: 600, color: 'var(--crm-text)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{row.title}</span>
                  </div>
                  {row.published_at && <div style={{ fontSize: 10, color: 'var(--crm-text-muted)', marginTop: 2 }}>{timeAgo(row.published_at)}</div>}
                </td>
                <td style={{ padding: '10px 10px', textAlign: 'right' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: platColor, background: `${platColor}15`, borderRadius: 5, padding: '2px 6px', textTransform: 'uppercase' }}>{row.platform}</span>
                </td>
                <td style={{ padding: '10px 10px', textAlign: 'right', color: 'var(--crm-text-secondary)' }}>{row.reach ? fmt(row.reach) : '—'}</td>
                <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 600, color: row.leads_generated > 0 ? '#4f6df5' : 'var(--crm-text-muted)' }}>{row.leads_generated}</td>
                <td style={{ padding: '10px 10px', textAlign: 'right', color: row.qualified_leads > 0 ? '#28c99a' : 'var(--crm-text-muted)' }}>{row.qualified_leads}</td>
                <td style={{ padding: '10px 10px', textAlign: 'right', color: row.deals_attributed > 0 ? '#f4c95d' : 'var(--crm-text-muted)' }}>{row.deals_attributed}</td>
                <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700, color: row.revenue_attributed > 0 ? '#28c99a' : 'var(--crm-text-muted)' }}>
                  {row.revenue_attributed > 0 ? fmtCurrency(row.revenue_attributed) : '—'}
                </td>
                <td style={{ padding: '10px 10px', textAlign: 'right' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: conv >= 10 ? '#28c99a' : conv >= 5 ? '#f4c95d' : 'var(--crm-text-muted)' }}>{conv > 0 ? `${conv}%` : '—'}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Source Performance ────────────────────────────────────────
function SourceTable({ rows }: { rows: SourceRow[] }) {
  if (rows.length === 0) {
    return (
      <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--crm-text-muted)', fontSize: 12 }}>
        No source data yet. Contacts with a source field will appear here.
      </div>
    );
  }
  const maxLeads = Math.max(...rows.map(r => r.leads), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((row, i) => {
        const pct = Math.round((row.leads / maxLeads) * 100);
        const convRate = row.leads > 0 ? Math.round((row.deals / row.leads) * 100) : 0;
        return (
          <div key={row.source} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: SOURCE_COLORS[i % SOURCE_COLORS.length], flexShrink: 0 }} />
            <div style={{ width: 90, fontSize: 12, fontWeight: 600, color: 'var(--crm-text)', textTransform: 'capitalize', flexShrink: 0 }}>{row.source}</div>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(130,145,190,0.12)', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: SOURCE_COLORS[i % SOURCE_COLORS.length] }} />
            </div>
            <div style={{ display: 'flex', gap: 14, flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: 'var(--crm-text-muted)', width: 40, textAlign: 'right' }}>{row.leads} leads</span>
              <span style={{ fontSize: 11, color: '#28c99a', width: 40, textAlign: 'right' }}>{row.qualified} qual</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: convRate > 0 ? '#4f6df5' : 'var(--crm-text-muted)', width: 36, textAlign: 'right' }}>{convRate > 0 ? `${convRate}%` : '—'}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: row.revenue > 0 ? '#28c99a' : 'var(--crm-text-muted)', width: 60, textAlign: 'right' }}>{row.revenue > 0 ? fmtCurrency(row.revenue) : '—'}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Attribution Timeline ──────────────────────────────────────
function AttributionTimeline({ rows }: { rows: TimelineRow[] }) {
  if (rows.length === 0) {
    return (
      <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--crm-text-muted)', fontSize: 12 }}>
        No attribution events yet. Attribution records are created when leads and deals are linked to content.
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {rows.slice(0, 20).map((row, i) => {
        const isWon = row.is_won;
        const hasLead = !!row.contact_id;
        const hasDeal = !!row.deal_id;
        const icon = isWon ? '🏆' : hasDeal ? '💼' : hasLead ? '👤' : '📄';
        const color = isWon ? '#28c99a' : hasDeal ? '#f4c95d' : hasLead ? '#4f6df5' : '#8790aa';
        const label = isWon ? 'Deal Won' : hasDeal ? 'Deal Created' : hasLead ? 'Lead Created' : 'Attribution';
        return (
          <div key={row.id} style={{ display: 'flex', gap: 12, position: 'relative' }}>
            {i < rows.length - 1 && <div style={{ position: 'absolute', left: 14, top: 30, width: 2, height: 'calc(100% - 8px)', background: 'rgba(130,145,190,0.12)' }} />}
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${color}18`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0, zIndex: 1 }}>{icon}</div>
            <div style={{ flex: 1, paddingBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--crm-text)' }}>{label}</span>
                <span style={{ fontSize: 10, color: 'var(--crm-text-muted)', flexShrink: 0 }}>{timeAgo(row.created_at)}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                {row.source && <span style={{ fontSize: 10, color: 'var(--crm-text-muted)' }}>via {row.source}</span>}
                {row.attribution_method && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(79,109,245,0.08)', color: '#4f6df5' }}>{row.attribution_method}</span>}
                {row.revenue_amount && isWon && <span style={{ fontSize: 10, fontWeight: 700, color: '#28c99a' }}>{fmtCurrency(row.revenue_amount)}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function RevenuePage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [contentRows, setContentRows] = useState<ContentRow[]>([]);
  const [sourceRows, setSourceRows] = useState<SourceRow[]>([]);
  const [timelineRows, setTimelineRows] = useState<TimelineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'content' | 'source' | 'timeline'>('overview');
  const [dateRange, setDateRange] = useState<number>(30);
  const [error, setError] = useState<string | null>(null);

  const buildDateParams = useCallback(() => {
    if (dateRange === 0) return '';
    const from = new Date(Date.now() - dateRange * 86400000).toISOString();
    return `&date_from=${from}`;
  }, [dateRange]);

  const loadOverview = useCallback(async () => {
    const res = await fetch(`/api/v3/attribution?view=overview${buildDateParams()}`);
    if (res.ok) {
      const d = await res.json() as { overview: Overview };
      setOverview(d.overview);
    }
  }, [buildDateParams]);

  const loadContent = useCallback(async () => {
    const res = await fetch(`/api/v3/attribution?view=content${buildDateParams()}`);
    if (res.ok) {
      const d = await res.json() as { content: ContentRow[]; overview: Overview };
      setContentRows(d.content ?? []);
      setOverview(d.overview);
    }
  }, [buildDateParams]);

  const loadSource = useCallback(async () => {
    const res = await fetch(`/api/v3/attribution?view=source${buildDateParams()}`);
    if (res.ok) {
      const d = await res.json() as { sources: SourceRow[]; overview: Overview };
      setSourceRows(d.sources ?? []);
      setOverview(d.overview);
    }
  }, [buildDateParams]);

  const loadTimeline = useCallback(async () => {
    const res = await fetch(`/api/v3/attribution?view=timeline${buildDateParams()}`);
    if (res.ok) {
      const d = await res.json() as { timeline: TimelineRow[]; overview: Overview };
      setTimelineRows(d.timeline ?? []);
      setOverview(d.overview);
    }
  }, [buildDateParams]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadOverview(), loadContent(), loadSource(), loadTimeline()]);
    } catch {
      setError('Failed to load attribution data');
    } finally {
      setLoading(false);
    }
  }, [loadOverview, loadContent, loadSource, loadTimeline]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // Build funnel chart data from overview
  const funnelData = overview ? [
    { name: 'Leads', value: overview.total_leads, fill: '#4f6df5' },
    { name: 'Qualified', value: overview.qualified_leads, fill: '#8b5cf6' },
    { name: 'Deals', value: overview.total_deals, fill: '#f4c95d' },
    { name: 'Won', value: overview.won_deals, fill: '#28c99a' },
  ] : [];

  // Build source pie data
  const sourcePieData = sourceRows.slice(0, 6).map((s, i) => ({
    name: s.source,
    value: s.leads,
    fill: SOURCE_COLORS[i % SOURCE_COLORS.length],
  }));

  const TABS = [
    { id: 'overview' as const, label: 'Overview', icon: <BarChart3 size={13} /> },
    { id: 'content' as const, label: 'Content', icon: <Sparkles size={13} /> },
    { id: 'source' as const, label: 'Sources', icon: <Link2 size={13} /> },
    { id: 'timeline' as const, label: 'Timeline', icon: <Filter size={13} /> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '0 0 12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 750, color: 'var(--crm-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={18} color="#4f6df5" /> Revenue Attribution
            </h1>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--crm-text-muted)' }}>
              Content → Engagement → Lead → Deal → Revenue
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Date range */}
            <div style={{ display: 'flex', gap: 3, background: 'rgba(255,255,255,0.50)', borderRadius: 10, padding: 3, border: '1px solid rgba(255,255,255,0.70)' }}>
              {DATE_RANGES.map(r => (
                <button key={r.label} onClick={() => setDateRange(r.days)} style={{ padding: '4px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: dateRange === r.days ? 700 : 400, background: dateRange === r.days ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'transparent', color: dateRange === r.days ? 'white' : 'var(--crm-text-secondary)' }}>
                  {r.label}
                </button>
              ))}
            </div>
            <button onClick={() => void loadAll()} style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid rgba(130,145,190,0.20)', background: 'rgba(255,255,255,0.50)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--crm-text-muted)' }}>
              <RefreshCw size={13} />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.20)', color: '#f46b72', fontSize: 12, marginBottom: 10, flexShrink: 0 }}>
          {error}
        </div>
      )}

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 12, flexShrink: 0 }}>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ height: 80, borderRadius: 14, background: 'rgba(255,255,255,0.40)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))
        ) : overview ? [
          { label: 'Attributed Revenue', value: fmtCurrency(overview.attributed_revenue), sub: `Pipeline: ${fmtCurrency(overview.pipeline_value)}`, color: '#28c99a', icon: <DollarSign size={14} /> },
          { label: 'Leads Generated', value: fmt(overview.total_leads), sub: `${overview.qualification_rate}% qualified`, color: '#4f6df5', icon: <Users size={14} /> },
          { label: 'Qualified Leads', value: fmt(overview.qualified_leads), sub: `${overview.deal_rate}% → deal`, color: '#8b5cf6', icon: <Target size={14} /> },
          { label: 'Deals Won', value: `${overview.won_deals}/${overview.total_deals}`, sub: `${overview.conversion_rate}% win rate`, color: '#f4c95d', icon: <TrendingUp size={14} /> },
          { label: 'Conversion Rate', value: `${overview.conversion_rate}%`, sub: 'Lead → Won', color: '#f46b72', icon: <ArrowUpRight size={14} /> },
        ].map(k => <KPICard key={k.label} {...k} />) : null}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: activeTab === t.id ? 700 : 400, background: activeTab === t.id ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(255,255,255,0.50)', color: activeTab === t.id ? 'white' : 'var(--crm-text-secondary)' }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {/* Funnel */}
            <div className="crm-glass" style={{ padding: '16px 18px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 14 }}>Attribution Funnel</div>
              {funnelData.every(d => d.value === 0) ? (
                <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--crm-text-muted)', fontSize: 12 }}>
                  No attribution data yet. Create content and link leads to see the funnel.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {funnelData.map((d, i) => {
                    const maxVal = funnelData[0].value || 1;
                    const pct = Math.round((d.value / maxVal) * 100);
                    return (
                      <div key={d.name}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--crm-text)' }}>{d.name}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: d.fill }}>{d.value}</span>
                        </div>
                        <div style={{ height: 8, borderRadius: 4, background: 'rgba(130,145,190,0.12)', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: d.fill, transition: 'width 600ms ease' }} />
                        </div>
                        {i < funnelData.length - 1 && funnelData[i + 1].value > 0 && (
                          <div style={{ fontSize: 10, color: 'var(--crm-text-muted)', marginTop: 2, textAlign: 'right' }}>
                            {Math.round((funnelData[i + 1].value / (d.value || 1)) * 100)}% → {funnelData[i + 1].name}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Source Pie */}
            <div className="crm-glass" style={{ padding: '16px 18px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 14 }}>Leads by Source</div>
              {sourcePieData.length === 0 ? (
                <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--crm-text-muted)', fontSize: 12 }}>
                  No source data yet. Contacts with a source field will appear here.
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <ResponsiveContainer width={120} height={120}>
                    <PieChart>
                      <Pie data={sourcePieData} cx="50%" cy="50%" innerRadius={35} outerRadius={55} dataKey="value" paddingAngle={2}>
                        {sourcePieData.map((entry, _i) => <Cell key={_i} fill={entry.fill} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {sourcePieData.map((s, _i) => (
                      <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.fill, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: 'var(--crm-text)', flex: 1, textTransform: 'capitalize' }}>{s.name}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text)' }}>{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Bar chart: content revenue */}
            <div className="crm-glass" style={{ padding: '16px 18px', gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 14 }}>Content Revenue Attribution</div>
              {contentRows.filter(c => c.revenue_attributed > 0).length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--crm-text-muted)', fontSize: 12 }}>
                  No revenue attributed to content yet. Publish content and link won deals to see this chart.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={contentRows.filter(c => c.revenue_attributed > 0).slice(0, 8)} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <XAxis dataKey="title" tick={{ fontSize: 10, fill: 'var(--crm-text-muted)' }} tickFormatter={v => (v as string).slice(0, 14)} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--crm-text-muted)' }} tickFormatter={v => fmtCurrency(v as number)} width={60} />
                    <Tooltip formatter={(v: unknown) => [fmtCurrency(v as number), 'Revenue']} contentStyle={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(130,145,190,0.20)', borderRadius: 10, fontSize: 12 }} />
                    <Bar dataKey="revenue_attributed" fill="#28c99a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}

        {/* CONTENT TAB */}
        {activeTab === 'content' && (
          <div className="crm-glass" style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)' }}>Content Performance</div>
              <span style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>{contentRows.length} items</span>
            </div>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <div key={i} style={{ height: 44, borderRadius: 8, background: 'rgba(255,255,255,0.40)', marginBottom: 6 }} />)
            ) : (
              <ContentTable rows={contentRows} />
            )}
          </div>
        )}

        {/* SOURCE TAB */}
        {activeTab === 'source' && (
          <div className="crm-glass" style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)' }}>Source Performance</div>
              <div style={{ display: 'flex', gap: 16, fontSize: 10, color: 'var(--crm-text-muted)' }}>
                <span>Leads</span><span>Qualified</span><span>Conv%</span><span>Revenue</span>
              </div>
            </div>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <div key={i} style={{ height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.40)', marginBottom: 8 }} />)
            ) : (
              <SourceTable rows={sourceRows} />
            )}
          </div>
        )}

        {/* TIMELINE TAB */}
        {activeTab === 'timeline' && (
          <div className="crm-glass" style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 14 }}>Attribution Timeline</div>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <div key={i} style={{ height: 48, borderRadius: 8, background: 'rgba(255,255,255,0.40)', marginBottom: 8 }} />)
            ) : (
              <AttributionTimeline rows={timelineRows} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
