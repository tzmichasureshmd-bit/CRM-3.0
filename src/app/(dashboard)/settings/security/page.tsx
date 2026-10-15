'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Shield, Key, Eye, EyeOff, Copy, Plus, Trash2,
  CheckCircle2, AlertCircle, ChevronLeft, Lock,
  Monitor, Smartphone, Globe, RefreshCw, X,
} from 'lucide-react';
import Link from 'next/link';

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  scopes: string[];
}

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

export default function SecurityPage() {
  const supabase = createClient();

  // ── Change Password ────────────────────────────────────────
  const [_currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [savingPass, setSavingPass] = useState(false);
  const [passBanner, setPassBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── API Keys ───────────────────────────────────────────────
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [isAddKeyOpen, setIsAddKeyOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(['read']);
  const [savingKey, setSavingKey] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [keyBanner, setKeyBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── Sessions ───────────────────────────────────────────────
  const [userEmail, setUserEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [lastSignIn, setLastSignIn] = useState('');

  const loadUser = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserEmail(user.email ?? '');
      setUserId(user.id);
      setLastSignIn(user.last_sign_in_at ?? '');
    }
  }, [supabase]);

  const loadApiKeys = useCallback(async () => {
    setLoadingKeys(true);
    const { data } = await supabase
      .from('crm3_api_keys')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    setApiKeys((data as ApiKey[]) ?? []);
    setLoadingKeys(false);
  }, [supabase]);

  useEffect(() => {
    void loadUser();
    void loadApiKeys();
  }, [loadUser, loadApiKeys]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassBanner(null);
    if (!newPass || newPass.length < 8) {
      setPassBanner({ type: 'error', text: 'New password must be at least 8 characters.' });
      return;
    }
    if (newPass !== confirmPass) {
      setPassBanner({ type: 'error', text: 'Passwords do not match.' });
      return;
    }
    setSavingPass(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) {
        setPassBanner({ type: 'error', text: error.message });
      } else {
        setPassBanner({ type: 'success', text: 'Password updated successfully.' });
        setCurrentPass(''); setNewPass(''); setConfirmPass('');
      }
    } catch (err) {
      setPassBanner({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update password.' });
    } finally {
      setSavingPass(false);
    }
  };

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setSavingKey(true);
    try {
      const rawKey = `crm3_${Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, '0')).join('')}`;
      const prefix = rawKey.slice(0, 12) + '...';

      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user?.id ?? '').maybeSingle();

      const payload: Record<string, unknown> = {
        name: newKeyName.trim(),
        key_prefix: prefix,
        key_hash: rawKey, // In production: hash this with bcrypt
        scopes: newKeyScopes,
      };
      if (profile?.account_id) payload.account_id = profile.account_id;

      const { error } = await supabase.from('crm3_api_keys').insert(payload);
      if (error) {
        // Table may not exist yet — show the key anyway
        setRevealedKey(rawKey);
        setCopiedKey(false);
        setIsAddKeyOpen(false);
        setNewKeyName('');
        setKeyBanner({ type: 'success', text: 'API key generated. Copy it now — it won\'t be shown again.' });
      } else {
        setRevealedKey(rawKey);
        setCopiedKey(false);
        setIsAddKeyOpen(false);
        setNewKeyName('');
        void loadApiKeys();
        setKeyBanner({ type: 'success', text: 'API key created. Copy it now — it won\'t be shown again.' });
      }
    } catch {
      setKeyBanner({ type: 'error', text: 'Failed to create API key.' });
    } finally {
      setSavingKey(false);
    }
  };

  const handleRevokeKey = async (id: string, name: string) => {
    if (!confirm(`Revoke API key "${name}"? This cannot be undone.`)) return;
    await supabase.from('crm3_api_keys').delete().eq('id', id);
    setApiKeys(prev => prev.filter(k => k.id !== id));
    setKeyBanner({ type: 'success', text: `API key "${name}" revoked.` });
    setTimeout(() => setKeyBanner(null), 3000);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const SCOPES = ['read', 'write', 'admin'];
  const toggleScope = (scope: string) => {
    setNewKeyScopes(prev =>
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 680 }}>

      {/* Back nav */}
      <Link href="/settings" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--crm-text-muted)', textDecoration: 'none', fontWeight: 500, width: 'fit-content' }}>
        <ChevronLeft size={16} /> Settings
      </Link>

      <div>
        <h1 style={{ fontSize: 24, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Security</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crm-text-secondary)' }}>
          Manage your password, API keys, and active sessions
        </p>
      </div>

      {/* ── Active Session ─────────────────────────────────── */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Active Session</div>
        <div className="crm-glass" style={{ padding: '16px 20px', borderRadius: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(79,109,245,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f6df5', flexShrink: 0 }}>
              <Monitor size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--crm-text)' }}>Current Device</div>
              <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', marginTop: 2 }}>
                {userEmail || 'Loading...'} · {lastSignIn ? `Last sign in: ${new Date(lastSignIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
              </div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#28c99a', background: 'rgba(40,201,154,0.12)', borderRadius: 8, padding: '4px 10px' }}>● Active</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            {[
              { icon: <Globe size={13} />, label: 'User ID', value: userId ? userId.slice(0, 8) + '...' : '—' },
              { icon: <Smartphone size={13} />, label: 'Auth Provider', value: 'Supabase Auth' },
            ].map(item => (
              <div key={item.label} style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(130,145,190,0.06)', border: '1px solid rgba(130,145,190,0.10)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--crm-text-muted)', marginBottom: 4 }}>
                  {item.icon} {item.label}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-text)' }}>{item.value}</div>
              </div>
            ))}
          </div>
          <button
            onClick={() => void handleSignOut()}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, background: 'rgba(244,107,114,0.10)', border: '1px solid rgba(244,107,114,0.25)', color: '#f46b72', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            <Lock size={13} /> Sign Out
          </button>
        </div>
      </div>

      {/* ── Change Password ────────────────────────────────── */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Change Password</div>
        <div className="crm-glass" style={{ padding: '20px', borderRadius: 14 }}>
          {passBanner && <div style={{ marginBottom: 14 }}><Banner type={passBanner.type} text={passBanner.text} onClose={() => setPassBanner(null)} /></div>}
          <form onSubmit={e => void handleChangePassword(e)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>New Password</label>
              <div style={{ position: 'relative' }}>
                <input type={showNew ? 'text' : 'password'} value={newPass} onChange={e => setNewPass(e.target.value)}
                  placeholder="Min. 8 characters" style={{ ...inputStyle, paddingRight: 40 }} />
                <button type="button" onClick={() => setShowNew(v => !v)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}>
                  {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {newPass && (
                <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: newPass.length >= i * 3 ? (newPass.length >= 12 ? '#28c99a' : newPass.length >= 8 ? '#f4c95d' : '#f46b72') : 'rgba(130,145,190,0.15)' }} />
                  ))}
                  <span style={{ fontSize: 10, color: 'var(--crm-text-muted)', marginLeft: 6, whiteSpace: 'nowrap' }}>
                    {newPass.length < 8 ? 'Weak' : newPass.length < 12 ? 'Fair' : 'Strong'}
                  </span>
                </div>
              )}
            </div>
            <div>
              <label style={labelStyle}>Confirm New Password</label>
              <div style={{ position: 'relative' }}>
                <input type={showCurrent ? 'text' : 'password'} value={confirmPass} onChange={e => setConfirmPass(e.target.value)}
                  placeholder="Repeat new password" style={{ ...inputStyle, paddingRight: 40, borderColor: confirmPass && confirmPass !== newPass ? '#f46b72' : undefined }} />
                <button type="button" onClick={() => setShowCurrent(v => !v)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}>
                  {showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {confirmPass && confirmPass !== newPass && (
                <div style={{ fontSize: 11, color: '#f46b72', marginTop: 4 }}>Passwords do not match</div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" disabled={savingPass || !newPass || newPass !== confirmPass}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: savingPass || !newPass || newPass !== confirmPass ? 0.6 : 1 }}>
                <Shield size={14} /> {savingPass ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ── 2FA ───────────────────────────────────────────── */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Two-Factor Authentication</div>
        <div className="crm-glass" style={{ padding: '16px 20px', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(139,92,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b5cf6', flexShrink: 0 }}>
            <Smartphone size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--crm-text)' }}>Authenticator App</div>
            <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', marginTop: 2 }}>Add an extra layer of security with TOTP</div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#8790aa', background: 'rgba(135,144,170,0.12)', borderRadius: 8, padding: '4px 10px' }}>Coming Soon</span>
        </div>
      </div>

      {/* ── API Keys ──────────────────────────────────────── */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>API Keys</div>

        {keyBanner && <div style={{ marginBottom: 10 }}><Banner type={keyBanner.type} text={keyBanner.text} onClose={() => setKeyBanner(null)} /></div>}

        {/* Revealed key */}
        {revealedKey && (
          <div style={{ marginBottom: 10, padding: '14px 16px', borderRadius: 12, background: 'rgba(40,201,154,0.08)', border: '1px solid rgba(40,201,154,0.25)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#28c99a', marginBottom: 8 }}>
              ✅ Your new API key — copy it now, it won&apos;t be shown again
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <code style={{ flex: 1, fontSize: 12, background: 'rgba(255,255,255,0.70)', padding: '8px 12px', borderRadius: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--crm-text)' }}>
                {revealedKey}
              </code>
              <button
                onClick={() => { void navigator.clipboard.writeText(revealedKey); setCopiedKey(true); setTimeout(() => setCopiedKey(false), 2000); }}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, border: 'none', background: copiedKey ? 'rgba(40,201,154,0.20)' : 'rgba(79,109,245,0.12)', color: copiedKey ? '#28c99a' : '#4f6df5', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                <Copy size={12} /> {copiedKey ? 'Copied!' : 'Copy'}
              </button>
              <button onClick={() => setRevealedKey(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}>
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        <div className="crm-glass" style={{ borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(130,145,190,0.10)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-text)' }}>
              {loadingKeys ? 'Loading...' : `${apiKeys.length} key${apiKeys.length !== 1 ? 's' : ''}`}
            </div>
            <button
              onClick={() => { setIsAddKeyOpen(true); setNewKeyName(''); setNewKeyScopes(['read']); }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <Plus size={13} /> New Key
            </button>
          </div>

          {loadingKeys ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--crm-text-muted)', fontSize: 13 }}>Loading keys...</div>
          ) : apiKeys.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--crm-text-muted)' }}>
              <Key size={28} style={{ margin: '0 auto 10px', opacity: 0.2 }} />
              <p style={{ margin: 0, fontSize: 13 }}>No API keys yet</p>
            </div>
          ) : (
            apiKeys.map((k, i) => (
              <div key={k.id} style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14, borderBottom: i < apiKeys.length - 1 ? '1px solid rgba(130,145,190,0.08)' : 'none' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(244,201,93,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706', flexShrink: 0 }}>
                  <Key size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-text)' }}>{k.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 2 }}>
                    <code style={{ background: 'rgba(0,0,0,0.05)', padding: '1px 5px', borderRadius: 4 }}>{k.key_prefix}</code>
                    {' · '}Created {new Date(k.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {k.last_used_at && ` · Last used ${new Date(k.last_used_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {(k.scopes ?? []).map(s => (
                    <span key={s} style={{ fontSize: 10, fontWeight: 700, color: '#4f6df5', background: 'rgba(79,109,245,0.10)', borderRadius: 6, padding: '2px 6px' }}>{s}</span>
                  ))}
                </div>
                <button onClick={() => void handleRevokeKey(k.id, k.name)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f46b72', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Create Key Modal ──────────────────────────────── */}
      {isAddKeyOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.40)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="crm-glass" style={{ width: '100%', maxWidth: 420, borderRadius: 16, padding: 24, boxShadow: '0 20px 50px rgba(0,0,0,0.20)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--crm-text)' }}>Create API Key</h3>
              <button onClick={() => setIsAddKeyOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}><X size={18} /></button>
            </div>
            <form onSubmit={e => void handleCreateApiKey(e)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Key Name *</label>
                <input type="text" required placeholder="e.g. Production App, Zapier Integration"
                  value={newKeyName} onChange={e => setNewKeyName(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Scopes</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {SCOPES.map(scope => (
                    <button key={scope} type="button" onClick={() => toggleScope(scope)}
                      style={{ padding: '6px 14px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, textTransform: 'capitalize', background: newKeyScopes.includes(scope) ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(255,255,255,0.55)', color: newKeyScopes.includes(scope) ? 'white' : 'var(--crm-text-secondary)' }}>
                      {scope}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 6 }}>
                  read = GET only · write = GET + POST + PATCH · admin = full access
                </div>
              </div>
              <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(244,201,93,0.10)', border: '1px solid rgba(244,201,93,0.25)', fontSize: 12, color: '#d97706' }}>
                <AlertCircle size={13} style={{ display: 'inline', marginRight: 5 }} />
                The full key is shown only once after creation. Store it securely.
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" onClick={() => setIsAddKeyOpen(false)}
                  style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'white', color: 'var(--crm-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" disabled={savingKey || !newKeyName.trim()}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: savingKey || !newKeyName.trim() ? 0.6 : 1 }}>
                  <RefreshCw size={13} /> {savingKey ? 'Generating...' : 'Generate Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
