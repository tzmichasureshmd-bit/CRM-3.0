'use client';

import { useState } from 'react';
import { CheckCircle, XCircle, Copy, ExternalLink, ChevronLeft } from 'lucide-react';
import Link from 'next/link';

// ── Types ────────────────────────────────────────────────────
interface ChannelConfig {
  id: 'whatsapp' | 'instagram' | 'facebook';
  label: string;
  color: string;
  icon: string;
  fields: { key: string; label: string; placeholder: string; secret?: boolean }[];
  webhookPath: string;
  docsUrl: string;
}

// ── Channel definitions ──────────────────────────────────────
const CHANNELS: ChannelConfig[] = [
  {
    id: 'whatsapp',
    label: 'WhatsApp Business',
    color: '#25D366',
    icon: '💬',
    webhookPath: '/api/v1/webhooks/whatsapp',
    docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
    fields: [
      { key: 'WHATSAPP_ACCESS_TOKEN',     label: 'Access Token',       placeholder: 'EAAxxxxx...', secret: true },
      { key: 'WHATSAPP_PHONE_NUMBER_ID',  label: 'Phone Number ID',    placeholder: '1234567890' },
      { key: 'WHATSAPP_VERIFY_TOKEN',     label: 'Verify Token',       placeholder: 'my_verify_token_123' },
      { key: 'WHATSAPP_APP_SECRET',       label: 'App Secret',         placeholder: 'abc123...', secret: true },
    ],
  },
  {
    id: 'instagram',
    label: 'Instagram DMs',
    color: '#E1306C',
    icon: '📸',
    webhookPath: '/api/v1/webhooks/instagram',
    docsUrl: 'https://developers.facebook.com/docs/messenger-platform/instagram',
    fields: [
      { key: 'INSTAGRAM_PAGE_ID',         label: 'Instagram Page ID',  placeholder: '1234567890' },
      { key: 'INSTAGRAM_VERIFY_TOKEN',    label: 'Verify Token',       placeholder: 'my_verify_token_123' },
      { key: 'INSTAGRAM_APP_SECRET',      label: 'App Secret',         placeholder: 'abc123...', secret: true },
      { key: 'FACEBOOK_PAGE_ACCESS_TOKEN',label: 'Page Access Token',  placeholder: 'EAAxxxxx...', secret: true },
    ],
  },
  {
    id: 'facebook',
    label: 'Facebook Messenger',
    color: '#1877F2',
    icon: '📘',
    webhookPath: '/api/v1/webhooks/facebook',
    docsUrl: 'https://developers.facebook.com/docs/messenger-platform',
    fields: [
      { key: 'FACEBOOK_PAGE_ID',          label: 'Facebook Page ID',   placeholder: '1234567890' },
      { key: 'FACEBOOK_VERIFY_TOKEN',     label: 'Verify Token',       placeholder: 'my_verify_token_123' },
      { key: 'FACEBOOK_APP_SECRET',       label: 'App Secret',         placeholder: 'abc123...', secret: true },
      { key: 'FACEBOOK_PAGE_ACCESS_TOKEN',label: 'Page Access Token',  placeholder: 'EAAxxxxx...', secret: true },
    ],
  },
];

// ── Channel Card ─────────────────────────────────────────────
function ChannelCard({ ch }: { ch: ChannelConfig }) {
  const [values, setValues]     = useState<Record<string, string>>({});
  const [saved, setSaved]       = useState(false);
  const [saving, setSaving]     = useState(false);
  const [copied, setCopied]     = useState(false);
  const [expanded, setExpanded] = useState(false);

  const isConnected = ch.fields.every(f => values[f.key]?.trim());
  const webhookUrl  = `${typeof window !== 'undefined' ? window.location.origin.replace('3000', '8000') : 'https://your-backend.com'}${ch.webhookPath}`;

  const handleSave = async () => {
    setSaving(true);
    // In production: POST to /api/v3/settings/integrations with values
    await new Promise(r => setTimeout(r, 600));
    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 3000);
  };

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="crm-glass" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <div style={{ width: 44, height: 44, borderRadius: 14, background: `${ch.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
          {ch.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text)' }}>{ch.label}</div>
          <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', marginTop: 2 }}>
            Meta Cloud API · Webhook ready
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isConnected
            ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#28c99a', fontWeight: 600 }}><CheckCircle size={13} /> Connected</span>
            : <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#8790aa', fontWeight: 600 }}><XCircle size={13} /> Not configured</span>
          }
          <span style={{ fontSize: 18, color: 'var(--crm-text-muted)', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>›</span>
        </div>
      </button>

      {/* Expanded config */}
      {expanded && (
        <div style={{ padding: '0 20px 20px', borderTop: '1px solid rgba(130,145,190,0.10)' }}>

          {/* Webhook URL */}
          <div style={{ marginTop: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
              Webhook URL (paste in Meta App Dashboard)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'rgba(79,109,245,0.07)', border: '1px solid rgba(79,109,245,0.20)' }}>
              <code style={{ flex: 1, fontSize: 12, color: '#4f6df5', wordBreak: 'break-all' }}>{webhookUrl}</code>
              <button onClick={copyWebhook} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? '#28c99a' : 'var(--crm-text-muted)', flexShrink: 0 }}>
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

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ padding: '9px 20px', borderRadius: 10, background: ch.color, border: 'none', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}
            >
              {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save & Connect'}
            </button>
            <a href={ch.docsUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--crm-text-muted)', textDecoration: 'none' }}>
              <ExternalLink size={12} /> Meta Docs
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Setup Steps ──────────────────────────────────────────────
const STEPS = [
  'Go to developers.facebook.com → Create App → Business type',
  'Add products: WhatsApp, Messenger, Instagram (as needed)',
  'Under each product → Webhooks → paste the Webhook URL above',
  'Set Verify Token (same value you enter in the field below)',
  'Subscribe to: messages, messaging_postbacks events',
  'Copy Access Token & App Secret → paste below → Save',
];

// ── Page ─────────────────────────────────────────────────────
export default function IntegrationsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 760 }}>
      {/* Back */}
      <Link href="/settings" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--crm-text-muted)', textDecoration: 'none' }}>
        <ChevronLeft size={14} /> Back to Settings
      </Link>

      <div>
        <h1 style={{ fontSize: 22, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Meta Integrations</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crm-text-muted)' }}>Connect WhatsApp, Instagram & Facebook Messenger via Meta Cloud API</p>
      </div>

      {/* Setup guide */}
      <div className="crm-glass" style={{ padding: '16px 20px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Quick Setup Guide</div>
        <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {STEPS.map((s, i) => (
            <li key={i} style={{ fontSize: 13, color: 'var(--crm-text-secondary)' }}>{s}</li>
          ))}
        </ol>
        <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 12, fontSize: 12, color: '#4f6df5', textDecoration: 'none', fontWeight: 600 }}>
          <ExternalLink size={12} /> Open Meta Developer Console
        </a>
      </div>

      {/* Channel cards */}
      {CHANNELS.map(ch => <ChannelCard key={ch.id} ch={ch} />)}
    </div>
  );
}
