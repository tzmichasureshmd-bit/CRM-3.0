/**
 * Shared data & error helper for Pipeline & CRM tabs.
 *
 * 1. Extracts structured Supabase error fields (message, code, details, hint, status)
 *    without ever logging `{}` or exposing tokens/secrets.
 * 2. Resolves tenant `account_id` from the active Supabase session/profile when available.
 * 3. Provides a localStorage persistence layer (matching `src/lib/local-automations.ts`)
 *    so creating/loading contacts and deals continues to work seamlessly in local/dev
 *    environments when Supabase is unauthenticated or blocked by RLS.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface FormattedDatabaseError {
  message: string;
  code: string | null;
  details: string | null;
  hint: string | null;
  status: number | null;
}

export interface ContactRecord {
  id: string;
  account_id?: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  source: string | null;
  lead_status: string | null;
  lead_score: number | null;
  lead_score_tier: string | null;
  lead_score_reason: string | null;
  tags: string[] | null;
  created_at: string;
}

export interface DealRecord {
  id: string;
  account_id?: string | null;
  title: string;
  value: number | null;
  currency: string | null;
  status: string;
  stage_id: string | null;
  contact_id: string | null;
  notes?: string | null;
  created_at: string;
  contacts?: { name: string | null } | { name: string | null }[] | null;
}

export interface PipelineStageRecord {
  id: string;
  name: string;
  position: number;
  color: string | null;
}

export const DEFAULT_PIPELINE_STAGES: PipelineStageRecord[] = [
  { id: 'new', name: 'New', position: 0, color: '#4d7cff' },
  { id: 'contacted', name: 'Contacted', position: 1, color: '#8b5cf6' },
  { id: 'qualified', name: 'Qualified', position: 2, color: '#28c99a' },
  { id: 'proposal', name: 'Proposal', position: 3, color: '#f4c95d' },
  { id: 'negotiation', name: 'Negotiation', position: 4, color: '#f46b72' },
  { id: 'won', name: 'Won', position: 5, color: '#28c99a' },
  { id: 'lost', name: 'Lost', position: 6, color: '#8790aa' },
];

const CONTACTS_STORAGE_KEY = 'crm3:local-contacts';
const DEALS_STORAGE_KEY = 'crm3:local-deals';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STAGE_TAG_REGEX = /\[stage:([a-z0-9_-]+)\]/i;

export function isUuid(value: string | null | undefined): boolean {
  if (!value) return false;
  return UUID_REGEX.test(value.trim());
}

/**
 * Redacts JWTs, API keys, or bearer tokens from any error text before logging or display.
 */
function redactSecrets(input: string): string {
  return input
    .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[REDACTED_TOKEN]')
    .replace(/(Bearer\s+)[a-zA-Z0-9._-]+/gi, '$1[REDACTED]')
    .replace(/(apikey[=:]\s*)[a-zA-Z0-9._-]+/gi, '$1[REDACTED]');
}

/**
 * Extracts message, code, details, hint, and status from any Supabase PostgrestError / AuthError / Error
 * into a plain serializable object so console logs never print `{}`.
 */
export function formatSupabaseError(err: unknown): FormattedDatabaseError {
  if (!err) {
    return {
      message: 'Unknown database error',
      code: null,
      details: null,
      hint: null,
      status: null,
    };
  }

  if (typeof err === 'string') {
    return {
      message: redactSecrets(err),
      code: null,
      details: null,
      hint: null,
      status: null,
    };
  }

  if (typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    const rawMessage =
      typeof obj.message === 'string' && obj.message.trim()
        ? obj.message
        : typeof obj.error_description === 'string' && obj.error_description.trim()
          ? obj.error_description
          : typeof obj.error === 'string' && obj.error.trim()
            ? obj.error
            : err instanceof Error && err.message
              ? err.message
              : 'Database request failed';

    return {
      message: redactSecrets(rawMessage),
      code: typeof obj.code === 'string' && obj.code.trim() ? obj.code : null,
      details: typeof obj.details === 'string' && obj.details.trim() ? redactSecrets(obj.details) : null,
      hint: typeof obj.hint === 'string' && obj.hint.trim() ? redactSecrets(obj.hint) : null,
      status:
        typeof obj.status === 'number'
          ? obj.status
          : typeof obj.statusCode === 'number'
            ? obj.statusCode
            : null,
    };
  }

  return {
    message: redactSecrets(String(err)),
    code: null,
    details: null,
    hint: null,
    status: null,
  };
}

export function formatErrorSummary(info: FormattedDatabaseError): string {
  const parts: string[] = [`message: "${info.message}"`];
  if (info.code) parts.push(`code: "${info.code}"`);
  if (info.status !== null) parts.push(`status: ${info.status}`);
  if (info.details) parts.push(`details: "${info.details}"`);
  if (info.hint) parts.push(`hint: "${info.hint}"`);
  return parts.join(' | ');
}

/**
 * Resolves the active tenant `account_id` for the current user session if available.
 * Both `contacts.account_id` and `deals.account_id` are NOT NULL in CRM 3.0's schema.
 */
