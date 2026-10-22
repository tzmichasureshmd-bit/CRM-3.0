'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, Copy, ExternalLink, ChevronLeft, Loader2, RefreshCw, Phone, AlertCircle } from 'lucide-react';
import Link from 'next/link';

interface ChannelConfig {
  id: 'whatsapp' | 'instagram' | 'facebook' | 'telegram';
  label: string; color: string; icon: string;
  fields: { key: string; label: string; placeholder: string; secret?: boolean }[];
  webhookPath: string; docsUrl: string;
  statusEndpoint: string;
  apiNote?: string;
}

const CHANNELS: ChannelConfig[] = [
  {
    id: 'whatsapp', label: 'WhatsApp Business', color: '#25D366', icon: '💬',
    webhookPath: '/api/v1/webhooks/whatsapp',
    docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
    statusEndpoint: '/api/v1/whatsapp/status',
    apiNote: 'Meta Cloud API',
    fields: [
      { key: 'WHATSAPP_PHONE_NUMBER_ID',   label: 'Phone Number ID',  placeholder: '123456789012345' },
      { key: 'WHATSAPP_ACCESS_TOKEN',      label: 'Access Token',     placeholder: 'EAAxxxxx...', secret: true },
      { key: 'WHATSAPP_VERIFY_TOKEN',      label: 'Verify Token',     placeholder: 'tzmicha_crm3_verify' },
      { key: 'WHATSAPP_APP_SECRET',        label: 'App Secret',       placeholder: 'abc123...', secret: true },
    ],
  },
  {
    id: 'instagram', label: 'Instagram DMs', color: '#E1306C', icon: '📸',
    webhookPath: '/api/v1/webhooks/instagram',
    docsUrl: 'https://developers.facebook.com/docs/messenger-platform/instagram',
    statusEndpoint: '/api/v1/instagram/status',
    apiNote: 'Meta Graph API',
    fields: [
      { key: 'INSTAGRAM_PAGE_ID',          label: 'Instagram Page ID',  placeholder: '17641442196029096' },
      { key: 'FACEBOOK_PAGE_ACCESS_TOKEN', label: 'Page Access Token',  placeholder: 'EAAxxxxx...', secret: true },
      { key: 'INSTAGRAM_VERIFY_TOKEN',     label: 'Verify Token',       placeholder: 'tzmicha_crm3_verify' },
      { key: 'INSTAGRAM_APP_SECRET',       label: 'App Secret',         placeholder: 'abc123...', secret: true },
    ],
  },
  {
    id: 'facebook', label: 'Facebook Messenger', color: '#1877F2', icon: '📘',
    webhookPath: '/api/v1/webhooks/facebook',
    docsUrl: 'https://developers.facebook.com/docs/messenger-platform',
    statusEndpoint: '/api/v1/meta/page',
    apiNote: 'Meta Graph API',
    fields: [
      { key: 'FACEBOOK_PAGE_ID',           label: 'Facebook Page ID',   placeholder: '1234567890' },
      { key: 'FACEBOOK_PAGE_ACCESS_TOKEN', label: 'Page Access Token',  placeholder: 'EAAxxxxx...', secret: true },
      { key: 'FACEBOOK_VERIFY_TOKEN',      label: 'Verify Token',       placeholder: 'tzmicha_crm3_verify' },
      { key: 'FACEBOOK_APP_SECRET',        label: 'App Secret',         placeholder: 'abc123...', secret: true },
    ],
  },
  {
    id: 'telegram', label: 'Telegram Bot', color: '#229ED9', icon: '✈️',
    webhookPath: '/api/v1/webhooks/telegram',
    docsUrl: 'https://core.telegram.org/bots/api',
    statusEndpoint: '',
    apiNote: 'Telegram Bot API',
    fields: [
      { key: 'TELEGRAM_BOT_TOKEN',      label: 'Bot Token',      placeholder: '123456:ABC-DEF...', secret: true },
      { key: 'TELEGRAM_WEBHOOK_SECRET', label: 'Webhook Secret', placeholder: 'your-secret-token' },
    ],
  },
];

