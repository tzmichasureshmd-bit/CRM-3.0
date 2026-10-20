import { NextResponse } from "next/server";

/**
 * GET /api/health/supabase
 *
 * Production diagnostic endpoint. Checks whether the Supabase auth
 * endpoint is reachable and returning JSON (not an HTML paused-project
 * page). No secrets are logged or returned.
 *
 * Safe to call publicly — only reports "ok" or a reason code.
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json(
      { ok: false, reason: "missing_config", detail: "NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set." },
      { status: 500 },
    );
  }

  try {
    const res = await fetch(`${url}/auth/v1/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
      },
      body: JSON.stringify({ grant_type: "password", email: "x@x", password: "x" }),
      signal: AbortSignal.timeout(10_000),
    });

    const text = await res.text();
    const isHtml =
      text.trimStart().startsWith("<!") ||
      text.trimStart().startsWith("<html") ||
      text.includes("This project is paused") ||
      text.includes("project has been paused");

    if (isHtml) {
      return NextResponse.json(
        { ok: false, reason: "paused_project", detail: "Supabase auth endpoint returned HTML instead of JSON. The project may be paused." },
        { status: 503 },
      );
    }

    return NextResponse.json({ ok: true, status: res.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, reason: "network_error", detail: message },
      { status: 502 },
    );
  }
}
