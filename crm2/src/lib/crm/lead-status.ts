import type { SupabaseClient } from '@supabase/supabase-js';
import { describeError } from '@/lib/errors';

/**
 * The canonical CRM lead-status vocabulary — the single source of truth
 * shared by the Inbox contact sidebar, the Contacts table/detail view and
 * the Pipeline board (spec §23–§27).
 *
 * These seven values mirror the `contacts.lead_status` CHECK constraint
 * from `supabase/migrations/038_crm_lead_status_and_followups.sql`; never
 * write a value outside this list (the database rejects it with 23514).
 */
export const LEAD_STATUSES = [
  'new',
  'contacted',
  'qualified',
  'proposal',
  'negotiation',
  'won',
  'lost',
] as const;

/** Union of every status a contact may carry. */
export type LeadStatus = (typeof LEAD_STATUSES)[number];

const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New Lead',
  contacted: 'Contacted',
  qualified: 'Qualified',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
};

const LEAD_STATUS_BADGE_CLASSES: Record<LeadStatus, string> = {
  new: 'bg-[#EEF4FF] text-[#3462EE] border-[#3462EE]/30',
  contacted: 'bg-[#E8F6FD] text-[#1a8fc4] border-[#26A5E4]/30',
  qualified: 'bg-[#F3F0FF] text-[#6d28d9] border-[#7C3AED]/30',
  proposal: 'bg-[#FDF4FF] text-[#9333ea] border-[#a855f7]/30',
  negotiation: 'bg-[#FFFBEA] text-[#b45309] border-[#f59e0b]/30',
  won: 'bg-[#EDFAF4] text-[#1a9e4e] border-[#25D366]/30',
  lost: 'bg-[#FEF2F2] text-[#dc2626] border-[#ef4444]/30',
};

/**
 * Type guard: is this raw value one of the seven canonical statuses?
 * Values coming from the database, a CSV import or a URL param are all
 * plain strings, so this is the cheap pre-check before anything is written.
 */
export function isLeadStatus(value: unknown): value is LeadStatus {
  return (
    typeof value === 'string' &&
    (LEAD_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Normalise any raw value (case/whitespace insensitive) to a `LeadStatus`,
 * or `null` when it does not match the vocabulary. Never throws, so it is
 * safe to use on imported or legacy data.
 */
export function parseLeadStatus(value: unknown): LeadStatus | null {
  if (isLeadStatus(value)) return value;
  if (typeof value !== 'string') return null;
  const normalised = value.trim().toLowerCase();
  return isLeadStatus(normalised) ? normalised : null;
}

/**
 * Human label for a status ("New Lead", "Qualified", …). Unknown or empty
 * values fall back to a capitalised word (legacy data) or an em dash, so
 * callers can render it directly without a null check.
 */
export function leadStatusLabel(status?: string | null): string {
  const parsed = parseLeadStatus(status);
  if (parsed) return LEAD_STATUS_LABELS[parsed];
  const raw = typeof status === 'string' ? status.trim() : '';
  if (!raw) return '—';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/**
 * Full Tailwind class string for the shared status pill (base + colour
 * variant). Unknown statuses get the neutral variant instead of throwing,
 * so a badge rendered from stale data still looks intentional.
 */
export function leadStatusBadgeClassName(status?: string | null): string {
  const parsed = parseLeadStatus(status);
  const variant = parsed
    ? LEAD_STATUS_BADGE_CLASSES[parsed]
    : 'bg-muted text-muted-foreground border-border';
  return `inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${variant}`;
}

/** One selectable status: the stable value plus its display label. */
export interface LeadStatusOption {
  value: LeadStatus;
  label: string;
}

/** Ordered option list for every status select in the app. */
export const LEAD_STATUS_OPTIONS: readonly LeadStatusOption[] =
  LEAD_STATUSES.map((value) => ({ value, label: LEAD_STATUS_LABELS[value] }));

/** Result of a status write: `status` carries the value actually saved. */
export type SetContactLeadStatusResult =
  { ok: true; status: LeadStatus } | { ok: false; error: string };

/**
 * Persist a contact's `lead_status` (single write path for every surface).
 *
 * Validates the value against `LEAD_STATUSES` before touching the network,
 * stamps `updated_at`, and translates any database/RLS failure into a
 * user-facing sentence via `describeError`. Toasts are the caller's job.
 *
 * @param client - Supabase browser client (`createClient()`).
 * @param contactId - The contact row to update.
 * @param next - Proposed status; rejected (without a write) if unknown.
 */
export async function setContactLeadStatus(
  client: SupabaseClient,
  contactId: string,
  next: unknown
): Promise<SetContactLeadStatusResult> {
  const status = parseLeadStatus(next);
  if (!status) {
    return {
      ok: false,
      error: `"${String(next)}" is not a valid lead status.`,
    };
  }
  if (!contactId) {
    return { ok: false, error: 'Missing contact id.' };
  }

  const { error } = await client
    .from('contacts')
    .update({ lead_status: status, updated_at: new Date().toISOString() })
    .eq('id', contactId);

  if (error) {
    return {
      ok: false,
      error: describeError(error, 'Could not save the lead status.'),
    };
  }

  return { ok: true, status };
}
