'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, Copy, ExternalLink, ChevronLeft, Loader2, RefreshCw } from 'lucide-react';
import Link from 'next/link';

interface ChannelConfig {
  id: 'whatsapp' | 'instagram' | 'facebook' | 'telegram';
  label: string; color: string; icon: string;
  fields: { key: string; label: string; placeholder: string; secret?: boolean }[];
  webhookPath: string; docsUrl: string;
  statusEndpoint: string;
  webhookNote?: string;
  apiNote?: string;
}

const CHANNELS: ChannelConfig[] = [
  {
    id: 'telegram', label: 'Telegram Bot', color: '#229ED9', icon: '✈️',
    webhookPath: '/api/v1/webhooks/telegram',
    docsUrl: 'https://core.telegram.org/bots/api',
    statusEndpoint: '',
    fields: [
      { key: 'TELEGRAM_BOT_TOKEN',      label: 'Bot Token',      placeholder: '123456:ABC-DEF...', secret: true },
      { key: 'TELEGRAM_WEBHOOK_SECRET', label: 'Webhook Secret', placeholder: 'your-secret-token' },
    ],
    webhookNote: 'Auto-registered via Telegram Bot API',
    apiNote: 'Telegram Bot API',
  },
  {
    id: 'instagram', label: 'Instagram DMs', color: '#E1306C', icon: '📸',
    webhookPath: '/api/v1/webhooks/instagram',
    docsUrl: 'https://developers.facebook.com/docs/messenger-platform/instagram',
    statusEndpoint: '/api/v1/instagram/status',
    fields: [
      { key: 'INSTAGRAM_PAGE_ID',          label: 'Instagram Page ID',   placeholder: '17641442196029096' },
      { key: 'INSTAGRAM_VERIFY_TOKEN',     label: 'Verify Token',        placeholder: 'tzmicha_crm3_verify_2024' },
      { key: 'INSTAGRAM_APP_SECRET',       label: 'App Secret',          placeholder: 'abc123...', secret: true },
      { key: 'FACEBOOK_PAGE_ACCESS_TOKEN', label: 'Page Access Token',   placeholder: 'EAAxxxxx...', secret: true },
    ],
  },
  {
    id: 'facebook', label: 'Facebook Messenger', color: '#1877F2', icon: '📘',
    webhookPath: '/api/v1/webhooks/facebook',
    docsUrl: 'https://developers.facebook.com/docs/messenger-platform',
    statusEndpoint: '/api/v1/meta/page',
    fields: [
      { key: 'FACEBOOK_PAGE_ID',           label: 'Facebook Page ID',    placeholder: '1234567890' },
      { key: 'FACEBOOK_VERIFY_TOKEN',      label: 'Verify Token',        placeholder: 'tzmicha_crm3_verify_2024' },
      { key: 'FACEBOOK_APP_SECRET',        label: 'App Secret',          placeholder: 'abc123...', secret: true },
      { key: 'FACEBOOK_PAGE_ACCESS_TOKEN', label: 'Page Access Token',   placeholder: 'EAAxxxxx...', secret: true },
    ],
  },
  {
    id: 'whatsapp', label: 'WhatsApp Business', color: '#25D366', icon: '💬',
    webhookPath: '/api/v1/webhooks/whatsapp',
    docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
    statusEndpoint: '',
    fields: [
      { key: 'WHATSAPP_ACCESS_TOKEN',      label: 'Access Token',        placeholder: 'EAAxxxxx...', secret: true },
      { key: 'WHATSAPP_PHONE_NUMBER_ID',   label: 'Phone Number ID',     placeholder: '1234567890' },
      { key: 'WHATSAPP_VERIFY_TOKEN',      label: 'Verify Token',        placeholder: 'tzmicha_crm3_verify_2024' },
      { key: 'WHATSAPP_APP_SECRET',        label: 'App Secret',          placeholder: 'abc123...', secret: true },
    ],
  },
];

