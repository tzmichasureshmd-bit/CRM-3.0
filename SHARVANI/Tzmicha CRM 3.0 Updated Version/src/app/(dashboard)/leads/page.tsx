'use client';

import { useState, useEffect, useCallback } from 'react';
import { Flame, Search, Brain, Zap, ChevronRight, RefreshCw } from 'lucide-react';
import { getLeads, analyzeLead, type Contact } from '@/lib/api-client';
import Link from 'next/link';

const TIER_META: Record<string, { color: string; bg: string; label: string }> = {
  hot:  { color: '#f46b72', bg: 'rgba(244,107,114,0.10)', label: '🔥 Hot' },
  warm: { color: '#f4c95d', bg: 'rgba(244,201,93,0.10)',  label: '⚡ Warm' },
  cold: { color: '#8790aa', bg: 'rgba(135,144,170,0.10)', label: '❄️ Cold' },
};

const STATUS_COLORS: Record<string, string> = {
  new: '#4d7cff', contacted: '#8b5cf6', qualified: '#28c99a',
  proposal: '#f4c95d', negotiation: '#f46b72', won: '#28c99a', lost: '#8790aa',
};

function timeAgo(iso: string | null) {
  if (!iso) return 'Never';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tier, setTier] = useState<'all' | 'hot' | 'warm' | 'cold'>('all');
  const [analyzing, setAnalyzing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getLeads();
      setLeads(res.data);
    } catch { /* api-client handles 401 → redirect to /login */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = leads.filter(l => {
    const s = search.toLowerCase();
    const matchSearch = (l.name ?? '').toLowerCase().includes(s) || (l.phone ?? '').includes(s) || (l.email ?? '').toLowerCase().includes(s);
    const matchTier = tier === 'all' || l.lead_score_tier === tier;
    return matchSearch && matchTier;
  });

  async function analyzeOne(id: string) {
    setAnalyzing(id);
    try {
      const result = await analyzeLead(id);
      setLeads(prev => prev.map(l => l.id === id ? {
        ...l,
        lead_score: result.score,
        lead_score_tier: result.tier,
        lead_score_reason: result.ai_summary,
      } : l));
    } catch { /* ignore */ }
    finally { setAnalyzing(null); }
  }

  const hot  = leads.filter(l => l.lead_score_tier === 'hot').length;
  const warm = leads.filter(l => l.lead_score_tier === 'warm').length;
  const cold = leads.filter(l => l.lead_score_tier === 'cold').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="crm-page-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 750, color: 'var(--crm-text)', margin: 0, letterSpacing: '-0.02em' }}>AI Lead Intelligence</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crm-text-secondary)' }}>Explainable scores · Intent · Next Best Action</p>
        </div>
        <button onClick={() => void load()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 12, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <RefreshCw size={13} /> Refresh Scores
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {[
          { label: 'Hot Leads', count: hot, color: '#f46b72', icon: '🔥' },
          { label: 'Warm Leads', count: warm, color: '#f4c95d', icon: '⚡' },
          { label: 'Cold Leads', count: cold, color: '#8790aa', icon: '❄️' },
        ].map(k => (
          <div key={k.label} className="crm-glass" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 28 }}>{k.icon}</div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 750, color: k.color, lineHeight: 1 }}>{k.count}</div>
              <div style={{ fontSize: 12, color: 'var(--crm-text-secondary)', marginTop: 2 }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(255,255,255,0.80)', borderRadius: 12, padding: '8px 12px', flex: 1, maxWidth: 360 }}>
          <Search size={13} color="var(--crm-text-muted)" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search leads..." style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 13, color: 'var(--crm-text)' }} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['all', 'hot', 'warm', 'cold'] as const).map(t => (
            <button key={t} onClick={() => setTier(t)} style={{ padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: tier === t ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(255,255,255,0.55)', color: tier === t ? 'white' : 'var(--crm-text-secondary)' }}>
              {t === 'all' ? 'All' : TIER_META[t].label}
            </button>
          ))}
        </div>
      </div>

      <div className="crm-glass" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--crm-text-muted)' }}>Loading leads...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--crm-text-muted)' }}>
            <Flame size={36} style={{ margin: '0 auto 10px', opacity: 0.2 }} />
            <p style={{ margin: 0 }}>No leads found</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(130,145,190,0.12)' }}>
                  {['Contact', 'Score', 'Tier', 'Status', 'Intent', 'Last Activity', 'Source', 'Action'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead, i) => {
                  const tierMeta = TIER_META[lead.lead_score_tier ?? 'cold'];
                  const score = lead.lead_score ?? 0;
                  const intent = score >= 80 ? 'Very High' : score >= 60 ? 'High' : score >= 35 ? 'Medium' : 'Low';
                  const intentColor = score >= 80 ? '#f46b72' : score >= 60 ? '#f4c95d' : score >= 35 ? '#4d7cff' : '#8790aa';
                  return (
                    <tr key={lead.id} style={{ borderBottom: '1px solid rgba(130,145,190,0.07)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.20)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                            {(lead.name ?? '?')[0].toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-text)' }}>{lead.name ?? 'Unknown'}</div>
                            <div style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>{lead.phone ?? lead.email ?? '—'}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: `conic-gradient(${tierMeta.color} ${score * 3.6}deg, rgba(130,145,190,0.15) 0deg)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--crm-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: tierMeta.color }}>{score}</div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: tierMeta.color, background: tierMeta.bg, borderRadius: 8, padding: '3px 8px' }}>{tierMeta.label}</span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLORS[lead.lead_status ?? 'new'] ?? '#8790aa', background: `${STATUS_COLORS[lead.lead_status ?? 'new']}18`, borderRadius: 8, padding: '3px 8px', textTransform: 'capitalize' }}>
                          {lead.lead_status ?? 'new'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Zap size={11} color={intentColor} />
                          <span style={{ fontSize: 12, fontWeight: 600, color: intentColor }}>{intent}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--crm-text-muted)' }}>{timeAgo(lead.lead_score_reason ?? null)}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--crm-text-secondary)' }}>{lead.source ?? '—'}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => void analyzeOne(lead.id)} disabled={analyzing === lead.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 8, background: 'rgba(139,92,246,0.10)', border: '1px solid rgba(139,92,246,0.20)', color: '#8b5cf6', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                            <Brain size={10} />{analyzing === lead.id ? '...' : 'Analyze'}
                          </button>
                          <Link href="/inbox" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 8, background: 'rgba(79,109,245,0.10)', border: '1px solid rgba(79,109,245,0.20)', color: '#4f6df5', fontSize: 11, fontWeight: 600 }}>
                            <ChevronRight size={10} />Contact
                          </Link>
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
    </div>
  );
}
