'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, Building2, Edit2, Users, Plug, Calendar, Crown, Globe, Phone, Mail, MapPin, X, Check } from 'lucide-react';
import { v3fetch } from '@/lib/auth-client';

interface CompanyProfile {
  id: string; name: string; plan: string; status: string;
  email: string; phone: string; website: string; industry: string;
  description: string; logo_url: string; address: string;
  created_at: string; active_employees: number; connected_integrations: number;
  owner: { full_name?: string; email?: string; avatar_url?: string };
}

const PLAN_COLOR: Record<string, string> = { free: '#8790aa', starter: '#4f6df5', pro: '#8b5cf6', enterprise: '#f4c95d' };
const STATUS_COLOR: Record<string, string> = { active: '#28c99a', suspended: '#f46b72', trial: '#f4c95d' };

export default function CompanyPage() {
  const [company, setCompany]   = useState<CompanyProfile | null>(null);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(false);
  const [form, setForm]         = useState<Partial<CompanyProfile>>({});
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  const load = () => {
    setLoading(true);
    v3fetch('/api/v3/company').then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setCompany(d); setForm(d); } })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const r = await v3fetch('/api/v3/company', {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name, email: form.email, phone: form.phone,
          website: form.website, industry: form.industry,
          description: form.description, address: form.address,
        }),
      });
      if (r.ok) { setSaved(true); setEditing(false); load(); setTimeout(() => setSaved(false), 3000); }
    } finally { setSaving(false); }
  };

  const field = (key: keyof CompanyProfile) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--crm-text-muted)', fontSize: 13 }}>Loading…</div>
  );

  if (!company) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--crm-text-muted)', fontSize: 13 }}>
      Company profile not available. <button onClick={load} style={{ background: 'none', border: 'none', color: '#4f6df5', cursor: 'pointer', fontSize: 13 }}>Retry</button>
    </div>
  );

  return (
    <div style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Link href="/settings" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--crm-text-muted)', textDecoration: 'none' }}>
        <ChevronLeft size={14} /> Settings
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Company Profile</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crm-text-muted)' }}>Manage your workspace and company details</p>
        </div>
        <button onClick={() => setEditing(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 10, background: '#4f6df5', border: 'none', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <Edit2 size={14} /> Edit Profile
        </button>
      </div>

      {saved && (
        <div style={{ padding: '10px 16px', borderRadius: 10, background: 'rgba(40,201,154,0.10)', border: '1px solid rgba(40,201,154,0.25)', color: '#28c99a', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Check size={14} /> Company profile updated successfully.
        </div>
      )}

      {/* Company card */}
      <div className="crm-glass" style={{ padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, marginBottom: 24 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: 'rgba(79,109,245,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
            {company.logo_url
              ? <img src={company.logo_url} alt="logo" style={{ width: 64, height: 64, objectFit: 'cover' }} />
              : <Building2 size={28} color="#4f6df5" />}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 750, color: 'var(--crm-text)' }}>{company.name}</h2>
              <span style={{ padding: '3px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, background: `${PLAN_COLOR[company.plan] || '#8790aa'}15`, color: PLAN_COLOR[company.plan] || '#8790aa', textTransform: 'capitalize' }}>{company.plan}</span>
              <span style={{ padding: '3px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, background: `${STATUS_COLOR[company.status] || '#8790aa'}15`, color: STATUS_COLOR[company.status] || '#8790aa', textTransform: 'capitalize' }}>{company.status}</span>
            </div>
            {company.industry && <div style={{ fontSize: 13, color: 'var(--crm-text-muted)', marginTop: 4 }}>{company.industry}</div>}
            {company.description && <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', marginTop: 6, lineHeight: 1.5 }}>{company.description}</div>}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { icon: <Users size={15} />, label: 'Active Employees', value: company.active_employees, color: '#4f6df5' },
            { icon: <Plug size={15} />, label: 'Integrations', value: company.connected_integrations, color: '#28c99a' },
            { icon: <Calendar size={15} />, label: 'Member Since', value: company.created_at ? new Date(company.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—', color: '#8b5cf6' },
          ].map(s => (
            <div key={s.label} style={{ padding: '14px 16px', borderRadius: 12, background: `${s.color}08`, border: `1px solid ${s.color}20`, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ color: s.color }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 750, color: 'var(--crm-text)' }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Details grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {[
            { icon: <Crown size={13} />, label: 'Company Owner', value: company.owner?.full_name || company.owner?.email || '—' },
            { icon: <Building2 size={13} />, label: 'Company ID', value: company.id, mono: true },
            { icon: <Mail size={13} />, label: 'Contact Email', value: company.email || '—' },
            { icon: <Phone size={13} />, label: 'Phone', value: company.phone || '—' },
            { icon: <Globe size={13} />, label: 'Website', value: company.website || '—' },
            { icon: <MapPin size={13} />, label: 'Address', value: company.address || '—' },
          ].map(d => (
            <div key={d.label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ color: 'var(--crm-text-muted)', marginTop: 2, flexShrink: 0 }}>{d.icon}</div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{d.label}</div>
                <div style={{ fontSize: 12, color: 'var(--crm-text)', fontFamily: d.mono ? 'monospace' : undefined, wordBreak: 'break-all' }}>{d.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {[
          { href: '/settings/team', label: 'Manage Team', icon: <Users size={15} />, color: '#4f6df5' },
          { href: '/settings/team-requests', label: 'Invitations & Requests', icon: <Mail size={15} />, color: '#28c99a' },
          { href: '/settings/integrations', label: 'Manage Integrations', icon: <Plug size={15} />, color: '#8b5cf6' },
        ].map(a => (
          <Link key={a.href} href={a.href}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderRadius: 12, background: `${a.color}08`, border: `1px solid ${a.color}20`, textDecoration: 'none', color: a.color, fontSize: 13, fontWeight: 600 }}>
            {a.icon} {a.label}
          </Link>
        ))}
      </div>

      {/* Edit Modal */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="crm-glass" style={{ width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto', borderRadius: 18, padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 750, color: 'var(--crm-text)' }}>Edit Company Profile</h2>
              <button onClick={() => setEditing(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { key: 'name' as const, label: 'Company Name', ph: 'Acme Corp' },
                { key: 'email' as const, label: 'Contact Email', ph: 'hello@company.com' },
                { key: 'phone' as const, label: 'Phone', ph: '+1 555 000 0000' },
                { key: 'website' as const, label: 'Website', ph: 'https://company.com' },
                { key: 'industry' as const, label: 'Industry', ph: 'SaaS / Technology' },
                { key: 'address' as const, label: 'Address', ph: '123 Main St, City' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{f.label}</label>
                  <input value={(form[f.key] as string) ?? ''} onChange={field(f.key)} placeholder={f.ph}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid rgba(130,145,190,0.20)', background: 'rgba(255,255,255,0.05)', color: 'var(--crm-text)', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Description</label>
                <textarea value={(form.description as string) ?? ''} onChange={field('description')} rows={3} placeholder="Brief company description"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid rgba(130,145,190,0.20)', background: 'rgba(255,255,255,0.05)', color: 'var(--crm-text)', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }} />
              </div>
              <button onClick={handleSave} disabled={saving}
                style={{ padding: '11px', borderRadius: 10, background: '#4f6df5', border: 'none', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1, marginTop: 4 }}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
