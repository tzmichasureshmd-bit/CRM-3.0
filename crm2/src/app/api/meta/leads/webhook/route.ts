import { NextResponse, after } from "next/server";
import { verifyMetaWebhookSignature } from "@/lib/whatsapp/webhook-signature";
import { decrypt } from "@/lib/whatsapp/encryption";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { getLeadDetails, MetaLeadsApiError } from "@/lib/meta/leads-api";
import { processMetaLead } from "@/lib/meta/lead-processor";
import { createNotification } from "@/lib/notifications";
import {
  processMessagingEvents,
  type MessengerWebhookMessagingEvent,
} from "@/lib/meta/messaging-processor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface LeadgenChangeValue {
  leadgen_id?: string;
  page_id?: string;
  form_id?: string;
  ad_id?: string;
  created_time?: string;
}

/**
 * Shape of `entry[].changes[].value` when `field === "messages"` on an
 * Instagram webhook subscription (`object: "instagram"`). Meta delivers
 * Instagram DM events here instead of in `entry[].messaging[]` when the
 * app is subscribed via the Instagram product (not the Page product).
 */
interface InstagramMessagesChangeValue {
  messaging?: MessengerWebhookMessagingEvent[];
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean };
}

interface LeadgenEntry {
  id?: string;
  time?: number;
  changes?: Array<{
    field?: string;
    value?: LeadgenChangeValue | InstagramMessagesChangeValue;
  }>;
  /** Messenger / Instagram DM events (`object: "page"`, field messages). */
  messaging?: MessengerWebhookMessagingEvent[];
}

interface LeadgenBody {
  object?: string;
  entry?: LeadgenEntry[];
}

// ------------------------------------------------------------
// GET — Meta webhook verification challenge.
// ------------------------------------------------------------
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const challenge = url.searchParams.get("hub.challenge");
  const verifyToken = url.searchParams.get("hub.verify_token");

  if (
    mode !== "subscribe" ||
    typeof challenge !== "string" ||
    typeof verifyToken !== "string"
  ) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const admin = supabaseAdmin();

  // Per-connection verify tokens (encrypted) take precedence.
  const { data: connections, error } = await admin
    .from("meta_page_connections")
    .select("verify_token")
    .not("verify_token", "is", null);

  if (!error && connections) {
    for (const conn of connections) {
      const stored = conn.verify_token as string | null;
      if (!stored) continue;
      try {
        if (decrypt(stored) === verifyToken) {
          await admin
            .from("meta_page_connections")
            .update({ webhook_status: "active", updated_at: new Date().toISOString() })
            .eq("verify_token", stored);
          return new NextResponse(challenge, { status: 200 });
        }
      } catch {
        // un-decryptable token — skip
      }
    }
  }

  // Instance-level fallback (META_VERIFY_TOKEN), like the WhatsApp webhook.
  if (process.env.META_VERIFY_TOKEN && verifyToken === process.env.META_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

// ------------------------------------------------------------
// POST — leadgen events.
// ------------------------------------------------------------
export async function POST(request: Request) {
  // 1. Read + verify HMAC-SHA256 signature against META_APP_SECRET.
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyMetaWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: LeadgenBody;
  try {
    body = JSON.parse(rawBody) as LeadgenBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log("[meta/webhook] received object=", body.object);

  // Instagram DMs arrive with object="instagram"; Facebook Messenger + Lead
  // Ads arrive with object="page". Both use the same entry[].messaging[] shape.
  // Anything else (whatsapp, user, etc.) is acknowledged but not processed.
  const isPage = body.object === "page";
  const isInstagram = body.object === "instagram";

  if (isInstagram) {
    console.log("[meta/webhook] object=instagram");
  } else if (isPage) {
    console.log("[meta/webhook] object=page");
  }

  if (!isPage && !isInstagram) {
    return NextResponse.json({ status: "ignored" });
  }

  // 2. Process events, ack quickly so Meta doesn't retry. Uses the runtime's
  //    `after()` (not a detached promise) so the work still runs to
  //    completion after we return — same pattern/guarantee as the WhatsApp
  //    webhook (see issue #301 there).
  after(async () => {
    // Lead Ads only come through page object
    if (isPage) {
      try {
        await processLeadgen(body);
      } catch (error) {
        console.error("[meta/webhook] error processing leadgen:", error);
      }
    }
    // Messaging events come through both page (Messenger) and instagram (IG DMs)
    try {
      await processMessaging(body);
    } catch (error) {
      console.error("[meta/webhook] error processing messaging:", error);
    }
  });

  return NextResponse.json({ status: "ok" });
}

/**
 * Ingest Messenger / Instagram DM events after acking Meta.
 *
 * Meta delivers messaging events in two shapes depending on the
 * webhook subscription type:
 *
 *   1. Page subscription (`object: "page"` or `object: "instagram"` via
 *      Page product): events in `entry[].messaging[]`.
 *
 *   2. Instagram subscription (`object: "instagram"` via Instagram
 *      product): events in `entry[].changes[]` where `field === "messages"`
 *      and `value.messaging[]` carries the same event shape.
 *
 * Both shapes are collected here so no DM is silently dropped.
 */
async function processMessaging(body: LeadgenBody): Promise<void> {
  const entries = body.entry ?? [];
  const events: MessengerWebhookMessagingEvent[] = [];

  for (const entry of entries) {
    // Shape 1: entry.messaging[] (Page subscription / Messenger)
    if (entry.messaging && entry.messaging.length > 0) {
      for (const ev of entry.messaging) {
        if (ev.message) {
          console.log("[meta/webhook] event field=messages (entry.messaging)");
        }
      }
      events.push(...entry.messaging);
    }

    // Shape 2: entry.changes[].value.messaging[] (Instagram subscription)
    // Meta uses this shape when the app is subscribed to the Instagram
    // product's `messages` field rather than the Page product.
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const val = change.value as InstagramMessagesChangeValue | undefined;
      if (!val) continue;

      if (val.messaging && val.messaging.length > 0) {
        // Nested messaging array (most common Instagram subscription shape)
        for (const ev of val.messaging) {
          if (ev.message) {
            console.log("[meta/webhook] event field=messages (changes.value.messaging)");
          }
        }
        events.push(...val.messaging);
      } else if (val.sender?.id && val.recipient?.id && val.message?.mid) {
        // Flat shape: the change value itself is the messaging event
        console.log("[meta/webhook] event field=messages (changes.value flat)");
        events.push({
          sender: val.sender,
          recipient: val.recipient,
          timestamp: val.timestamp,
          message: val.message,
        });
      }
    }
  }

  if (events.length === 0) return;
  const sanitized = sanitizeMessagingEvents(events);
  console.log("[meta/webhook] event count", sanitized.length);
  console.log("[meta/webhook] processing started");
  await processMessagingEvents(sanitized);
}

/**
 * Drop events that clearly aren't DM messages (no message / missing ids)
 * before handing off — the processor double-checks, but cheap defensive
 * filtering keeps the log clean for reaction/postback flushes.
 */
function sanitizeMessagingEvents(
  events: MessengerWebhookMessagingEvent[],
): MessengerWebhookMessagingEvent[] {
  return events.filter(
    (ev) =>
      ev &&
      !!ev.sender?.id &&
      !!ev.recipient?.id &&
      !!ev.message?.mid,
  );
}

/**
 * Ingest leadgen events after acking Meta.
 */
async function processLeadgen(body: LeadgenBody): Promise<void> {
  const admin = supabaseAdmin();
  const entries = body.entry ?? [];

  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen" || !change.value) continue;
      await handleLeadgen(admin, change.value as LeadgenChangeValue);
    }
  }
}

