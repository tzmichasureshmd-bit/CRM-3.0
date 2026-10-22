/**
 * CRM 3.0 — AI Key Resolver
 * Reads AI API keys from DB (account_settings) first, then falls back to env vars.
 * This means keys saved via Settings → AI Keys work immediately in all AI routes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface ResolvedAIKey {
  provider: 'openai' | 'anthropic' | 'groq' | 'gemini' | 'none';
  apiKey: string;
  model: string;
}

interface StoredProviderConfig {
  api_key?: string;
  model?: string;
  enabled?: boolean;
  is_default?: boolean;
  fallback_order?: number;
}

type StoredAIKeys = Record<string, StoredProviderConfig>;

/**
 * Resolve the best available AI key for an account.
 * Priority: DB default provider → DB any enabled → env OPENAI_API_KEY → env ANTHROPIC_API_KEY → none
 */
export async function resolveAIKey(
  db: SupabaseClient,
  accountId: string,
): Promise<ResolvedAIKey> {
  // 1. Try DB-stored keys
  try {
    const { data } = await db
      .from('account_settings')
      .select('value')
      .eq('account_id', accountId)
      .eq('key', 'ai_keys')
      .limit(1)
      .single();

    if (data?.value) {
      const stored: StoredAIKeys =
        typeof data.value === 'string' ? JSON.parse(data.value) : data.value;

      // Find default provider first
      const defaultEntry = Object.entries(stored).find(
        ([, cfg]) => cfg.is_default && cfg.enabled && cfg.api_key?.trim(),
      );
      if (defaultEntry) {
        const [provider, cfg] = defaultEntry;
        return { provider: provider as ResolvedAIKey['provider'], apiKey: cfg.api_key!, model: cfg.model || defaultModel(provider) };
      }

      // Any enabled provider in fallback order
      const fallbacks = Object.entries(stored)
        .filter(([, cfg]) => cfg.enabled && cfg.api_key?.trim() && (cfg.fallback_order ?? 0) > 0)
        .sort(([, a], [, b]) => (a.fallback_order ?? 99) - (b.fallback_order ?? 99));

      if (fallbacks.length > 0) {
        const [provider, cfg] = fallbacks[0];
        return { provider: provider as ResolvedAIKey['provider'], apiKey: cfg.api_key!, model: cfg.model || defaultModel(provider) };
      }
    }
  } catch { /* fall through to env */ }

  // 2. Env vars fallback
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey && openaiKey.length > 20 && !openaiKey.startsWith('sk-...')) {
    return { provider: 'openai', apiKey: openaiKey, model: 'gpt-4o-mini' };
  }
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey && anthropicKey.length > 20 && !anthropicKey.startsWith('sk-ant-...')) {
    return { provider: 'anthropic', apiKey: anthropicKey, model: 'claude-3-haiku-20240307' };
  }

  return { provider: 'none', apiKey: '', model: '' };
}

function defaultModel(provider: string): string {
  const map: Record<string, string> = {
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-haiku-20240307',
    groq: 'llama-3.1-8b-instant',
    gemini: 'gemini-1.5-flash',
  };
  return map[provider] ?? 'gpt-4o-mini';
}

/**
 * Make a chat completion using the resolved key.
 * Supports openai, anthropic, groq (openai-compatible), gemini.
 * Returns null if no key configured.
 */
export async function aiComplete(
  key: ResolvedAIKey,
  system: string,
  user: string,
  opts: { maxTokens?: number; temperature?: number; json?: boolean } = {},
): Promise<string | null> {
  if (key.provider === 'none' || !key.apiKey) return null;

  const maxTokens = opts.maxTokens ?? 400;
  const temperature = opts.temperature ?? 0.3;

  if (key.provider === 'openai' || key.provider === 'groq') {
    const baseUrl = key.provider === 'groq'
      ? 'https://api.groq.com/openai/v1'
      : 'https://api.openai.com/v1';
    const body: Record<string, unknown> = {
      model: key.model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature,
      max_tokens: maxTokens,
    };
    if (opts.json && key.provider === 'openai') body.response_format = { type: 'json_object' };
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const d = await res.json() as { choices?: { message?: { content?: string } }[] };
    return d.choices?.[0]?.message?.content?.trim() ?? null;
  }

  if (key.provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: key.model, max_tokens: maxTokens, temperature, system, messages: [{ role: 'user', content: user }] }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const d = await res.json() as { content?: { type: string; text?: string }[] };
    return (d.content ?? []).filter(c => c.type === 'text').map(c => c.text ?? '').join('\n').trim() || null;
  }

  if (key.provider === 'gemini') {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${key.model}:generateContent?key=${key.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: `${system}\n\n${user}` }] }], generationConfig: { maxOutputTokens: maxTokens, temperature } }),
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!res.ok) return null;
    const d = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
  }

  return null;
}
