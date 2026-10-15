// POST /api/admin/lead-notifications/test
// Super Admin only — send a labelled test lead-email to the two
// configured recipients (falls back to the caller's email when no
// recipients are configured yet).

import { NextResponse } from "next/server";
import { requireSuperAdmin, toErrorResponse } from "@/lib/auth/super-admin";
import {
  fetchLeadNotificationSettings,
} from "@/lib/lead-notifications/process";
import {
  sendLeadEmail,
  buildTestEmailPayload,
  resolveBaseUrl,
  resendApiKey,
} from "@/lib/lead-notifications/email";

export async function POST() {
  try {
    const ctx = await requireSuperAdmin();

    if (!resendApiKey()) {
      return NextResponse.json(
        {
          error:
            "RESEND_API_KEY is not configured on the server — the test email cannot be sent.",
        },
        { status: 503 },
      );
    }

    const settings = await fetchLeadNotificationSettings();
    const recipients = [
      settings?.recipient_1_email ?? null,
      settings?.recipient_2_email ?? null,
    ].filter((v): v is string => !!v && v.trim().length > 0);

    // Nothing configured yet → at least deliver to the operator so the
    // button always proves the pipeline works.
    if (recipients.length === 0) {
      const { data: user } = await ctx.supabase.auth.getUser();
      recipients.push(user?.user?.email ?? ctx.userId);
    }

    const fromName = settings?.from_name ?? "Tzmicha";
    const fromEmail = settings?.from_email ?? "no-reply@tzmicha.com";
    const payload = buildTestEmailPayload(resolveBaseUrl());

    const results = await Promise.all(
      recipients.map(async (to) => {
        const r = await sendLeadEmail({ fromName, fromEmail, to, payload });
        return { ok: r.ok, to, status: r.status ?? null, error: r.error ?? null };
      }),
    );

    const allOk = results.every((r) => r.ok);
    return NextResponse.json(
      { ok: allOk, results },
      { status: allOk ? 200 : 502 },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}