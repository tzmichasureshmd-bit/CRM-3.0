import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { encrypt } from "@/lib/whatsapp/encryption";
import {
  discoverPages,
  exchangeCodeForLongLivedToken,
  getGrantedPermissions,
  subscribePageToLeadgen,
  subscribePageToMessaging,
  MetaLeadsApiError,
} from "@/lib/meta/leads-api";
import { buildRedirectUri, normalizeReturnTo } from "../../connect/route";
import {
  planIgCleanup,
  resolveInstagramAccountId,
  assertValidInstagramRow,
} from "@/lib/meta/instagram-cleanup";

export const dynamic = "force-dynamic";

const REQUIRED_INSTAGRAM_PERMISSIONS = [
  "instagram_basic",
  "instagram_manage_messages",
] as const;

const REQUIRED_FACEBOOK_PERMISSIONS = [
  "pages_show_list",
  "pages_manage_metadata",
  "pages_messaging",
] as const;

const SAFE_REASON_KEYS = new Set([
  "no_pages",
  "denied",
  "exchange_code",
  "discover_pages",
  "subscribe_page",
  "missing_permissions",
]);

function reasonForError(err: unknown): string {
  if (!(err instanceof MetaLeadsApiError)) return "meta_error";
  console.error(
    `[meta/oauth] ${err.operation} failed: code=${err.code ?? "n/a"} ` +
      `type=${err.type ?? "n/a"} message=${err.metaMessage ?? err.message}`,
  );
  return err.operation && SAFE_REASON_KEYS.has(err.operation)
    ? err.operation
    : "meta_error";
}

function safeRedirect(
  base: string,
  returnTo: string,
  status: "connected" | "denied" | "error" | "error_no_pages",
  params: Record<string, string> = {},
): NextResponse {
  const query = new URLSearchParams({ meta_leads: status });
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  return NextResponse.redirect(`${base}${returnTo}?${query.toString()}`);
}

/**
 * Facebook OAuth callback.
 *
 * Per-page processing order (critical — do not reorder):
 *
 *   1. COUNT existing Instagram rows for account+page → log before-count.
 *   2. DELETE all existing Instagram rows for account+page — UNCONDITIONAL.
 *      This runs regardless of whether a fresh IG account was found.
 *      A broken row (instagram_account_id=NULL, stale token) can never
 *      survive a reconnect.
 *   3. LOG stale rows removed.
 *   4. DELETE existing Facebook row for account+page.
 *   5. Resolve freshIgId from the OAuth result.
 *   6. LOG fresh instagram account discovered (id or "none").
 *   7. Subscribe Page to leadgen + messages webhooks.
 *   8. INSERT fresh Facebook connection.
 *   9. If freshIgId is non-null: INSERT fresh Instagram connection.
 *      assertValidInstagramRow() is called as a last-line-of-defence
 *      invariant check before the DB call.
 *  10. LOG fresh instagram connection created (id or "none").
 *
 * Invariant guaranteed: platform='instagram', status='active',
 * instagram_account_id=NULL can never exist after this handler runs.
 */
