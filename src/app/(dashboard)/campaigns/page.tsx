'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Megaphone, Plus, Search, X, CheckCircle2, AlertCircle,
  Smartphone, AtSign, Mail, MessageSquare, Rss,
  BarChart3, Clock, Send, Trash2, ExternalLink,
  RefreshCw, ShieldCheck, Globe, Key, Settings2,
  Eye, EyeOff, HelpCircle, Play, Pause, Archive, Edit2,
  Lock, Unlock, ChevronDown, Filter, SlidersHorizontal,
  TrendingUp, Users, Target, Zap,
} from 'lucide-react';
import Link from 'next/link';
import {
  getMetaCampaigns, syncMetaCampaigns, getMetaSyncStatus,
  getMetaCredentials, saveMetaCredentials, testMetaConnection,
  getMetaPermissions, createMetaCampaign, updateMetaCampaign,
  pauseMetaCampaign, resumeMetaCampaign, archiveMetaCampaign,
  getMetaCampaignLiveDetails,
  type MetaCredentialsInfo, type MetaConnectionTestResult,
  type MetaPermissionsInfo, type MetaCampaignLiveDetails,
} from '@/lib/api-client';

interface Campaign {
  id: string;
  name: string;
  status: string;
  platform: string | null;
  created_at: string;
  updated_at?: string | null;
  meta_campaign_id?: string | null;
  objective?: string | null;
  last_synced_at?: string | null;
  start_time?: string | null;
  stop_time?: string | null;
}

interface CampaignCreate {
  name: string;
  platform: string;
  status: string;
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  draft:     { color: '#6b7280', bg: 'rgba(107,114,128,0.10)', label: 'Draft' },
  active:    { color: '#2563eb', bg: 'rgba(37,99,235,0.10)',   label: 'Active' },
  paused:    { color: '#d97706', bg: 'rgba(217,119,6,0.10)',   label: 'Paused' },
  completed: { color: '#059669', bg: 'rgba(5,150,105,0.10)',   label: 'Completed' },
  archived:  { color: '#9ca3af', bg: 'rgba(156,163,175,0.10)', label: 'Archived' },
};

const PLATFORM_CONFIG: Record<string, { color: string; label: string }> = {
  whatsapp:  { color: '#16a34a', label: 'WhatsApp' },
  instagram: { color: '#db2777', label: 'Instagram' },
  facebook:  { color: '#2563eb', label: 'Facebook' },
  email:     { color: '#7c3aed', label: 'Email' },
  sms:       { color: '#d97706', label: 'SMS' },
  all:       { color: '#4f6df5', label: 'All Channels' },
};

function PlatformIcon({ platform, size = 14 }: { platform: string; size?: number }) {
  const icons: Record<string, React.ReactNode> = {
    whatsapp:  <Smartphone size={size} />,
    instagram: <AtSign size={size} />,
    facebook:  <MessageSquare size={size} />,
    email:     <Mail size={size} />,
    sms:       <Send size={size} />,
    all:       <Rss size={size} />,
  };
  return <>{icons[platform] ?? <Rss size={size} />}</>;
}

const STATUS_FILTERS = ['all', 'draft', 'active', 'paused', 'completed', 'archived'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

// ── Shared input style ────────────────────────────────────────
const inputCss: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 8,
  border: '1px solid rgba(130,145,190,0.28)',
  background: 'rgba(255,255,255,0.80)',
  fontSize: 13,
  color: 'var(--crm-text)',
  boxSizing: 'border-box',
  outline: 'none',
};

// ── Status badge ──────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
      color: cfg.color, background: cfg.bg,
    }}>
      {cfg.label}
    </span>
  );
}

// ── KPI card ──────────────────────────────────────────────────
function KpiCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 12,
      background: 'rgba(255,255,255,0.70)',
      border: '1px solid rgba(130,145,190,0.16)',
      display: 'flex', alignItems: 'center', gap: 12,
      boxShadow: '0 2px 8px rgba(75,85,130,0.06)',
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: `${color}15`, display: 'flex', alignItems: 'center',
        justifyContent: 'center', color,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--crm-text)', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

