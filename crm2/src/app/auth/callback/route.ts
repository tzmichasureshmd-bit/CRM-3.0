import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /auth/callback
 *
 * Landing target for one-time Supabase email links (password recovery,
 * and any confirmation link configured to point here). The URL carries
 * a single-use PKCE `code`; we exchange it server-side for a real
 * session (cookies written by the @supabase/ssr helper) and forward the
 * visitor to the `next` path — by default /reset-password, where they
 * set their new password.
 *
 * The `next` param is restricted to internal absolute paths so the
 * route can never be abused as an open redirect.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextRaw = searchParams.get("next") ?? "/reset-password";
  const next =
    nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/reset-password";

  if (!code) {
    return NextResponse.redirect(`${origin}/forgot-password?error=invalid_reset_link`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Codes are single-use and short-lived: reused, expired, or
    // otherwise invalid links all land here. Send the user back to
    // request a fresh link rather than exposing why it failed.
    console.error("[auth/callback] exchangeCodeForSession failed:", error.message);
    return NextResponse.redirect(`${origin}/forgot-password?error=invalid_reset_link`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
