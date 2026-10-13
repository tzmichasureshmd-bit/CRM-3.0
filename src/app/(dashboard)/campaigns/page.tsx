'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Megaphone, Plus, Search, X, CheckCircle2, AlertCircle,
  Smartphone, AtSign, Mail, MessageSquare, Rss,
  BarChart3, Clock, CheckCheck, Send, Trash2, ExternalLink,
} from 'lucide-react';
import Link from 'next/link';

interface Campaign {
  id: string;
  name: string;
  status: string;
  platform: string | null;
  created_at: string;
}

interface CampaignCreate {
  name: string;
  platform: string;
  status: string;
}

const STATUS_META: Record<string, { color: string; label: string }> = {
  draft:     { color: '#8790aa', label: 'Draft' },
  active:    { color: '#4d7cff', label: 'Active' },
  paused:    { color: '#f4c95d', label: 'Paused' },
  completed: { color: '#28c99a', label: 'Completed' },
  archived:  { color: '#8790aa', label: 'Archived' },
};

const PLATFORM_META: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  whatsapp:  { color: '#25D366', icon: <Smartphone size={14} />, label: 'WhatsApp' },
  instagram: { color: '#E1306C', icon: <AtSign size={14} />,     label: 'Instagram' },
  facebook:  { color: '#1877F2', icon: <MessageSquare size={14} />, label: 'Facebook' },
  email:     { color: '#8b5cf6', icon: <Mail size={14} />,        label: 'Email' },
  sms:       { color: '#f4c95d', icon: <Send size={14} />,        label: 'SMS' },
  all:       { color: '#4f6df5', icon: <Rss size={14} />,         label: 'All Channels' },
};

