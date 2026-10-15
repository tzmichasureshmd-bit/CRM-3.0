import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { decrypt } from "@/lib/whatsapp/encryption";

export const dynamic = "force-dynamic";

const META_API_VERSION = "v21.0";
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

/**
 * Per-connection live health check for the Integrations hub.
 *
 * Unlike the stored overview (which reports row existence), this endpoint
 * actually TALKS to the Meta Graph API for every connection and reports:
 *   * whatsapp  — token call to each phone_number_id + WABA subscribed_apps
 *   * facebook  — token call to each Page + Page subscribed_apps fields
 *   * instagram — token call to each Professional account
 *
 * Secrets never leave the server: tokens are decrypted in-process and only
 * a normalized status string is returned. Individual check failures are
 * collected per resource (never fails the whole request) so one broken
 * number doesn't hide the rest.
 */

type CheckStatus = "ok" | "error" | "unverified" | "unknown";

interface WhatsappNumberHealth {
  id: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  businessName: string | null;
  connectionMethod: string | null;
  api: CheckStatus;
  apiError: string | null;
  webhook: CheckStatus;
  lastWebhookAt: string | null;
  lastInboundAt: string | null;
}

interface FacebookPageHealth {
  id: string;
  pageId: string;
  pageName: string | null;
  api: CheckStatus;
  apiError: string | null;
  leadgenWebhook: CheckStatus;
  messagesWebhook: CheckStatus;
}

interface InstagramAccountHealth {
  id: string;
  instagramAccountId: string | null;
  username: string | null;
  pageName: string | null;
  api: CheckStatus;
  apiError: string | null;
}

export interface IntegrationHealthPayload {
  checkedAt: string;
  config: {
    metaConfigured: boolean;
    whatsappConfigured: boolean;
  };
  whatsapp: {
    connected: boolean;
    numbers: WhatsappNumberHealth[];
  };
  facebook: {
    connected: boolean;
    pages: FacebookPageHealth[];
  };
  instagram: {
    connected: boolean;
    accounts: InstagramAccountHealth[];
  };
}

/** Safe, user-presentable description of a failed check. Never includes
 *  request bodies/headers (tokens, app secret, raw Meta errors). */
function safeApiError(status: number, label: string): string {
  if (status === 401 || status === 403) {
    return `${label} credential rejected — reconnect to refresh access.`;
  }
  if (status === 404) {
    return `${label} not found on this Meta account — reconnect to refresh.`;
  }
  return `${label} unreachable (HTTP ${status}).`;
}

async function graphGet(
  path: string,
  accessToken: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  try {
    const res = await fetch(
      `${META_API_BASE}/${path}?fields=id,name&access_token=${encodeURIComponent(accessToken)}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(9000),
      },
    );
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { ok: true, status: res.status, data };
    }
    return { ok: false, status: res.status, data: {} };
  } catch {
    return { ok: false, status: 0, data: {} };
  }
}

async function subscribedFields(pageId: string, accessToken: string) {
  try {
    const res = await fetch(
      `${META_API_BASE}/${pageId}/subscribed_apps?fields=name,subscribed_fields&access_token=${encodeURIComponent(accessToken)}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(9000),
      },
    );
    if (!res.ok) {
      return { leadgen: "unknown" as CheckStatus, messages: "unknown" as CheckStatus };
    }
    const body = (await res.json().catch(() => ({}))) as {
      data?: Array<{ name?: string | null; subscribed_fields?: string[] | null }>;
    };
    const apps = body.data ?? [];
    const leadgen = apps.some((a) =>
      (a.subscribed_fields ?? []).includes("leadgen"),
    );
    const messages = apps.some((a) =>
      (a.subscribed_fields ?? []).includes("messages"),
    );
    return {
      leadgen: (leadgen ? "ok" : "unverified") as CheckStatus,
      messages: (messages ? "ok" : "unverified") as CheckStatus,
    };
  } catch {
    return { leadgen: "unknown" as CheckStatus, messages: "unknown" as CheckStatus };
  }
}