export async function resolveTenantAccountId(
  supabase: SupabaseClient,
  existingAccountIds: Array<string | null | undefined> = []
): Promise<string | null> {
  for (const candidate of existingAccountIds) {
    if (candidate && isUuid(candidate)) {
      return candidate;
    }
  }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('account_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profile?.account_id && typeof profile.account_id === 'string') {
        return profile.account_id;
      }
    }
  } catch {
    // Ignore auth lookup errors and try fallback table lookup
  }

  try {
    const { data: accountRow } = await supabase
      .from('accounts')
      .select('id')
      .limit(1)
      .maybeSingle();
    if (accountRow?.id && typeof accountRow.id === 'string') {
      return accountRow.id;
    }
  } catch {
    // Ignore if RLS blocks direct accounts lookup
  }

  return null;
}

/**
 * Encodes a non-UUID stage key inside `deals.notes` so stage placement is preserved
 * in the database even when `pipeline_stages` has no UUID rows yet.
 */
export function encodeStageInNotes(stageKey: string | null | undefined, existingNotes?: string | null): string | null {
  const base = (existingNotes ?? '').replace(STAGE_TAG_REGEX, '').trim();
  if (!stageKey || isUuid(stageKey)) {
    return base || null;
  }
  return base ? `[stage:${stageKey}] ${base}` : `[stage:${stageKey}]`;
}

export function extractStageFromDeal(
  deal: { stage_id?: string | null; status?: string | null; notes?: string | null },
  stages: PipelineStageRecord[]
): string {
  const rawStageId = deal.stage_id ?? null;

  // 1. Direct match against loaded stages
  if (rawStageId && stages.some(s => s.id === rawStageId)) {
    return rawStageId;
  }

  // 2. Check stage tag in notes (e.g. [stage:qualified])
  if (typeof deal.notes === 'string') {
    const match = deal.notes.match(STAGE_TAG_REGEX);
    if (match?.[1]) {
      const tagKey = match[1].toLowerCase();
      const byId = stages.find(s => s.id.toLowerCase() === tagKey);
      if (byId) return byId.id;
      const byName = stages.find(s => s.name.toLowerCase().startsWith(tagKey));
      if (byName) return byName.id;
    }
  }

  // 3. Match by status for won / lost
  if (deal.status === 'won') {
    const wonStage = stages.find(s => s.id === 'won' || s.name.toLowerCase() === 'won');
    if (wonStage) return wonStage.id;
  }
  if (deal.status === 'lost') {
    const lostStage = stages.find(s => s.id === 'lost' || s.name.toLowerCase() === 'lost');
    if (lostStage) return lostStage.id;
  }

  // 4. Match by name if rawStageId is a slug and stages are UUIDs from DB
  if (rawStageId) {
    const normalized = rawStageId.toLowerCase().replace(/_/g, ' ');
    const matched = stages.find(
      s =>
        s.name.toLowerCase() === normalized ||
        s.name.toLowerCase().startsWith(normalized)
    );
    if (matched) return matched.id;
  }

  // 5. Fallback to first stage
  return stages[0]?.id ?? 'new';
}

export function resolveDealContactName(
  deal: DealRecord,
  contacts: Array<{ id: string; name: string | null; email?: string | null; phone?: string | null }>
): string | null {
  if (deal.contacts) {
    if (Array.isArray(deal.contacts)) {
      const firstName = deal.contacts[0]?.name;
      if (firstName) return firstName;
    } else if (typeof deal.contacts === 'object' && deal.contacts.name) {
      return deal.contacts.name;
    }
  }

  if (deal.contact_id) {
    const found = contacts.find(c => c.id === deal.contact_id);
    if (found) {
      return found.name || found.email || found.phone || null;
    }
  }

  return null;
}

// ── Local Storage Persistence (used alongside Supabase) ───────

export function readLocalContacts(): ContactRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CONTACTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is ContactRecord =>
        Boolean(item && typeof item === 'object' && typeof (item as ContactRecord).id === 'string')
    );
  } catch {
    return [];
  }
}

export function writeLocalContacts(items: ContactRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage quota errors
  }
}

export function upsertLocalContact(contact: ContactRecord): ContactRecord[] {
  const current = readLocalContacts();
  const next = [contact, ...current.filter(c => c.id !== contact.id)];
  writeLocalContacts(next);
  return next;
}

export function updateLocalContact(id: string, patch: Partial<ContactRecord>): void {
  const current = readLocalContacts();
  const idx = current.findIndex(c => c.id === id);
  if (idx === -1) return;
  current[idx] = { ...current[idx], ...patch };
  writeLocalContacts(current);
}

export function readLocalDeals(): DealRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DEALS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is DealRecord =>
        Boolean(item && typeof item === 'object' && typeof (item as DealRecord).id === 'string')
    );
  } catch {
    return [];
  }
}

export function writeLocalDeals(items: DealRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DEALS_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage quota errors
  }
}

export function upsertLocalDeal(deal: DealRecord): DealRecord[] {
  const current = readLocalDeals();
  const next = [deal, ...current.filter(d => d.id !== deal.id)];
  writeLocalDeals(next);
  return next;
}

export function updateLocalDeal(id: string, patch: Partial<DealRecord>): void {
  const current = readLocalDeals();
  const idx = current.findIndex(d => d.id === id);
  if (idx === -1) return;
  current[idx] = { ...current[idx], ...patch };
  writeLocalDeals(current);
}

export function mergeRecordsById<T extends { id: string; created_at?: string }>(
  remoteItems: T[],
  localItems: T[]
): T[] {
  const map = new Map<string, T>();
  for (const item of localItems) {
    map.set(item.id, item);
  }
  for (const item of remoteItems) {
    map.set(item.id, item);
  }
  return Array.from(map.values()).sort((a, b) =>
    String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))
  );
}

export function generateLocalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
