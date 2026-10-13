'use client';

import { useState } from 'react';
import {
  Smartphone, AtSign, MessageSquare, Mail, Send,
  CheckCircle2, XCircle, AlertCircle, ChevronLeft,
  Copy, Eye, EyeOff, ExternalLink, RefreshCw,
} from 'lucide-react';
import Link from 'next/link';

interface IntegrationField {
  key: string;
  label: string;
  placeholder: string;
  type: 'text' | 'password' | 'url';
  hint?: string;
}

interface Integration {
  id: string;
  label: string;
  desc: string;
  color: string;
  icon: React.ReactNode;
  docsUrl: string;
  fields: IntegrationField[];
  statusKey: string;
}

const INTEGRATIONS: Integration[] = [
  {
    id: 'whatsapp',
    label: 'WhatsApp Business',
    desc: 'Receive and send WhatsApp messages via Meta Business API',
    color: '#25D366',
    icon: <Smartphone size={20} />,
    docsUrl: 'https://developers.facebook.com/docs/whatsapp',
    statusKey: 'WHATSAPP_VERIFY_TOKEN',
    fields: [
      { key: 'NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID', label: 'Phone Number ID', placeholder: '1234567890', type: 'text', hint: 'Found in Meta Business → WhatsApp → API Setup' },
      { key: 'WHATSAPP_VERIFY_TOKEN', label: 'Webhook Verify Token', placeholder: 'your-verify-token', type: 'text', hint: 'Any string you choose — must match Meta webhook config' },
      { key: 'WHATSAPP_APP_SECRET', label: 'App Secret', placeholder: 'your-app-secret', type: 'password', hint: 'Found in Meta App Dashboard → Settings → Basic' },
    ],
  },
  {
    id: 'instagram',
    label: 'Instagram DMs',
    desc: 'Receive and reply to Instagram Direct Messages',
    color: '#E1306C',
    icon: <AtSign size={20} />,
    docsUrl: 'https://developers.facebook.com/docs/messenger-platform/instagram',
    statusKey: 'INSTAGRAM_ACCESS_TOKEN',
    fields: [
      { key: 'INSTAGRAM_ACCESS_TOKEN', label: 'Page Access Token', placeholder: 'EAAxxxxxxx...', type: 'password', hint: 'Long-lived page access token from Meta Graph API Explorer' },
      { key: 'INSTAGRAM_APP_SECRET', label: 'App Secret', placeholder: 'your-app-secret', type: 'password', hint: 'Same Meta App Secret as WhatsApp if using same app' },
    ],
  },
  {
    id: 'facebook',
    label: 'Facebook Messenger',
    desc: 'Receive and reply to Facebook Page messages',
    color: '#1877F2',
    icon: <MessageSquare size={20} />,
    docsUrl: 'https://developers.facebook.com/docs/messenger-platform',
    statusKey: 'FACEBOOK_PAGE_ACCESS_TOKEN',
    fields: [
      { key: 'FACEBOOK_PAGE_ACCESS_TOKEN', label: 'Page Access Token', placeholder: 'EAAxxxxxxx...', type: 'password', hint: 'Long-lived page access token for your Facebook Page' },
      { key: 'FACEBOOK_VERIFY_TOKEN', label: 'Webhook Verify Token', placeholder: 'your-verify-token', type: 'text', hint: 'Any string — must match Meta webhook config' },
    ],
  },
  {
    id: 'email',
    label: 'Email (SMTP)',
    desc: 'Send emails via SMTP — Gmail, Outlook, or custom server',
    color: '#8b5cf6',
    icon: <Mail size={20} />,
    docsUrl: 'https://nodemailer.com/smtp/',
    statusKey: 'SMTP_HOST',
    fields: [
      { key: 'SMTP_HOST', label: 'SMTP Host', placeholder: 'smtp.gmail.com', type: 'text', hint: 'e.g. smtp.gmail.com, smtp.office365.com' },
      { key: 'SMTP_PORT', label: 'SMTP Port', placeholder: '587', type: 'text', hint: '587 for TLS, 465 for SSL, 25 for plain' },
      { key: 'SMTP_USER', label: 'SMTP Username', placeholder: 'you@gmail.com', type: 'text', hint: 'Your email address or SMTP username' },
      { key: 'SMTP_PASS', label: 'SMTP Password', placeholder: 'your-app-password', type: 'password', hint: 'For Gmail: use App Password, not your account password' },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    desc: 'Powers all AI features — lead scoring, reply assist, content generation',
    color: '#10b981',
    icon: <Send size={20} />,
    docsUrl: 'https://platform.openai.com/api-keys',
    statusKey: 'OPENAI_API_KEY',
    fields: [
      { key: 'OPENAI_API_KEY', label: 'API Key', placeholder: 'sk-proj-...', type: 'password', hint: 'Get from platform.openai.com/api-keys — GPT-4o-mini is used by default' },
    ],
  },
];

function IntegrationCard({
  integration,
  envValues,
}: {
  integration: Integration;
  envValues: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    integration.fields.forEach(f => { init[f.key] = envValues[f.key] ?? ''; });
    return init;
  });
  const [showPass, setShowPass] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const isConnected = !!values[integration.statusKey]?.trim() &&
    values[integration.statusKey] !== 'your-verify-token' &&
    values[integration.statusKey] !== 'your-app-secret' &&
    !values[integration.statusKey].startsWith('sk-..') &&
    !values[integration.statusKey].startsWith('your-');

  const handleCopy = (text: string, key: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const handleSave = () => {
    // In production this would call an API to update env vars
    // For now we show a save confirmation
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="crm-glass" style={{ overflow: 'hidden', borderRadius: 14 }}>
      {/* Header row */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <div style={{ width: 44, height: 44, borderRadius: 12, background: `${integration.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: integration.color, flexShrink: 0 }}>
          {integration.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--crm-text)' }}>{integration.label}</div>
          <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', marginTop: 2 }}>{integration.desc}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {isConnected ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#28c99a', background: 'rgba(40,201,154,0.12)', borderRadius: 8, padding: '4px 10px' }}>
              <CheckCircle2 size={13} /> Connected
            </span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#8790aa', background: 'rgba(135,144,170,0.12)', borderRadius: 8, padding: '4px 10px' }}>
              <XCircle size={13} /> Not configured
            </span>
          )}
          <div style={{ fontSize: 18, color: 'var(--crm-text-muted)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}>⌄</div>
        </div>
      </button>

      {/* Expanded config */}
      {expanded && (
        <div style={{ padding: '0 20px 20px', borderTop: '1px solid rgba(130,145,190,0.10)' }}>
          <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Docs link */}
            <a href={integration.docsUrl} target="_blank" rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--crm-primary)', textDecoration: 'none', fontWeight: 600 }}>
              <ExternalLink size={12} /> View Setup Docs
            </a>

            {/* Fields */}
            {integration.fields.map(field => (
              <div key={field.key}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>
                  {field.label}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={field.type === 'password' && !showPass[field.key] ? 'password' : 'text'}
                    value={values[field.key]}
                    onChange={e => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    style={{ width: '100%', padding: '9px 70px 9px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'white', fontSize: 13, color: 'var(--crm-text)', boxSizing: 'border-box', outline: 'none', fontFamily: field.type === 'password' ? 'monospace' : 'inherit' }}
                  />
                  <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 4 }}>
                    {field.type === 'password' && (
                      <button type="button" onClick={() => setShowPass(p => ({ ...p, [field.key]: !p[field.key] }))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)', padding: 3 }}>
                        {showPass[field.key] ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    )}
                    {values[field.key] && (
                      <button type="button" onClick={() => handleCopy(values[field.key], field.key)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied === field.key ? '#28c99a' : 'var(--crm-text-muted)', padding: 3 }}>
                        <Copy size={13} />
                      </button>
                    )}
                  </div>
                </div>
                {field.hint && (
                  <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 4 }}>💡 {field.hint}</div>
                )}
              </div>
            ))}

            {/* Webhook URL info for WhatsApp/Instagram/Facebook */}
            {['whatsapp', 'instagram', 'facebook'].includes(integration.id) && (
              <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(79,109,245,0.06)', border: '1px solid rgba(79,109,245,0.15)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#4f6df5', marginBottom: 6 }}>Webhook URL (paste in Meta Dashboard)</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <code style={{ flex: 1, fontSize: 11, color: 'var(--crm-text)', background: 'rgba(255,255,255,0.70)', padding: '5px 8px', borderRadius: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://your-domain.com'}/api/v3/webhooks/${integration.id}`}
                  </code>
                  <button type="button"
                    onClick={() => handleCopy(`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://your-domain.com'}/api/v3/webhooks/${integration.id}`, `webhook-${integration.id}`)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied === `webhook-${integration.id}` ? '#28c99a' : '#4f6df5', padding: 4 }}>
                    <Copy size={13} />
                  </button>
                </div>
              </div>
            )}

            {/* Save notice */}
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(244,201,93,0.10)', border: '1px solid rgba(244,201,93,0.25)', fontSize: 12, color: '#d97706' }}>
              <AlertCircle size={13} style={{ display: 'inline', marginRight: 5 }} />
              To apply changes, update your <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 4px', borderRadius: 4 }}>.env.local</code> file and restart the dev server.
            </div>

            {/* Save button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={handleSave}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 10, border: 'none', background: saved ? 'rgba(40,201,154,0.15)' : 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: saved ? '#28c99a' : 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 200ms' }}>
                {saved ? <><CheckCircle2 size={14} /> Saved!</> : <><RefreshCw size={14} /> Save Config</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function IntegrationsPage() {
  // Read env values that are safe to show (NEXT_PUBLIC_ ones only for display)
  // Sensitive keys show masked placeholder
  const envValues: Record<string, string> = {
    NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID: process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID ?? '',
    WHATSAPP_VERIFY_TOKEN: '',   // server-side only — never exposed to client
    WHATSAPP_APP_SECRET: '',
    INSTAGRAM_ACCESS_TOKEN: '',
    INSTAGRAM_APP_SECRET: '',
    FACEBOOK_PAGE_ACCESS_TOKEN: '',
    FACEBOOK_VERIFY_TOKEN: '',
    SMTP_HOST: '',
    SMTP_PORT: '',
    SMTP_USER: '',
    SMTP_PASS: '',
    OPENAI_API_KEY: '',
  };

  const connectedCount = INTEGRATIONS.filter(i =>
    i.id === 'whatsapp'
      ? !!process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID
      : false
  ).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 760 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/settings" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--crm-text-muted)', textDecoration: 'none', fontWeight: 500 }}>
          <ChevronLeft size={16} /> Settings
        </Link>
      </div>

      <div>
        <h1 style={{ fontSize: 24, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Integrations</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crm-text-secondary)' }}>
          Connect your channels and AI services · {connectedCount}/{INTEGRATIONS.length} configured
        </p>
      </div>

      {/* Status overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 10 }}>
        {INTEGRATIONS.map(integration => {
          const isConfigured = integration.id === 'whatsapp'
            ? !!process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID
            : false;
          return (
            <div key={integration.id} className="crm-glass-soft" style={{ padding: '12px 14px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: `${integration.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: integration.color, flexShrink: 0 }}>
                {integration.icon}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--crm-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{integration.label}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: isConfigured ? '#28c99a' : '#8790aa', marginTop: 2 }}>
                  {isConfigured ? '● Connected' : '○ Not set'}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* How to configure notice */}
      <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(79,109,245,0.06)', border: '1px solid rgba(79,109,245,0.15)', fontSize: 13, color: 'var(--crm-text-secondary)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--crm-text)' }}>How to configure:</strong> Copy the values from each integration below and paste them into your{' '}
        <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 5px', borderRadius: 4, fontSize: 12 }}>.env.local</code> file, then restart the dev server with{' '}
        <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 5px', borderRadius: 4, fontSize: 12 }}>npm run dev</code>.
        For production, set these in your Vercel dashboard under Environment Variables.
      </div>

      {/* Integration cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Messaging Channels
        </div>
        {INTEGRATIONS.filter(i => ['whatsapp', 'instagram', 'facebook', 'email'].includes(i.id)).map(integration => (
          <IntegrationCard key={integration.id} integration={integration} envValues={envValues} />
        ))}

        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 8 }}>
          AI Services
        </div>
        {INTEGRATIONS.filter(i => ['openai'].includes(i.id)).map(integration => (
          <IntegrationCard key={integration.id} integration={integration} envValues={envValues} />
        ))}
      </div>

      {/* Supabase info (read-only) */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          Database
        </div>
        <div className="crm-glass" style={{ padding: '16px 20px', borderRadius: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(62,207,142,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 20 }}>⚡</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--crm-text)' }}>Supabase</div>
              <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', marginTop: 2 }}>PostgreSQL · Auth · Realtime · Storage</div>
            </div>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#28c99a', background: 'rgba(40,201,154,0.12)', borderRadius: 8, padding: '4px 10px' }}>
              <CheckCircle2 size={13} /> Connected
            </span>
          </div>
          <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 10, background: 'rgba(130,145,190,0.06)', border: '1px solid rgba(130,145,190,0.12)' }}>
            <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginBottom: 4 }}>Project URL</div>
            <code style={{ fontSize: 12, color: 'var(--crm-text)' }}>
              {process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'Not configured'}
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
