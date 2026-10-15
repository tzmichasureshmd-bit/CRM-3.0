// ============================================================
// Lead-notification dispatcher (server-only).
//
// Idempotent claim-then-send drain:
//   1. Claim pending events whose lease is free (lease_expires_at
//      null OR in the past) with an optimistic UPDATE ... WHERE
//      status = 'pending'. Overlapping workers simply lose the race
//      and skip the row — never double-send.
//   2. Enrich each deal with contact / account / assignee / stage /
//      pipeline, build the branded email, send via Resend.
//   3. Mark sent, or failed (retryable → back to pending; permanent
//      after MAX_RETRIES → failed).
//   4. Manual retries reset failed rows back to pending.
// ============================================================

import { supabaseAdmin } from "@/lib/automations/admin-client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlatformLeadNotificationSettings } from "@/types";
import { stageProgress } from "@/lib/crm/leads";
import { sendLeadEmail, resolveBaseUrl } from "@/lib/lead-notifications/email";

export const MAX_RETRIES = 3;
export const LEASE_MS = 5 * 60 * 1000;

export interface ProcessResult {
  paused: boolean;
  claimed: number;
  sent: number;
  retryable: number;
  failed: number;
}

interface PendingEventRow {
  id: string;
  deal_id: string;
  account_id: string;
  recipient_email: string;
  retry_count: number;
}

// -------------------------------------------------------------
// Settings
// -------------------------------------------------------------

export async function fetchLeadNotificationSettings(
  admin: SupabaseClient = supabaseAdmin(),
): Promise<PlatformLeadNotificationSettings | null> {
  const { data, error } = await admin
    .from("platform_lead_notification_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return null;
  return data as PlatformLeadNotificationSettings;
}

export async function saveLeadNotificationSettings(
  patch: Partial<
    Pick<
      PlatformLeadNotificationSettings,
      "enabled" | "recipient_1_email" | "recipient_2_email" | "from_email" | "from_name"
    >
  >,
  updatedBy?: string,
): Promise<{ error?: string }> {
  const admin = supabaseAdmin();
  const { error } = await admin
    .from("platform_lead_notification_settings")
    .upsert(
      {
        id: 1,
        ...patch,
        updated_by: updatedBy ?? null,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "id" },
    );
  return { error: error?.message };
}

// -------------------------------------------------------------
// Dispatch
// -------------------------------------------------------------

export async function processPendingLeadNotifications(
  limit = 50,
): Promise<ProcessResult> {
  const admin = supabaseAdmin();
  const settings = await fetchLeadNotificationSettings(admin);
  if (!settings?.enabled) {
    return { paused: true, claimed: 0, sent: 0, retryable: 0, failed: 0 };
  }

  const now = new Date();
  const leaseExpiredOr = `lease_expires_at.is.null,lease_expires_at.lt.${now.toISOString()}`;

  const { data: candidates, error } = await admin
    .from("lead_notification_events")
    .select("id, deal_id, account_id, recipient_email, retry_count")
    .eq("status", "pending")
    .or(leaseExpiredOr)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error || !candidates || candidates.length === 0) {
    return { paused: false, claimed: 0, sent: 0, retryable: 0, failed: 0 };
  }

  const claimed: PendingEventRow[] = [];
  const newLease = new Date(now.getTime() + LEASE_MS).toISOString();

  for (const row of candidates as PendingEventRow[]) {
    const { data: won } = await admin
      .from("lead_notification_events")
      .update({
        status: "sending",
        lease_expires_at: newLease,
        retry_count: (row.retry_count ?? 0) + 1,
      })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (won) claimed.push(row);
  }

  if (claimed.length === 0) {
    return { paused: false, claimed: 0, sent: 0, retryable: 0, failed: 0 };
  }

  // Enrich all claimed deals in two batched queries.
  const dealIds = [...new Set(claimed.map((row) => row.deal_id))];
  const [dealMap, stageMap] = await Promise.all([
    loadDeals(admin, dealIds),
    loadStages(admin, dealIds),
  ]);

  let sent = 0;
  let retryable = 0;
  let failed = 0;
  const baseUrl = resolveBaseUrl();

  for (const row of claimed) {
    const deal = dealMap.get(row.deal_id) as EnrichedDeal | undefined;
    if (!deal) {
      // Lead was deleted between claim and process — drop silently.
      await admin
        .from("lead_notification_events")
        .update({
          status: "failed",
          error_message: "deal no longer exists",
          sent_at: null,
          lease_expires_at: null,
        })
        .eq("id", row.id);
      failed += 1;
      continue;
    }

    const result = await sendLeadEmail({
      fromName: settings.from_name,
      fromEmail: settings.from_email,
      to: row.recipient_email,
      payload: {
        leadName: deal.contact?.name ?? deal.title ?? "New Lead",
        phone: deal.contact?.phone ?? "",
        email: deal.contact?.email ?? "",
        customer: deal.account?.name ?? "",
        sourceLabel: sourceLabel(deal.contact?.source ?? null, deal.contact?.source_platform ?? null),
        stageName: deal.stage?.name ?? "",
        agentName: deal.assignee?.full_name ?? "Unassigned",
        createdAt: deal.created_at,
        progress: deal.stage
          ? stageProgress(deal.stage, stageMap.get(deal.pipeline_id) ?? [])
          : 0,
        dealId: deal.id,
        baseUrl,
      },
    });

    if (result.ok) {
      await admin
        .from("lead_notification_events")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          error_message: null,
          lease_expires_at: null,
        })
        .eq("id", row.id);
      sent += 1;
    } else {
      const permanent = (row.retry_count ?? 0) + 1 >= MAX_RETRIES;
      await admin
        .from("lead_notification_events")
        .update({
          status: permanent ? "failed" : "pending",
          error_message: result.error ?? "send failed",
          sent_at: null,
          lease_expires_at: null,
        })
        .eq("id", row.id);
      if (permanent) failed += 1;
      else retryable += 1;
    }
  }

  return { paused: false, claimed: claimed.length, sent, retryable, failed };
}

