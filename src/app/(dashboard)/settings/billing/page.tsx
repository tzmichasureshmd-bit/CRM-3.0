'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Copy, Check, Clock, ShieldCheck, Headphones } from 'lucide-react';

const WHATSAPP_DISPLAY = '9346947043';
const WHATSAPP_INTL = '919346947043';
const WHATSAPP_MESSAGE = 'Hello, I need assistance with TZMICHA CRM billing.';
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_INTL}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;

function WhatsAppIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

export default function BillingPage() {
  const [copied, setCopied] = useState(false);

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
          <span className="crm-bill-badge">
            <i /> Consultant Support
          </span>
          <h1 className="crm-bill-title">Billing &amp; Support</h1>
          <p className="crm-bill-subtitle">
            Need help with your CRM plan or billing? Our consultant is here to help.
          </p>
        </div>

        <div className="crm-glass crm-bill-card">
          <div className="crm-bill-avatar">
            <WhatsAppIcon size={40} />
            <span className="crm-bill-online" />
          </div>

          <div>
            <div className="crm-bill-label">WhatsApp Contact</div>
          </div>

          <div className="crm-bill-number">
            <span>{WHATSAPP_DISPLAY}</span>
            <button type="button" onClick={handleCopy} aria-label="Copy consultant number" title="Copy number">
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </button>
          </div>

          <p className="crm-bill-note">
            Contact our consultant for plan details, billing assistance, and account-related queries.
          </p>

          <a
            className="crm-bill-cta"
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <WhatsAppIcon size={20} /> Chat on WhatsApp
          </a>

          <div className="crm-bill-meta">
            <span className="crm-bill-chip"><Headphones size={13} /> Dedicated consultant</span>
            <span className="crm-bill-chip"><Clock size={13} /> Typically replies quickly</span>
            <span className="crm-bill-chip"><ShieldCheck size={13} /> Account &amp; plan help</span>
          </div>
        </div>

        <p className="crm-bill-foot">
          Opens WhatsApp in a new tab · Available on desktop and mobile
        </p>
      </div>
    </div>
  );
}
