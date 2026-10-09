'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users, Search, MessageSquare, TrendingUp, Calendar,
  Brain, Zap, RefreshCw, Phone, Mail, Building2,
  DollarSign, Link2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

// ── Types ────────────────────────────────────────────────────
interface Contact {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  lead_status: string | null;
  lead_score: number | null;
  lead_score_tier: string | null;
  lead_score_reason: string | null;
  source: string | null;
  created_at: string;
  last_customer_reply_at: string | null;
}

interface Conversation {
  id: string;
  platform: string | null;
  status: string | null;
  last_message_text: string | null;
  last_message_at: string | null;
  unread_count: number;
  created_at: string;
}

interface Deal {
  id: string;
  title: string | null;
  value: number | null;
  currency: string | null;
  status: string | null;
  created_at: string;
}

interface TimelineEvent {
  id: string;
  icon: string;
  label: string;
  detail: string;
  time: string;
  color: string;
  type: 'contact' | 'conversation' | 'deal' | 'ai' | 'followup';
}

interface Attribution {
  id: string;
  content_id: string | null;
  campaign_id: string | null;
  source: string | null;
  channel: string | null;
  attribution_method: string;
  attribution_confidence: string;
  revenue_amount: number | null;
  is_won: boolean;
  created_at: string;
}

// ── Helpers ──────────────────────────────────────────────────
function timeAgo(iso: string | null) {
  if (!iso) return 'Never';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return 'Just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const PLATFORM_COLORS: Record<string, string> = {
  whatsapp: '#25d366', instagram: '#e1306c', facebook: '#1877f2', email: '#8b5cf6',
};

const STATUS_COLORS: Record<string, string> = {
  open: '#4d7cff', pending: '#f4c95d', resolved: '#28c99a', closed: '#8790aa',
  new: '#4d7cff', contacted: '#8b5cf6', qualified: '#28c99a',
  proposal: '#f4c95d', negotiation: '#f46b72', won: '#28c99a', lost: '#8790aa',
};

const JOURNEY_STAGES = ['Discovery', 'Engagement', 'Conversation', 'Qualification', 'Sales', 'Conversion', 'Retention'];

