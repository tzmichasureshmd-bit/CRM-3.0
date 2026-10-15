// ============================================================
// POST /api/v1/integrations/google-forms — ingests a Google Form
// submission into the CRM's Contacts (single source of truth).
//
// This is the secure endpoint a Google Apps Script calls when a new
// row lands in the connected Google Sheet. It uses the SAME public API
// key authentication as every other /api/v1 route — the key both
// authenticates the caller AND identifies the target tenant/account in
// one step (requireApiKey → accountId), so there is no way for a form
// belonging to tenant A to write into tenant B.
//
// Required scope: contacts:write (mint an API key with this scope from
// Settings → API keys and put its value in the Apps Script config).
//
// Payload (all optional except `phone`; `submission_id` is the strongly
// recommended idempotency key from Google Forms so retries can never
// duplicate a contact):
//   {
//     submission_id, form_id, name, phone, email, company, location,
//     message, campaign, submitted_at,
//     utm_source, utm_medium, utm_campaign, utm_content, utm_term
//   }
//
// Response uses the standard v1 envelope:
//   { data: { action, contact_id, duplicate } }  (201 new / 200 updated)
//   { error: { code, message } }                 (4xx/5xx)
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { resolveAuditUserId } from '@/lib/api/v1/contacts';
import {
  sanitizeSubmission,
  ingestGoogleFormSubmission,
} from '@/lib/google-forms/ingest';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'contacts:write');

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail('bad_request', 'Request body must be valid JSON', 400);
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return fail('bad_request', 'Request body must be a JSON object', 400);
    }

    const input = sanitizeSubmission(raw as Record<string, unknown>);
    const auditUserId = await resolveAuditUserId(ctx.supabase, ctx.accountId);

    const result = await ingestGoogleFormSubmission(
      ctx.supabase,
      ctx.accountId,
      auditUserId,
      input,
    );

    const status = result.action === 'created' ? 201 : 200;
    return ok(
      {
        action: result.action,
        contact_id: result.contactId,
        duplicate: result.duplicate,
      },
      status,
    );
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status && status >= 400 && status < 500) {
      return fail(
        'bad_request',
        (err as Error).message,
        status,
      );
    }
    return toApiErrorResponse(err);
  }
}
