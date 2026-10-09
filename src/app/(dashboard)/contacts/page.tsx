'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, Search, Plus, Phone, Mail, Tag, Filter } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Contact {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  lead_status: string | null;
  lead_score: number | null;
  lead_score_tier: string | null;
  source: string | null;
  tags: string[] | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  new: '#4d7cff', contacted: '#8b5cf6', qualified: '#28c99a',
  proposal: '#f4c95d', negotiation: '#f46b72', won: '#28c99a', lost: '#8790aa',
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, count } = await supabase.from('contacts').select('*', { count: 'exact' }).order('created_at', { ascending: false }).limit(100);
    setContacts((data as Contact[]) ?? []);
    setTotal(count ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = contacts.filter(c => {
    const s = search.toLowerCase();
    return (c.name ?? '').toLowerCase().includes(s) || (c.phone ?? '').includes(s) || (c.email ?? '').toLowerCase().includes(s) || (c.company ?? '').toLowerCase().includes(s);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="crm-page-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Contacts</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crm-text-secondary)' }}>{total.toLocaleString()} total contacts</p>
        </div>
        <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 12, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={14} /> Add Contact
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(255,255,255,0.80)', borderRadius: 12, padding: '8px 12px', flex: 1, maxWidth: 400 }}>
          <Search size={13} color="var(--crm-text-muted)" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, phone, email..." style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 13, color: 'var(--crm-text)' }} />
        </div>
        <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.75)', color: 'var(--crm-text-secondary)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          <Filter size={13} /> Filter
        </button>
      </div>

      <div className="crm-glass" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--crm-text-muted)' }}>Loading contacts...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--crm-text-muted)' }}>
            <Users size={36} style={{ margin: '0 auto 10px', opacity: 0.2 }} />
            <p style={{ margin: 0 }}>No contacts found</p>
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
                  <tr key={c.id} style={{ borderBottom: '1px solid rgba(130,145,190,0.07)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.20)', transition: 'background 150ms' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                          {(c.name ?? '?')[0].toUpperCase()}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-text)' }}>{c.name ?? 'Unknown'}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--crm-text-secondary)' }}>
                        <Phone size={11} />{c.phone ?? '—'}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--crm-text-secondary)' }}>
                        <Mail size={11} />{c.email ?? '—'}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--crm-text-secondary)' }}>{c.company ?? '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      {c.lead_status && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLORS[c.lead_status] ?? '#8790aa', background: `${STATUS_COLORS[c.lead_status] ?? '#8790aa'}18`, borderRadius: 8, padding: '3px 8px', textTransform: 'capitalize' }}>
                          {c.lead_status}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {c.lead_score != null && (
                        <span style={{ fontSize: 12, fontWeight: 700, color: c.lead_score >= 70 ? '#f46b72' : c.lead_score >= 40 ? '#f4c95d' : '#8790aa' }}>
                          {c.lead_score}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--crm-text-secondary)' }}>{c.source ?? '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {(c.tags ?? []).slice(0, 2).map(tag => (
                          <span key={tag} style={{ fontSize: 10, fontWeight: 600, color: '#4f6df5', background: 'rgba(79,109,245,0.10)', borderRadius: 6, padding: '2px 6px' }}>
                            <Tag size={8} style={{ display: 'inline', marginRight: 2 }} />{tag}
                          </span>
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