const STATUS_FILTERS = ['all', 'draft', 'active', 'paused', 'completed'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selected, setSelected] = useState<Campaign | null>(null);

  // Create modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPlatform, setNewPlatform] = useState('whatsapp');
  const [newStatus, setNewStatus] = useState('draft');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    setCampaigns((data as Campaign[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  const filtered = campaigns.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (!search.trim()) return true;
    return c.name.toLowerCase().includes(search.toLowerCase());
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!newName.trim()) { setFormError('Campaign name is required.'); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles').select('account_id').eq('user_id', user?.id ?? '').maybeSingle();

      const payload: CampaignCreate & { account_id?: string } = {
        name: newName.trim(),
        platform: newPlatform,
        status: newStatus,
      };
      if (profile?.account_id) payload.account_id = profile.account_id;

      const { data, error } = await supabase.from('campaigns').insert(payload).select('*').single();
      if (error) { setFormError(error.message); return; }
      setCampaigns(prev => [data as Campaign, ...prev]);
      setIsModalOpen(false);
      setNewName(''); setNewPlatform('whatsapp'); setNewStatus('draft');
      setBanner({ type: 'success', text: `Campaign "${(data as Campaign).name}" created.` });
      setTimeout(() => setBanner(null), 3000);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create campaign.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete campaign "${name}"?`)) return;
    await supabase.from('campaigns').delete().eq('id', id);
    setCampaigns(prev => prev.filter(c => c.id !== id));
    if (selected?.id === id) setSelected(null);
    setBanner({ type: 'success', text: `Campaign "${name}" deleted.` });
    setTimeout(() => setBanner(null), 3000);
  };

  const handleStatusChange = async (id: string, status: string) => {
    setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status } : c));
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status } : null);
    await supabase.from('campaigns').update({ status }).eq('id', id);
  };

  // KPI counts
  const total = campaigns.length;
  const active = campaigns.filter(c => c.status === 'active').length;
  const completed = campaigns.filter(c => c.status === 'completed').length;
  const draft = campaigns.filter(c => c.status === 'draft').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Banner */}
      {banner && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '10px 14px', borderRadius: 12,
          background: banner.type === 'success' ? 'rgba(40,201,154,0.12)' : 'rgba(244,107,114,0.12)',
          border: `1px solid ${banner.type === 'success' ? 'rgba(40,201,154,0.30)' : 'rgba(244,107,114,0.30)'}`,
          color: banner.type === 'success' ? '#10b981' : '#f46b72', fontSize: 13, fontWeight: 600,
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {banner.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            {banner.text}
          </span>
          <button onClick={() => setBanner(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}><X size={14} /></button>
        </div>
      )}

      {/* Header */}
      <div className="crm-page-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Campaigns</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crm-text-secondary)' }}>
            Manage multi-channel marketing campaigns
          </p>
        </div>
        <button
          onClick={() => { setIsModalOpen(true); setFormError(null); setNewName(''); setNewPlatform('whatsapp'); setNewStatus('draft'); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 12, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 14px rgba(79,109,245,0.25)' }}
        >
          <Plus size={14} /> New Campaign
        </button>
      </div>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
        {[
          { label: 'Total', value: total, color: '#4f6df5', icon: <Megaphone size={16} /> },
          { label: 'Active', value: active, color: '#28c99a', icon: <Send size={16} /> },
          { label: 'Completed', value: completed, color: '#8b5cf6', icon: <CheckCheck size={16} /> },
          { label: 'Drafts', value: draft, color: '#8790aa', icon: <Clock size={16} /> },
        ].map(k => (
          <div key={k.label} className="crm-glass-soft" style={{ padding: '12px 16px', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${k.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: k.color, flexShrink: 0 }}>{k.icon}</div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 750, color: 'var(--crm-text)', lineHeight: 1 }}>{k.value}</div>
              <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 2 }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Search + Filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(130,145,190,0.22)', borderRadius: 12, padding: '7px 12px', minWidth: 260 }}>
          <Search size={14} color="var(--crm-text-muted)" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search campaigns..."
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 13, color: 'var(--crm-text)' }}
          />
          {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}><X size={13} color="var(--crm-text-muted)" /></button>}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {STATUS_FILTERS.map(f => (
            <button key={f} onClick={() => setStatusFilter(f)} style={{
              padding: '6px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, textTransform: 'capitalize',
              background: statusFilter === f ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(255,255,255,0.55)',
              color: statusFilter === f ? 'white' : 'var(--crm-text-secondary)',
            }}>{f}</button>
          ))}
        </div>
      </div>

      {/* Main layout: list + detail */}
      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 360px' : '1fr', gap: 12 }}>

        {/* Campaign List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading ? (
            <div className="crm-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--crm-text-muted)' }}>Loading campaigns...</div>
          ) : filtered.length === 0 ? (
            <div className="crm-glass" style={{ padding: 48, textAlign: 'center', color: 'var(--crm-text-muted)' }}>
              <Megaphone size={36} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
              <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>
                {search || statusFilter !== 'all' ? 'No campaigns match your filters' : 'No campaigns yet'}
              </p>
              {!search && statusFilter === 'all' && (
                <button
                  onClick={() => setIsModalOpen(true)}
                  style={{ padding: '8px 18px', borderRadius: 10, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  Create First Campaign
                </button>
              )}
            </div>
          ) : filtered.map(c => {
            const sm = STATUS_META[c.status] ?? STATUS_META.draft;
            const pm = PLATFORM_META[c.platform ?? 'all'] ?? PLATFORM_META.all;
            const isSelected = selected?.id === c.id;
            return (
              <div
                key={c.id}
                onClick={() => setSelected(isSelected ? null : c)}
                className="crm-glass-soft"
                style={{
                  padding: '14px 18px', borderRadius: 14, cursor: 'pointer',
                  border: isSelected ? '1.5px solid rgba(79,109,245,0.40)' : '1px solid rgba(130,145,190,0.14)',
                  transition: 'all 120ms ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: `${pm.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: pm.color, flexShrink: 0 }}>
                    {pm.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--crm-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', marginTop: 2 }}>
                      {pm.label} · {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: sm.color, background: `${sm.color}15`, borderRadius: 8, padding: '3px 8px' }}>
                      {sm.label}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); void handleDelete(c.id, c.name); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail Panel */}
        {selected && (() => {
          const sm = STATUS_META[selected.status] ?? STATUS_META.draft;
          const pm = PLATFORM_META[selected.platform ?? 'all'] ?? PLATFORM_META.all;
          return (
            <div className="crm-glass" style={{ padding: '20px', borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 16, alignSelf: 'start', position: 'sticky', top: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text)' }}>Campaign Details</div>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}><X size={16} /></button>
              </div>

              {/* Icon + name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: `${pm.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: pm.color, flexShrink: 0 }}>
                  {pm.icon}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--crm-text)' }}>{selected.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', marginTop: 2 }}>{pm.label}</div>
                </div>
              </div>

              {/* Status badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: sm.color, background: `${sm.color}15`, borderRadius: 8, padding: '4px 10px' }}>{sm.label}</span>
                <span style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>
                  Created {new Date(selected.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>

              {/* Change status */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Change Status</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {Object.entries(STATUS_META).map(([key, meta]) => (
                    <button
                      key={key}
                      onClick={() => void handleStatusChange(selected.id, key)}
                      style={{
                        padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                        background: selected.status === key ? `${meta.color}20` : 'rgba(255,255,255,0.55)',
                        color: selected.status === key ? meta.color : 'var(--crm-text-secondary)',
                        outline: selected.status === key ? `1.5px solid ${meta.color}` : 'none',
                      }}
                    >{meta.label}</button>
                  ))}
                </div>
              </div>

              {/* Performance placeholder */}
              <div style={{ background: 'rgba(130,145,190,0.06)', borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Performance</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { label: 'Recipients', value: '—' },
                    { label: 'Delivered', value: '—' },
                    { label: 'Read Rate', value: '—' },
                    { label: 'Conversions', value: '—' },
                  ].map(s => (
                    <div key={s.label} style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.50)', borderRadius: 8, textAlign: 'center' }}>
                      <div style={{ fontSize: 16, fontWeight: 750, color: 'var(--crm-text)' }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: 'var(--crm-text-muted)', marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 10, textAlign: 'center' }}>
                  Stats available after campaign is sent
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Link
                  href="/content-studio"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', borderRadius: 10, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}
                >
                  <BarChart3 size={13} /> Create Content <ExternalLink size={12} />
                </Link>
                <button
                  onClick={() => void handleDelete(selected.id, selected.name)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', borderRadius: 10, background: 'rgba(244,107,114,0.10)', border: '1px solid rgba(244,107,114,0.25)', color: '#f46b72', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  <Trash2 size={13} /> Delete Campaign
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Create Campaign Modal */}
      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.40)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="crm-glass" style={{ width: '100%', maxWidth: 440, borderRadius: 16, padding: 24, boxShadow: '0 20px 50px rgba(0,0,0,0.20)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--crm-text)' }}>New Campaign</h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}><X size={18} /></button>
            </div>

            <form onSubmit={e => void handleCreate(e)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {formError && (
                <div style={{ padding: '9px 12px', borderRadius: 10, background: 'rgba(244,107,114,0.12)', border: '1px solid rgba(244,107,114,0.28)', color: '#f46b72', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertCircle size={14} />{formError}
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Campaign Name *</label>
                <input
                  type="text" required placeholder="e.g. Summer Sale WhatsApp Blast"
                  value={newName} onChange={e => setNewName(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'white', fontSize: 13, color: 'var(--crm-text)', boxSizing: 'border-box', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Platform</label>
                  <select value={newPlatform} onChange={e => setNewPlatform(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'white', fontSize: 13, color: 'var(--crm-text)', boxSizing: 'border-box', outline: 'none' }}>
                    {Object.entries(PLATFORM_META).map(([key, meta]) => (
                      <option key={key} value={key}>{meta.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Status</label>
                  <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'white', fontSize: 13, color: 'var(--crm-text)', boxSizing: 'border-box', outline: 'none' }}>
                    {Object.entries(STATUS_META).map(([key, meta]) => (
                      <option key={key} value={key}>{meta.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(79,109,245,0.06)', border: '1px solid rgba(79,109,245,0.15)', fontSize: 12, color: 'var(--crm-text-secondary)' }}>
                💡 After creating, go to <strong>Content Studio</strong> to generate AI content for this campaign.
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                <button type="button" onClick={() => setIsModalOpen(false)}
                  style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'white', color: 'var(--crm-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  style={{ padding: '8px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Creating...' : 'Create Campaign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
