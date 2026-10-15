// POST /api/admin/lead-notifications/retry
// Super Admin only — reset `failed` notification events back to
// `pending` so the next drain retries them.

import { NextResponse } from "next/server";
import { requireSuperAdmin, toErrorResponse } from "@/lib/auth/super-admin";
import { retryLeadNotifications } from "@/lib/lead-notifications/process";

export async function POST(request: Request) {
  try {
    await requireSuperAdmin();

    const body = (await request.json()) as { ids?: string[] };
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id): id is string => typeof id === "string")
      : [];

    if (ids.length === 0) {
      return NextResponse.json(
        { error: "No notification event ids supplied" },
        { status: 400 },
      );
    }

    const { reset } = await retryLeadNotifications(ids);

    return NextResponse.json({ ok: true, reset });
  } catch (err) {
    return toErrorResponse(err);
  }
}