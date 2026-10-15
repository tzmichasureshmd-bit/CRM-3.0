import { NextResponse } from "next/server";

/**
 * GET /api/health
 *
 * Public deployment diagnostic endpoint. Reports the deployed build's git
 * commit and version so release operators can prove WHICH commit is running
 * in production (e.g. `curl https://crm.tzmicha.com/api/health`).
 *
 * The values come from build-time env (NEXT_PUBLIC_GIT_COMMIT /
 * NEXT_PUBLIC_APP_VERSION), which are public and non-secret. No API keys,
 * tokens, app secrets, service-role keys, or encryption keys are ever
 * returned or logged.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    app: process.env.NEXT_PUBLIC_APP_VERSION?.trim() || null,
    commit: process.env.NEXT_PUBLIC_GIT_COMMIT?.trim() || null,
  });
}