// ── WhatsApp Setup Guide ──────────────────────────────────────
function WASetupGuide({ webhookUrl, verifyToken }: { webhookUrl: string; verifyToken: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string, key: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };
  const steps = [
    { n: 1, title: 'Create a Meta App', body: 'Go to developers.facebook.com → My Apps → Create App → Business type.' },
    { n: 2, title: 'Add WhatsApp Product', body: 'Inside your app → Add Product → WhatsApp → Set Up.' },
    { n: 3, title: 'Get Phone Number ID', body: 'WhatsApp → API Setup → copy the Phone Number ID shown under "From".' },
    { n: 4, title: 'Generate Access Token', body: 'On the same page, click "Generate access token" (temporary) or use a System User token for production.' },
    { n: 5, title: 'Register Webhook', body: 'WhatsApp → Configuration → Webhooks → Edit. Paste the URL and Verify Token below, then click Verify & Save.' },
    { n: 6, title: 'Subscribe to messages', body: 'After verifying, click "Manage" next to the webhook and enable the "messages" subscription.' },
  ];
  return (
    <div style={{ marginTop: 16, padding: '16px 18px', borderRadius: 12, background: 'rgba(37,211,102,0.06)', border: '1px solid rgba(37,211,102,0.20)' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#25D366', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
        <Phone size={14} /> WhatsApp Setup Guide
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {steps.map(s => (
          <div key={s.n} style={{ display: 'flex', gap: 10 }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#25D366', color: 'white', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{s.n}</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--crm-text)' }}>{s.title}</div>
              <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 2, lineHeight: 1.5 }}>{s.body}</div>
            </div>
          </div>
        ))}
      </div>
      {/* Copy fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          { label: 'Callback URL (paste in Meta)', value: webhookUrl },
          { label: 'Verify Token (paste in Meta)', value: verifyToken || 'tzmicha_crm3_verify' },
        ].map(f => (
          <div key={f.label}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{f.label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 9, background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.22)' }}>
              <code style={{ flex: 1, fontSize: 11, color: '#25D366', wordBreak: 'break-all' }}>{f.value}</code>
              <button onClick={() => copy(f.value, f.label)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied === f.label ? '#28c99a' : 'var(--crm-text-muted)', flexShrink: 0 }}>
                <Copy size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 9, background: '#25D366', color: 'white', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
          <ExternalLink size={12} /> Open Meta for Developers
        </a>
        <a href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" target="_blank" rel="noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 9, background: 'rgba(37,211,102,0.10)', border: '1px solid rgba(37,211,102,0.25)', color: '#25D366', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
          Docs
        </a>
      </div>
    </div>
  );
}

// ── Channel Card ──────────────────────────────────────────────
function ChannelCard({ ch }: { ch: ChannelConfig }) {
  const [values, setValues]     = useState<Record<string, string>>({});
  const [saved, setSaved]       = useState(false);
  const [saving, setSaving]     = useState(false);
  const [copied, setCopied]     = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [realStatus, setRealStatus] = useState<'loading' | 'connected' | 'not_configured'>('loading');
  const [statusDetail, setStatusDetail] = useState('');
  // Telegram-specific
  const [tgState, setTgState] = useState<'idle' | 'checking' | 'registering' | 'ok' | 'error'>('idle');
  const [tgMsg, setTgMsg]     = useState('');
  const [tgUrl, setTgUrl]     = useState('');

  const BACKEND    = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
  const webhookUrl = `https://crm3.tzmicha.com${ch.webhookPath}`;
  const getToken   = () => typeof window !== 'undefined' ? localStorage.getItem('crm_token') ?? '' : '';
  const authH      = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

  // ── Telegram: check via backend proxy (token never in browser) ──
  const checkTelegram = useCallback(async () => {
    setTgState('checking');
    try {
      const r = await fetch(`${BACKEND}/api/v1/settings/integrations/telegram/bot-info`, {
        headers: authH(),
      });
      const d = await r.json() as { configured: boolean; bot?: { username: string; first_name: string }; error?: string };
      if (d.configured && d.bot) {
        setTgUrl(`@${d.bot.username}`);
        setTgState('ok');
        setTgMsg(`✓ Bot: ${d.bot.first_name} (@${d.bot.username})`);
        setRealStatus('connected');
      } else {
        setTgState('idle');
        setTgMsg(d.error ?? 'Bot token not configured yet.');
        setRealStatus('not_configured');
      }
    } catch {
      setTgState('idle');
      setTgMsg('Could not reach backend.');
      setRealStatus('not_configured');
    }
  }, [BACKEND]);

  // ── Telegram: register webhook via backend ──
  const registerTelegramWebhook = async () => {
    setTgState('registering'); setTgMsg('');
    try {
      const r = await fetch(`${BACKEND}/api/v1/settings/integrations/telegram/register-webhook`, {
        method: 'POST',
        headers: authH(),
        body: JSON.stringify({ webhook_url: webhookUrl }),
      });
      const d = await r.json() as { ok: boolean; description?: string };
      if (d.ok) {
        setTgState('ok'); setTgUrl(webhookUrl);
        setTgMsg('✓ Webhook registered! Telegram will now deliver messages to your CRM.');
        setRealStatus('connected');
      } else {
        setTgState('error');
        setTgMsg(`Error: ${d.description ?? 'Unknown error'}`);
      }
    } catch {
      setTgState('error');
      setTgMsg('Network error. Check backend is running.');
    }
  };

  // ── Load creds + check status ──
  const loadAndCheck = useCallback(async () => {
    setRealStatus('loading'); setStatusDetail('');
    let loaded: Record<string, string> = {};
    try {
      const r = await fetch(`${BACKEND}/api/v1/settings/integrations/${ch.id}`, { headers: authH() });
      if (r.ok) { loaded = await r.json() as Record<string, string>; setValues(loaded); }
    } catch { /* silent */ }

    if (ch.id === 'telegram') { await checkTelegram(); return; }

    if (!ch.statusEndpoint) {
      const hasKeys = ch.fields.slice(0, 2).every(f => loaded[f.key]?.trim());
      setRealStatus(hasKeys ? 'connected' : 'not_configured');
      return;
    }
    try {
      const sr = await fetch(`${BACKEND}${ch.statusEndpoint}`, { headers: authH() });
      if (!sr.ok) { setRealStatus('not_configured'); return; }
      const d = await sr.json() as Record<string, unknown>;
      if (ch.id === 'whatsapp') {
        if (d.valid) {
          setRealStatus('connected');
          setStatusDetail(`${d.verified_name as string} · ${d.phone_number as string}`);
        } else if (d.configured) {
          setRealStatus('not_configured');
          setStatusDetail((d.error as string) ?? 'Invalid credentials');
        } else {
          setRealStatus('not_configured');
        }
      } else if (ch.id === 'instagram') {
        setRealStatus((d.configured as boolean) ? 'connected' : 'not_configured');
      } else {
        setRealStatus('connected');
      }
    } catch { setRealStatus('not_configured'); }
  }, [BACKEND, ch, checkTelegram]);

  useEffect(() => { void loadAndCheck(); }, [loadAndCheck]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${BACKEND}/api/v1/settings/integrations/${ch.id}`, {
        method: 'POST', headers: authH(), body: JSON.stringify(values),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      void loadAndCheck();
    } finally { setSaving(false); }
  };

  const statusBadge = () => {
    if (realStatus === 'loading') return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#8790aa', fontWeight: 600 }}>
        <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Checking…
      </span>
    );
    if (realStatus === 'connected') return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#28c99a', fontWeight: 600 }}>
        <CheckCircle size={13} /> Connected
      </span>
    );
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#8790aa', fontWeight: 600 }}>
        <XCircle size={13} /> Not configured
      </span>
    );
  };

  return (
    <div className="crm-glass" style={{ overflow: 'hidden' }}>
      {/* Header row */}
      <button onClick={() => setExpanded(e => !e)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ width: 44, height: 44, borderRadius: 14, background: `${ch.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
          {ch.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text)' }}>{ch.label}</div>
          <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', marginTop: 2 }}>
            {ch.apiNote} · {statusDetail || 'Webhook ready'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {statusBadge()}
          <span style={{ fontSize: 18, color: 'var(--crm-text-muted)', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>›</span>
        </div>
      </button>

      {expanded && (
        <div style={{ padding: '0 20px 20px', borderTop: '1px solid rgba(130,145,190,0.10)' }}>

          {/* Status banner */}
          <div style={{ marginTop: 14, marginBottom: 14, padding: '10px 14px', borderRadius: 10, background: realStatus === 'connected' ? 'rgba(40,201,154,0.08)' : 'rgba(244,201,93,0.08)', border: `1px solid ${realStatus === 'connected' ? 'rgba(40,201,154,0.25)' : 'rgba(244,201,93,0.25)'}`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: realStatus === 'connected' ? '#28c99a' : '#f4c95d', flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: realStatus === 'connected' ? '#28c99a' : '#f4c95d', fontWeight: 600, flex: 1 }}>
              {realStatus === 'connected'
                ? `✓ ${ch.label} is connected${statusDetail ? ` — ${statusDetail}` : ''}`
                : statusDetail || `Configure credentials below to connect ${ch.label}`}
            </span>
            <button onClick={() => void loadAndCheck()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}>
              <RefreshCw size={11} />
            </button>
          </div>

          {/* Webhook URL */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
              Webhook URL — paste this in Meta / Telegram
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'rgba(79,109,245,0.07)', border: '1px solid rgba(79,109,245,0.20)' }}>
              <code style={{ flex: 1, fontSize: 12, color: '#4f6df5', wordBreak: 'break-all' }}>{webhookUrl}</code>
              <button onClick={() => { void navigator.clipboard.writeText(webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? '#28c99a' : 'var(--crm-text-muted)', flexShrink: 0 }}>
                <Copy size={14} />
              </button>
            </div>
          </div>

          {/* Credential fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {ch.fields.map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 4 }}>{f.label}</label>
                <input
                  type={f.secret ? 'password' : 'text'}
                  placeholder={f.placeholder}
                  value={values[f.key] ?? ''}
                  onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid rgba(130,145,190,0.20)', background: 'rgba(255,255,255,0.05)', color: 'var(--crm-text)', fontSize: 13, boxSizing: 'border-box', outline: 'none' }}
                />
              </div>
            ))}
          </div>

          {/* Save + docs row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <button onClick={() => void handleSave()} disabled={saving}
              style={{ padding: '9px 20px', borderRadius: 10, background: ch.color, border: 'none', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save Credentials'}
            </button>
            {ch.id === 'whatsapp' && (
              <button onClick={() => setShowGuide(g => !g)}
                style={{ padding: '9px 16px', borderRadius: 10, background: 'rgba(37,211,102,0.10)', border: '1px solid rgba(37,211,102,0.25)', color: '#25D366', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {showGuide ? 'Hide Guide' : '📋 Setup Guide'}
              </button>
            )}
            <a href={ch.docsUrl} target="_blank" rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--crm-text-muted)', textDecoration: 'none' }}>
              <ExternalLink size={12} /> {ch.id === 'telegram' ? 'Telegram Docs' : 'Meta Docs'}
            </a>
          </div>

          {/* WhatsApp setup guide */}
          {ch.id === 'whatsapp' && showGuide && (
            <WASetupGuide webhookUrl={webhookUrl} verifyToken={values['WHATSAPP_VERIFY_TOKEN'] ?? ''} />
          )}

          {/* Telegram panel */}
          {ch.id === 'telegram' && (
            <div style={{ marginTop: 18, padding: '14px 16px', borderRadius: 12, background: 'rgba(34,158,217,0.07)', border: '1px solid rgba(34,158,217,0.20)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#229ED9', marginBottom: 10 }}>✈️ Telegram Webhook Registration</div>
              {tgState === 'checking' && (
                <div style={{ fontSize: 12, color: '#8790aa', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Checking…
                </div>
              )}
              {tgMsg && (
                <div style={{ fontSize: 12, color: tgState === 'ok' ? '#28c99a' : tgState === 'error' ? '#f46b72' : '#f4c95d', marginBottom: 10 }}>
                  {tgMsg}
                </div>
              )}
              {tgState === 'ok' && tgUrl && (
                <div style={{ fontSize: 12, color: '#28c99a', marginBottom: 10 }}>
                  Bot: <code style={{ color: '#229ED9' }}>{tgUrl}</code>
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
                Save your Bot Token above first, then click <strong>Register Webhook</strong>. Telegram will immediately start delivering messages to your CRM.
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => void registerTelegramWebhook()} disabled={tgState === 'registering'}
                  style={{ padding: '8px 16px', borderRadius: 9, background: '#229ED9', border: 'none', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: tgState === 'registering' ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {tgState === 'registering' ? <><Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> Registering…</> : '🔗 Register Webhook'}
                </button>
                <button onClick={() => void checkTelegram()}
                  style={{ padding: '8px 14px', borderRadius: 9, background: 'rgba(34,158,217,0.10)', border: '1px solid rgba(34,158,217,0.25)', color: '#229ED9', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <RefreshCw size={11} /> Check Status
                </button>
              </div>
            </div>
          )}

          {/* Not configured warning for Meta channels */}
          {realStatus === 'not_configured' && ch.id !== 'telegram' && statusDetail && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 13px', borderRadius: 10, background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.22)', fontSize: 12, color: '#f46b72' }}>
              <AlertCircle size={13} /> {statusDetail}
            </div>
          )}

        </div>
      )}
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 760 }}>
      <Link href="/settings" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--crm-text-muted)', textDecoration: 'none' }}>
        <ChevronLeft size={14} /> Back to Settings
      </Link>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Channel Integrations</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crm-text-muted)' }}>
          Connect WhatsApp, Instagram, Facebook Messenger & Telegram. Status verified live against each API.
        </p>
      </div>
      <div className="crm-glass" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4f6df5', flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>
          Credentials saved here are used by the Inbox, channel pages, and webhook handlers automatically.
        </span>
      </div>
      {CHANNELS.map(ch => <ChannelCard key={ch.id} ch={ch} />)}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
