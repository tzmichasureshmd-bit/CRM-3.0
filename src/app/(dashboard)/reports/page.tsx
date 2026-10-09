'use client';

import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, DollarSign, Target, Users, RefreshCw, AlertTriangle } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

// ── Types ─────────────────────────────────────────────────────
interface RIOverview {
  total_revenue: number; pipeline_value: number; weighted_pipeline: number;
  win_rate: number; avg_deal_value: number; total_deals: number;
  open_deals: number; won_deals: number; lost_deals: number;
  total_contacts: number; currency: string; lost_value: number;
}
interface MonthlyRow { label: string; revenue: number; }
interface ForecastRow { label: string; projected: number; confidence: string; }
interface WinLossRow { label: string; win_rate: number; won: number; lost: number; }
interface CohortRow { label: string; total: number; hot: number; warm: number; qualified: number; }
interface SourceRow { source: string; count: number; }
interface TierBreakdown { hot: number; warm: number; cold: number; }
interface PipelineStage { stage: string; count: number; value: number; color: string; }

// ── Helpers ───────────────────────────────────────────────────
function fmt(v: number, currency = 'USD') {
  const sym = currency === 'INR' ? '₹' : '$';
  if (v >= 1_000_000) return `${sym}${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 100_000)   return `${sym}${(v / 100_000).toFixed(1)}L`;
  if (v >= 1_000)     return `${sym}${(v / 1_000).toFixed(0)}K`;
  return `${sym}${Math.round(v)}`;
}

const COLORS = ['#4f6df5', '#8b5cf6', '#28c99a', '#f4c95d', '#f46b72', '#06b6d4'];

const CONF_COLORS: Record<string, string> = { high: '#28c99a', medium: '#f4c95d', low: '#8790aa' };

function EmptyState({ msg }: { msg: string }) {
  return (
    <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--crm-text-muted)', fontSize: 12 }}>
      {msg}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'forecast' | 'win_loss' | 'cohort'>('overview');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<RIOverview | null>(null);
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [tiers, setTiers] = useState<TierBreakdown>({ hot: 0, warm: 0, cold: 0 });
  const [pipeline, setPipeline] = useState<PipelineStage[]>([]);
  const [forecast, setForecast] = useState<ForecastRow[]>([]);
  const [winLoss, setWinLoss] = useState<WinLossRow[]>([]);
  const [cohort, setCohort] = useState<CohortRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ovRes, fcRes, wlRes, coRes] = await Promise.all([
        fetch('/api/v3/revenue-intelligence?view=overview'),
        fetch('/api/v3/revenue-intelligence?view=forecast'),
        fetch('/api/v3/revenue-intelligence?view=win_loss'),
        fetch('/api/v3/revenue-intelligence?view=cohort'),
      ]);

      if (ovRes.ok) {
        const d = await ovRes.json() as {
          overview: RIOverview;
          monthly_revenue: MonthlyRow[];
          source_breakdown: SourceRow[];
          tier_breakdown: TierBreakdown;
        };
        setOverview(d.overview);
        setMonthly(d.monthly_revenue ?? []);
        setSources(d.source_breakdown ?? []);
        setTiers(d.tier_breakdown ?? { hot: 0, warm: 0, cold: 0 });
        setPipeline([
          { stage: 'Open', count: d.overview.open_deals, value: d.overview.pipeline_value, color: '#4f6df5' },
          { stage: 'Won', count: d.overview.won_deals, value: d.overview.total_revenue, color: '#28c99a' },
          { stage: 'Lost', count: d.overview.lost_deals, value: d.overview.lost_value, color: '#f46b72' },
        ]);
      } else if (ovRes.status === 401) {
        setError('Not authenticated. Please log in.');
      }

      if (fcRes.ok) {
        const d = await fcRes.json() as { forecast: ForecastRow[] };
        setForecast(d.forecast ?? []);
      }
      if (wlRes.ok) {
        const d = await wlRes.json() as { win_rate_by_month: WinLossRow[] };
        setWinLoss(d.win_rate_by_month ?? []);
      }
      if (coRes.ok) {
        const d = await coRes.json() as { cohort: CohortRow[] };
        setCohort(d.cohort ?? []);
      }
    } catch {
      setError('Failed to load revenue data. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const cur = overview?.currency ?? 'USD';
  const tierData = [
    { name: '🔥 Hot', value: tiers.hot, color: '#f46b72' },
    { name: '⚡ Warm', value: tiers.warm, color: '#f4c95d' },
    { name: '❄️ Cold', value: tiers.cold, color: '#8790aa' },
  ];
  const sourceData = sources.map(s => ({ name: s.source, value: s.count }));

  const kpis = overview ? [
    { label: 'Total Revenue', value: fmt(overview.total_revenue, cur), sub: `${overview.won_deals} deals won`, color: '#28c99a', icon: <DollarSign size={18} /> },
    { label: 'Pipeline', value: fmt(overview.pipeline_value, cur), sub: `Weighted: ${fmt(overview.weighted_pipeline, cur)}`, color: '#4d7cff', icon: <Target size={18} /> },
    { label: 'Win Rate', value: `${overview.win_rate}%`, sub: `Avg deal: ${fmt(overview.avg_deal_value, cur)}`, color: '#8b5cf6', icon: <TrendingUp size={18} /> },
    { label: 'Contacts', value: String(overview.total_contacts), sub: `${tiers.hot} hot leads`, color: '#f4c95d', icon: <Users size={18} /> },
  ] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Revenue Intelligence</h1>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--crm-text-muted)' }}>Real data · No fabricated numbers</p>
        </div>
        <button onClick={() => void loadAll()} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 9, border: '1px solid rgba(130,145,190,0.20)', background: 'rgba(255,255,255,0.50)', fontSize: 12, cursor: 'pointer', color: 'var(--crm-text-muted)' }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4 }}>
        {([['overview','Overview'],['forecast','Forecast'],['win_loss','Win/Loss'],['cohort','Cohort']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)} style={{ padding: '6px 14px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: activeTab === id ? 700 : 400, background: activeTab === id ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(255,255,255,0.50)', color: activeTab === id ? 'white' : 'var(--crm-text-secondary)' }}>
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.20)', color: '#f46b72', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlertTriangle size={13} /> {error}
        </div>
      )}

      {loading ? (
        <div className="crm-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--crm-text-muted)' }}>Loading revenue intelligence...</div>
      ) : (
        <>
          {/* KPIs — always visible */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
            {kpis.map(k => (
              <div key={k.label} className="crm-glass-soft" style={{ padding: '14px 16px', borderRadius: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: `${k.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: k.color }}>{k.icon}</div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase' }}>{k.label}</span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 750, color: 'var(--crm-text)' }}>{k.value}</div>
                <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 3 }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Revenue trend */}
              <div className="crm-glass" style={{ padding: '18px 20px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 14 }}>Revenue Trend (6 months)</div>
                {monthly.every(m => m.revenue === 0) ? <EmptyState msg="No won deals yet. Revenue will appear here once deals are marked won." /> : (
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={monthly}>
                      <defs>
                        <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4f6df5" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#4f6df5" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(130,145,190,0.12)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--crm-text-muted)' }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={v => fmt(v as number, cur)} tick={{ fontSize: 11, fill: 'var(--crm-text-muted)' }} axisLine={false} tickLine={false} width={60} />
                      <Tooltip formatter={(v: unknown) => [fmt(v as number, cur), 'Revenue']} contentStyle={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(130,145,190,0.20)', borderRadius: 10, fontSize: 12 }} />
                      <Area type="monotone" dataKey="revenue" stroke="#4f6df5" strokeWidth={2} fill="url(#rg)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* Deal funnel */}
                <div className="crm-glass" style={{ padding: '18px 20px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 14 }}>Deal Funnel</div>
                  {pipeline.length === 0 ? <EmptyState msg="No deals yet." /> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {pipeline.map(row => (
                        <div key={row.stage} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--crm-text)' }}>{row.stage}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: row.color }}>{row.count} · {fmt(row.value, cur)}</span>
                            </div>
                            <div style={{ height: 4, borderRadius: 2, background: 'rgba(130,145,190,0.15)' }}>
                              <div style={{ height: '100%', width: `${Math.min(100, overview ? (row.count / Math.max(1, overview.total_deals)) * 100 : 0)}%`, background: row.color, borderRadius: 2 }} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Lead sources */}
                <div className="crm-glass" style={{ padding: '18px 20px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 14 }}>Lead Sources</div>
                  {sourceData.length === 0 ? <EmptyState msg="No source data. Add source to contacts." /> : (
                    <ResponsiveContainer width="100%" height={150}>
                      <BarChart data={sourceData} layout="vertical">
                        <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--crm-text-muted)' }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--crm-text-muted)' }} axisLine={false} tickLine={false} width={65} />
                        <Tooltip contentStyle={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(130,145,190,0.20)', borderRadius: 10, fontSize: 12 }} />
                        <Bar dataKey="value" radius={[0, 5, 5, 0]}>
                          {sourceData.map((_e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Lead quality */}
              <div className="crm-glass" style={{ padding: '18px 20px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 14 }}>Lead Quality Breakdown</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <ResponsiveContainer width={120} height={120}>
                    <PieChart>
                      <Pie data={tierData} cx="50%" cy="50%" innerRadius={35} outerRadius={55} dataKey="value" paddingAngle={2}>
                        {tierData.map((_e, i) => <Cell key={i} fill={tierData[i].color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {tierData.map(t => (
                      <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: 'var(--crm-text)', flex: 1 }}>{t.name}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--crm-text)' }}>{t.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* FORECAST TAB */}
          {activeTab === 'forecast' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="crm-glass" style={{ padding: '18px 20px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 6 }}>Revenue Forecast (Next 3 Months)</div>
                <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginBottom: 14 }}>
                  Forecast = Won Revenue + Σ(Open Deal Value × Win Rate). Transparent rule-based methodology.
                </div>
                {forecast.length === 0 ? <EmptyState msg="Insufficient historical data for forecast." /> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {forecast.map(f => (
                      <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.70)' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)' }}>{f.label}</div>
                          <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 2 }}>Confidence: <span style={{ color: CONF_COLORS[f.confidence] ?? '#8790aa', fontWeight: 700 }}>{f.confidence}</span></div>
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 750, color: CONF_COLORS[f.confidence] ?? '#8790aa' }}>{fmt(f.projected, cur)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {overview && (
                <div className="crm-glass" style={{ padding: '18px 20px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 14 }}>Pipeline Summary</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                    {[
                      { label: 'Open Pipeline', value: fmt(overview.pipeline_value, cur), color: '#4f6df5' },
                      { label: 'Weighted Forecast', value: fmt(overview.weighted_pipeline, cur), color: '#8b5cf6' },
                      { label: 'Won Revenue', value: fmt(overview.total_revenue, cur), color: '#28c99a' },
                    ].map(s => (
                      <div key={s.label} style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.70)' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
                        <div style={{ fontSize: 18, fontWeight: 750, color: s.color }}>{s.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* WIN/LOSS TAB */}
          {activeTab === 'win_loss' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="crm-glass" style={{ padding: '18px 20px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 14 }}>Win Rate by Month</div>
                {winLoss.every(w => w.won === 0 && w.lost === 0) ? <EmptyState msg="No won or lost deals yet." /> : (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={winLoss}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(130,145,190,0.12)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--crm-text-muted)' }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={v => `${v as number}%`} tick={{ fontSize: 11, fill: 'var(--crm-text-muted)' }} axisLine={false} tickLine={false} domain={[0, 100]} />
                      <Tooltip formatter={(v: unknown) => [`${v as number}%`, 'Win Rate']} contentStyle={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(130,145,190,0.20)', borderRadius: 10, fontSize: 12 }} />
                      <Line type="monotone" dataKey="win_rate" stroke="#28c99a" strokeWidth={2} dot={{ fill: '#28c99a', r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="crm-glass" style={{ padding: '18px 20px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 14 }}>Won vs Lost</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={winLoss}>
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--crm-text-muted)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--crm-text-muted)' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(130,145,190,0.20)', borderRadius: 10, fontSize: 12 }} />
                      <Bar dataKey="won" fill="#28c99a" radius={[3, 3, 0, 0]} name="Won" />
                      <Bar dataKey="lost" fill="#f46b72" radius={[3, 3, 0, 0]} name="Lost" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {overview && (
                  <div className="crm-glass" style={{ padding: '18px 20px' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 14 }}>Summary</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {[
                        { label: 'Overall Win Rate', value: `${overview.win_rate}%`, color: '#28c99a' },
                        { label: 'Won Deals', value: String(overview.won_deals), color: '#28c99a' },
                        { label: 'Lost Deals', value: String(overview.lost_deals), color: '#f46b72' },
                        { label: 'Avg Deal Value', value: fmt(overview.avg_deal_value, cur), color: '#4f6df5' },
                      ].map(s => (
                        <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(130,145,190,0.08)' }}>
                          <span style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>{s.label}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* COHORT TAB */}
          {activeTab === 'cohort' && (
            <div className="crm-glass" style={{ padding: '18px 20px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 14 }}>Contact Cohort by Month</div>
              {cohort.every(c => c.total === 0) ? <EmptyState msg="No contacts yet." /> : (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={cohort}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(130,145,190,0.12)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--crm-text-muted)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--crm-text-muted)' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(130,145,190,0.20)', borderRadius: 10, fontSize: 12 }} />
                      <Bar dataKey="total" fill="#4f6df5" radius={[3, 3, 0, 0]} name="Total" />
                      <Bar dataKey="hot" fill="#f46b72" radius={[3, 3, 0, 0]} name="Hot" />
                      <Bar dataKey="qualified" fill="#28c99a" radius={[3, 3, 0, 0]} name="Qualified" />
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 11 }}>
                    {[['#4f6df5','Total'],['#f46b72','Hot'],['#28c99a','Qualified']].map(([c,l]) => (
                      <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
                        <span style={{ color: 'var(--crm-text-muted)' }}>{l}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
