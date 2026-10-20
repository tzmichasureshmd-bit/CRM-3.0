// ============================================================
// Google Forms → Contacts ingestion logic (public webhook backing).
//
// The Apps Script that watches a Google Sheet POSTs each new form
// response to POST /api/v1/integrations/google-forms. That route
// authenticates with the CRM's public API key (scope: contacts:write)
// and delegates the actual upsert to this module.
//
// Design invariants (all inherited from the Meta lead path):
//   * Contacts remain the single source of truth. No second lead table.
//   * `google_form_submission_id` is the idempotency key — a retried
//     submission or duplicate trigger never creates a second contact.
//   * Phone-based `findExistingContact` dedup still applies, so a brand
//     new submission that matches an existing number updates it instead
//     of duplicating.
//   * Every write is scoped to `accountId` (from the API key); we never
//     accept a target tenant from the client.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { findExistingContact, isUniqueViolation } from '@/lib/contacts/dedupe';
import { setContactTags } from '@/lib/api/v1/contacts';
import { sanitizePhoneForMeta, isValidE164 } from '@/lib/whatsapp/phone-utils';

/** Payload a Google Apps Script sends for each new form response. */
export interface GoogleFormSubmission {
  /** Google Forms response id — the idempotency key. */
  submission_id?: string | null;
  /** Google Form id (form id / form URL) — identifies the source form. */
  form_id?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  location?: string | null;
  message?: string | null;
  /** Optional campaign attribution from the landing page URL. */
  campaign?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  /** ISO timestamp of the actual form submission. */
  submitted_at?: string | null;
}

export type IngestResult =
  | { action: 'created'; contactId: string; duplicate: false }
  | { action: 'updated'; contactId: string; duplicate: false }
  | { action: 'duplicate'; contactId: string | null; duplicate: true };

function cleanString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

function cleanNullableString(v: unknown): string | null | undefined {
  const s = cleanString(v);
  // Distinguish "absent" (undefined) from "explicitly blank" (null) so
  // we never overwrite a previously set value with an empty string.
  return v === undefined ? undefined : s;
}

const MAX_FIELD_LENGTH = 500;
const MAX_MESSAGE_LENGTH = 5000;
const MAX_UTM_LENGTH = 200;

function truncate(s: string | null | undefined, max: number): string | null | undefined {
  return s === undefined || s === null ? s : s.slice(0, max);
}

/**
 * Normalize a user-supplied phone into an E.164 string using the shared
 * phone utilities. Returns null when the value can't be made valid —
 * callers decide whether that is fatal.
 */
export function normalizePhone(value: unknown): string | null {
  const raw = cleanString(value);
  if (!raw) return null;
  const sanitized = sanitizePhoneForMeta(raw);
  return isValidE164(sanitized) ? sanitized : null;
}

/**
 * Validate + sanitize a raw submission payload. Returns a normalized
 * object, or throws an `Error` with a `.status` when a required field
 * is missing/malformed (so the route can map it to a 4xx).
 *
 * Only `phone` is strictly required (contacts.phone is NOT NULL). All
 * other fields are optional and never fabricated.
 */
export function sanitizeSubmission(
  raw: Record<string, unknown>,
): GoogleFormSubmission {
  const phone = cleanString(raw.phone) ?? cleanString(raw.phone_number);
  if (!phone) {
    const err = new Error("'phone' is required");
    (err as unknown as { status: number }).status = 400;
    throw err;
  }

  const submission_id = cleanString(raw.submission_id);
  const utm_source = truncate(cleanNullableString(raw.utm_source), MAX_UTM_LENGTH);
  const utm_medium = truncate(cleanNullableString(raw.utm_medium), MAX_UTM_LENGTH);
  const utm_campaign = truncate(cleanNullableString(raw.utm_campaign), MAX_UTM_LENGTH);
  const utm_content = truncate(cleanNullableString(raw.utm_content), MAX_UTM_LENGTH);
  const utm_term = truncate(cleanNullableString(raw.utm_term), MAX_UTM_LENGTH);
  const campaign =
    truncate(cleanNullableString(raw.campaign), MAX_FIELD_LENGTH) ?? utm_campaign;

  return {
    submission_id,
    form_id: truncate(cleanNullableString(raw.form_id), MAX_FIELD_LENGTH),
    name: truncate(cleanNullableString(raw.name), MAX_FIELD_LENGTH),
    phone,
    email: truncate(cleanNullableString(raw.email), MAX_FIELD_LENGTH),
    company: truncate(cleanNullableString(raw.company), MAX_FIELD_LENGTH),
    location: truncate(cleanNullableString(raw.location), MAX_FIELD_LENGTH),
    message: truncate(cleanNullableString(raw.message), MAX_MESSAGE_LENGTH),
    campaign,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
    submitted_at: cleanString(raw.submitted_at) ?? null,
  };
}

/**
 * Create-or-update a contact from a validated Google Form submission.
 * Returns the contact id and whether it was created.
 *
 * Idempotency (in priority order):
 *   1. `google_form_submission_id` — if a contact in this account
 *      already carries it, return `duplicate` (no write).
 *   2. Phone match (`findExistingContact`) — update in place.
 *   3. Fresh insert with `source='google_form'`, `lead_status='new'`.
 *
 * Tags ("Google Form Lead" + optional campaign) are attached via the
 * shared tag machinery; a form "message" is optionally stored as a
 * contact note. Neither failure is fatal (never lose the contact).
 */
