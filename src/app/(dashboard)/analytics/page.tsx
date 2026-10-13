'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { MessageSquare, Users, TrendingUp, Clock, RefreshCw, Activity } from 'lucide-react';

const COLORS = ['#4f6df5', '#8b5cf6', '#28c99a', '#f4c95d', '#f46b72', '#06b6d4'];
const PLATFORM_COLORS: Record<string, string> = {
  whatsapp: '#25D366', instagram: '#E1306C', facebook: '#1877F2',
  email: '#8b5cf6', telegram: '#0088cc', web: '#4f6df5',
};

function fmt(v: number) {
  if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
  return String(v);
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--crm-text-muted)', fontSize: 12 }}>
      {msg}
    </div>
  );
}

interface DayRow { label: string; count: number; }
interface PlatformRow { name: string; value: number; }
interface FunnelRow { stage: string; count: number; pct: number; color: string; }
interface AgentRow { name: string; conversations: number; }
interface StatusRow { name: string; value: number; }

export default function AnalyticsPage() {
  const [tab, setTab] = useState<'conversations' | 'leads' | 'agents' | 'channels'>('conversations');
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const [loading, setLoading] = useState(true);
  const [convByDay, setConvByDay] = useState<DayRow[]>([]);
  const [convByPlatform, setConvByPlatform] = useState<PlatformRow[]>([]);
  const [convByStatus, setConvByStatus] = useState<StatusRow[]>([]);
  const [totalConvs, setTotalConvs] = useState(0);
  const [openConvs, setOpenConvs] = useState(0);
  const [funnel, setFunnel] = useState<FunnelRow[]>([]);
  const [totalLeads, setTotalLeads] = useState(0);
  const [hotLeads, setHotLeads] = useState(0);
  const [wonLeads, setWonLeads] = useState(0);
  const [agents, setAgents] = useState<AgentRow[]>([]);

  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - range * 86400000).toISOString();
    try {
      // Conversations
      const { data: convs } = await supabase
        .from('conversations')
        .select('id, platform, status, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(1000);

      const convData = (convs ?? []) as { id: string; platform: string | null; status: string; created_at: string; }[];
      setTotalConvs(convData.length);
      setOpenConvs(convData.filter(c => c.status === 'open').length);

      // By day
      const dayMap = new Map<string, number>();
      for (let i = range - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        dayMap.set(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), 0);
      }
      for (const c of convData) {
        const label = new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (dayMap.has(label)) dayMap.set(label, (dayMap.get(label) ?? 0) + 1);
      }
      setConvByDay(Array.from(dayMap.entries()).map(([label, count]) => ({ label, count })));

      // By platform
      const platMap = new Map<string, number>();
      for (const c of convData) {
        const p = c.platform ?? 'unknown';
        platMap.set(p, (platMap.get(p) ?? 0) + 1);
      }
      setConvByPlatform(Array.from(platMap.entries()).map(([name, value]) => ({ name, value })));

      // By status
      const statMap = new Map<string, number>();
      for (const c of convData) {
        statMap.set(c.status, (statMap.get(c.status) ?? 0) + 1);
      }
      setConvByStatus(Array.from(statMap.entries()).map(([name, value]) => ({ name, value })));

      // Contacts / Leads
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, lead_status, lead_score_tier')
        .gte('created_at', since)
        .limit(2000);

      const contactData = (contacts ?? []) as { id: string; lead_status: string | null; lead_score_tier: string | null; }[];
      setTotalLeads(contactData.length);
      setHotLeads(contactData.filter(c => c.lead_score_tier === 'hot').length);
      setWonLeads(contactData.filter(c => c.lead_status === 'won').length);

      const stages = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won'];
      const stageColors = ['#4d7cff', '#8b5cf6', '#28c99a', '#f4c95d', '#f46b72', '#10b981'];
      const total = contactData.length || 1;
      setFunnel(stages.map((s, i) => {
        const count = contactData.filter(c => c.lead_status === s).length;
        return { stage: s.charAt(0).toUpperCase() + s.slice(1), count, pct: Math.round((count / total) * 100), color: stageColors[i] };
      }));

      // Agents
      const { data: profiles } = await supabase.from('profiles').select('user_id, full_name').limit(20);
      const profileData = (profiles ?? []) as { user_id: string; full_name: string | null }[];
      const agentRows: AgentRow[] = [];
      for (const p of profileData) {
        const { count } = await supabase
          .from('conversations')
          .select('id', { count: 'exact', head: true })
          .eq('assigned_agent_id', p.user_id)
          .gte('created_at', since);
        if ((count ?? 0) > 0) agentRows.push({ name: p.full_name ?? 'Unknown', conversations: count ?? 0 });
      }
      setAgents(agentRows.sort((a, b) => b.conversations - a.conversations));
    } catch (e) {
      console.error('Analytics load error', e);
    } finally {
      setLoading(false);
    }
  }, [supabase, range]);

  useEffect(() => { void load(); }, [load]);

  const TABS = [
    { id: 'conversations' as const, label: 'Conversations', icon: <MessageSquare size={13} /> },
    { id: 'leads' as const, label: 'Leads', icon: <Users size={13} /> },
    { id: 'agents' as const, label: 'Agents', icon: <Activity size={13} /> },
    { id: 'channels' as const, label: 'Channels', icon: <TrendingUp size={13} /> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Analytics</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crm-text-secondary)' }}>
            Real-time insights across conversations, leads, and channels
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {([7, 30, 90] as const).map(r => (
            <button key={r} onClick={() => setRange(r)} style={{
              padding: '6px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: range === r ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(255,255,255,0.55)',
              color: range === r ? 'white' : 'var(--crm-text-secondary)',
            }}>{r}D</button>
          ))}
          <button onClick={() => void load()} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 9, border: '1px solid rgba(130,145,190,0.20)', background: 'rgba(255,255,255,0.50)', fontSize: 12, cursor: 'pointer', color: 'var(--crm-text-muted)' }}>
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
        {[
          { label: 'Total Conversations', value: fmt(totalConvs), sub: `${openConvs} open`, color: '#4f6df5', icon: <MessageSquare size={16} /> },
          { label: 'Total Leads', value: fmt(totalLeads), sub: `${hotLeads} hot`, color: '#f46b72', icon: <Users size={16} /> },
          { label: 'Conversions', value: fmt(wonLeads), sub: totalLeads > 0 ? `${Math.round((wonLeads / totalLeads) * 100)}% rate` : '0% rate', color: '#28c99a', icon: <TrendingUp size={16} /> },
          { label: 'Channels Active', value: String(convByPlatform.length), sub: 'platforms', color: '#f4c95d', icon: <Clock size={16} /> },
        ].map(k => (
          <div key={k.label} className="crm-glass-soft" style={{ padding: '14px 16px', borderRadius: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: `${k.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: k.color }}>{k.icon}</div>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase' }}>{k.label}</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 750, color: 'var(--crm-text)' }}>{loading ? '—' : k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 3 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: tab === t.id ? 700 : 500,
            background: tab === t.id ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(255,255,255,0.55)',
            color: tab === t.id ? 'white' : 'var(--crm-text-secondary)',
          }}>{t.icon}{t.label}</button>
        ))}
      </div>

      {loading ? (
        <div className="crm-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--crm-text-muted)' }}>Loading analytics...</div>
      ) : (
        <>
          {/* CONVERSATIONS TAB */}
          {tab === 'conversations' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="crm-glass" style={{ padding: '18px 20px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 14 }}>Conversation Volume ({range}D)</div>
                {convByDay.every(d => d.count === 0) ? <EmptyState msg="No conversations in this period." /> : (
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={convByDay}>
                      <defs>
                        <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4f6df5" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#4f6df5" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(130,145,190,0.12)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--crm-text-muted)' }} axisLine={false} tickLine={false} interval={range === 7 ? 0 : range === 30 ? 4 : 9} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--crm-text-muted)' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(130,145,190,0.20)', borderRadius: 10, fontSize: 12 }} />
                      <Area type="monotone" dataKey="count" stroke="#4f6df5" strokeWidth={2} fill="url(#cg)" dot={false} name="Conversations" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="crm-glass" style={{ padding: '18px 20px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 14 }}>By Status</div>
                  {convByStatus.length === 0 ? <EmptyState msg="No data." /> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {convByStatus.map((s, i) => (
                        <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                          <span style={{ flex: 1, fontSize: 12, color: 'var(--crm-text)', textTransform: 'capitalize' }}>{s.name}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: COLORS[i % COLORS.length] }}>{s.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="crm-glass" style={{ padding: '18px 20px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 14 }}>By Platform</div>
                  {convByPlatform.length === 0 ? <EmptyState msg="No platform data." /> : (
                    <ResponsiveContainer width="100%" height={140}>
                      <PieChart>
                        <Pie data={convByPlatform} cx="50%" cy="50%" innerRadius={35} outerRadius={55} dataKey="value" paddingAngle={2}>
                          {convByPlatform.map((e, i) => <Cell key={i} fill={PLATFORM_COLORS[e.name] ?? COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(130,145,190,0.20)', borderRadius: 10, fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* LEADS TAB */}
          {tab === 'leads' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="crm-glass" style={{ padding: '18px 20px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 14 }}>Lead Funnel</div>
                {funnel.every(f => f.count === 0) ? <EmptyState msg="No leads in this period." /> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {funnel.map(row => (
                      <div key={row.stage} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 90, fontSize: 12, fontWeight: 600, color: 'var(--crm-text)', textAlign: 'right', flexShrink: 0 }}>{row.stage}</div>
                        <div style={{ flex: 1, height: 22, borderRadius: 6, background: 'rgba(130,145,190,0.10)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.max(row.pct, 2)}%`, background: row.color, borderRadius: 6 }} />
                        </div>
                        <div style={{ width: 70, fontSize: 12, fontWeight: 700, color: row.color, flexShrink: 0 }}>{row.count} ({row.pct}%)</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="crm-glass" style={{ padding: '18px 20px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 14 }}>Stage Distribution</div>
                {funnel.every(f => f.count === 0) ? <EmptyState msg="No leads yet." /> : (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={funnel}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(130,145,190,0.12)" vertical={false} />
                      <XAxis dataKey="stage" tick={{ fontSize: 11, fill: 'var(--crm-text-muted)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--crm-text-muted)' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(130,145,190,0.20)', borderRadius: 10, fontSize: 12 }} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Leads">
                        {funnel.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}

          {/* AGENTS TAB */}
          {tab === 'agents' && (
            <div className="crm-glass" style={{ padding: '18px 20px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 14 }}>Agent Performance</div>
              {agents.length === 0 ? <EmptyState msg="No agent data. Assign conversations to agents to see performance." /> : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(130,145,190,0.12)' }}>
                        {['Agent', 'Conversations', 'Share', 'Performance'].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {agents.map((a, i) => {
                        const maxConvs = agents[0]?.conversations ?? 1;
                        const pct = Math.round((a.conversations / maxConvs) * 100);
                        const share = totalConvs > 0 ? Math.round((a.conversations / totalConvs) * 100) : 0;
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid rgba(130,145,190,0.07)' }}>
                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 11, fontWeight: 700 }}>
                                  {a.name[0]?.toUpperCase()}
                                </div>
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-text)' }}>{a.name}</span>
                              </div>
                            </td>
                            <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, color: '#4f6df5' }}>{a.conversations}</td>
                            <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--crm-text-secondary)' }}>{share}%</td>
                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ height: 6, borderRadius: 3, background: 'rgba(130,145,190,0.15)', width: 120 }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#4f6df5,#8b5cf6)', borderRadius: 3 }} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* CHANNELS TAB */}
          {tab === 'channels' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="crm-glass" style={{ padding: '18px 20px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 14 }}>Channel Volume</div>
                {convByPlatform.length === 0 ? <EmptyState msg="No channel data in this period." /> : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={convByPlatform}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(130,145,190,0.12)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--crm-text-muted)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--crm-text-muted)' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(130,145,190,0.20)', borderRadius: 10, fontSize: 12 }} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]} name="Conversations">
                        {convByPlatform.map((e, i) => <Cell key={i} fill={PLATFORM_COLORS[e.name] ?? COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 }}>
                {convByPlatform.map((p, i) => {
                  const color = PLATFORM_COLORS[p.name] ?? COLORS[i % COLORS.length];
                  const pct = totalConvs > 0 ? Math.round((p.value / totalConvs) * 100) : 0;
                  return (
                    <div key={p.name} className="crm-glass-soft" style={{ padding: '14px 16px', borderRadius: 12, borderLeft: `3px solid ${color}` }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'capitalize', marginBottom: 6 }}>{p.name}</div>
                      <div style={{ fontSize: 22, fontWeight: 750, color: 'var(--crm-text)' }}>{p.value}</div>
                      <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 2 }}>{pct}% of total</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