// ── Main Component ───────────────────────────────────────────
export default function CustomersPage() {
  const supabase = createClient();
  const [contacts, setContacts]       = useState<Contact[]>([]);
  const [selected, setSelected]       = useState<Contact | null>(null);
  const [conversations, setConvs]     = useState<Conversation[]>([]);
  const [deals, setDeals]             = useState<Deal[]>([]);
  const [timeline, setTimeline]       = useState<TimelineEvent[]>([]);
  const [attribution, setAttribution] = useState<Attribution[]>([]);
  const [loading, setLoading]         = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch]           = useState('');
  const [analyzing, setAnalyzing]     = useState(false);
  const [aiIntel, setAiIntel]         = useState<{ score: number; intent: string; sentiment: string; summary: string; nba: string } | null>(null);

  // Load contact list
  const loadContacts = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('contacts')
      .select('id,name,phone,email,company,lead_status,lead_score,lead_score_tier,lead_score_reason,source,created_at,last_customer_reply_at')
      .order('last_customer_reply_at', { ascending: false, nullsFirst: false })
      .limit(100);
    setContacts((data as Contact[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void loadContacts(); }, [loadContacts]);

  // Load detail when contact selected
  const loadDetail = useCallback(async (contact: Contact) => {
    setDetailLoading(true);
    setConvs([]);
    setDeals([]);
    setTimeline([]);
    setAiIntel(null);
    setAttribution([]);

    const [convRes, dealRes, attrRes] = await Promise.all([
      supabase
        .from('conversations')
        .select('id,platform,status,last_message_text,last_message_at,unread_count,created_at')
        .eq('contact_id', contact.id)
        .order('last_message_at', { ascending: false })
        .limit(10),
      supabase
        .from('deals')
        .select('id,title,value,currency,status,created_at')
        .eq('contact_id', contact.id)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('crm3_attribution')
        .select('id,content_id,campaign_id,source,channel,attribution_method,attribution_confidence,revenue_amount,is_won,created_at')
        .eq('contact_id', contact.id)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const convs    = (convRes.data  as Conversation[]) ?? [];
    const dealList = (dealRes.data  as Deal[])         ?? [];
    const attrList = (attrRes.data  as Attribution[])  ?? [];
    setConvs(convs);
    setDeals(dealList);
    setAttribution(attrList);

    // Build timeline from real data
    const events: TimelineEvent[] = [];

    events.push({
      id: `contact-${contact.id}`,
      icon: '👤', label: 'Contact created',
      detail: `Added via ${contact.source ?? 'direct'}`,
      time: fmtDate(contact.created_at),
      color: '#4d7cff', type: 'contact',
    });

    convs.forEach(c => {
      events.push({
        id: `conv-${c.id}`,
        icon: '💬', label: `Conversation via ${c.platform ?? 'channel'}`,
        detail: c.last_message_text ? `"${c.last_message_text.slice(0, 60)}${c.last_message_text.length > 60 ? '…' : ''}"` : 'No messages',
        time: timeAgo(c.last_message_at ?? c.created_at),
        color: PLATFORM_COLORS[c.platform ?? ''] ?? '#8790aa', type: 'conversation',
      });
    });

    dealList.forEach(d => {
      const val = d.value ? `${d.currency ?? ''}${d.value.toLocaleString()}` : '';
      events.push({
        id: `deal-${d.id}`,
        icon: d.status === 'won' ? '🏆' : d.status === 'lost' ? '❌' : '💼',
        label: `Deal: ${d.title ?? 'Untitled'}`,
        detail: `${d.status ?? 'open'}${val ? ` · ${val}` : ''}`,
        time: fmtDate(d.created_at),
        color: STATUS_COLORS[d.status ?? 'open'] ?? '#8790aa', type: 'deal',
      });
    });

    if (contact.lead_score !== null) {
      events.push({
        id: `ai-score-${contact.id}`,
        icon: '🤖', label: `AI Lead Score: ${contact.lead_score}/100`,
        detail: contact.lead_score_reason ?? 'Based on CRM activity',
        time: 'Calculated',
        color: contact.lead_score >= 70 ? '#f46b72' : contact.lead_score >= 40 ? '#f4c95d' : '#8790aa',
        type: 'ai',
      });
    }

    // Sort by recency (keep contact created first)
    events.sort((a, b) => {
      if (a.type === 'contact') return -1;
      if (b.type === 'contact') return 1;
      return 0;
    });

    setTimeline(events);
    setDetailLoading(false);
  }, []);

  const handleSelect = useCallback((c: Contact) => {
    setSelected(c);
    void loadDetail(c);
  }, [loadDetail]);

  // AI analyze
  const handleAnalyze = useCallback(async () => {
    if (!selected) return;
    setAnalyzing(true);
    try {
      const res = await fetch('/api/v3/ai/lead-intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: selected.id }),
      });
      if (res.ok) {
        const data = await res.json() as {
          score: number; intent: string; sentiment: string;
          ai_summary: string; next_best_action: { action: string };
        };
        setAiIntel({
          score: data.score,
          intent: data.intent,
          sentiment: data.sentiment,
          summary: data.ai_summary,
          nba: data.next_best_action?.action ?? '',
        });
        // Refresh contact list to show updated score
        void loadContacts();
      }
    } catch { /* AI unavailable — keep existing data */ }
    finally { setAnalyzing(false); }
  }, [selected, loadContacts]);

  const filtered = contacts.filter(c => {
    const s = search.toLowerCase();
    return (c.name ?? '').toLowerCase().includes(s)
      || (c.phone ?? '').includes(s)
      || (c.email ?? '').toLowerCase().includes(s)
      || (c.company ?? '').toLowerCase().includes(s);
  });

  const score = aiIntel?.score ?? selected?.lead_score ?? 0;
  const scoreColor = score >= 70 ? '#f46b72' : score >= 40 ? '#f4c95d' : '#8790aa';
  const stageIndex = score >= 80 ? 6 : score >= 65 ? 5 : score >= 50 ? 4 : score >= 35 ? 3 : score >= 20 ? 2 : score >= 8 ? 1 : 0;
  const tier = selected?.lead_score_tier;
  const tierColor = tier === 'hot' ? '#f46b72' : tier === 'warm' ? '#f4c95d' : '#8790aa';

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 90px)', gap: 10, overflow: 'hidden' }}>

      {/* ── Contact List ── */}
      <div className="crm-glass" style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
        <div style={{ padding: '14px 12px 10px', borderBottom: '1px solid rgba(130,145,190,0.10)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h1 style={{ fontSize: 15, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Customer 360</h1>
            <button onClick={() => void loadContacts()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}>
              <RefreshCw size={13} />
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.75)', borderRadius: 10, padding: '7px 10px' }}>
            <Search size={12} color="var(--crm-text-muted)" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customers..." style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 12, color: 'var(--crm-text)' }} />
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--crm-text-muted)' }}>{filtered.length} customers</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ height: 56, borderRadius: 10, background: 'rgba(255,255,255,0.35)', marginBottom: 4 }} />
            ))
          ) : filtered.length === 0 ? (
            <div style={{ padding: '30px 16px', textAlign: 'center', color: 'var(--crm-text-muted)', fontSize: 12 }}>
              <Users size={28} style={{ margin: '0 auto 8px', opacity: 0.2 }} />
              No customers found
            </div>
          ) : filtered.map(c => {
            const dot = c.lead_score_tier === 'hot' ? '#f46b72' : c.lead_score_tier === 'warm' ? '#f4c95d' : '#8790aa';
            const isActive = selected?.id === c.id;
            return (
              <button key={c.id} onClick={() => handleSelect(c)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px',
                borderRadius: 11, border: 'none', cursor: 'pointer', textAlign: 'left', marginBottom: 3,
                background: isActive ? 'linear-gradient(135deg,rgba(79,109,245,0.16),rgba(139,92,246,0.10))' : 'rgba(255,255,255,0.40)',
                borderLeft: isActive ? '3px solid #4f6df5' : '3px solid transparent',
              }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {(c.name ?? '?')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--crm-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name ?? 'Unknown'}</div>
                  <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.phone ?? c.email ?? c.company ?? '—'}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: dot }} />
                  {c.lead_score !== null && <span style={{ fontSize: 9, fontWeight: 700, color: dot }}>{c.lead_score}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 360 Detail ── */}
      {!selected ? (
        <div className="crm-glass" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: 'var(--crm-text-muted)' }}>
          <Users size={44} style={{ opacity: 0.15 }} />
          <p style={{ margin: 0, fontSize: 14 }}>Select a customer for their 360° profile</p>
          <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>Conversations · Deals · AI Intelligence · Timeline</p>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', minWidth: 0 }}>

          {/* Profile header */}
          <div className="crm-glass" style={{ padding: '18px 22px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 20, fontWeight: 700, flexShrink: 0 }}>
                {(selected.name ?? '?')[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 750, color: 'var(--crm-text)' }}>{selected.name ?? 'Unknown'}</h2>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
                  {selected.phone && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--crm-text-secondary)' }}><Phone size={11} />{selected.phone}</span>}
                  {selected.email && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--crm-text-secondary)' }}><Mail size={11} />{selected.email}</span>}
                  {selected.company && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--crm-text-secondary)' }}><Building2 size={11} />{selected.company}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={() => void handleAnalyze()} disabled={analyzing} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', color: '#8b5cf6', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  <Brain size={12} />{analyzing ? 'Analyzing...' : 'AI Analyze'}
                </button>
                <Link href="/inbox" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 12, fontWeight: 600 }}>
                  <MessageSquare size={12} /> Message
                </Link>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, flexShrink: 0 }}>
            {[
              { label: 'Lead Score', value: `${score}/100`, color: scoreColor, icon: <Brain size={15} /> },
              { label: 'Status', value: selected.lead_status ?? 'new', color: STATUS_COLORS[selected.lead_status ?? 'new'] ?? '#8790aa', icon: <TrendingUp size={15} /> },
              { label: 'Conversations', value: String(conversations.length), color: '#4d7cff', icon: <MessageSquare size={15} /> },
              { label: 'Last Active', value: timeAgo(selected.last_customer_reply_at), color: '#f4c95d', icon: <Calendar size={15} /> },
            ].map(s => (
              <div key={s.label} className="crm-glass-soft" style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                  <div style={{ color: s.color }}>{s.icon}</div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--crm-text)', textTransform: 'capitalize' }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Journey stage */}
          <div className="crm-glass" style={{ padding: '16px 20px', flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 12 }}>Customer Journey</div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {JOURNEY_STAGES.map((stage, i) => {
                const active = i === stageIndex;
                const done = i < stageIndex;
                return (
                  <div key={stage} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                    {i > 0 && <div style={{ position: 'absolute', left: '-50%', top: 13, width: '100%', height: 2, background: done ? 'linear-gradient(90deg,#4f6df5,#8b5cf6)' : 'rgba(130,145,190,0.18)', zIndex: 0 }} />}
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: active ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : done ? 'rgba(79,109,245,0.28)' : 'rgba(130,145,190,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, boxShadow: active ? '0 0 10px rgba(79,109,245,0.40)' : 'none' }}>
                      {done ? <span style={{ fontSize: 9, color: '#4f6df5' }}>✓</span> : <span style={{ width: 7, height: 7, borderRadius: '50%', background: active ? 'white' : 'rgba(130,145,190,0.35)', display: 'block' }} />}
                    </div>
                    <div style={{ fontSize: 8, fontWeight: 600, color: active ? '#4f6df5' : 'var(--crm-text-muted)', marginTop: 5, textAlign: 'center' }}>{stage}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AI Intelligence */}
          <div className="crm-glass-ai" style={{ padding: '14px 18px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div className="crm-ai-orb" style={{ width: 28, height: 28 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)' }}>AI Intelligence</span>
              {tier && <span style={{ fontSize: 10, fontWeight: 700, color: tierColor, background: `${tierColor}18`, borderRadius: 6, padding: '2px 7px' }}>{tier === 'hot' ? '🔥 Hot' : tier === 'warm' ? '⚡ Warm' : '❄️ Cold'}</span>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 10 }}>
              <div style={{ background: 'rgba(255,255,255,0.45)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Score</div>
                <div style={{ fontSize: 18, fontWeight: 750, color: scoreColor }}>{score}<span style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>/100</span></div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.45)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Intent</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#4f6df5', textTransform: 'capitalize' }}>{aiIntel?.intent ?? (score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low')}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.45)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Sentiment</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#28c99a', textTransform: 'capitalize' }}>{aiIntel?.sentiment ?? 'neutral'}</div>
              </div>
            </div>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--crm-text-secondary)', lineHeight: 1.6 }}>
              {aiIntel?.summary ?? `${selected.name ?? 'This customer'} has a lead score of ${score}/100. ${selected.lead_score_reason ?? (score >= 70 ? 'High buying intent — recommend immediate outreach.' : score >= 40 ? 'Moderate interest — continue nurturing.' : 'Early stage — monitor for engagement signals.')}`}
            </p>
            {(aiIntel?.nba ?? score > 0) && (
              <div style={{ background: 'rgba(79,109,245,0.10)', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={12} color="#4f6df5" />
                <span style={{ fontSize: 11, fontWeight: 600, color: '#4f6df5' }}>
                  {aiIntel?.nba ?? (score >= 70 ? 'Contact immediately — high buying intent' : 'Send a personalized follow-up message')}
                </span>
              </div>
            )}
          </div>

          {/* Attribution Origin */}
          {(selected.source ?? attribution.length > 0) && (
            <div className="crm-glass" style={{ padding: '14px 16px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--crm-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Link2 size={13} color="#4f6df5" /> Attribution
                </div>
                <Link href="/revenue" style={{ fontSize: 10, color: '#4f6df5', fontWeight: 600 }}>Full Dashboard →</Link>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {selected.source && (
                  <div style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(79,109,245,0.08)', border: '1px solid rgba(79,109,245,0.15)' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Source</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#4f6df5', textTransform: 'capitalize' }}>{selected.source}</div>
                  </div>
                )}
                {attribution.length > 0 && (
                  <div style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(40,201,154,0.08)', border: '1px solid rgba(40,201,154,0.15)' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Attribution Records</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#28c99a' }}>{attribution.length} event{attribution.length !== 1 ? 's' : ''}</div>
                  </div>
                )}
                {attribution.some(a => a.is_won) && (
                  <div style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(244,201,93,0.08)', border: '1px solid rgba(244,201,93,0.15)' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Attributed Revenue</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#f4c95d' }}>
                      ${attribution.filter(a => a.is_won).reduce((s, a) => s + (a.revenue_amount ?? 0), 0).toLocaleString()}
                    </div>
                  </div>
                )}
                {attribution[0]?.attribution_method && (
                  <div style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Method</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#8b5cf6', textTransform: 'capitalize' }}>{attribution[0].attribution_method.replace('_', ' ')}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Conversations + Deals row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, flexShrink: 0 }}>
            {/* Conversations */}
            <div className="crm-glass" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 10 }}>Conversations ({conversations.length})</div>
              {detailLoading ? <div style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>Loading...</div>
                : conversations.length === 0 ? <div style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>No conversations yet</div>
                : conversations.slice(0, 4).map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid rgba(130,145,190,0.08)' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: PLATFORM_COLORS[c.platform ?? ''] ?? '#8790aa', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--crm-text)', textTransform: 'capitalize' }}>{c.platform ?? 'unknown'}</div>
                      <div style={{ fontSize: 10, color: 'var(--crm-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.last_message_text ?? 'No messages'}</div>
                    </div>
                    <span style={{ fontSize: 9, color: 'var(--crm-text-muted)', flexShrink: 0 }}>{timeAgo(c.last_message_at)}</span>
                  </div>
                ))
              }
            </div>

            {/* Deals */}
            <div className="crm-glass" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 10 }}>Deals ({deals.length})</div>
              {detailLoading ? <div style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>Loading...</div>
                : deals.length === 0 ? <div style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>No deals yet</div>
                : deals.slice(0, 4).map(d => (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid rgba(130,145,190,0.08)' }}>
                    <DollarSign size={12} color={STATUS_COLORS[d.status ?? 'open'] ?? '#8790aa'} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--crm-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title ?? 'Untitled Deal'}</div>
                      <div style={{ fontSize: 10, color: 'var(--crm-text-muted)', textTransform: 'capitalize' }}>{d.status ?? 'open'}</div>
                    </div>
                    {d.value && <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLORS[d.status ?? 'open'] ?? '#8790aa', flexShrink: 0 }}>{d.currency ?? ''}{d.value.toLocaleString()}</span>}
                  </div>
                ))
              }
            </div>
          </div>

          {/* Activity Timeline */}
          <div className="crm-glass" style={{ padding: '14px 18px', flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 12 }}>Activity Timeline</div>
            {detailLoading ? (
              Array.from({ length: 3 }).map((_, i) => <div key={i} style={{ height: 40, borderRadius: 8, background: 'rgba(255,255,255,0.35)', marginBottom: 8 }} />)
            ) : timeline.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>No activity recorded yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {timeline.map((e, i) => (
                  <div key={e.id} style={{ display: 'flex', gap: 12, position: 'relative' }}>
                    {i < timeline.length - 1 && <div style={{ position: 'absolute', left: 15, top: 32, width: 2, height: 'calc(100% - 8px)', background: 'rgba(130,145,190,0.15)' }} />}
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: `${e.color}18`, border: `1px solid ${e.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0, zIndex: 1 }}>{e.icon}</div>
                    <div style={{ flex: 1, paddingBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--crm-text)' }}>{e.label}</span>
                        <span style={{ fontSize: 10, color: 'var(--crm-text-muted)', flexShrink: 0 }}>{e.time}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 2 }}>{e.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