export async function ingestGoogleFormSubmission(
  db: SupabaseClient,
  accountId: string,
  auditUserId: string,
  input: GoogleFormSubmission,
): Promise<IngestResult> {
  // 1. Idempotency by submission id — prior retry already processed this
  //    exact form response.
  if (input.submission_id) {
    const { data: existing } = await db
      .from('contacts')
      .select('id')
      .eq('account_id', accountId)
      .eq('google_form_submission_id', input.submission_id)
      .maybeSingle();
    if (existing) {
      return { action: 'duplicate', contactId: existing.id as string, duplicate: true };
    }
  }

  const phone = normalizePhone(input.phone);
  if (!phone) {
    const err = new Error("'phone' is not a valid phone number");
    (err as unknown as { status: number }).status = 400;
    throw err;
  }

  const sourceAttribution = {
    source: 'google_form',
    source_platform: null,
    google_form_submission_id: input.submission_id ?? null,
    form_id: input.form_id ?? null,
    campaign_name: input.campaign ?? null,
    utm_source: input.utm_source ?? null,
    utm_medium: input.utm_medium ?? null,
    utm_campaign: input.utm_campaign ?? null,
    utm_content: input.utm_content ?? null,
    utm_term: input.utm_term ?? null,
  };

  const existing = await findExistingContact(db, accountId, phone);
  let contactId: string | undefined;

  if (existing) {
    // Prefer the submission timestamp when provided, else now.
    const patch: Record<string, unknown> = {
      ...sourceAttribution,
      updated_at: new Date().toISOString(),
    };
    if (input.name !== undefined && input.name !== null) patch.name = input.name;
    if (input.company !== undefined && input.company !== null)
      patch.company = input.company;
    if (input.location !== undefined && input.location !== null)
      patch.location = input.location;
    if (input.email !== undefined && input.email !== null) patch.email = input.email;

    const { data: existingRow } = await db
      .from('contacts')
      .select('lead_status')
      .eq('id', existing.id)
      .maybeSingle();
    const currentStatus = existingRow?.lead_status as string | null | undefined;
    // Never regress a contact that has already moved past 'new'.
    if (!currentStatus || currentStatus === 'new') patch.lead_status = 'new';

    const { error } = await db.from('contacts').update(patch).eq('id', existing.id);
    if (error) throw error;
    contactId = existing.id;
  } else {
    // Legacy contacts.phone is NOT NULL.
    const insertPayload: Record<string, unknown> = {
      user_id: auditUserId,
      account_id: accountId,
      name: input.name ?? phone,
      phone,
      email: input.email ?? null,
      company: input.company ?? null,
      location: input.location ?? null,
      ...sourceAttribution,
      lead_status: 'new',
    };
    // Preserve the actual form submission time when provided.
    if (input.submitted_at) {
      try {
        insertPayload.created_at = new Date(input.submitted_at).toISOString();
      } catch {
        /* ignore invalid timestamp */
      }
    }
    const { data, error } = await db
      .from('contacts')
      .insert(insertPayload)
      .select('id')
      .single();

    if (error && isUniqueViolation(error)) {
      // Concurrency race — re-resolve by submission id or phone.
      if (input.submission_id) {
        const recheck = await db
          .from('contacts')
          .select('id')
          .eq('account_id', accountId)
          .eq('google_form_submission_id', input.submission_id)
          .maybeSingle();
        const againId = recheck.data?.id as string | undefined;
        if (againId) contactId = againId;
      }
      if (!contactId) {
        const raced = await findExistingContact(db, accountId, phone);
        if (raced) contactId = raced.id;
      }
      if (contactId) {
        await db
          .from('contacts')
          .update(sourceAttribution)
          .eq('id', contactId);
        return { action: 'updated', contactId, duplicate: false };
      }
      return { action: 'duplicate', contactId: null, duplicate: true };
    }
    if (error) throw error;
    contactId = data?.id as string | undefined;
  }

  if (!contactId) {
    return { action: 'duplicate', contactId: null, duplicate: true };
  }

  const created = !existing;

  // 3. Auto-tag (reuses existing tags; never duplicates).
  const tagNames = ['Google Form Lead'];
  if (input.campaign?.trim()) tagNames.push(`Campaign: ${input.campaign.trim()}`);
  try {
    await setContactTags(db, accountId, auditUserId, contactId, tagNames);
  } catch (error) {
    console.error('[google-forms] tag apply failed:', error);
  }

  // 4. Optional contact note for the form "message".
  if (input.message?.trim()) {
    try {
      await db.from('contact_notes').insert({
        contact_id: contactId,
        user_id: auditUserId,
        account_id: accountId,
        note_text: input.message.trim(),
      });
    } catch (error) {
      console.error('[google-forms] note insert failed:', error);
    }
  }

  return {
    action: created ? 'created' : 'updated',
    contactId,
    duplicate: false,
  };
}
