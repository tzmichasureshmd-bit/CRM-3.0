import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";

export const dynamic = "force-dynamic";

/**
 * Live status overview for the /integrations page.
 *
 * Every value here comes from a REAL backend resource scoped to the
 * caller's account via RLS (whatsapp_config, meta_page_connections,
 * email_config, webhook_endpoints, contacts). It never fabricates
 * connection state — a card is "connected" only when an actual row /
 * count exists. Secrets (tokens, API keys, passwords) are never leaked;
 * this route reports existence, counts, and safe diagnostic timestamps
 * only.
 */
export interface IntegrationOverviewPayload {
  whatsapp: {
    connected: boolean;
    accountCount: number;
    primary: {
      id: string;
      displayPhoneNumber: string | null;
      businessName: string | null;
      connectionMethod: string | null;
    } | null;
    lastInboundAt: string | null;
  };
  email: {
    connected: boolean;
    fromEmail: string | null;
    provider: string | null;
  };
  meta: {
    /** True when META_APP_ID is present in the server environment. */
    configured: boolean;
    connected: boolean;
    connectionCount: number;
    facebookPages: number;
    instagramAccounts: number;
    lastLeadAt: string | null;
  };
  googleForms: {
    connected: boolean;
    contactCount: number;
    lastSubmissionAt: string | null;
  };
  webhooks: {
    endpointCount: number;
  };
  apiKeys: {
    activeCount: number;
  };
  leadCounts: {
    facebook: number;
    instagram: number;
    whatsapp: number;
    google_form: number;
  };
  threads: {
    connected: boolean;
    username: string | null;
    name: string | null;
    connectedAt: string | null;
  };
  x: {
    connected: boolean;
    username: string | null;
    name: string | null;
    connectedAt: string | null;
    accessLevel: string | null;
  };
}