export async function GET() {
  try {
    const ctx = await requireRole("viewer");
    const admin = supabaseAdmin();

    // Tokens are encrypted; read the raw rows via the service role (we
    // already resolved the tenant server-side) and decrypt in-process.
    const [waRes, fbRes] = await Promise.all([
      admin
        .from("whatsapp_config")
        .select(
          "id, phone_number_id, waba_id, access_token, display_phone_number, " +
            "business_name, connection_method, last_webhook_at, last_inbound_at",
        )
        .eq("account_id", ctx.accountId),
      admin
        .from("meta_page_connections")
        .select(
          "id, page_id, page_name, access_token, platform, " +
            "instagram_account_id, instagram_username",
        )
        .eq("account_id", ctx.accountId),
    ]);

    const waRows = (waRes.data ?? []) as unknown as Array<Record<string, unknown>>;
    const connRows = (fbRes.data ?? []) as unknown as Array<Record<string, unknown>>;

    // ---- WhatsApp -----------------------------------------------------
    const waNumbers: WhatsappNumberHealth[] = [];
    for (const row of waRows as Array<Record<string, unknown>>) {
      const phoneNumberId = (row.phone_number_id as string) ?? "";
      const rawToken = (row.access_token as string) ?? "";
      const token = rawToken ? decrypt(rawToken) : "";
      let api: CheckStatus = "unverified";
      let apiError: string | null = null;
      let webhook: CheckStatus = "unverified";

      if (phoneNumberId && token) {
        const { ok, status } = await graphGet(phoneNumberId, token);
        api = ok ? "ok" : "error";
        if (!ok) apiError = safeApiError(status, "Phone number");

        // App-level webhook subscription lives on the WABA.
        const wabaId = (row.waba_id as string) ?? "";
        if (wabaId) {
          try {
            const res = await fetch(
              `${META_API_BASE}/${wabaId}/subscribed_apps?access_token=${encodeURIComponent(token)}`,
              { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(9000) },
            );
            const body = res.ok
              ? ((await res.json().catch(() => ({}))) as { data?: Array<{ id?: string }> })
              : { data: [] as Array<{ id?: string }> };
            const appId = process.env.META_APP_ID;
            webhook =
              res.ok && (body.data ?? []).some((a) => a.id === appId)
                ? "ok"
                : "unverified";
          } catch {
            webhook = "unknown";
          }
        }
      }

      waNumbers.push({
        id: row.id as string,
        phoneNumberId,
        displayPhoneNumber: (row.display_phone_number as string | null) ?? null,
        businessName: (row.business_name as string | null) ?? null,
        connectionMethod: (row.connection_method as string | null) ?? null,
        api,
        apiError,
        webhook,
        lastWebhookAt: (row.last_webhook_at as string | null) ?? null,
        lastInboundAt: (row.last_inbound_at as string | null) ?? null,
      });
    }

    // ---- Facebook + Instagram -----------------------------------------
    const pages: FacebookPageHealth[] = [];
    let accounts: InstagramAccountHealth[] = [];
    const igPromises: Promise<InstagramAccountHealth>[] = [];

    for (const row of connRows as Array<Record<string, unknown>>) {
      const platform = (row.platform as string) ?? "facebook";
      const pageId = (row.page_id as string) ?? "";
      const rawToken = (row.access_token as string) ?? "";
      const token = rawToken ? decrypt(rawToken) : "";
      const id = row.id as string;

      if (platform === "facebook") {
        let api: CheckStatus = "unverified";
        let apiError: string | null = null;
        if (pageId && token) {
          const { ok, status } = await graphGet(pageId, token);
          api = ok ? "ok" : "error";
          if (!ok) apiError = safeApiError(status, "Facebook Page");
        }
        const fields = token
          ? await subscribedFields(pageId, token)
          : { leadgen: "unverified" as CheckStatus, messages: "unverified" as CheckStatus };
        pages.push({
          id,
          pageId,
          pageName: (row.page_name as string | null) ?? null,
          api,
          apiError,
          leadgenWebhook: fields.leadgen,
          messagesWebhook: fields.messages,
        });
      } else {
        // Instagram: verify the Professional account id + token together.
        igPromises.push(
          (async (): Promise<InstagramAccountHealth> => {
            const igId = (row.instagram_account_id as string | null) ?? null;
            let api: CheckStatus = "unverified";
            let apiError: string | null = null;
            const username = (row.instagram_username as string | null) ?? null;
            if (igId && token) {
              const { ok, status } = await graphGet(igId, token);
              api = ok ? "ok" : "error";
              if (!ok) apiError = safeApiError(status, "Instagram account");
            }
            return {
              id,
              instagramAccountId: igId,
              username,
              pageName: (row.page_name as string | null) ?? null,
              api,
              apiError,
            };
          })(),
        );
      }
    }
    if (igPromises.length > 0) {
      accounts = await Promise.all(igPromises);
    }

    const metaConfigured = Boolean(process.env.META_APP_ID);
    const whatsappConfigured = Boolean(
      process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_EMBEDDED_SIGNUP_CONFIG_ID,
    );

    const payload: IntegrationHealthPayload = {
      checkedAt: new Date().toISOString(),
      config: { metaConfigured, whatsappConfigured },
      whatsapp: {
        connected: waNumbers.length > 0,
        numbers: waNumbers,
      },
      facebook: {
        connected: pages.length > 0,
        pages,
      },
      instagram: {
        connected: accounts.length > 0,
        accounts,
      },
    };

    return NextResponse.json(payload);
  } catch (err) {
    return toErrorResponse(err);
  }
}