'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, Search, Plus, Phone, Mail, Tag, Filter, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { getContacts, createContact, type Contact } from '@/lib/api-client';

const STATUS_COLORS: Record<string, string> = {
  new: '#4d7cff', contacted: '#8b5cf6', qualified: '#28c99a',
  proposal: '#f4c95d', negotiation: '#f46b72', won: '#28c99a', lost: '#8790aa',
};
const STATUS_OPTIONS = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
const SOURCE_OPTIONS = ['website', 'whatsapp', 'instagram', 'facebook', 'referral', 'email', 'cold_call', 'other'];

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 10,
  border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.80)',
  fontSize: 13, color: 'var(--crm-text)', boxSizing: 'border-box', outline: 'none',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600,
  color: 'var(--crm-text-secondary)', marginBottom: 4,
};

function AddContactModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Contact) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [source, setSource] = useState('website');
  const [leadStatus, setLeadStatus] = useState('new');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() && !phone.trim() && !email.trim()) { setError('Enter at least a name, phone, or email.'); return; }
    setSaving(true); setError('');
    try {
      const contact = await createContact({
        name: name.trim() || null, phone: phone.trim() || null,
        email: email.trim() || null, company: company.trim() || null,
        source, lead_status: leadStatus,
        tags: tags.trim() ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      });
      onCreated(contact);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create contact');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="crm-glass" style={{ width: '100%', maxWidth: 500, borderRadius: 18, padding: 26, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 750, color: 'var(--crm-text)' }}>Add Contact</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}><X size={18} /></button>
        </div>
        {error && <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, background: 'rgba(244,107,114,0.10)', border: '1px solid rgba(244,107,114,0.25)', color: '#f46b72', fontSize: 12, marginBottom: 14 }}><AlertCircle size={13} />{error}</div>}
        <form onSubmit={e => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={labelStyle}>Full Name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Rahul Sharma" style={inputStyle} /></div>
            <div><label style={labelStyle}>Phone</label><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" style={inputStyle} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={labelStyle}>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="rahul@example.com" style={inputStyle} /></div>
            <div><label style={labelStyle}>Company</label><input value={company} onChange={e => setCompany(e.target.value)} placeholder="Acme Corp" style={inputStyle} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={labelStyle}>Lead Status</label>
              <select value={leadStatus} onChange={e => setLeadStatus(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
            <div><label style={labelStyle}>Source</label>
              <select value={source} onChange={e => setSource(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {SOURCE_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')}</option>)}
              </select>
            </div>
          </div>
          <div><label style={labelStyle}>Tags <span style={{ fontWeight: 400, color: 'var(--crm-text-muted)' }}>(comma separated)</span></label><input value={tags} onChange={e => setTags(e.target.value)} placeholder="vip, hot-lead, enterprise" style={inputStyle} /></div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 18px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', color: 'var(--crm-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 22px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              <Plus size={14} />{saving ? 'Adding...' : 'Add Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FilterPanel({ statusFilter, setStatusFilter, sourceFilter, setSourceFilter, onClose }: {
  statusFilter: string; setStatusFilter: (v: string) => void;
  sourceFilter: string; setSourceFilter: (v: string) => void; onClose: () => void;
}) {
  return (
    <div className="crm-glass" style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 100, padding: '16px 18px', borderRadius: 14, minWidth: 260, boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)' }}>Filters</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}><X size={14} /></button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ ...labelStyle, marginBottom: 6 }}>Lead Status</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {['all', ...STATUS_OPTIONS].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} style={{ padding: '4px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, textTransform: 'capitalize', background: statusFilter === s ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(255,255,255,0.55)', color: statusFilter === s ? 'white' : 'var(--crm-text-secondary)' }}>{s}</button>
            ))}
          </div>
        </div>
        <div>
          <label style={{ ...labelStyle, marginBottom: 6 }}>Source</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {['all', ...SOURCE_OPTIONS].map(s => (
              <button key={s} onClick={() => setSourceFilter(s)} style={{ padding: '4px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, textTransform: 'capitalize', background: sourceFilter === s ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(255,255,255,0.55)', color: sourceFilter === s ? 'white' : 'var(--crm-text-secondary)' }}>{s.replace('_', ' ')}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [banner, setBanner] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getContacts({ limit: '100' });
      setContacts(res.data);
      setTotal(res.total);
    } catch { /* token expired → api-client redirects to /login */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = contacts.filter(c => {
    const s = search.toLowerCase();
    return (
      ((c.name ?? '').toLowerCase().includes(s) || (c.phone ?? '').includes(s) || (c.email ?? '').toLowerCase().includes(s) || (c.company ?? '').toLowerCase().includes(s)) &&
      (statusFilter === 'all' || c.lead_status === statusFilter) &&
      (sourceFilter === 'all' || c.source === sourceFilter)
    );
  });

  const handleCreated = (contact: Contact) => {
    setContacts(prev => [contact, ...prev]);
    setTotal(prev => prev + 1);
    setShowAdd(false);
    setBanner(`✅ Contact "${contact.name ?? contact.phone ?? contact.email}" added`);
    setTimeout(() => setBanner(null), 3500);
  };

  const activeFilters = (statusFilter !== 'all' ? 1 : 0) + (sourceFilter !== 'all' ? 1 : 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {showAdd && <AddContactModal onClose={() => setShowAdd(false)} onCreated={handleCreated} />}
      {banner && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12, background: 'rgba(40,201,154,0.12)', border: '1px solid rgba(40,201,154,0.30)', color: '#10b981', fontSize: 13, fontWeight: 600 }}>
          <CheckCircle2 size={15} />{banner}
          <button onClick={() => setBanner(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}><X size={13} /></button>
        </div>
      )}
      <div className="crm-page-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Contacts</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crm-text-secondary)' }}>{total.toLocaleString()} total contacts</p>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 12, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={14} /> Add Contact
        </button>
      </div>
      <div style={{ display: 'flex', gap: 10, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(255,255,255,0.80)', borderRadius: 12, padding: '8px 12px', flex: 1, maxWidth: 400 }}>
          <Search size={13} color="var(--crm-text-muted)" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, phone, email..." style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 13, color: 'var(--crm-text)' }} />
          {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}><X size={12} color="var(--crm-text-muted)" /></button>}
        </div>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowFilter(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 12, background: activeFilters > 0 ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.75)', color: activeFilters > 0 ? 'white' : 'var(--crm-text-secondary)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            <Filter size={13} /> Filter{activeFilters > 0 ? ` (${activeFilters})` : ''}
          </button>
          {showFilter && <FilterPanel statusFilter={statusFilter} setStatusFilter={setStatusFilter} sourceFilter={sourceFilter} setSourceFilter={setSourceFilter} onClose={() => setShowFilter(false)} />}
        </div>
      </div>
      <div className="crm-glass" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--crm-text-muted)' }}>Loading contacts...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--crm-text-muted)' }}>
            <Users size={36} style={{ margin: '0 auto 10px', opacity: 0.2 }} />
            <p style={{ margin: '0 0 12px' }}>No contacts found</p>
            <button onClick={() => setShowAdd(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}><Plus size={13} /> Add First Contact</button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(130,145,190,0.12)' }}>
                  {['Name', 'Phone', 'Email', 'Company', 'Status', 'Score', 'Source', 'Tags'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid rgba(130,145,190,0.07)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.20)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{(c.name ?? '?')[0].toUpperCase()}</div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-text)' }}>{c.name ?? 'Unknown'}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--crm-text-secondary)' }}><Phone size={11} />{c.phone ?? '—'}</div></td>
                    <td style={{ padding: '12px 16px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--crm-text-secondary)' }}><Mail size={11} />{c.email ?? '—'}</div></td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--crm-text-secondary)' }}>{c.company ?? '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      {c.lead_status && <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLORS[c.lead_status] ?? '#8790aa', background: `${STATUS_COLORS[c.lead_status] ?? '#8790aa'}18`, borderRadius: 8, padding: '3px 8px', textTransform: 'capitalize' }}>{c.lead_status}</span>}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {c.lead_score != null && <span style={{ fontSize: 12, fontWeight: 700, color: c.lead_score >= 70 ? '#f46b72' : c.lead_score >= 40 ? '#f4c95d' : '#8790aa' }}>{c.lead_score}</span>}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--crm-text-secondary)', textTransform: 'capitalize' }}>{c.source?.replace('_', ' ') ?? '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {(c.tags ?? []).slice(0, 2).map(tag => (
                          <span key={tag} style={{ fontSize: 10, fontWeight: 600, color: '#4f6df5', background: 'rgba(79,109,245,0.10)', borderRadius: 6, padding: '2px 6px' }}><Tag size={8} style={{ display: 'inline', marginRight: 2 }} />{tag}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
