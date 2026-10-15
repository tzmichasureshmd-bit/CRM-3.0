/**
 * Shared Meta lead → contact ingestion for the Lead Ads webhook.
 *
 * Single source of truth for turning a received `leadgen_id` into a
 * contact in the EXISTING `contacts` table — reusing the same dedupe
 * helpers (`findExistingContact`, `isUniqueViolation`) and the same
 * idempotency log the rest of the CRM relies on. Nothing here creates
 * a separate "Meta leads" system: Meta leads are just contacts with
 * source-attribution columns populated.
 *
 * Idempotency guarantees:
 *   1. meta_lead_events (page_id, leadgen_id) UNIQUE — the same lead
 *      event is never processed twice.
 *   2. contacts (account_id, meta_lead_id) UNIQUE partial index — the
 *      same Meta Lead ID can never become two contacts.
 *   3. If a contact already matches on phone/email, we UPDATE it with
 *      source attribution + missing (non-empty) fields instead of
 *      duplicating — and we NEVER overwrite a valid existing value
 *      with an empty Meta value.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { findExistingContact, isUniqueViolation } from "@/lib/contacts/dedupe";
import { normalizePhone } from "@/lib/whatsapp/phone-utils";
import type { MetaLead } from "./leads-api";

export interface ProcessLeadOptions {
  /** Service-role admin client (bypasses RLS for the webhook). */
  db: SupabaseClient;
  accountId: string;
  userId: string;
  pageId: string;
  pageName?: string | null;
  platform: "facebook" | "instagram";
  instagramAccountId?: string | null;
  instagramUsername?: string | null;
  lead: MetaLead;
}

export interface ProcessLeadResult {
  /** 'created' | 'updated' | 'duplicate' | 'skipped' */
  action: "created" | "updated" | "duplicate" | "skipped";
  contactId?: string;
}

interface ParsedContact {
  name?: string;
  phone?: string;
  email?: string;
  company?: string;
  location?: string;
  address?: string;
  country?: string;
}

/**
 * Normalise a phone string coming out of a Meta lead form. The form
 * may return `+1-202-555-0111`, `(202) 555-0111`, or a plain number.
 * Use digits-only so the existing normalize/compare helpers agree.
 */
function cleanFieldValue(raw?: string | string[]): string {
  if (!raw) return "";
  const value = Array.isArray(raw) ? raw.join(" ") : raw;
  return value.trim();
}

function parseFieldData(lead: MetaLead): ParsedContact {
  const out: ParsedContact = {};
  for (const field of lead.field_data ?? []) {
    const name = (field.name ?? "").toLowerCase();
    const value = cleanFieldValue(field.values);
    if (!name || !value) continue;
    if (name.includes("full_name") || name === "name") out.name = value;
    else if (name.includes("phone") || name.includes("mobile") || name.includes("tel")) {
      out.phone = value;
    } else if (name.includes("email")) out.email = value;
    else if (name.includes("company") || name.includes("business")) out.company = value;
    else if (name.includes("city") || name.includes("location")) out.location = value;
    else if (name.includes("address")) out.address = value;
    else if (name.includes("country")) out.country = value;
  }
  return out;
}

/**
 * Look up an existing contact by phone first, then by email. Never
 * merge on name alone. Returns null when neither matches.
 */
async function findExistingByContact(
  db: SupabaseClient,
  accountId: string,
  parsed: ParsedContact,
): Promise<{ id: string } | null> {
  if (parsed.phone && normalizePhone(parsed.phone)) {
    const byPhone = await findExistingContact(db, accountId, parsed.phone);
    if (byPhone) return { id: byPhone.id };
  }
  if (parsed.email) {
    const email = parsed.email.toLowerCase();
    const { data } = await db
      .from("contacts")
      .select("id")
      .eq("account_id", accountId)
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    if (data) return { id: data.id as string };
  }
  return null;
}

