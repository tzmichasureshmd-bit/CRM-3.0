// POST /api/admin/lead-notifications/process
// Drains the pending lead-notification queue.
//
// Guarded by EITHER:
//   - the scheduler cron secret (x-cron-secret) — wired into
//     /api/scheduler/run as step 4, or
//   - a super admin session — the "Process now" button on the
//     Super Admin Lead Alerts page.

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { requireSuperAdmin, toErrorResponse } from "@/lib/auth/super-admin";
import { processPendingLeadNotifications } from "@/lib/lead-notifications/process";

export async function POST(request: Request) {
  try {
    const expected = process.env.AUTOMATION_CRON_SECRET;
    const supplied = request.headers.get("x-cron-secret") ?? "";
    const suppliedBuf = Buffer.from(supplied);
    const expectedBuf = Buffer.from(expected ?? "");
    const isCron =
      !!expected &&
      suppliedBuf.length === expectedBuf.length &&
      timingSafeEqual(suppliedBuf, expectedBuf);

    let triggeredBy = "super_admin";
    if (isCron) {
      triggeredBy = "cron";
    } else {
      await requireSuperAdmin();
    }

    const result = await processPendingLeadNotifications(50);
    return NextResponse.json({ ok: true, triggeredBy, ...result });
  } catch (err) {
    return toErrorResponse(err);
  }
}