export async function GET(request: Request) {
  console.log("[meta/oauth] OAuth callback received");

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  const base = buildRedirectUri(request);

  if (errorParam) {
    console.warn("[meta/oauth] user denied or Meta returned error:", errorParam);
    return safeRedirect(base, "/settings", "denied");
  }
  if (!code || !stateParam) {
    return safeRedirect(base, "/settings", "error");
  }

  // CSRF: validate state against the cookie.
  const cookieStore = await cookies();
  const cookieRaw = cookieStore.get("meta_oauth_state")?.value;
  let parsed: unknown = null;
  try {
    parsed = cookieRaw ? JSON.parse(cookieRaw) : null;
  } catch {
    parsed = null;
  }
  const session = parsed as {
    state?: string;
    accountId?: string;
    userId?: string;
    returnTo?: string;
  } | null;
  if (
    !session ||
    !cookieRaw ||
    session.state !== stateParam ||
    !session.accountId ||
    !session.userId
  ) {
    return safeRedirect(base, "/settings", "error");
  }
  const { accountId, userId } = session;
  const returnTo = normalizeReturnTo(session.returnTo);

  try {
    const redirectUri = base + "/api/meta/leads/connect/callback";

    // Step A. Code -> long-lived user token.
    const { accessToken } = await exchangeCodeForLongLivedToken(code, redirectUri);

    // Step B. Validate permissions actually granted — authoritative check.
    // auth_type=rerequest in the OAuth URL asks Meta to re-show the dialog
    // for previously-declined permissions, but the actual grant is confirmed
    // here via /me/permissions regardless of what the dialog showed.
    const grantedPerms = await getGrantedPermissions(accessToken);
    const grantedSet = new Set(
      grantedPerms
        .filter((p) => p.status === "granted")
        .map((p) => p.permission),
    );
    console.log("[meta/oauth] permissions granted:", [...grantedSet].join(", "));

    const missingFb = REQUIRED_FACEBOOK_PERMISSIONS.filter((p) => !grantedSet.has(p));
    if (missingFb.length > 0) {
      console.error("[meta/oauth] missing required Facebook permissions:", missingFb.join(", "));
      return safeRedirect(base, returnTo, "error", { reason: "missing_permissions" });
    }

    const missingIg = REQUIRED_INSTAGRAM_PERMISSIONS.filter((p) => !grantedSet.has(p));
    const instagramPermissionsGranted = missingIg.length === 0;
    if (!instagramPermissionsGranted) {
      console.warn(
        "[meta/oauth] Instagram permissions missing — Instagram connections will not be saved:",
        missingIg.join(", "),
      );
    }

    // Step C. Discover Pages (and their linked Instagram accounts).
    const pages = await discoverPages(accessToken);
    if (pages.length === 0) {
      console.warn(`[meta/oauth] account ${accountId}: OAuth succeeded but no Pages found.`);
      return safeRedirect(base, returnTo, "error_no_pages");
    }

    const admin = supabaseAdmin();
    const records = [];

    for (const page of pages) {
      console.log(`[meta/oauth] page discovered: id=${page.id} name=${page.name}`);

      // ------------------------------------------------------------------
      // STEP 1 — COUNT existing Instagram rows before touching anything.
      // ------------------------------------------------------------------
      const { data: existingIgRows } = await admin
        .from("meta_page_connections")
        .select("id, instagram_account_id")
        .eq("account_id", accountId)
        .eq("page_id", page.id)
        .eq("platform", "instagram");

      const plan = planIgCleanup(
        (existingIgRows ?? []) as Array<{
          id: string;
          account_id: string;
          page_id: string;
          platform: string;
          status: string;
          instagram_account_id: string | null;
        }>,
        null, // freshIgId resolved after cleanup — plan only needs existing rows here
      );

      console.log(
        `[meta/oauth] existing instagram connections before cleanup: ${plan.existingCount}`,
      );

      // ------------------------------------------------------------------
      // STEP 2 — DELETE stale Instagram rows UNCONDITIONALLY.
      //
      // This runs before we even look at what the fresh OAuth result
      // contains for Instagram. Whether freshIgId will be null or valid,
      // the old row is gone. A broken row can never survive a reconnect.
      // ------------------------------------------------------------------
      const { error: igDeleteErr } = await admin
        .from("meta_page_connections")
        .delete()
        .eq("account_id", accountId)
        .eq("page_id", page.id)
        .eq("platform", "instagram");

      const staleRemoved = igDeleteErr ? 0 : plan.existingCount;
      console.log(`[meta/oauth] stale instagram connections removed: ${staleRemoved}`);

      // ------------------------------------------------------------------
      // STEP 3 — DELETE stale Facebook row.
      // ------------------------------------------------------------------
      await admin
        .from("meta_page_connections")
        .delete()
        .eq("account_id", accountId)
        .eq("page_id", page.id)
        .eq("platform", "facebook");

      // ------------------------------------------------------------------
      // STEP 4 — Resolve what the fresh OAuth result contains for IG.
      //          This happens AFTER the delete so the log is accurate.
      // ------------------------------------------------------------------
      const freshIgId = resolveInstagramAccountId({
        instagramPermissionsGranted,
        pageInstagramId: page.instagram?.id,
      });

      console.log(
        `[meta/oauth] fresh instagram account discovered: ${freshIgId ?? "none"}`,
      );

      // ------------------------------------------------------------------
      // STEP 5 — Webhook subscriptions.
      // ------------------------------------------------------------------
      try {
        await subscribePageToLeadgen(page.id, page.pageAccessToken);
      } catch {
        // best-effort; still record the connection
      }

      const messagingOk = await subscribePageToMessaging(page.id, page.pageAccessToken);
      const encryptedToken = encrypt(page.pageAccessToken);
      const webhookStatus = messagingOk ? "active" : "error";

      // ------------------------------------------------------------------
      // STEP 6 — INSERT fresh Facebook connection.
      // ------------------------------------------------------------------
      const fbRow = {
        account_id: accountId,
        user_id: userId,
        page_id: page.id,
        page_name: page.name,
        access_token: encryptedToken,
        status: "active",
        webhook_status: webhookStatus,
        platform: "facebook",
        connected_at: new Date().toISOString(),
      };
      const { data: fbInserted, error: fbErr } = await admin
        .from("meta_page_connections")
        .insert(fbRow)
        .select()
        .single();
      if (fbErr) {
        console.error(`[meta/oauth] insert facebook page=${page.id}:`, fbErr.message);
        continue;
      }
      records.push(fbInserted);

      // ------------------------------------------------------------------
      // STEP 7 — INSERT fresh Instagram connection, only when valid.
      //
      // freshIgId is null  → no row written (old row already deleted above)
      // freshIgId is valid → insert with assertValidInstagramRow() guard
      //
      // It is structurally impossible to reach the insert with a null id:
      //   • freshIgId is the instagram_account_id value
      //   • the if-guard checks freshIgId !== null
      //   • assertValidInstagramRow() throws as a last-line-of-defence
      // ------------------------------------------------------------------
      if (freshIgId) {
        const igRow = {
          account_id: accountId,
          user_id: userId,
          page_id: page.id,
          page_name: page.name,
          access_token: encryptedToken,
          status: "active",
          webhook_status: webhookStatus,
          platform: "instagram",
          instagram_account_id: freshIgId,
          instagram_username: page.instagram?.username ?? null,
          connected_at: new Date().toISOString(),
        };
        assertValidInstagramRow(igRow);
        const { data: igInserted, error: igErr } = await admin
          .from("meta_page_connections")
          .insert(igRow)
          .select("id")
          .single();
        if (igErr) {
          console.error(`[meta/oauth] insert instagram page=${page.id}:`, igErr.message);
          console.log(`[meta/oauth] fresh instagram connection created: none`);
        } else {
          console.log(
            `[meta/oauth] fresh instagram connection created: ${igInserted?.id ?? "unknown"}`,
          );
        }
      } else {
        console.log(`[meta/oauth] fresh instagram connection created: none`);
        if (page.instagram?.id && !instagramPermissionsGranted) {
          console.warn(
            `[meta/oauth] instagram account ${page.instagram.id} found but NOT saved — ` +
              "instagram_basic / instagram_manage_messages not granted.",
          );
        }
      }
    }

    return safeRedirect(base, returnTo, "connected", {
      pages: String(records.length),
    });
  } catch (err) {
    return safeRedirect(base, returnTo, "error", {
      reason: reasonForError(err),
    });
  }
}
