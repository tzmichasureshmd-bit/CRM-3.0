'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, Copy, Check, Clock, ShieldCheck, Headphones, TrendingUp, AlertCircle } from 'lucide-react';
import { v3fetch } from '@/lib/auth-client';

const WHATSAPP_DISPLAY = '9346947043';
const WHATSAPP_INTL = '919346947043';
const WHATSAPP_MESSAGE = 'Hello, I need assistance with TZMICHA CRM billing.';
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_INTL}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;

interface BillingData {
  plan: {
    key: string;
    name: string;
    limits: Record<string, number>;
    features: string[];
    started_at: string | null;
  };
  usage: {
    contacts: number;
    broadcasts_this_month: number;
    automations: number;
    agents: number;
  };
  utilization: Record<string, number | null>;
}

function WhatsAppIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

function UsageBar({ label, used, limit, pct }: { label: string; used: number; limit: number; pct: number | null }) {
  const isUnlimited = limit === -1;
  const barPct = isUnlimited ? 0 : Math.min(pct ?? 0, 100);
  const barColor = barPct >= 90 ? '#f46b72' : barPct >= 70 ? '#f4c95d' : '#28c99a';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-text)' }}>{label}</span>
        <span style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>
          {used.toLocaleString()} / {isUnlimited ? '∞' : limit.toLocaleString()}
          {!isUnlimited && pct !== null && <span style={{ marginLeft: 6, fontWeight: 700, color: barColor }}>{pct}%</span>}
        </span>
      </div>
      {!isUnlimited && (
        <div style={{ height: 6, borderRadius: 3, background: 'rgba(130,145,190,0.15)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${barPct}%`, borderRadius: 3, background: barColor, transition: 'width 0.4s ease' }} />
        </div>
      )}
      {isUnlimited && <div style={{ fontSize: 11, color: '#28c99a', fontWeight: 600 }}>Unlimited</div>}
    </div>
  );
}

export default function BillingPage() {
  const [copied, setCopied] = useState(false);
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    v3fetch('/api/v3/billing')
      .then(r => r.ok ? r.json() as Promise<BillingData> : Promise.reject())
      .then(d => setBilling(d))
      .catch(() => setLoadError(true));
  }, []);

  const handleCopy = () => {
    void navigator.clipboard?.writeText(WHATSAPP_DISPLAY);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="crm-bill-page">
      <div className="crm-bill-inner">
        <Link href="/settings" className="crm-bill-breadcrumb">
          <ChevronLeft size={16} /> Settings
        </Link>

        <div className="crm-bill-hero">
          <span className="crm-bill-badge"><i /> Billing &amp; Usage</span>
          <h1 className="crm-bill-title">Plan &amp; Usage</h1>
          <p className="crm-bill-subtitle">Monitor your usage and contact our consultant for plan changes.</p>
        </div>

        {/* Live usage card */}
        {billing && (
          <div className="crm-glass" style={{ padding: '20px 24px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <TrendingUp size={18} color="#4f6df5" />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text)' }}>{billing.plan.name} Plan</div>
                  {billing.plan.started_at && (
                    <div style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>Since {new Date(billing.plan.started_at).toLocaleDateString()}</div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'flex-end', maxWidth: 280 }}>
                {billing.plan.features.slice(0, 3).map(f => (
                  <span key={f} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 5, background: 'rgba(79,109,245,0.08)', color: '#4f6df5', fontWeight: 600 }}>{f}</span>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <UsageBar label="Contacts" used={billing.usage.contacts} limit={billing.plan.limits.contacts} pct={billing.utilization.contacts} />
              <UsageBar label="Broadcasts this month" used={billing.usage.broadcasts_this_month} limit={billing.plan.limits.broadcasts_per_month} pct={billing.utilization.broadcasts_this_month} />
              <UsageBar label="Automations" used={billing.usage.automations} limit={billing.plan.limits.automations} pct={billing.utilization.automations} />
              <UsageBar label="AI Agents" used={billing.usage.agents} limit={billing.plan.limits.agents} pct={billing.utilization.agents} />
            </div>
          </div>
        )}

        {loadError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.20)', color: '#f46b72', fontSize: 13, marginBottom: 16 }}>
            <AlertCircle size={14} />Could not load usage data. Please refresh.
          </div>
        )}

        {/* WhatsApp contact card */}
        <div className="crm-glass crm-bill-card">
          <div className="crm-bill-avatar">
            <WhatsAppIcon size={40} />
            <span className="crm-bill-online" />
          </div>
          <div><div className="crm-bill-label">WhatsApp Contact</div></div>
          <div className="crm-bill-number">
            <span>{WHATSAPP_DISPLAY}</span>
            <button type="button" onClick={handleCopy} aria-label="Copy consultant number" title="Copy number">
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </button>
          </div>
          <p className="crm-bill-note">Contact our consultant for plan upgrades, billing assistance, and account-related queries.</p>
          <a className="crm-bill-cta" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon size={20} /> Chat on WhatsApp
          </a>
          <div className="crm-bill-meta">
            <span className="crm-bill-chip"><Headphones size={13} /> Dedicated consultant</span>
            <span className="crm-bill-chip"><Clock size={13} /> Typically replies quickly</span>
            <span className="crm-bill-chip"><ShieldCheck size={13} /> Account &amp; plan help</span>
          </div>
        </div>

        <p className="crm-bill-foot">Opens WhatsApp in a new tab · Available on desktop and mobile</p>
      </div>
    </div>
  );
}
