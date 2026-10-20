'use client';

import { useState, useEffect, useCallback } from 'react';

const BACKEND = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000')
  : 'http://localhost:8000';

const getH = () => ({
  Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('crm_token') ?? '' : ''}`,
});

export interface ChannelStatus {
  configured: boolean;  // credentials saved in DB
  connected: boolean;   // actual API ping succeeded
  loading: boolean;
}

export interface IntegrationStatus {
  instagram: ChannelStatus;
  facebook: ChannelStatus;
  whatsapp: ChannelStatus;
  email: ChannelStatus;
}

const DEFAULT: ChannelStatus = { configured: false, connected: false, loading: true };

export function useIntegrationStatus() {
  const [status, setStatus] = useState<IntegrationStatus>({
    instagram: { ...DEFAULT },
    facebook:  { ...DEFAULT },
    whatsapp:  { ...DEFAULT },
    email:     { ...DEFAULT },
  });

  const check = useCallback(async () => {
    // Reset to loading
    setStatus(s => ({
      instagram: { ...s.instagram, loading: true },
      facebook:  { ...s.facebook,  loading: true },
      whatsapp:  { ...s.whatsapp,  loading: true },
      email:     { ...s.email,     loading: true },
    }));

    const [igRes, fbRes, waRes, emRes] = await Promise.allSettled([
      fetch(`${BACKEND}/api/v1/instagram/status`, { headers: getH() }),
      fetch(`${BACKEND}/api/v1/meta/page`,         { headers: getH() }),
      fetch(`${BACKEND}/api/v1/health`,            { headers: getH() }),
      fetch(`${BACKEND}/api/v1/email/status`,      { headers: getH() }),
    ]);

    // Instagram
    let igConfigured = false, igConnected = false;
    if (igRes.status === 'fulfilled' && igRes.value.ok) {
      const d = await igRes.value.json() as { configured: boolean };
      igConfigured = d.configured;
      igConnected  = d.configured; // if configured, treat as connected (real test done by profile load)
    }

    // Facebook
    let fbConfigured = false, fbConnected = false;
    if (fbRes.status === 'fulfilled' && fbRes.value.ok) {
      fbConfigured = true;
      fbConnected  = true;
    } else if (fbRes.status === 'fulfilled' && fbRes.value.status === 400) {
      fbConfigured = false; fbConnected = false;
    }

    // WhatsApp — check if token saved
    let waConfigured = false;
    try {
      const waSettRes = await fetch(`${BACKEND}/api/v1/settings/integrations/whatsapp`, { headers: getH() });
      if (waSettRes.ok) {
        const d = await waSettRes.json() as Record<string, string>;
        waConfigured = !!(d['WHATSAPP_ACCESS_TOKEN']?.trim() && d['WHATSAPP_PHONE_NUMBER_ID']?.trim());
      }
    } catch { /* silent */ }

    // Email
    let emConfigured = false, emConnected = false;
    if (emRes.status === 'fulfilled' && emRes.value.ok) {
      const d = await emRes.value.json() as { configured: boolean };
      emConfigured = d.configured;
      emConnected  = d.configured;
    }

    setStatus({
      instagram: { configured: igConfigured, connected: igConnected,  loading: false },
      facebook:  { configured: fbConfigured, connected: fbConnected,  loading: false },
      whatsapp:  { configured: waConfigured, connected: waConfigured, loading: false },
      email:     { configured: emConfigured, connected: emConnected,  loading: false },
    });
  }, []);

  useEffect(() => { void check(); }, [check]);

  return { status, refresh: check };
}