export async function processMetaLead(
  opts: ProcessLeadOptions,
): Promise<ProcessLeadResult> {
  const { db, accountId, userId, lead, pageId, pageName, platform } = opts;
  const leadgenId = lead.id;
  if (!leadgenId) {
    return { action: "skipped" };
  }

  // 1. Idempotency: reject a lead event we've already handled.
  const { data: existingEvent } = await db
    .from("meta_lead_events")
    .select("id")
    .eq("page_id", pageId)
    .eq("leadgen_id", leadgenId)
    .maybeSingle();
  if (existingEvent) {
    return { action: "duplicate" };
  }

  const parsed = parseFieldData(lead);
  const sourceJson = JSON.stringify(lead);

  // 2. Find an existing contact to update (phone, then email).
  const existing = await findExistingByContact(db, accountId, parsed);

  const sourceAttribution = {
    source: "Meta",
    source_platform: platform,
    meta_lead_id: leadgenId,
    source_page_id: pageId,
    source_page_name: pageName ?? null,
    source_instagram_id: opts.instagramAccountId ?? null,
    source_instagram_username: opts.instagramUsername ?? null,
    campaign_id: lead.campaign_id ?? null,
    campaign_name: lead.campaign_name ?? null,
    adset_id: lead.adset_id ?? null,
    adset_name: lead.adset_name ?? null,
    ad_id: lead.ad_id ?? null,
    ad_name: lead.ad_name ?? null,
    form_id: lead.form_id ?? null,
    form_name: lead.form_name ?? null,
    meta_created_time: lead.created_time ? new Date(lead.created_time).toISOString() : null,
    source_json: sourceJson,
    lead_status: existing ? undefined : "new",
  } as Record<string, unknown>;

  let contactId: string | undefined = existing?.id;

  if (existing) {
    // Update the existing contact with source attribution + missing
    // info, never clobbering valid existing values with empty ones.
    // Preserve the contact's existing lead status if it has already
    // progressed past 'new' (don't regress a won/lost/qualified contact).
    const { data: existingRow } = await db
      .from("contacts")
      .select("*")
      .eq("id", existing.id)
      .maybeSingle();

    const patch: Record<string, unknown> = {
      ...sourceAttribution,
      updated_at: new Date().toISOString(),
    };
    if (parsed.name) patch.name = parsed.name;
    if (parsed.phone) patch.phone = parsed.phone;
    if (parsed.email) patch.email = parsed.email;
    if (parsed.company) patch.company = parsed.company;
    if (parsed.location) patch.location = parsed.location;
    if (parsed.address) patch.address = parsed.address;
    if (parsed.country) patch.country = parsed.country;
    patch.source_json = sourceJson;
    if (!existingRow?.lead_status || existingRow.lead_status === "new") {
      patch.lead_status = "new";
    }
    const { error } = await db
      .from("contacts")
      .update(patch)
      .eq("id", existing.id);
    if (error) throw error;
    contactId = existing.id;
  } else {
    // Create a brand-new contact.
    const insertPayload: Record<string, unknown> = {
      user_id: userId,
      account_id: accountId,
      name: parsed.name ?? null,
      phone: parsed.phone || generateFallbackPhone(),
      email: parsed.email ?? null,
      company: parsed.company ?? null,
      location: parsed.location ?? null,
      address: parsed.address ?? null,
      country: parsed.country ?? null,
      ...sourceAttribution,
      lead_status: "new",
    };
    const { data, error } = await db
      .from("contacts")
      .insert(insertPayload)
      .select("id")
      .single();

    if (error && isUniqueViolation(error)) {
      // Another webhook raced us; re-check whether the contact now exists.
      const again = await findExistingByContact(db, accountId, parsed);
      if (again) {
        await db
          .from("contacts")
          .update({ ...sourceAttribution, updated_at: new Date().toISOString() })
          .eq("id", again.id);
        contactId = again.id;
      } else {
        return { action: "skipped" };
      }
    } else if (error) {
      throw error;
    } else {
      contactId = data?.id as string | undefined;
    }
  }

  // 3. Record the idempotency event (unconditionally on success).
  await db.from("meta_lead_events").insert({
    page_id: pageId,
    leadgen_id: leadgenId,
    form_id: lead.form_id ?? null,
    event_payload: sourceJson,
  });

  if (contactId) {
    // 4. Auto-tag the lead (reuses existing tags; never duplicates).
    await ensureLeadTags(db, userId, accountId, contactId, {
      platform,
      pageName,
      instagramUsername: opts.instagramUsername ?? undefined,
      campaignName: lead.campaign_name ?? undefined,
    });
  }

  return { action: existing ? "updated" : "created", contactId };
}

/**
 * Ensure source tags exist (reusing any existing tags by name) and
 * attach them to the lead contact. Idempotent: tags are created once
 * and a contact tag is only attached if not already present.
 */
async function ensureLeadTags(
  db: SupabaseClient,
  userId: string,
  accountId: string,
  contactId: string,
  opts: {
    platform: "facebook" | "instagram";
    pageName?: string | null;
    instagramUsername?: string | null;
    campaignName?: string | null;
  },
): Promise<void> {
  const tagNames: string[] = [];
  if (opts.platform === "instagram") tagNames.push("Instagram Lead");
  else tagNames.push("Facebook Lead");
  if (opts.pageName?.trim()) tagNames.push(opts.pageName.trim());
  if (opts.campaignName?.trim()) tagNames.push(opts.campaignName.trim());

  if (tagNames.length === 0) return;

  const { data: existingTags } = await db
    .from("tags")
    .select("id, name")
    .eq("account_id", accountId)
    .in("name", tagNames);

  const tagIdByName = new Map<string, string>();
  for (const t of existingTags ?? []) {
    tagIdByName.set(t.name as string, t.id as string);
  }

  const palette = ["#3b82f6", "#ec4899", "#8b5cf6", "#10b981", "#f59e0b"];
  let paletteIdx = 0;

  for (const name of tagNames) {
    let tagId = tagIdByName.get(name);
    if (!tagId) {
      const color = palette[paletteIdx++ % palette.length];
      const { data: created, error } = await db
        .from("tags")
        .insert({
          user_id: userId,
          account_id: accountId,
          name,
          color,
        })
        .select("id")
        .single();
      if (error) continue;
      tagId = created.id as string;
      tagIdByName.set(name, tagId!);
    }

    if (!tagId) continue;

    // Attach only if not already attached.
    const { data: existingLink } = await db
      .from("contact_tags")
      .select("id")
      .eq("contact_id", contactId)
      .eq("tag_id", tagId)
      .maybeSingle();
    if (!existingLink) {
      await db.from("contact_tags").insert({
        contact_id: contactId,
        tag_id: tagId,
      });
    }
  }
}

/**
 * Meta lead forms sometimes omit a phone number entirely. The CRM's
 * contacts.phone is NOT NULL, so generate a unique, invalid-looking
 * placeholder so the lead is never dropped. It's clearly not a real
 * number and can be corrected later. Exported for the Messenger/IG
 * messaging processor, whose channel-originated contacts also have no
 * phone.
 */
export function generateFallbackPhone(): string {
  const suffix = Math.random().toString().slice(2, 11);
  return `00000${suffix}`;
}
