// GET/PUT /api/admin/lead-notifications/config
// Super Admin only — read/update the two-recipient lead alert settings.

import { NextResponse } from "next/server";
import { requireSuperAdmin, toErrorResponse } from "@/lib/auth/super-admin";
import {
  fetchLeadNotificationSettings,
  saveLeadNotificationSettings,
} from "@/lib/lead-notifications/process";

export async function GET() {
  try {
    await requireSuperAdmin();
    const settings = await fetchLeadNotificationSettings();

    return NextResponse.json({
      settings: settings ?? null,
      emailProviderConfigured: !!process.env.RESEND_API_KEY,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PUT(request: Request) {
  try {
    const ctx = await requireSuperAdmin();

    const body = (await request.json()) as {
      enabled?: boolean;
      recipient_1_email?: string | null;
      recipient_2_email?: string | null;
      from_email?: string;
      from_name?: string;
    };

    const norm = (v: unknown) =>
      typeof v === "string" && v.trim() ? v.trim() : null;
    const patch: {
      enabled?: boolean;
      recipient_1_email?: string | null;
      recipient_2_email?: string | null;
      from_email?: string;
      from_name?: string;
    } = {};
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    if ("recipient_1_email" in body) patch.recipient_1_email = norm(body.recipient_1_email);
    if ("recipient_2_email" in body) patch.recipient_2_email = norm(body.recipient_2_email);
    if ("from_email" in body) patch.from_email = norm(body.from_email) ?? "no-reply@tzmicha.com";
    if ("from_name" in body) patch.from_name = norm(body.from_name) ?? "Tzmicha";

    const { error } = await saveLeadNotificationSettings(patch, ctx.userId);
    if (error) {
      return NextResponse.json({ error }, { status: 500 });
    }

    const settings = await fetchLeadNotificationSettings();
    return NextResponse.json({ ok: true, settings: settings ?? null });
  } catch (err) {
    return toErrorResponse(err);
  }
}