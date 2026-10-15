'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { User, ChevronLeft, CheckCircle2, AlertCircle, X, Camera } from 'lucide-react';
import Link from 'next/link';

function Banner({ type, text, onClose }: { type: 'success' | 'error'; text: string; onClose: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      padding: '10px 14px', borderRadius: 12,
      background: type === 'success' ? 'rgba(40,201,154,0.12)' : 'rgba(244,107,114,0.12)',
      border: `1px solid ${type === 'success' ? 'rgba(40,201,154,0.30)' : 'rgba(244,107,114,0.30)'}`,
      color: type === 'success' ? '#10b981' : '#f46b72', fontSize: 13, fontWeight: 600,
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
        {text}
      </span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
        <X size={14} />
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 10,
  border: '1px solid rgba(130,145,190,0.25)', background: 'white',
  fontSize: 13, color: 'var(--crm-text)', boxSizing: 'border-box', outline: 'none',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600,
  color: 'var(--crm-text-secondary)', marginBottom: 4,
};

const TIMEZONES = [
  'UTC','America/New_York','America/Chicago','America/Denver','America/Los_Angeles',
  'Europe/London','Europe/Paris','Europe/Berlin','Asia/Kolkata','Asia/Dubai',
  'Asia/Singapore','Asia/Tokyo','Australia/Sydney',
];
const LANGUAGES = [
  { value: 'en', label: 'English' }, { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },  { value: 'de', label: 'German' },
  { value: 'ar', label: 'Arabic' },  { value: 'hi', label: 'Hindi' },
  { value: 'pt', label: 'Portuguese' },
];

export default function ProfilePage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [language, setLanguage] = useState('en');
  const [userId, setUserId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setEmail(user.email ?? '');
    setUserId(user.id);
    const { data: profile } = await supabase
      .from('profiles').select('full_name, role, timezone, language')
      .eq('user_id', user.id).maybeSingle();
    if (profile) {
      setFullName(profile.full_name ?? '');
      setRole(profile.role ?? '');
      setTimezone(profile.timezone ?? 'UTC');
      setLanguage(profile.language ?? 'en');
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setBanner(null);
    try {
      const { error } = await supabase.from('profiles')
        .update({ full_name: fullName.trim(), timezone, language })
        .eq('user_id', userId);
      if (error) setBanner({ type: 'error', text: error.message });
      else setBanner({ type: 'success', text: 'Profile updated successfully.' });
    } catch (err) {
      setBanner({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save.' });
    } finally { setSaving(false); }
  };

  const initials = fullName.trim()
    ? fullName.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : (email[0]?.toUpperCase() ?? '?');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 600 }}>
      <Link href="/settings" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--crm-text-muted)', textDecoration: 'none', fontWeight: 500, width: 'fit-content' }}>
        <ChevronLeft size={16} /> Settings
      </Link>

      <div>
        <h1 style={{ fontSize: 24, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Profile</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crm-text-secondary)' }}>Your personal information and preferences</p>
      </div>

      {banner && <Banner type={banner.type} text={banner.text} onClose={() => setBanner(null)} />}

      {loading ? (
        <div className="crm-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--crm-text-muted)' }}>Loading profile...</div>
      ) : (
        <form onSubmit={e => void handleSave(e)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Avatar card */}
          <div className="crm-glass" style={{ padding: 20, borderRadius: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{ position: 'relative' }}>
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 24, fontWeight: 700 }}>
                  {initials}
                </div>
                <div style={{ position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: '50%', background: 'white', border: '2px solid rgba(130,145,190,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--crm-text-muted)' }}>
                  <Camera size={11} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--crm-text)' }}>{fullName || email}</div>
                <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', marginTop: 2 }}>{email}</div>
                {role && <span style={{ fontSize: 11, fontWeight: 700, color: '#4f6df5', background: 'rgba(79,109,245,0.10)', borderRadius: 7, padding: '2px 8px', marginTop: 6, display: 'inline-block', textTransform: 'capitalize' }}>{role}</span>}
              </div>
            </div>
          </div>

          {/* Personal info */}
          <div className="crm-glass" style={{ padding: 20, borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Personal Info</div>
            <div>
              <label style={labelStyle}>Full Name</label>
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Email Address</label>
              <input type="email" value={email} disabled style={{ ...inputStyle, background: 'rgba(130,145,190,0.06)', color: 'var(--crm-text-muted)', cursor: 'not-allowed' }} />
              <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 4 }}>Managed by Supabase Auth — cannot be changed here.</div>
            </div>
            <div>
              <label style={labelStyle}>Role</label>
              <input type="text" value={role} disabled style={{ ...inputStyle, background: 'rgba(130,145,190,0.06)', color: 'var(--crm-text-muted)', cursor: 'not-allowed', textTransform: 'capitalize' }} />
              <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 4 }}>Assigned by your account owner.</div>
            </div>
          </div>

          {/* Preferences */}
          <div className="crm-glass" style={{ padding: 20, borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Preferences</div>
            <div>
              <label style={labelStyle}>Timezone</label>
              <select value={timezone} onChange={e => setTimezone(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Language</label>
              <select value={language} onChange={e => setLanguage(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 22px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              <User size={14} /> {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
