import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireRole } from "@/lib/auth/account";

export const dynamic = "force-dynamic";

const PERMISSIONS = [
  "pages_show_list",
  "pages_manage_metadata",
  // Messenger DMs (Facebook Messenger Platform)
  "pages_messaging",
  // Instagram DMs (Instagram Messaging API)
  "instagram_manage_messages",
  // Required to read Instagram account info linked to a Page
  "instagram_basic",
].join(",");

/**
 * Destinations the OAuth flow may send the user back to. Never trust
 * an arbitrary `return_to` from the browser — the callback stores the
 * value in the state cookie and re-normalizes it before redirecting.
 */
const SAFE_RETURN_TOS = new Set<string>(["/settings", "/social-media"]);

/**
 * Normalize a (possibly user-supplied) `return_to` to a known-safe path.
 * Unknown or missing values fall back to /settings (the historical home
 * of the Meta Leads settings panel).
 */
export function normalizeReturnTo(value: string | null | undefined): string {
  return value && SAFE_RETURN_TOS.has(value) ? value : "/settings";
}

/**
 * Build a redirect back into the CRM with a `meta_leads` status flag.
 * Uses an ABSOLUTE URL: `NextResponse.redirect()` rejects relative
 * locations (`URL is malformed ...`, see next/dist/server/web/utils.js
 * validateURL), which previously turned this error path into a raw HTTP
 * 500 in production instead of the intended return to the CRM.
 */
function redirectBack(
  request: Request,
  returnTo: string,
  flag: string,
): NextResponse {
  return NextResponse.redirect(`${buildRedirectUri(request)}${returnTo}?meta_leads=${flag}`);
}

/**
 * Build the Meta OAuth authorization URL for server-side redirect.
 *
 * The `state` is a random value stored in a short-lived cookie; the
 * callback validates it to prevent CSRF. The redirect URI is derived
 * from the request origin (or a NEXT_PUBLIC override) so it works in
 * local dev and production with no hardcoded host.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = normalizeReturnTo(url.searchParams.get("return_to"));

  // Config error: never leak `META_APP_ID is not configured` as raw JSON.
  // Log the technical detail server-side and bounce the user back to the
  // CRM with a flag the UI renders as a professional message.
  const appId = process.env.META_APP_ID;
  if (!appId) {
    console.error(
      "[meta/connect] Meta Lead Ads connect blocked: META_APP_ID is not " +
        "set on this process. Set META_APP_ID (and META_APP_SECRET) in the " +
        "server environment — see docs/meta-leads.md and .env.local.",
    );
    return redirectBack(request, returnTo, "config_error");
  }

  let ctx;
  try {
    ctx = await requireRole("admin");
  } catch (err) {
    // Auth/role failures also get the friendly treatment; the technical
    // reason is logged server-side only.
    console.error("[meta/connect] connect blocked by auth check:", err);
    return redirectBack(request, returnTo, "error");
  }

  const redirectUri =
    buildRedirectUri(request) + "/api/meta/leads/connect/callback";

  const state = crypto.randomBytes(24).toString("hex");

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: PERMISSIONS,
    state,
    // Force Meta to re-show the permissions dialog instead of silently
    // reusing a previous authorization. Without this, a reconnect after
    // a broken/partial grant returns the old token with the old (missing)
    // scopes and the user never sees the permission screen again.
    auth_type: "rerequest",
  });

  const facebookUrl = `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;

  const response = NextResponse.redirect(facebookUrl);
  // Short-lived HttpOnly state cookie for CSRF protection on callback.
  // Carries the trusted account + user ids captured from the
  // authenticated session (the callback itself is an external redirect
  // with no app session), plus the whitelisted destination to return to.
  response.cookies.set(
    "meta_oauth_state",
    JSON.stringify({
      state,
      accountId: ctx.accountId,
      userId: ctx.userId,
      returnTo,
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: request.url.startsWith("https://"),
      path: "/",
      maxAge: 600,
    },
  );
  return response;
}

/**
 * Derive the site origin from the request, falling back to a
 * NEXT_PUBLIC_SITE_URL override. Never hardcodes localhost/prod.
 */
export function buildRedirectUri(request: Request): string {
  const override = process.env.NEXT_PUBLIC_SITE_URL;
  if (override) return override.replace(/\/+$/, "");
  const { protocol, host } = new URL(request.url);
  return `${protocol}//${host}`;
}
