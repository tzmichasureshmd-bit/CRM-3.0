'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft, Loader2, CheckCircle, AlertCircle, Eye, EyeOff, Star, ArrowDown } from 'lucide-react';
import Link from 'next/link';

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
const getH = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('crm_token') ?? '' : ''}`,
});

const PROVIDERS = [
  { id: 'openai',    name: 'OpenAI',    icon: '🟢', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'], color: '#10a37f' },
  { id: 'anthropic', name: 'Anthropic', icon: '🟠', models: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307', 'claude-3-opus-20240229'], color: '#d97706' },
  { id: 'groq',      name: 'Groq',      icon: '⚡', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'], color: '#7c3aed' },
  { id: 'gemini',    name: 'Google Gemini', icon: '🔵', models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash'], color: '#4285f4' },
] as const;

type ProviderId = typeof PROVIDERS[number]['id'];

interface ProviderConfig {
  api_key: string;
  model: string;
  enabled: boolean;
  is_default: boolean;
  fallback_order: number; // 0 = not in fallback, 1 = first fallback, 2 = second, etc.
}

type AIConfig = Record<ProviderId, ProviderConfig>;

const DEFAULT_CONFIG: AIConfig = {
  openai:    { api_key: '', model: 'gpt-4o-mini',                    enabled: false, is_default: true,  fallback_order: 0 },
  anthropic: { api_key: '', model: 'claude-3-haiku-20240307',        enabled: false, is_default: false, fallback_order: 1 },
  groq:      { api_key: '', model: 'llama-3.1-8b-instant',           enabled: false, is_default: false, fallback_order: 2 },
  gemini:    { api_key: '', model: 'gemini-1.5-flash',               enabled: false, is_default: false, fallback_order: 3 },
};

export default function AIKeysPage() {
  const [config, setConfig]   = useState<AIConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [testing, setTesting] = useState<ProviderId | null>(null);
  const [status, setStatus]   = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch(`${BASE}/api/v1/settings/ai-keys`, { headers: getH() })
      .then(r => r.ok ? r.json() : null)
      .then((d: Partial<AIConfig> | null) => { if (d) setConfig(c => ({ ...c, ...d })); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const update = (id: ProviderId, field: keyof ProviderConfig, value: unknown) => {
    setConfig(c => ({ ...c, [id]: { ...c[id], [field]: value } }));
  };

  const setDefault = (id: ProviderId) => {
    setConfig(c => {
      const next = { ...c };
      (Object.keys(next) as ProviderId[]).forEach(k => { next[k] = { ...next[k], is_default: k === id }; });
      return next;
    });
  };

  const save = async () => {
    setSaving(true); setStatus(null);
    try {
      const r = await fetch(`${BASE}/api/v1/settings/ai-keys`, {
        method: 'POST', headers: getH(), body: JSON.stringify(config),
      });
      if (!r.ok) { const d = await r.json() as { detail?: string }; throw new Error(d.detail ?? 'Save failed'); }
      setStatus({ type: 'success', msg: 'AI API keys saved!' });
    } catch (e: unknown) {
      setStatus({ type: 'error', msg: e instanceof Error ? e.message : 'Save failed' });
    }
    setSaving(false);
  };

  const test = async (id: ProviderId) => {
    setTesting(id); setStatus(null);
    try {
      const r = await fetch(`${BASE}/api/v1/settings/ai-keys/test`, {
        method: 'POST', headers: getH(), body: JSON.stringify({ provider: id, api_key: config[id].api_key, model: config[id].model }),
      });
      const d = await r.json() as { ok?: boolean; message?: string; detail?: string };
      if (!r.ok || !d.ok) throw new Error(d.detail ?? d.message ?? 'Test failed');
      setStatus({ type: 'success', msg: `✓ ${PROVIDERS.find(p => p.id === id)?.name} connected! ${d.message ?? ''}` });
    } catch (e: unknown) {
      setStatus({ type: 'error', msg: e instanceof Error ? e.message : 'Test failed' });
    }
    setTesting(null);
  };

  const defaultProvider = (Object.keys(config) as ProviderId[]).find(k => config[k].is_default);
  const fallbackChain = (Object.keys(config) as ProviderId[])
    .filter(k => config[k].fallback_order > 0 && config[k].enabled)
    .sort((a, b) => config[a].fallback_order - config[b].fallback_order);

  return (
    <div style={{ maxWidth: 700, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Link href="/settings" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--crm-text-muted)', textDecoration: 'none' }}>
        <ChevronLeft size={14} /> Back to Settings
      </Link>

      <div>
        <h1 style={{ fontSize: 22, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>AI API Keys</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crm-text-muted)' }}>
          Configure AI providers. Set one as default — others act as automatic fallbacks.
        </p>
      </div>

      {/* Fallback chain preview */}
      {fallbackChain.length > 0 && (
        <div className="crm-glass" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            Fallback Chain (auto-switches if primary fails)
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {defaultProvider && (
              <span style={{ padding: '4px 10px', borderRadius: 8, background: 'rgba(79,109,245,0.12)', color: '#4f6df5', fontSize: 12, fontWeight: 700 }}>
                ⭐ {PROVIDERS.find(p => p.id === defaultProvider)?.name} (default)
              </span>
            )}
            {fallbackChain.map((id, i) => (
              <span key={id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ArrowDown size={12} color="var(--crm-text-muted)" />
                <span style={{ padding: '4px 10px', borderRadius: 8, background: 'rgba(130,145,190,0.10)', color: 'var(--crm-text-secondary)', fontSize: 12, fontWeight: 600 }}>
                  {i + 1}. {PROVIDERS.find(p => p.id === id)?.name}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--crm-text-muted)', fontSize: 13 }}>
          <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {PROVIDERS.map(p => {
            const cfg = config[p.id];
            const isDefault = cfg.is_default;
            const isEnabled = cfg.enabled;
            return (
              <div key={p.id} className="crm-glass" style={{ padding: '18px 20px', border: isDefault ? '1.5px solid rgba(79,109,245,0.35)' : undefined }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: `${p.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                    {p.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      {p.name}
                      {isDefault && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 6, background: 'rgba(79,109,245,0.12)', color: '#4f6df5', fontWeight: 700 }}>DEFAULT</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 2 }}>{p.models[0]}</div>
                  </div>
                  {/* Enable toggle */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--crm-text-muted)' }}>
                    <input type="checkbox" checked={isEnabled} onChange={e => update(p.id, 'enabled', e.target.checked)}
                      style={{ accentColor: p.color, width: 15, height: 15 }} />
                    Enabled
                  </label>
                </div>

                {/* API Key */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 10 }}>
                  <div style={{ position: 'relative' }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 4 }}>API KEY</label>
                    <input
                      type={showKey[p.id] ? 'text' : 'password'}
                      placeholder={`sk-... or your ${p.name} API key`}
                      value={cfg.api_key}
                      onChange={e => update(p.id, 'api_key', e.target.value)}
                      style={{ width: '100%', padding: '9px 36px 9px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', color: 'var(--crm-text)', fontSize: 13, boxSizing: 'border-box' as const, outline: 'none' }}
                    />
                    <button onClick={() => setShowKey(s => ({ ...s, [p.id]: !s[p.id] }))}
                      style={{ position: 'absolute', right: 10, bottom: 9, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)', padding: 0 }}>
                      {showKey[p.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 4 }}>MODEL</label>
                    <select value={cfg.model} onChange={e => update(p.id, 'model', e.target.value)}
                      style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', color: 'var(--crm-text)', fontSize: 13, outline: 'none', cursor: 'pointer' }}>
                      {p.models.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>

                {/* Fallback order */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--crm-text-muted)' }}>FALLBACK ORDER</label>
                  <select value={cfg.fallback_order} onChange={e => update(p.id, 'fallback_order', Number(e.target.value))}
                    style={{ padding: '4px 8px', borderRadius: 7, border: '1px solid rgba(130,145,190,0.20)', background: 'rgba(255,255,255,0.60)', color: 'var(--crm-text)', fontSize: 12, outline: 'none' }}>
                    <option value={0}>Not in fallback</option>
                    <option value={1}>1st fallback</option>
                    <option value={2}>2nd fallback</option>
                    <option value={3}>3rd fallback</option>
                  </select>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8 }}>
                  {!isDefault && (
                    <button onClick={() => setDefault(p.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 9, border: '1.5px solid rgba(79,109,245,0.30)', background: 'rgba(79,109,245,0.06)', color: '#4f6df5', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      <Star size={12} /> Set as Default
                    </button>
                  )}
                  <button onClick={() => void test(p.id)} disabled={!cfg.api_key.trim() || testing === p.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 9, border: `1.5px solid ${p.color}40`, background: `${p.color}08`, color: p.color, fontSize: 12, fontWeight: 600, cursor: cfg.api_key.trim() ? 'pointer' : 'default', opacity: cfg.api_key.trim() ? 1 : 0.5 }}>
                    {testing === p.id ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : '⚡'}
                    Test Connection
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Status */}
      {status && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderRadius: 12, background: status.type === 'success' ? 'rgba(40,201,154,0.08)' : 'rgba(244,107,114,0.08)', border: `1px solid ${status.type === 'success' ? 'rgba(40,201,154,0.25)' : 'rgba(244,107,114,0.25)'}`, color: status.type === 'success' ? '#28c99a' : '#f46b72', fontSize: 13, fontWeight: 600 }}>
          {status.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
          {status.msg}
        </div>
      )}

      <button onClick={() => void save()} disabled={saving}
        style={{ padding: '12px 28px', borderRadius: 12, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 14, fontWeight: 700, cursor: saving ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, opacity: saving ? 0.75 : 1, width: 'fit-content' }}>
        {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : '💾 Save All Keys'}
      </button>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