// -------------------------------------------------------------
// Manual retry — reset failed rows so the next drain retries them.
// -------------------------------------------------------------

export async function retryLeadNotifications(
  ids: string[],
): Promise<{ reset: number }> {
  if (ids.length === 0) return { reset: 0 };
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("lead_notification_events")
    .update({
      status: "pending",
      error_message: null,
      sent_at: null,
      lease_expires_at: null,
      retry_count: 0,
    })
    .eq("status", "failed")
    .in("id", ids)
    .select("id");
  return { reset: data?.length ?? 0 };
}

// -------------------------------------------------------------
// Enrichment
// -------------------------------------------------------------

interface EnrichedDeal {
  id: string;
  title: string;
  created_at: string;
  status: string;
  pipeline_id: string;
  stage_id: string;
  contact?: { name?: string | null; phone?: string | null; email?: string | null; source?: string | null; source_platform?: string | null } | null;
  assignee?: { full_name?: string | null } | null;
  account?: { name?: string | null } | null;
  stage?: StageRow | null;
}

interface StageRow {
  id: string
  pipeline_id: string
  name: string
  position: number
  color: string
  created_at: string
}

async function loadDeals(
  admin: SupabaseClient,
  dealIds: string[],
): Promise<Map<string, EnrichedDeal>> {
  const { data } = await admin
    .from("deals")
    .select(
      `id, title, created_at, status, pipeline_id, stage_id,
       contact:contacts(id, name, phone, email, source, source_platform),
       assignee:profiles!deals_assigned_to_fkey(id, full_name),
       account:accounts(id, name),
       stage:pipeline_stages(id, name, position, color, pipeline_id)`,
    )
    .in("id", dealIds);

  const map = new Map<string, EnrichedDeal>();
  for (const row of (data ?? []) as unknown as EnrichedDeal[]) {
    map.set(row.id, row);
  }
  return map;
}

async function loadStages(
  admin: SupabaseClient,
  dealIds: string[],
): Promise<Map<string, StageRow[]>> {
  const { data: deals } = await admin
    .from("deals")
    .select("pipeline_id")
    .in("id", dealIds);
  const pipelineIds = [...new Set((deals ?? []).map((d) => String(d.pipeline_id)))];
  if (pipelineIds.length === 0) return new Map();

  const { data: stages } = await admin
    .from("pipeline_stages")
    .select("id, pipeline_id, name, position, color, created_at")
    .in("pipeline_id", pipelineIds);

  const byPipeline = new Map<string, StageRow[]>();
  for (const s of (stages ?? []) as unknown as StageRow[]) {
    const list = byPipeline.get(s.pipeline_id) ?? [];
    list.push(s);
    byPipeline.set(s.pipeline_id, list);
  }
  for (const list of byPipeline.values()) {
    list.sort((a, b) => a.position - b.position);
  }
  return byPipeline;
}

function sourceLabel(source: string | null, sourcePlatform: string | null): string {
  const s = (source ?? "").toLowerCase();
  if (sourcePlatform === "facebook") return "Facebook";
  if (sourcePlatform === "instagram") return "Instagram";
  if (s.includes("google")) return "Google Form";
  if (s.includes("facebook")) return "Facebook";
  if (s.includes("instagram")) return "Instagram";
  if (s.includes("whatsapp")) return "WhatsApp";
  if (s.includes("website") || s.includes("web")) return "Website";
  if (s.includes("manual")) return "Manual";
  if (s === "meta" || s.includes("lead ads")) return "Meta";
  return "Unknown";
}