export async function GET() {
  try {
    const ctx = await requireRole("viewer");

    const [whatsappRes, metaRes, emailRes, googleRes, webhookRes, metaConnRes, apiKeyRes, threadsRes, xRes] =
      await Promise.all([
        ctx.supabase
          .from("whatsapp_config")
          .select(
            "id, display_phone_number, business_name, connection_method, is_primary, last_inbound_at",
          )
          .order("updated_at", { ascending: false }),
        // contacts rows attributed to Meta leads (facebook / instagram)
        ctx.supabase
          .from("contacts")
          .select("source_platform, meta_created_time", { count: "exact", head: false })
          .in("source", ["Meta"])
          .limit(1000),
        ctx.supabase
          .from("email_config")
          .select("provider, from_email, enabled")
          .eq("account_id", ctx.accountId)
          .maybeSingle(),
        ctx.supabase
          .from("contacts")
          .select("created_at", { count: "exact", head: false })
          .eq("source", "google_form")
          .order("created_at", { ascending: false })
          .limit(500),
        ctx.supabase
          .from("webhook_endpoints")
          .select("id, is_active", { count: "exact", head: false }),
        ctx.supabase
          .from("meta_page_connections")
          .select(
            "platform, webhook_status, connected_at, status",
          )
          .order("connected_at", { ascending: false }),
        ctx.supabase
          .from("api_keys")
          .select("id, is_active", { count: "exact", head: false }),
        ctx.supabase
          .from("channel_integrations")
          .select("status, account_name, external_account_id, connected_at, metadata")
          .eq("account_id", ctx.accountId)
          .eq("platform", "threads")
          .maybeSingle(),
        ctx.supabase
          .from("channel_integrations")
          .select("status, account_name, external_account_id, connected_at, metadata")
          .eq("account_id", ctx.accountId)
          .eq("platform", "x")
          .maybeSingle(),
      ]);

    const whatsappRows = whatsappRes.data ?? [];
    const metaConnRows = metaConnRes.data ?? [];
    const googleRows = googleRes.data ?? [];

    const emailConnected = Boolean(
      emailRes.data?.enabled && emailRes.data?.from_email,
    );

    const metaConfigured = Boolean(process.env.META_APP_ID);

    const leadCounts = {
      facebook: 0,
      instagram: 0,
      whatsapp: 0,
      google_form: googleRows.length,
    };
    for (const row of metaRes.data ?? []) {
      const platform = (row as { source_platform?: string }).source_platform;
      if (platform === "instagram") leadCounts.instagram += 1;
      else leadCounts.facebook += 1;
    }

    const whatsappLeadCount = (
      await ctx.supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("source", "whatsapp")
    ).count ?? 0;
    leadCounts.whatsapp = whatsappLeadCount;

    // Facebook/Instagram lead timestamps come from the contact rows; the
    // most recent meta_created_time across them.
    const lastLeadAt = metaRes.data
      ?.map((r) => (r as { meta_created_time?: string | null }).meta_created_time ?? null)
      .filter((v): v is string => Boolean(v))
      .sort()
      .at(-1) ?? null;

    const lastSubmissionAt = googleRows
      .map((r) => (r as { created_at: string }).created_at)
      .sort()
      .at(-1) ?? null;

    const primaryAccount =
      whatsappRows.find((r) => (r as { is_primary?: boolean }).is_primary) ??
      whatsappRows[0] ??
      null;

    const payload: IntegrationOverviewPayload = {
      whatsapp: {
        connected: whatsappRows.length > 0,
        accountCount: whatsappRows.length,
        primary: primaryAccount
          ? {
              id: (primaryAccount as { id: string }).id,
              displayPhoneNumber: (primaryAccount as { display_phone_number?: string | null })
                .display_phone_number ?? null,
              businessName: (primaryAccount as { business_name?: string | null }).business_name ?? null,
              connectionMethod: (primaryAccount as { connection_method?: string | null })
                .connection_method ?? null,
            }
          : null,
        lastInboundAt:
          whatsappRows
            .map((r) => (r as { last_inbound_at?: string | null }).last_inbound_at ?? null)
            .filter((v): v is string => Boolean(v))
            .sort()
            .at(-1) ?? null,
      },
      email: {
        connected: emailConnected,
        fromEmail: emailRes.data?.from_email ?? null,
        provider: emailRes.data?.provider ?? null,
      },
      meta: {
        configured: metaConfigured,
        connected: metaConnRows.length > 0,
        connectionCount: metaConnRows.length,
        facebookPages: metaConnRows.filter(
          (r) => (r as { platform?: string }).platform === "facebook",
        ).length,
        instagramAccounts: metaConnRows.filter(
          (r) => (r as { platform?: string }).platform === "instagram",
        ).length,
        lastLeadAt,
      },
      googleForms: {
        connected: googleRows.length > 0,
        contactCount: googleRows.length,
        lastSubmissionAt,
      },
      webhooks: {
        endpointCount: webhookRes.count ?? 0,
      },
      apiKeys: {
        activeCount:
          (apiKeyRes.data ?? []).filter((r) => (r as { is_active?: boolean }).is_active === true)
            .length,
      },
      leadCounts,
      threads: (() => {
        const row = threadsRes.data as Record<string, unknown> | null;
        if (!row || row.status !== "connected") return { connected: false, username: null, name: null, connectedAt: null };
        const meta = (row.metadata ?? {}) as Record<string, unknown>;
        return {
          connected: true,
          username: (meta.username as string | null) ?? null,
          name: (row.account_name as string | null) ?? null,
          connectedAt: (row.connected_at as string | null) ?? null,
        };
      })(),
      x: (() => {
        const row = xRes.data as Record<string, unknown> | null;
        if (!row || row.status !== "connected") return { connected: false, username: null, name: null, connectedAt: null, accessLevel: null };
        const meta = (row.metadata ?? {}) as Record<string, unknown>;
        return {
          connected: true,
          username: (meta.username as string | null) ?? null,
          name: (row.account_name as string | null) ?? null,
          connectedAt: (row.connected_at as string | null) ?? null,
          accessLevel: (meta.access_level as string | null) ?? "free",
        };
      })(),
    };

    return NextResponse.json(payload);
  } catch (err) {
    return toErrorResponse(err);
  }
}