function ChannelCard({ ch }: { ch: ChannelConfig }) {
  const [values, setValues]     = useState<Record<string, string>>({});
  const [saved, setSaved]       = useState(false);
  const [saving, setSaving]     = useState(false);
  const [copied, setCopied]     = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [realStatus, setRealStatus] = useState<'loading' | 'connected' | 'not_configured'>('loading');
  // Telegram-specific
  const [tgWebhookState, setTgWebhookState] = useState<'idle' | 'checking' | 'registering' | 'ok' | 'error'>('idle');
  const [tgWebhookMsg, setTgWebhookMsg]     = useState('');
  const [tgWebhookUrl, setTgWebhookUrl]     = useState('');

  const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
  const webhookUrl = `https://crm3.tzmicha.com${ch.webhookPath}`;
  const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('crm_token') ?? '' : '';

  // ── Check Telegram webhook status via getWebhookInfo ──────
  const checkTelegramWebhook = useCallback(async (botToken: string) => {
    if (!botToken) return;
    setTgWebhookState('checking');
    try {
      const r = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
      const d = await r.json() as { ok: boolean; result: { url: string; last_error_message?: string } };
      if (d.ok && d.result.url) {
        setTgWebhookUrl(d.result.url);
        setTgWebhookState('ok');
        setTgWebhookMsg(d.result.last_error_message ? `⚠ Last error: ${d.result.last_error_message}` : '');
        setRealStatus('connected');
      } else {
        setTgWebhookState('idle');
        setTgWebhookMsg('No webhook registered yet.');
        setRealStatus('not_configured');
      }
    } catch {
      setTgWebhookState('idle');
      setTgWebhookMsg('Could not reach Telegram API.');
    }
  }, []);

  // ── Register webhook by calling setWebhook directly ───────
  const registerTelegramWebhook = async () => {
    const botToken = values['TELEGRAM_BOT_TOKEN']?.trim();
    const secret   = values['TELEGRAM_WEBHOOK_SECRET']?.trim();
    if (!botToken) {
      setTgWebhookMsg('Save your Bot Token first, then register.');
      setTgWebhookState('error');
      return;
    }
    setTgWebhookState('registering');
    setTgWebhookMsg('');
    try {
      const url = new URL(`https://api.telegram.org/bot${botToken}/setWebhook`);
      url.searchParams.set('url', webhookUrl);
      url.searchParams.set('allowed_updates', JSON.stringify(['message', 'edited_message', 'callback_query']));
      if (secret) url.searchParams.set('secret_token', secret);
      const r = await fetch(url.toString());
      const d = await r.json() as { ok: boolean; description: string };
      if (d.ok) {
        setTgWebhookState('ok');
        setTgWebhookUrl(webhookUrl);
        setTgWebhookMsg('✓ Webhook registered! Telegram will now deliver messages to your CRM.');
        setRealStatus('connected');
      } else {
        setTgWebhookState('error');
        setTgWebhookMsg(`Telegram error: ${d.description}`);
      }
    } catch {
      setTgWebhookState('error');
      setTgWebhookMsg('Network error. Check your bot token and try again.');
    }
  };

  // ── Delete webhook ─────────────────────────────────────────
  const deleteTelegramWebhook = async () => {
    const botToken = values['TELEGRAM_BOT_TOKEN']?.trim();
    if (!botToken) return;
    setTgWebhookState('registering');
    try {
      const r = await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook`);
      const d = await r.json() as { ok: boolean };
      if (d.ok) {
        setTgWebhookState('idle');
        setTgWebhookUrl('');
        setTgWebhookMsg('Webhook removed.');
        setRealStatus('not_configured');
      }
    } catch {
      setTgWebhookState('error');
      setTgWebhookMsg('Failed to delete webhook.');
    }
  };

  // ── Load saved values + check real status ─────────────────
  const loadAndCheck = useCallback(async () => {
    setRealStatus('loading');
    let loaded: Record<string, string> = {};
    try {
      const r = await fetch(`${BACKEND}/api/v1/settings/integrations/${ch.id}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (r.ok) {
        loaded = await r.json() as Record<string, string>;
        setValues(loaded);
      }
    } catch { /* silent */ }

    if (ch.id === 'telegram') {
      await checkTelegramWebhook(loaded['TELEGRAM_BOT_TOKEN'] ?? '');
      return;
    }

    if (!ch.statusEndpoint) {
      const hasKeys = ch.fields.slice(0, 2).every(f => loaded[f.key]?.trim());
      setRealStatus(hasKeys ? 'connected' : 'not_configured');
      return;
    }
    try {
      const sr = await fetch(`${BACKEND}${ch.statusEndpoint}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (sr.ok) {
        if (ch.id === 'instagram') {
          const d = await sr.json() as { configured: boolean };
          setRealStatus(d.configured ? 'connected' : 'not_configured');
        } else {
          setRealStatus('connected');
        }
      } else {
        setRealStatus('not_configured');
      }
    } catch {
      setRealStatus('not_configured');
    }
  }, [BACKEND, ch, checkTelegramWebhook]);

  useEffect(() => { void loadAndCheck(); }, [loadAndCheck]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${BACKEND}/api/v1/settings/integrations/${ch.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(values),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      void loadAndCheck();
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = () => {
    if (realStatus === 'loading') return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#8790aa', fontWeight: 600 }}>
        <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Checking...
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
      <button
        onClick={() => setExpanded(e => !e)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <div style={{ width: 44, height: 44, borderRadius: 14, background: `${ch.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
          {ch.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text)' }}>{ch.label}</div>
          <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', marginTop: 2 }}>{ch.apiNote ?? 'Meta Cloud API'} · Webhook ready</div>
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
            <span style={{ fontSize: 12, color: realStatus === 'connected' ? '#28c99a' : '#f4c95d', fontWeight: 600 }}>
              {realStatus === 'connected' ? `✓ ${ch.label} is connected and working` : `Configure credentials below to connect ${ch.label}`}
            </span>
            <button onClick={() => void loadAndCheck()} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}>
              <RefreshCw size={11} />
            </button>
          </div>

          {/* Webhook URL */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
              Webhook URL
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'rgba(79,109,245,0.07)', border: '1px solid rgba(79,109,245,0.20)' }}>
              <code style={{ flex: 1, fontSize: 12, color: '#4f6df5', wordBreak: 'break-all' }}>{webhookUrl}</code>
              <button onClick={() => { void navigator.clipboard.writeText(webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? '#28c99a' : 'var(--crm-text-muted)', flexShrink: 0 }}>
                <Copy size={14} />
              </button>
            </div>
          </div>

          {/* Fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {ch.fields.map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 4 }}>{f.label}</label>
                <input
                  type={f.secret ? 'password' : 'text'}
                  placeholder={f.placeholder}
                  value={values[f.key] ?? ''}
                  onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid rgba(130,145,190,0.20)', background: 'rgba(255,255,255,0.05)', color: 'var(--crm-text)', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
            ))}
          </div>

          {/* Save row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              style={{ padding: '9px 20px', borderRadius: 10, background: ch.color, border: 'none', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}
            >
              {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Credentials'}
            </button>
            <a href={ch.docsUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--crm-text-muted)', textDecoration: 'none' }}>
              <ExternalLink size={12} /> {ch.id === 'telegram' ? 'Telegram Docs' : 'Meta Docs'}
            </a>
          </div>

          {/* ── Telegram-only: Webhook Registration Panel ── */}
          {ch.id === 'telegram' && (
            <div style={{ marginTop: 18, padding: '14px 16px', borderRadius: 12, background: 'rgba(34,158,217,0.07)', border: '1px solid rgba(34,158,217,0.20)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#229ED9', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                ✈️ Telegram Webhook Registration
              </div>

              {/* Current webhook status */}
              {tgWebhookState === 'checking' && (
                <div style={{ fontSize: 12, color: '#8790aa', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Checking webhook status...
                </div>
              )}
              {tgWebhookState === 'ok' && tgWebhookUrl && (
                <div style={{ fontSize: 12, color: '#28c99a', marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <CheckCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>Webhook active: <code style={{ color: '#229ED9', fontSize: 11 }}>{tgWebhookUrl}</code></span>
                </div>
              )}
              {tgWebhookMsg && tgWebhookState !== 'ok' && (
                <div style={{ fontSize: 12, color: tgWebhookState === 'error' ? '#f46b72' : '#f4c95d', marginBottom: 10 }}>
                  {tgWebhookMsg}
                </div>
              )}
              {tgWebhookMsg && tgWebhookState === 'ok' && tgWebhookMsg.startsWith('✓') && (
                <div style={{ fontSize: 12, color: '#28c99a', marginBottom: 10 }}>{tgWebhookMsg}</div>
              )}

              <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
                Telegram verifies webhooks differently from Meta — no challenge needed. Click <strong>Register Webhook</strong> and Telegram will immediately start sending messages to your CRM. No curl required.
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => void registerTelegramWebhook()}
                  disabled={tgWebhookState === 'registering'}
                  style={{ padding: '8px 16px', borderRadius: 9, background: '#229ED9', border: 'none', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: tgWebhookState === 'registering' ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {tgWebhookState === 'registering' ? <><Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> Registering...</> : '🔗 Register Webhook'}
                </button>
                {tgWebhookState === 'ok' && (
                  <button
                    onClick={() => void deleteTelegramWebhook()}
                    style={{ padding: '8px 14px', borderRadius: 9, background: 'rgba(244,107,114,0.10)', border: '1px solid rgba(244,107,114,0.25)', color: '#f46b72', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Remove Webhook
                  </button>
                )}
                <button
                  onClick={() => void checkTelegramWebhook(values['TELEGRAM_BOT_TOKEN'] ?? '')}
                  style={{ padding: '8px 14px', borderRadius: 9, background: 'rgba(34,158,217,0.10)', border: '1px solid rgba(34,158,217,0.25)', color: '#229ED9', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  <RefreshCw size={11} /> Check Status
                </button>
              </div>
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
          Connect WhatsApp, Instagram, Facebook Messenger & Telegram.
          Status is verified live against the API — same status shown everywhere in the app.
        </p>
      </div>
      <div className="crm-glass" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4f6df5' }} />
        <span style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>
          Credentials saved here are automatically used by the Inbox, Profile pages, and webhook handlers — no need to configure in multiple places.
        </span>
      </div>
      {CHANNELS.map(ch => <ChannelCard key={ch.id} ch={ch} />)}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
