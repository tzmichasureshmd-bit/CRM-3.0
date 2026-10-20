import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { syncRecentMetaLeads } from "@/lib/meta/sync-leads";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/meta/leads/sync — manual "Sync now" for Meta Lead Ads.
 *
 * Pulls recent leads from the connected Pages' lead forms through the
 * official Graph API and re-processes them through the same idempotent
 * pipeline the webhook uses. Reconnects after gaps (disconnect,
 * webhook downtime) and backfills leads that were missed.
 *
 * Admin-only: it reads the encrypted Page tokens server-side and never
 * returns them.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireRole("admin");

    const limit = checkRateLimit(`meta-sync:${ctx.accountId}`, RATE_LIMITS.metaSync);
    if (!limit.success) {
      return rateLimitResponse(limit);
    }

    const body = (await request.json().catch(() => ({}))) as {
      leadsPerForm?: number;
      maxFormsPerPage?: number;
      maxTotalLeads?: number;
    };

    const result = await syncRecentMetaLeads({
      accountId: ctx.accountId,
      userId: ctx.userId,
      leadsPerForm: body.leadsPerForm,
      maxFormsPerPage: body.maxFormsPerPage,
      maxTotalLeads: body.maxTotalLeads,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return toErrorResponse(err);
  }
}