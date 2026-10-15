/**
 * Manual "Sync now" for Meta Lead Ads — a pull-based backstop to the
 * webhook. Used from the Social Media center / Settings to re-import
 * recent leads after a disconnect/reconnect gap or a missed webhook.
 *
 * It runs against the service-role client but every query is explicitly
 * scoped to `accountId` (same contract as the webhook path in
 * lead-processor.ts), so tenancy holds. Processing reuses the exact
 * idempotent pipeline the webhook uses (`processMetaLead`), so a lead
 * the webhook already delivered is a no-op (`meta_lead_events`),
 * never a duplicate contact.
 *
 * Any per-Page/API failure is tallied and skipped, never fatal — the
 * caller reports a summary the user can act on.
 */

import { supabaseAdmin } from "@/lib/automations/admin-client";
import { decrypt } from "@/lib/whatsapp/encryption";
import {
  getPageLeadForms,
  getLeadFormLeads,
  type MetaLead,
} from "./leads-api";
import { processMetaLead } from "./lead-processor";

export interface SyncLeadsOptions {
  /** Tenant to import into (account-scoped everywhere). */
  accountId: string;
  /** Attribution owner for rows that need a NOT NULL user_id. */
  userId: string;
  /** Leads per form (capped at 100 by the Graph API). */
  leadsPerForm?: number;
  /** Max forms scanned per Page (the API can return many). */
  maxFormsPerPage?: number;
  /** Hard cap on lead processing across the whole run. */
  maxTotalLeads?: number;
}

export interface SyncLeadsResult {
  pagesScanned: number;
  formsScanned: number;
  created: number;
  updated: number;
  duplicates: number;
  errors: number;
  /** Per-page diagnostics — safe for the dashboard to surface. */
  pages: {
    pageId: string;
    pageName: string | null;
    leadsFetched: number;
    errors: string[];
  }[];
}

export async function syncRecentMetaLeads(
  opts: SyncLeadsOptions,
): Promise<SyncLeadsResult> {
  const {
    accountId,
    userId,
    leadsPerForm = 25,
    maxFormsPerPage = 10,
    maxTotalLeads = 250,
  } = opts;
  const db = supabaseAdmin();

  const result: SyncLeadsResult = {
    pagesScanned: 0,
    formsScanned: 0,
    created: 0,
    updated: 0,
    duplicates: 0,
    errors: 0,
    pages: [],
  };

  const { data: connections, error } = await db
    .from("meta_page_connections")
    .select("*")
    .eq("account_id", accountId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[meta/sync] could not load connections:", error.message);
    result.errors += 1;
    return result;
  }

  if (!connections || connections.length === 0) {
    return result;
  }

  // Group connections by Page, preferring the facebook row for the token
  // (Instagram leads deliver under the parent Page + its Page token — same
  // choice the webhook makes).
  const byPage = new Map<
    string,
    { facebook?: Record<string, unknown>; instagram?: Record<string, unknown>; any: Record<string, unknown> }
  >();
  for (const conn of connections as Record<string, unknown>[]) {
    const pageId = conn.page_id as string;
    if (!byPage.has(pageId)) byPage.set(pageId, { any: conn });
    const group = byPage.get(pageId)!;
    if (conn.platform === "facebook") group.facebook = conn;
    else group.instagram = conn;
  }

  let processed = 0;

  for (const [pageId, group] of byPage) {
    // Hard cap: give up fetching once we hit the batch ceiling so a run
    // never fans out to thousands of Leads calls.
    if (processed >= maxTotalLeads) break;

    const tokenConn = group.facebook ?? group.any;
    const pageName = (tokenConn.page_name as string | null) ?? null;
    const pageErrors: string[] = [];

    let accessToken: string;
    try {
      accessToken = decrypt(tokenConn.access_token as string);
    } catch {
      pageErrors.push("Could not decrypt the stored Page access token.");
      result.pages.push({ pageId, pageName, leadsFetched: 0, errors: pageErrors });
      result.errors += 1;
      continue;
    }

    result.pagesScanned += 1;

    // Forms list is best-effort inside leads-api (returns [] on failure),
    // so surface a local failure we can actually see differently.
    const forms = await getPageLeadForms(pageId, accessToken).catch(() => []);
    if (forms.length === 0) {
      pageErrors.push("No lead forms found, or Meta rejected the forms request.");
      result.pages.push({ pageId, pageName, leadsFetched: 0, errors: pageErrors });
      result.errors += 1;
      continue;
    }

    let leadsFetched = 0;

    for (const form of forms.slice(0, maxFormsPerPage)) {
      if (processed >= maxTotalLeads) break;

      const leads = await getLeadFormLeads(
        form.id,
        accessToken,
        leadsPerForm,
      ).catch(() => null);

      if (!leads) {
        pageErrors.push(`Could not fetch leads for form "${form.name || form.id}".`);
        result.errors += 1;
        continue;
      }

      result.formsScanned += 1;

      for (const lead of leads) {
        if (processed >= maxTotalLeads) break;
        // The webhook feeds lead objects with `form_id` populated; seed it
        // here so source attribution records the owning form even when Meta
        // omits it on the lead row.
        attachFormIfMissing(lead, form.id, form.name);
        try {
          const outcome = await processMetaLead({
            db,
            accountId,
            userId,
            pageId,
            pageName,
            platform: group.instagram ? "instagram" : "facebook",
            instagramAccountId: (group.instagram?.instagram_account_id as string | null) ?? null,
            instagramUsername: (group.instagram?.instagram_username as string | null) ?? null,
            lead,
          });
          if (outcome.action === "created") result.created += 1;
          else if (outcome.action === "updated") result.updated += 1;
          else if (outcome.action === "duplicate") result.duplicates += 1;
          else result.errors += 1;
        } catch (err) {
          console.error("[meta/sync] lead processing failed:", err);
          result.errors += 1;
        }
        processed += 1;
        leadsFetched += 1;
      }
    }

    result.pages.push({ pageId, pageName, leadsFetched, errors: pageErrors });
  }

  return result;
}

/**
 * The Graph API normally returns `form_id` / `form_name` on lead rows,
 * but when it doesn't, backfill them from the form we pulled the leads
 * through so attribution is complete.
 */
function attachFormIfMissing(lead: MetaLead, formId: string, formName: string): void {
  if (!lead.form_id) lead.form_id = formId;
  if (!lead.form_name && formName) lead.form_name = formName;
}