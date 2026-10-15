/**
 * CRM 3.0 — AI Provider Abstraction
 *
 * Single entry point for all LLM calls made by the AI Agent engine.
 * Detects the configured provider from environment variables / agent config,
 * never exposes secrets, and degrades safely to rule-based reasoning.
 *
 * Supported providers:
 *   - openai     (OPENAI_API_KEY)
 *   - anthropic  (ANTHROPIC_API_KEY)
 *   - rule_based (no key configured — deterministic, no network)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type AIProviderId = 'openai' | 'anthropic' | 'rule_based';

export interface ProviderInfo {
  provider: AIProviderId;
  model: string;
  configured: boolean;
}

const DEFAULT_MODELS: Record<Exclude<AIProviderId, 'rule_based'>, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest',
};

/** A key is "real" only when present and not an obvious placeholder. */
export function isUsableKey(value: string | undefined | null): value is string {
  if (!value) return false;
  const v = value.trim();
  if (v.length < 20) return false;
  if (/^(your-|sk-\.\.\.|sk-ant-\.\.\.|\.\.\.)/.test(v)) return false;
  return true;
}

/**
 * Resolve the provider to use.
 * Priority: the agent's configured provider (if its key is usable)
 *        → whichever provider key is actually set in the environment
 *        → rule_based.
 */
export function detectProvider(preferred?: string | null): ProviderInfo {
  const openai = process.env.OPENAI_API_KEY;
  const anthropic = process.env.ANTHROPIC_API_KEY;
  const openaiOk = isUsableKey(openai);
  const anthropicOk = isUsableKey(anthropic);

  if (preferred === 'anthropic' && anthropicOk) {
    return { provider: 'anthropic', model: DEFAULT_MODELS.anthropic, configured: true };
  }
  if (preferred === 'openai' && openaiOk) {
    return { provider: 'openai', model: DEFAULT_MODELS.openai, configured: true };
  }
  if (openaiOk) return { provider: 'openai', model: DEFAULT_MODELS.openai, configured: true };
  if (anthropicOk) return { provider: 'anthropic', model: DEFAULT_MODELS.anthropic, configured: true };
  return { provider: 'rule_based', model: 'rule-based', configured: false };
}

export interface CompletionRequest {
  provider: AIProviderId;
  model: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  /** number of additional attempts after the first failure (default 2) */
  retries?: number;
  timeoutMs?: number;
}

export interface CompletionResult {
  ok: boolean;
  json: unknown;
  text: string;
  error?: string;
  provider: AIProviderId;
  model: string;
  latencyMs: number;
}

function extractJson(raw: string): unknown {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (start !== -1 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { /* fall through */ }
    }
    return null;
  }
}

async function callOnce(req: CompletionRequest): Promise<{ ok: boolean; text: string; error?: string }> {
  const timeout = req.timeoutMs ?? 20000;
  const maxTokens = req.maxTokens ?? 1200;
  const temperature = req.temperature ?? 0.3;

  if (req.provider === 'openai') {
    const key = process.env.OPENAI_API_KEY;
    if (!isUsableKey(key)) return { ok: false, text: '', error: 'openai key not configured' };
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: req.model,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, text: '', error: `openai HTTP ${res.status} ${body.slice(0, 160)}` };
    }
    const d = await res.json() as { choices?: { message?: { content?: string } }[] };
    const text = d.choices?.[0]?.message?.content ?? '';
    return { ok: !!text, text, error: text ? undefined : 'empty completion' };
  }

  if (req.provider === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!isUsableKey(key)) return { ok: false, text: '', error: 'anthropic key not configured' };
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: req.model,
        max_tokens: maxTokens,
        temperature,
        system: req.system,
        messages: [{ role: 'user', content: req.user }],
      }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, text: '', error: `anthropic HTTP ${res.status} ${body.slice(0, 160)}` };
    }
    const d = await res.json() as { content?: { type: string; text?: string }[] };
    const text = (d.content ?? []).filter(c => c.type === 'text').map(c => c.text ?? '').join('\n');
    return { ok: !!text, text, error: text ? undefined : 'empty completion' };
  }

  return { ok: false, text: '', error: 'provider_not_configured' };
}

/**
 * Request a structured JSON completion with bounded retries.
 * Never throws — always returns a CompletionResult.
 */
export async function completeJSON(req: CompletionRequest): Promise<CompletionResult> {
  const started = Date.now();
  const base: CompletionResult = { ok: false, json: null, text: '', provider: req.provider, model: req.model, latencyMs: 0 };

  if (req.provider === 'rule_based') {
    return { ...base, error: 'provider_not_configured', latencyMs: Date.now() - started };
  }

  const attempts = 1 + Math.max(0, req.retries ?? 2);
  let lastError: string | undefined;

  for (let i = 0; i < attempts; i++) {
    try {
      const r = await callOnce(req);
      if (r.ok) {
        const json = extractJson(r.text);
        if (json !== null) return { ...base, ok: true, json, text: r.text, latencyMs: Date.now() - started };
        lastError = 'unparseable JSON';
      } else {
        lastError = r.error;
        // Auth / config errors are not retryable.
        if (r.error && /not configured|401|403/.test(r.error)) break;
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'request failed';
    }
    if (i < attempts - 1) await new Promise(res => setTimeout(res, 300 * (i + 1)));
  }

  return { ...base, error: lastError, latencyMs: Date.now() - started };
}

/**
 * Best-effort logging of an AI operation into crm3_ai_operations.
 * Never throws, never blocks the run.
 */
export async function logAIOperation(
  supabase: SupabaseClient,
  args: {
    accountId: string;
    userId: string | null;
    operationType: string;
    provider: AIProviderId;
    model: string;
    latencyMs: number;
    success: boolean;
    error?: string;
  }
): Promise<void> {
  try {
    await supabase.from('crm3_ai_operations').insert({
      account_id: args.accountId,
      user_id: args.userId,
      operation_type: args.operationType,
      provider: args.provider,
      model: args.model,
      input_tokens: 0,
      output_tokens: 0,
      latency_ms: args.latencyMs,
      success: args.success,
      error_message: args.error ?? null,
    });
  } catch {
    /* logging is non-fatal */
  }
}