async function handleLeadgen(
  admin: ReturnType<typeof supabaseAdmin>,
  value: LeadgenChangeValue,
): Promise<void> {
  const leadgenId = value.leadgen_id;
  const pageId = value.page_id;
  if (!leadgenId || !pageId) {
    console.error("[meta/webhook] leadgen event missing leadgen_id/page_id");
    return;
  }

  // 3. Resolve the Page → connection → tenant (never trust a tenant id
  //    from the frontend — the tenant comes from the stored connection).
  const { data: conns, error } = await admin
    .from("meta_page_connections")
    .select("*")
    .eq("page_id", pageId)
    .eq("status", "active");

  if (error || !conns || conns.length === 0) {
    console.error(`[meta/webhook] no active connection for page ${pageId}`);
    return;
  }

  // Prefer the facebook connection if one exists (Instagram leads are
  // delivered under the parent Page and its Page access token).
  const facebookConn =
    conns.find((c) => c.platform === "facebook") ?? conns[0];

  let accessToken: string;
  try {
    accessToken = decrypt(facebookConn.access_token);
  } catch {
    console.error(`[meta/webhook] could not decrypt page token for ${pageId}`);
    return;
  }

  // 4. Fetch full lead details from Meta.
  let lead;
  try {
    lead = await getLeadDetails(leadgenId, accessToken);
  } catch (err) {
    if (err instanceof MetaLeadsApiError) {
      console.error(
        `[meta/webhook] Meta lead retrieval failed (page ${pageId}, lead ${leadgenId}): ${err.metaMessage}`,
      );
    } else {
      console.error(`[meta/webhook] lead retrieval failed: ${String(err)}`);
    }
    return;
  }

  const accountId = facebookConn.account_id as string;
  const userId = facebookConn.user_id as string;

  // 5. Create / update the contact (idempotent).
  //    Platform classification: Instagram lead forms deliver through the
  //    parent Page but are flagged organic. When a Page has a linked
  //    Instagram connection configured and the lead is organic, we treat
  //    it as an Instagram lead; otherwise it's a Facebook lead.
  const hasInstagram = conns.some((c) => c.platform === "instagram");
  const platform: "facebook" | "instagram" =
    hasInstagram && lead.is_organic ? "instagram" : "facebook";
  const instagramConn =
    (platform === "instagram" ? conns.find((c) => c.platform === "instagram") : undefined) ?? null;

  const result = await processMetaLead({
    db: admin,
    accountId,
    userId,
    pageId,
    pageName: (facebookConn.page_name as string | null) ?? null,
    platform,
    instagramAccountId: (instagramConn?.instagram_account_id as string | null) ?? null,
    instagramUsername: (instagramConn?.instagram_username as string | null) ?? null,
    lead,
  });

  if (result.action === "created") {
    const contactName = leadName(lead) || "New lead";
    const source = platform === "instagram" ? "Instagram" : "Facebook";

    // 6. Notify via the existing notification system (service role).
    const { data: members } = await admin
      .from("profiles")
      .select("user_id")
      .eq("account_id", accountId);
    for (const m of members ?? []) {
      await createNotification({
        accountId,
        userId: m.user_id as string,
        type: "new_lead",
        title: `New ${source} Lead`,
        body: `${contactName} — ${source}${lead.campaign_name ? ` · ${lead.campaign_name}` : ""}`,
        contactId: result.contactId ?? null,
      });
    }
  }
}

/** Best-effort display name from the lead field data. */
function leadName(lead: { field_data?: Array<{ name?: string; values?: string[] }> }): string | null {
  for (const field of lead.field_data ?? []) {
    const name = (field.name ?? "").toLowerCase();
    if (name.includes("full_name") || name === "name") {
      return field.values?.[0] ?? null;
    }
  }
  return null;
}