// ── Create CRM Campaign Modal ─────────────────────────────────
function CreateCampaignModal({
  onClose, onCreated,
}: { onClose: () => void; onCreated: (c: Campaign) => void }) {
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('whatsapp');
  const [status, setStatus] = useState('draft');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Campaign name is required.'); return; }
    setSaving(true); setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles').select('account_id').eq('user_id', user?.id ?? '').maybeSingle();
      const payload: CampaignCreate & { account_id?: string } = {
        name: name.trim(), platform, status,
      };
      if (profile?.account_id) payload.account_id = profile.account_id;
      const { data, error: dbErr } = await supabase.from('campaigns').insert(payload).select('*').single();
      if (dbErr) { setError(dbErr.message); return; }
      onCreated(data as Campaign);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create campaign.');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(6px)', padding: 16 }}>
      <div className="crm-glass-strong" style={{ width: '100%', maxWidth: 440, borderRadius: 18, padding: 26, boxShadow: '0 20px 50px rgba(0,0,0,0.20)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--crm-text)' }}>New Campaign</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)', padding: 4 }}><X size={16} /></button>
        </div>
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 8, background: 'rgba(244,107,114,0.10)', border: '1px solid rgba(244,107,114,0.25)', color: '#dc2626', fontSize: 12, marginBottom: 14 }}>
            <AlertCircle size={13} />{error}
          </div>
        )}
        <form onSubmit={e => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 5 }}>Campaign Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Summer Sale WhatsApp Blast" style={inputCss} autoFocus />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 5 }}>Platform</label>
              <select value={platform} onChange={e => setPlatform(e.target.value)} style={inputCss}>
                <option value="whatsapp">WhatsApp</option>
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="all">All Channels</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 5 }}>Initial Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)} style={inputCss}>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </select>
            </div>
          </div>
          <div style={{ padding: '9px 12px', borderRadius: 8, background: 'rgba(79,109,245,0.06)', border: '1px solid rgba(79,109,245,0.14)', fontSize: 12, color: 'var(--crm-text-secondary)' }}>
            After creating, use Content Studio to generate AI-powered content for this campaign.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(130,145,190,0.28)', background: 'rgba(255,255,255,0.60)', color: 'var(--crm-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Creating...' : 'Create Campaign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Meta Credentials Modal ────────────────────────────────────
function MetaCredentialsModal({
  onClose, onSaved, credsInfo,
}: { onClose: () => void; onSaved: () => void; credsInfo: MetaCredentialsInfo | null }) {
  const [adAccount, setAdAccount] = useState(credsInfo?.ad_account_id ?? 'act_2505907436503788');
  const [appId, setAppId] = useState(credsInfo?.app_id ?? '1354004176287129');
  const [token, setToken] = useState('');
  const [apiVersion, setApiVersion] = useState(credsInfo?.api_version ?? 'v26.0');
  const [showToken, setShowToken] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<MetaConnectionTestResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleTest = async () => {
    setTesting(true); setTestResult(null); setError('');
    try {
      const res = await testMetaConnection({ ad_account_id: adAccount.trim(), access_token: token.trim() || undefined, api_version: apiVersion.trim() || undefined });
      setTestResult(res);
    } catch (err) {
      setTestResult({ success: false, error: err instanceof Error ? err.message : 'Connection failed', hint: 'Check your access token and ad account ID.' });
    } finally { setTesting(false); }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await saveMetaCredentials({ ad_account_id: adAccount.trim(), app_id: appId.trim(), access_token: token.trim() || undefined, api_version: apiVersion.trim() });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save credentials.');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(6px)', padding: 16 }}>
      <div className="crm-glass-strong" style={{ width: '100%', maxWidth: 520, borderRadius: 18, padding: 26, boxShadow: '0 20px 50px rgba(0,0,0,0.20)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg,#1877F2,#4f6df5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0 }}><Key size={18} /></div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text)' }}>Meta Ads Connection</div>
              <div style={{ fontSize: 12, color: 'var(--crm-text-secondary)' }}>Configure Meta Marketing API credentials</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)', padding: 4 }}><X size={16} /></button>
        </div>

        <div style={{ padding: '9px 12px', borderRadius: 8, marginBottom: 16, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, background: credsInfo?.has_token ? 'rgba(5,150,105,0.08)' : 'rgba(217,119,6,0.08)', border: `1px solid ${credsInfo?.has_token ? 'rgba(5,150,105,0.25)' : 'rgba(217,119,6,0.25)'}`, color: credsInfo?.has_token ? '#059669' : '#d97706', fontWeight: 600 }}>
          {credsInfo?.has_token ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {credsInfo?.has_token ? `Token configured — ${credsInfo.token_preview}` : 'No access token configured'}
        </div>

        {error && <div style={{ padding: '9px 12px', borderRadius: 8, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', color: '#dc2626', fontSize: 12, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}><AlertCircle size={13} />{error}</div>}

        {testResult && (
          <div style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 14, fontSize: 12, background: testResult.success ? 'rgba(5,150,105,0.08)' : 'rgba(220,38,38,0.08)', border: `1px solid ${testResult.success ? 'rgba(5,150,105,0.25)' : 'rgba(220,38,38,0.25)'}`, color: testResult.success ? '#059669' : '#dc2626' }}>
            <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: testResult.success ? 6 : 0 }}>
              {testResult.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              {testResult.success ? 'Connection verified' : 'Connection failed'}
            </div>
            {testResult.success && <div style={{ color: 'var(--crm-text-secondary)', fontSize: 11 }}>{testResult.account_name} · {testResult.currency} · {testResult.timezone}</div>}
            {!testResult.success && <div style={{ marginTop: 4 }}>{testResult.error}{testResult.hint && <div style={{ color: 'var(--crm-text-muted)', marginTop: 3 }}>{testResult.hint}</div>}</div>}
          </div>
        )}

        <form onSubmit={e => void handleSave(e)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Ad Account ID *</label>
            <input value={adAccount} onChange={e => setAdAccount(e.target.value)} placeholder="act_2505907436503788" style={inputCss} required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>App ID</label>
              <input value={appId} onChange={e => setAppId(e.target.value)} placeholder="1354004176287129" style={inputCss} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>API Version</label>
              <input value={apiVersion} onChange={e => setApiVersion(e.target.value)} placeholder="v26.0" style={inputCss} />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>System User Access Token</label>
            <div style={{ position: 'relative' }}>
              <input type={showToken ? 'text' : 'password'} value={token} onChange={e => setToken(e.target.value)} placeholder={credsInfo?.has_token ? '•••••••• (leave blank to keep current)' : 'EAAT...'} style={{ ...inputCss, paddingRight: 36 }} />
              <button type="button" onClick={() => setShowToken(s => !s)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}>{showToken ? <EyeOff size={14} /> : <Eye size={14} />}</button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 3 }}>Requires <code>ads_read</code> permission. Stored server-side only.</div>
          </div>

          <div style={{ borderRadius: 8, border: '1px solid rgba(130,145,190,0.20)', overflow: 'hidden' }}>
            <button type="button" onClick={() => setShowGuide(g => !g)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: 'rgba(255,255,255,0.50)', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--crm-text)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><HelpCircle size={13} color="#1877F2" />How to get a non-expiring System User Token</span>
              <ChevronDown size={12} style={{ transform: showGuide ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>
            {showGuide && (
              <div style={{ padding: '8px 12px 10px', fontSize: 11, color: 'var(--crm-text-secondary)', lineHeight: 1.6, borderTop: '1px solid rgba(130,145,190,0.12)' }}>
                <ol style={{ margin: '4px 0 0 14px', padding: 0 }}>
                  <li>Meta Business Settings → Users → System Users → Add</li>
                  <li>Add Assets → Ad Accounts → select your account → View Performance</li>
                  <li>Generate New Token → Select App → Check <code>ads_read</code> → Expiration: Never</li>
                  <li>Copy and paste the token above</li>
                </ol>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, flexWrap: 'wrap', gap: 8 }}>
            <button type="button" onClick={() => void handleTest()} disabled={testing} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(24,119,242,0.30)', background: 'rgba(24,119,242,0.06)', color: '#1877F2', fontSize: 12, fontWeight: 600, cursor: testing ? 'not-allowed' : 'pointer' }}>
              <RefreshCw size={12} className={testing ? 'animate-spin' : ''} />{testing ? 'Testing...' : 'Test Connection'}
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(130,145,190,0.28)', background: 'rgba(255,255,255,0.60)', color: 'var(--crm-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button type="submit" disabled={saving} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#1877F2,#4f6df5)', color: 'white', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving...' : 'Save & Connect'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Create Meta Campaign Modal ────────────────────────────────
function CreateMetaCampaignModal({
  onClose, onCreated, adAccountId,
}: { onClose: () => void; onCreated: () => void; adAccountId: string }) {
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('OUTCOME_LEADS');
  const [status, setStatus] = useState<'PAUSED' | 'ACTIVE'>('PAUSED');
  const [budget, setBudget] = useState('');
  const [category, setCategory] = useState('NONE');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Campaign name is required.'); return; }
    setCreating(true); setError('');
    try {
      await createMetaCampaign({ name: name.trim(), objective, status, daily_budget: budget ? parseFloat(budget) : undefined, special_ad_categories: [category] });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create Meta campaign.');
    } finally { setCreating(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(6px)', padding: 16 }}>
      <div className="crm-glass-strong" style={{ width: '100%', maxWidth: 500, borderRadius: 18, padding: 26, boxShadow: '0 20px 50px rgba(0,0,0,0.20)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text)' }}>Create Meta Campaign</div>
            <div style={{ fontSize: 12, color: 'var(--crm-text-secondary)', marginTop: 2 }}>Deploy to Ad Account <code>{adAccountId}</code></div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)', padding: 4 }}><X size={16} /></button>
        </div>
        <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.18)', fontSize: 12, color: 'var(--crm-text-secondary)', marginBottom: 14 }}>
          New campaigns default to <strong>PAUSED</strong> to prevent unintended ad spend.
        </div>
        {error && <div style={{ padding: '9px 12px', borderRadius: 8, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', color: '#dc2626', fontSize: 12, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}><AlertCircle size={13} />{error}</div>}
        <form onSubmit={e => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Campaign Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Q4 Lead Generation" style={inputCss} autoFocus required />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Objective *</label>
            <select value={objective} onChange={e => setObjective(e.target.value)} style={inputCss}>
              <option value="OUTCOME_LEADS">OUTCOME_LEADS — Generate leads</option>
              <option value="OUTCOME_SALES">OUTCOME_SALES — Drive conversions</option>
              <option value="OUTCOME_TRAFFIC">OUTCOME_TRAFFIC — Send traffic</option>
              <option value="OUTCOME_AWARENESS">OUTCOME_AWARENESS — Brand awareness</option>
              <option value="OUTCOME_ENGAGEMENT">OUTCOME_ENGAGEMENT — Get engagement</option>
              <option value="OUTCOME_APP_PROMOTION">OUTCOME_APP_PROMOTION — App installs</option>
            </select>
            <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 3 }}>Objective cannot be changed after creation.</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Initial Status</label>
              <select value={status} onChange={e => setStatus(e.target.value as 'PAUSED' | 'ACTIVE')} style={inputCss}>
                <option value="PAUSED">PAUSED (Recommended)</option>
                <option value="ACTIVE">ACTIVE (Immediate)</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Daily Budget (USD)</label>
              <input type="number" step="0.01" min="1" value={budget} onChange={e => setBudget(e.target.value)} placeholder="Optional" style={inputCss} />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Special Ad Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)} style={inputCss}>
              <option value="NONE">NONE — Standard</option>
              <option value="HOUSING">HOUSING — Real estate</option>
              <option value="EMPLOYMENT">EMPLOYMENT — Jobs</option>
              <option value="CREDIT">CREDIT — Loans / financing</option>
              <option value="ISSUES_ELECTIONS_POLITICS">ISSUES_ELECTIONS_POLITICS</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(130,145,190,0.28)', background: 'rgba(255,255,255,0.60)', color: 'var(--crm-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={creating} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#1877F2,#4f6df5)', color: 'white', fontSize: 13, fontWeight: 600, cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.7 : 1 }}>
              {creating ? 'Creating on Meta...' : 'Create Campaign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Confirm Live Action Modal ─────────────────────────────────
function ConfirmActionModal({
  action, campaign, onClose, onConfirm, loading,
}: { action: 'pause' | 'resume' | 'archive'; campaign: Campaign; onClose: () => void; onConfirm: () => void; loading: boolean }) {
  const colors = { pause: '#d97706', resume: '#059669', archive: '#dc2626' };
  const color = colors[action];
  const icons = { pause: <Pause size={20} />, resume: <Play size={20} />, archive: <Archive size={20} /> };
  const descriptions = {
    pause: 'This will pause ad delivery immediately. You can resume at any time.',
    resume: 'This will reactivate the campaign. Ads will resume spending according to your schedule.',
    archive: 'Archiving is permanent. Archived campaigns cannot be restored to ACTIVE or PAUSED via the API.',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.50)', backdropFilter: 'blur(6px)', padding: 16 }}>
      <div className="crm-glass-strong" style={{ width: '100%', maxWidth: 420, borderRadius: 18, padding: 24, boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>{icons[action]}</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text)', textTransform: 'capitalize' }}>Confirm {action}</div>
            <div style={{ fontSize: 12, color: 'var(--crm-text-secondary)' }}>Live action on Meta Ad Account</div>
          </div>
        </div>
        <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(130,145,190,0.08)', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-text)' }}>{campaign.name}</div>
          <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 3 }}>Meta ID: <code>{campaign.meta_campaign_id ?? campaign.id}</code></div>
        </div>
        <div style={{ padding: '10px 12px', borderRadius: 8, background: `${color}08`, border: `1px solid ${color}25`, fontSize: 12, color, marginBottom: 18 }}>
          {descriptions[action]}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={loading} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(130,145,190,0.28)', background: 'rgba(255,255,255,0.60)', color: 'var(--crm-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, border: 'none', background: action === 'resume' ? 'linear-gradient(135deg,#059669,#047857)' : action === 'pause' ? 'linear-gradient(135deg,#d97706,#b45309)' : 'linear-gradient(135deg,#dc2626,#b91c1c)', color: 'white', fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading && <RefreshCw size={13} className="animate-spin" />}
            {loading ? 'Updating...' : `Yes, ${action.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Meta Campaign Modal ──────────────────────────────────
function EditMetaCampaignModal({
  campaign, liveDetails, onClose, onSaved,
}: { campaign: Campaign; liveDetails: MetaCampaignLiveDetails | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(campaign.name);
  const [budget, setBudget] = useState(liveDetails?.daily_budget ? (Number(liveDetails.daily_budget) / 100).toFixed(2) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const metaId = campaign.meta_campaign_id ?? campaign.id;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await updateMetaCampaign(metaId, { name: name.trim(), daily_budget: budget ? parseFloat(budget) : undefined });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed.');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.50)', backdropFilter: 'blur(6px)', padding: 16 }}>
      <div className="crm-glass-strong" style={{ width: '100%', maxWidth: 440, borderRadius: 18, padding: 24, boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text)' }}>Edit Meta Campaign</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)', padding: 4 }}><X size={16} /></button>
        </div>
        {error && <div style={{ padding: '9px 12px', borderRadius: 8, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', color: '#dc2626', fontSize: 12, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}><AlertCircle size={13} />{error}</div>}
        <form onSubmit={e => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Campaign Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} style={inputCss} required />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Daily Budget (USD)</label>
            <input type="number" step="0.01" min="1" value={budget} onChange={e => setBudget(e.target.value)} placeholder="Leave empty to keep ad-set level budget" style={inputCss} />
          </div>
          <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(130,145,190,0.06)', fontSize: 11, color: 'var(--crm-text-muted)' }}>
            Objective: <strong>{campaign.objective ?? 'Not specified'}</strong> — cannot be changed after creation.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(130,145,190,0.28)', background: 'rgba(255,255,255,0.60)', color: 'var(--crm-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#1877F2,#4f6df5)', color: 'white', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving && <RefreshCw size={13} className="animate-spin" />}{saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Campaign Detail Drawer ────────────────────────────────────
function CampaignDetailDrawer({
  campaign, isMeta, liveDetails, loadingLive, permissions,
  onClose, onStatusChange, onAction,
  syncStatus,
}: {
  campaign: Campaign; isMeta: boolean;
  liveDetails: MetaCampaignLiveDetails | null; loadingLive: boolean;
  permissions: MetaPermissionsInfo | null;
  onClose: () => void;
  onStatusChange: (id: string, status: string) => void;
  onAction: (action: 'pause' | 'resume' | 'archive' | 'edit') => void;
  syncStatus: { ad_account_id: string } | null;
}) {
  const pm = PLATFORM_CONFIG[campaign.platform ?? 'all'] ?? PLATFORM_CONFIG.all;
  const metaId = campaign.meta_campaign_id ?? campaign.id;

  return (
    <div className="crm-glass" style={{ padding: 20, borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 14, alignSelf: 'start', position: 'sticky', top: 16, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)' }}>{isMeta ? 'Meta Campaign' : 'Campaign Details'}</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)', padding: 4 }}><X size={15} /></button>
      </div>

      {isMeta && (
        <div style={{ padding: '7px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, background: permissions?.can_manage ? 'rgba(5,150,105,0.08)' : 'rgba(217,119,6,0.08)', border: `1px solid ${permissions?.can_manage ? 'rgba(5,150,105,0.25)' : 'rgba(217,119,6,0.25)'}`, color: permissions?.can_manage ? '#059669' : '#d97706' }}>
          {permissions?.can_manage ? <Unlock size={12} /> : <Lock size={12} />}
          {permissions?.can_manage ? 'Full management (ads_management)' : 'Read-only (ads_read)'}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 42, height: 42, borderRadius: 10, background: `${pm.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: pm.color, flexShrink: 0 }}>
          <PlatformIcon platform={campaign.platform ?? 'all'} size={18} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--crm-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{campaign.name}</div>
          <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 2 }}>{pm.label}</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <StatusBadge status={campaign.status} />
        <span style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>{new Date(campaign.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
      </div>

      {isMeta && (
        <div style={{ background: 'rgba(130,145,190,0.06)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Meta Metadata</div>
          <div style={{ fontSize: 12, color: 'var(--crm-text)' }}>ID: <code style={{ fontSize: 11 }}>{metaId}</code></div>
          {campaign.objective && <div style={{ fontSize: 12, color: 'var(--crm-text)' }}>Objective: {campaign.objective}</div>}
          {liveDetails?.daily_budget && <div style={{ fontSize: 12, color: 'var(--crm-text)' }}>Daily Budget: ${(Number(liveDetails.daily_budget) / 100).toFixed(2)} USD</div>}
          {campaign.last_synced_at && <div style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>Synced: {new Date(campaign.last_synced_at).toLocaleString()}</div>}
        </div>
      )}

      {/* Performance */}
      <div style={{ background: 'rgba(130,145,190,0.06)', borderRadius: 10, padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{isMeta ? 'Live Insights' : 'Attribution'}</div>
          {isMeta && loadingLive && <RefreshCw size={11} className="animate-spin" style={{ color: '#1877F2' }} />}
        </div>
        {isMeta ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[
              { label: 'Impressions', value: liveDetails?.insights?.impressions !== undefined ? Number(liveDetails.insights.impressions).toLocaleString() : (loadingLive ? '…' : '—') },
              { label: 'Spend', value: liveDetails?.insights?.spend !== undefined ? `$${Number(liveDetails.insights.spend).toFixed(2)}` : (loadingLive ? '…' : '$0.00') },
              { label: 'Clicks', value: liveDetails?.insights?.clicks !== undefined ? Number(liveDetails.insights.clicks).toLocaleString() : (loadingLive ? '…' : '—') },
              { label: 'CPC', value: liveDetails?.insights?.cpc !== undefined && Number(liveDetails.insights.cpc) > 0 ? `$${Number(liveDetails.insights.cpc).toFixed(2)}` : (loadingLive ? '…' : '—') },
            ].map(s => (
              <div key={s.label} style={{ padding: '7px 8px', background: 'rgba(255,255,255,0.55)', borderRadius: 7, textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text)' }}>{s.value}</div>
                <div style={{ fontSize: 10, color: 'var(--crm-text-muted)', marginTop: 1 }}>{s.label}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', fontStyle: 'italic' }}>
            Attribution not connected. Link contacts and deals to this campaign to see data.
          </div>
        )}
      </div>

      {/* Status change (CRM only) */}
      {!isMeta && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Change Status</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <button key={key} onClick={() => onStatusChange(campaign.id, key)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, background: campaign.status === key ? cfg.bg : 'rgba(255,255,255,0.55)', color: campaign.status === key ? cfg.color : 'var(--crm-text-secondary)', outline: campaign.status === key ? `1.5px solid ${cfg.color}` : 'none' }}>{cfg.label}</button>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {isMeta ? (
          <>
            {campaign.status === 'active' && (
              <button onClick={() => onAction('pause')} disabled={!permissions?.can_manage} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 8, background: 'rgba(217,119,6,0.10)', border: '1px solid rgba(217,119,6,0.28)', color: '#d97706', fontSize: 12, fontWeight: 600, cursor: permissions?.can_manage ? 'pointer' : 'not-allowed', opacity: permissions?.can_manage ? 1 : 0.5 }}>
                <Pause size={13} /> Pause on Meta
              </button>
            )}
            {campaign.status === 'paused' && (
              <button onClick={() => onAction('resume')} disabled={!permissions?.can_manage} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 8, background: 'rgba(5,150,105,0.10)', border: '1px solid rgba(5,150,105,0.28)', color: '#059669', fontSize: 12, fontWeight: 600, cursor: permissions?.can_manage ? 'pointer' : 'not-allowed', opacity: permissions?.can_manage ? 1 : 0.5 }}>
                <Play size={13} /> Resume on Meta
              </button>
            )}
            <button onClick={() => onAction('edit')} disabled={!permissions?.can_manage} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 8, background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.22)', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: permissions?.can_manage ? 'pointer' : 'not-allowed', opacity: permissions?.can_manage ? 1 : 0.5 }}>
              <Edit2 size={13} /> Edit Campaign
            </button>
            {campaign.status !== 'archived' && (
              <button onClick={() => onAction('archive')} disabled={!permissions?.can_manage} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 8, background: 'none', border: '1px solid rgba(220,38,38,0.25)', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: permissions?.can_manage ? 'pointer' : 'not-allowed', opacity: permissions?.can_manage ? 1 : 0.5 }}>
                <Archive size={13} /> Archive on Meta
              </button>
            )}
            <a href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${(syncStatus?.ad_account_id ?? '2505907436503788').replace('act_', '')}&selected_campaign_ids=${metaId}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 8, background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(130,145,190,0.22)', color: 'var(--crm-text-secondary)', textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>
              <ExternalLink size={13} /> View in Ads Manager
            </a>
          </>
        ) : (
          <Link href="/content-studio" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 8, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>
            <BarChart3 size={13} /> Open in Content Studio
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function CampaignsPage() {
  const [activeTab, setActiveTab] = useState<'crm' | 'meta'>('crm');
  const [crmCampaigns, setCrmCampaigns] = useState<Campaign[]>([]);
  const [metaCampaigns, setMetaCampaigns] = useState<Campaign[]>([]);
  const [loadingCrm, setLoadingCrm] = useState(true);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ ad_account_id: string; app_id: string; api_version: string; token_configured: boolean; last_sync: { status: string; created_at: string } | null } | null>(null);
  const [credsInfo, setCredsInfo] = useState<MetaCredentialsInfo | null>(null);
  const [permissions, setPermissions] = useState<MetaPermissionsInfo | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [liveDetails, setLiveDetails] = useState<MetaCampaignLiveDetails | null>(null);
  const [loadingLive, setLoadingLive] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal states
  const [showCreate, setShowCreate] = useState(false);
  const [showCreds, setShowCreds] = useState(false);
  const [showCreateMeta, setShowCreateMeta] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ action: 'pause' | 'resume' | 'archive'; campaign: Campaign; loading: boolean } | null>(null);
  const [editModal, setEditModal] = useState<Campaign | null>(null);

  const supabase = createClient();
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBanner = (type: 'success' | 'error', text: string) => {
    setBanner({ type, text });
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), 4000);
  };

  const loadCrmCampaigns = useCallback(async () => {
    setLoadingCrm(true);
    try {
      const { data } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false }).limit(100);
      setCrmCampaigns((data as Campaign[]) ?? []);
    } catch { setCrmCampaigns([]); }
    finally { setLoadingCrm(false); }
  }, [supabase]);

  const loadMetaCampaigns = useCallback(async () => {
    setLoadingMeta(true);
    try {
      const res = await getMetaCampaigns({ limit: '100' });
      if (res?.data) setMetaCampaigns(res.data as Campaign[]);
    } catch {
      const { data } = await supabase.from('campaigns').select('*').eq('platform', 'facebook').order('created_at', { ascending: false });
      setMetaCampaigns((data as Campaign[]) ?? []);
    } finally { setLoadingMeta(false); }
  }, [supabase]);

  const loadMeta = useCallback(async () => {
    try {
      const [status, creds, perms] = await Promise.allSettled([getMetaSyncStatus(), getMetaCredentials(), getMetaPermissions()]);
      if (status.status === 'fulfilled' && status.value) setSyncStatus(status.value as typeof syncStatus);
      if (creds.status === 'fulfilled' && creds.value) setCredsInfo(creds.value);
      if (perms.status === 'fulfilled' && perms.value) setPermissions(perms.value);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    void loadCrmCampaigns();
    void loadMetaCampaigns();
    void loadMeta();
  }, [loadCrmCampaigns, loadMetaCampaigns, loadMeta]);

  // Load live details when a Meta campaign is selected
  useEffect(() => {
    if (selected && (selected.meta_campaign_id || selected.platform === 'facebook')) {
      const metaId = selected.meta_campaign_id ?? selected.id;
      setLoadingLive(true); setLiveDetails(null);
      getMetaCampaignLiveDetails(metaId)
        .then(det => setLiveDetails(det))
        .catch(() => setLiveDetails(null))
        .finally(() => setLoadingLive(false));
    } else { setLiveDetails(null); }
  }, [selected]);

  const handleSyncMeta = async () => {
    setSyncing(true); setBanner(null);
    try {
      const res = await syncMetaCampaigns();
      showBanner('success', `Synced ${res.fetched_count} campaigns (${res.created_count} added, ${res.updated_count} updated).`);
      await loadMetaCampaigns(); await loadMeta(); await loadCrmCampaigns();
    } catch (err) {
      showBanner('error', err instanceof Error ? err.message : 'Sync failed. Verify META_ACCESS_TOKEN in backend/.env.');
    } finally { setSyncing(false); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete campaign "${name}"?`)) return;
    await supabase.from('campaigns').delete().eq('id', id);
    setCrmCampaigns(prev => prev.filter(c => c.id !== id));
    if (selected?.id === id) setSelected(null);
    showBanner('success', `Campaign "${name}" deleted.`);
  };

  const handleStatusChange = async (id: string, status: string) => {
    setCrmCampaigns(prev => prev.map(c => c.id === id ? { ...c, status } : c));
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status } : null);
    await supabase.from('campaigns').update({ status }).eq('id', id);
  };

  const handleLiveAction = async () => {
    if (!confirmModal) return;
    const { action, campaign } = confirmModal;
    const metaId = campaign.meta_campaign_id ?? campaign.id;
    setConfirmModal(prev => prev ? { ...prev, loading: true } : null);
    try {
      if (action === 'pause') await pauseMetaCampaign(metaId);
      else if (action === 'resume') await resumeMetaCampaign(metaId);
      else await archiveMetaCampaign(metaId);
      setConfirmModal(null);
      showBanner('success', `Campaign "${campaign.name}" ${action}d on Meta.`);
      await loadMetaCampaigns();
      if (selected?.id === campaign.id) {
        getMetaCampaignLiveDetails(metaId).then(det => setLiveDetails(det)).catch(() => {});
      }
    } catch (err) {
      showBanner('error', err instanceof Error ? err.message : `Failed to ${action} campaign.`);
      setConfirmModal(prev => prev ? { ...prev, loading: false } : null);
    }
  };

  const activeList = activeTab === 'crm' ? crmCampaigns : metaCampaigns;
  const activeLoading = activeTab === 'crm' ? loadingCrm : loadingMeta;

  const filtered = activeList.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.meta_campaign_id ?? '').toLowerCase().includes(q) || (c.objective ?? '').toLowerCase().includes(q);
  });

  const totalCount = activeList.length;
  const activeCount = activeList.filter(c => c.status === 'active').length;
  const pausedCount = activeList.filter(c => c.status === 'paused').length;
  const draftCount = activeList.filter(c => c.status === 'draft').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Modals */}
      {showCreate && <CreateCampaignModal onClose={() => setShowCreate(false)} onCreated={c => { setCrmCampaigns(prev => [c, ...prev]); setShowCreate(false); showBanner('success', `Campaign "${c.name}" created.`); }} />}
      {showCreds && <MetaCredentialsModal onClose={() => setShowCreds(false)} onSaved={() => { setShowCreds(false); showBanner('success', 'Meta credentials saved.'); void loadMeta(); void loadMetaCampaigns(); }} credsInfo={credsInfo} />}
      {showCreateMeta && <CreateMetaCampaignModal onClose={() => setShowCreateMeta(false)} onCreated={() => { setShowCreateMeta(false); showBanner('success', 'Meta campaign created.'); void loadMetaCampaigns(); void loadMeta(); }} adAccountId={syncStatus?.ad_account_id ?? 'act_2505907436503788'} />}
      {confirmModal && <ConfirmActionModal action={confirmModal.action} campaign={confirmModal.campaign} onClose={() => setConfirmModal(null)} onConfirm={() => void handleLiveAction()} loading={confirmModal.loading} />}
      {editModal && <EditMetaCampaignModal campaign={editModal} liveDetails={liveDetails} onClose={() => setEditModal(null)} onSaved={() => { setEditModal(null); showBanner('success', 'Campaign updated.'); void loadMetaCampaigns(); }} />}

      {/* Banner */}
      {banner && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 14px', borderRadius: 10, background: banner.type === 'success' ? 'rgba(5,150,105,0.10)' : 'rgba(220,38,38,0.10)', border: `1px solid ${banner.type === 'success' ? 'rgba(5,150,105,0.28)' : 'rgba(220,38,38,0.28)'}`, color: banner.type === 'success' ? '#059669' : '#dc2626', fontSize: 13, fontWeight: 600 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{banner.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}{banner.text}</span>
          <button onClick={() => setBanner(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 2 }}><X size={13} /></button>
        </div>
      )}

      {/* Header */}
      <div className="crm-page-header" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Campaigns</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--crm-text-secondary)' }}>Manage CRM campaigns, Meta advertising, and performance.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {activeTab === 'meta' && (
            <>
              <button onClick={() => setShowCreateMeta(true)} disabled={!permissions?.can_manage} title={!permissions?.can_manage ? 'Requires ads_management permission' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, background: permissions?.can_manage ? 'linear-gradient(135deg,#1877F2,#4f6df5)' : 'rgba(130,145,190,0.20)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: permissions?.can_manage ? 'pointer' : 'not-allowed', opacity: permissions?.can_manage ? 1 : 0.6 }}>
                <Plus size={13} /> New Meta Campaign
              </button>
              <button onClick={() => setShowCreds(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, background: 'rgba(255,255,255,0.80)', border: '1px solid rgba(24,119,242,0.30)', color: '#1877F2', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                <Key size={13} /> Credentials
                {syncStatus?.token_configured ? <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#059669', display: 'inline-block' }} /> : <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 5, background: 'rgba(217,119,6,0.15)', color: '#d97706', fontWeight: 700 }}>Setup</span>}
              </button>
              <button onClick={() => void handleSyncMeta()} disabled={syncing} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, background: 'linear-gradient(135deg,#1877F2,#4f6df5)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: syncing ? 'not-allowed' : 'pointer', opacity: syncing ? 0.75 : 1 }}>
                <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />{syncing ? 'Syncing...' : 'Sync Now'}
              </button>
            </>
          )}
          {activeTab === 'crm' && (
            <button onClick={() => setShowCreate(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(79,109,245,0.25)' }}>
              <Plus size={13} /> New Campaign
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid rgba(130,145,190,0.16)', paddingBottom: 0 }}>
        {(['crm', 'meta'] as const).map(tab => (
          <button key={tab} onClick={() => { setActiveTab(tab); setSelected(null); }} style={{ padding: '8px 16px', borderRadius: '9px 9px 0 0', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: activeTab === tab ? 'rgba(255,255,255,0.90)' : 'transparent', color: activeTab === tab ? 'var(--crm-primary)' : 'var(--crm-text-secondary)', borderBottom: activeTab === tab ? '2px solid var(--crm-primary)' : '2px solid transparent', transition: 'all 150ms' }}>
            {tab === 'crm' ? <><Megaphone size={13} style={{ display: 'inline', marginRight: 6 }} />CRM Campaigns ({crmCampaigns.length})</> : <><MessageSquare size={13} style={{ display: 'inline', marginRight: 6 }} />Meta Ads ({metaCampaigns.length})</>}
          </button>
        ))}
      </div>

      {/* Meta status bar */}
      {activeTab === 'meta' && (
        <div style={{ padding: '10px 14px', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, background: 'rgba(37,99,235,0.04)', border: '1px solid rgba(37,99,235,0.18)', fontSize: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--crm-text)' }}><ShieldCheck size={13} color="#2563eb" /><strong>Account:</strong> <code>{syncStatus?.ad_account_id ?? 'act_2505907436503788'}</code></span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--crm-text)' }}><Globe size={13} color="#2563eb" /><strong>API:</strong> {syncStatus?.api_version ?? 'v26.0'}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Lock size={12} color={permissions?.can_manage ? '#059669' : '#d97706'} />
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: permissions?.can_manage ? 'rgba(5,150,105,0.12)' : 'rgba(217,119,6,0.12)', color: permissions?.can_manage ? '#059669' : '#d97706' }}>
                {permissions?.can_manage ? 'ads_management' : permissions?.has_ads_read ? 'ads_read' : 'No permissions'}
              </span>
            </span>
            <button onClick={() => setShowCreds(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.20)', color: '#2563eb', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}><Settings2 size={11} />Configure</button>
          </div>
          <span style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>Last sync: {syncStatus?.last_sync?.created_at ? new Date(syncStatus.last_sync.created_at).toLocaleTimeString() : 'Never'}</span>
        </div>
      )}

      {/* Token missing alert */}
      {activeTab === 'meta' && syncStatus && !syncStatus.token_configured && (
        <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(217,119,6,0.06)', border: '1px solid rgba(217,119,6,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertCircle size={18} color="#d97706" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>Meta Access Token Not Configured</div>
              <div style={{ fontSize: 12, color: 'var(--crm-text-secondary)', marginTop: 1 }}>Connect a System User Token with <code>ads_read</code> to sync live campaigns.</div>
            </div>
          </div>
          <button onClick={() => setShowCreds(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: '#1877F2', border: 'none', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}><Key size={12} />Connect Now</button>
        </div>
      )}

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
        <KpiCard label={activeTab === 'crm' ? 'Total Campaigns' : 'Total Meta Campaigns'} value={totalCount} icon={<Megaphone size={16} />} color="#4f6df5" />
        <KpiCard label="Active" value={activeCount} icon={<Zap size={16} />} color="#059669" />
        <KpiCard label="Paused" value={pausedCount} icon={<Clock size={16} />} color="#d97706" />
        <KpiCard label={activeTab === 'crm' ? 'Drafts' : 'Drafts / Other'} value={draftCount} icon={<Target size={16} />} color="#6b7280" />
      </div>

      {/* Search + filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.70)', border: '1px solid rgba(130,145,190,0.22)', borderRadius: 9, padding: '7px 12px', minWidth: 240, flex: 1, maxWidth: 360 }}>
          <Search size={13} color="var(--crm-text-muted)" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={activeTab === 'crm' ? 'Search campaigns…' : 'Search name, ID, objective…'} style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 13, color: 'var(--crm-text)' }} />
          {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}><X size={12} color="var(--crm-text-muted)" /></button>}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {STATUS_FILTERS.map(f => (
            <button key={f} onClick={() => setStatusFilter(f)} style={{ padding: '6px 11px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, textTransform: 'capitalize', background: statusFilter === f ? 'var(--crm-primary)' : 'rgba(255,255,255,0.65)', color: statusFilter === f ? 'white' : 'var(--crm-text-secondary)' }}>{f}</button>
          ))}
        </div>
        {(search || statusFilter !== 'all') && (
          <button onClick={() => { setSearch(''); setStatusFilter('all'); }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 7, border: '1px solid rgba(130,145,190,0.22)', background: 'rgba(255,255,255,0.60)', color: 'var(--crm-text-secondary)', fontSize: 12, cursor: 'pointer' }}><X size={11} />Clear</button>
        )}
      </div>

      {/* Main layout */}
      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 340px' : '1fr', gap: 12, alignItems: 'start' }}>

        {/* Campaign list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {activeLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ height: 68, borderRadius: 10, background: 'rgba(255,255,255,0.50)', border: '1px solid rgba(130,145,190,0.14)', animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))
          ) : filtered.length === 0 ? (
            <div className="crm-glass" style={{ padding: 48, textAlign: 'center', color: 'var(--crm-text-muted)' }}>
              <Megaphone size={32} style={{ margin: '0 auto 10px', opacity: 0.2 }} />
              <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>
                {search || statusFilter !== 'all' ? 'No campaigns match your filters' : activeTab === 'crm' ? 'No CRM campaigns yet' : 'No Meta campaigns synced yet'}
              </p>
              {!search && statusFilter === 'all' && (
                activeTab === 'crm'
                  ? <button onClick={() => setShowCreate(true)} style={{ padding: '8px 16px', borderRadius: 8, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Create First Campaign</button>
                  : <button onClick={() => void handleSyncMeta()} disabled={syncing} style={{ padding: '8px 16px', borderRadius: 8, background: 'linear-gradient(135deg,#1877F2,#4f6df5)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: syncing ? 'not-allowed' : 'pointer' }}>Sync Meta Campaigns</button>
              )}
            </div>
          ) : filtered.map(c => {
            const pm = PLATFORM_CONFIG[c.platform ?? 'all'] ?? PLATFORM_CONFIG.all;
            const isSelected = selected?.id === c.id;
            const isMeta = Boolean(c.meta_campaign_id || c.platform === 'facebook');

            return (
              <div key={c.id} onClick={() => setSelected(isSelected ? null : c)} className="crm-glass-soft" style={{ padding: '12px 16px', borderRadius: 10, cursor: 'pointer', border: isSelected ? `1.5px solid rgba(79,109,245,0.40)` : '1px solid rgba(130,145,190,0.14)', transition: 'all 120ms', background: isSelected ? 'rgba(79,109,245,0.04)' : undefined }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: `${pm.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: pm.color, flexShrink: 0 }}>
                    <PlatformIcon platform={c.platform ?? 'all'} size={15} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                      {isMeta && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'rgba(37,99,235,0.10)', color: '#2563eb', flexShrink: 0 }}>META</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span>{pm.label}</span>
                      {c.objective && <><span>·</span><span>{c.objective}</span></>}
                      <span>·</span><span>{new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <StatusBadge status={c.status} />
                    {activeTab === 'meta' && (
                      <div style={{ display: 'flex', gap: 3 }} onClick={e => e.stopPropagation()}>
                        {c.status === 'active' && <button onClick={() => setConfirmModal({ action: 'pause', campaign: c, loading: false })} disabled={!permissions?.can_manage} title="Pause" style={{ padding: '4px 6px', borderRadius: 5, border: '1px solid rgba(217,119,6,0.28)', background: 'rgba(217,119,6,0.08)', color: '#d97706', cursor: permissions?.can_manage ? 'pointer' : 'not-allowed', opacity: permissions?.can_manage ? 1 : 0.4, display: 'flex', alignItems: 'center' }}><Pause size={11} /></button>}
                        {c.status === 'paused' && <button onClick={() => setConfirmModal({ action: 'resume', campaign: c, loading: false })} disabled={!permissions?.can_manage} title="Resume" style={{ padding: '4px 6px', borderRadius: 5, border: '1px solid rgba(5,150,105,0.28)', background: 'rgba(5,150,105,0.08)', color: '#059669', cursor: permissions?.can_manage ? 'pointer' : 'not-allowed', opacity: permissions?.can_manage ? 1 : 0.4, display: 'flex', alignItems: 'center' }}><Play size={11} /></button>}
                        <button onClick={() => setEditModal(c)} disabled={!permissions?.can_manage} title="Edit" style={{ padding: '4px 6px', borderRadius: 5, border: '1px solid rgba(130,145,190,0.22)', background: 'rgba(255,255,255,0.60)', color: 'var(--crm-text-secondary)', cursor: permissions?.can_manage ? 'pointer' : 'not-allowed', opacity: permissions?.can_manage ? 1 : 0.4, display: 'flex', alignItems: 'center' }}><Edit2 size={11} /></button>
                      </div>
                    )}
                    {activeTab === 'crm' && (
                      <button onClick={e => { e.stopPropagation(); void handleDelete(c.id, c.name); }} style={{ padding: '4px 6px', borderRadius: 5, border: 'none', background: 'none', color: 'var(--crm-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Trash2 size={12} /></button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail drawer */}
        {selected && (
          <CampaignDetailDrawer
            campaign={selected}
            isMeta={Boolean(selected.meta_campaign_id || selected.platform === 'facebook')}
            liveDetails={liveDetails}
            loadingLive={loadingLive}
            permissions={permissions}
            onClose={() => setSelected(null)}
            onStatusChange={handleStatusChange}
            onAction={action => {
              if (action === 'edit') { setEditModal(selected); }
              else { setConfirmModal({ action, campaign: selected, loading: false }); }
            }}
            syncStatus={syncStatus}
          />
        )}
      </div>
    </div>
  );
}
