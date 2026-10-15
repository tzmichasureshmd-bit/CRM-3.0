import { NextResponse, NextRequest } from "next/server";
import { getCurrentAccount, requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/ai/admin-client";

/**
 * GET /api/ai/followups/[id]  (viewer+)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getCurrentAccount();
    const { id } = await params;

    const { data, error } = await ctx.supabase
      .from("ai_followups")
      .select("*")
      .eq("id", id)
      .eq("account_id", ctx.accountId)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: "AI follow-up not found" }, { status: 404 });
    }

    return NextResponse.json({ followup: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * PUT /api/ai/followups/[id]  (agent+)
 *
 * Updates an AI follow-up recipe. Only columns that exist on the live
 * `ai_followups` table are accepted — no description, working-hours,
 * AI provider, or use_template fields (they are not in the schema).
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("agent");
    const { id } = await params;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    const allowedFields = [
      "name", "status", "trigger_type", "trigger_config",
      "max_followups", "delay_hours", "ai_system_prompt", "template_id",
    ];
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const STATUSES = ["draft", "active", "paused", "archived"];
    if ("status" in updates && !STATUSES.includes(updates.status as string)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${STATUSES.join(", ")}` },
        { status: 400 },
      );
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await ctx.supabase
      .from("ai_followups")
      .update(updates)
      .eq("id", id)
      .eq("account_id", ctx.accountId)
      .select("*")
      .single();

    if (error) {
      console.error("Failed to update AI follow-up:", error);
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 500 },
      );
    }

    return NextResponse.json({ followup: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * DELETE /api/ai/followups/[id]  (admin+)
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("admin");
    const { id } = await params;

    // Delete executions first (CASCADE should handle this, but be explicit).
    await ctx.supabase
      .from("ai_followup_executions")
      .delete()
      .eq("followup_id", id);

    const { error } = await ctx.supabase
      .from("ai_followups")
      .delete()
      .eq("id", id)
      .eq("account_id", ctx.accountId);

    if (error) {
      console.error("Failed to delete AI follow-up:", error);
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * POST /api/ai/followups/[id]  (agent+)
 *
 * Manual "Run now" — creates one or more executions for specific contacts
 * and queues them immediately (next_action_at = now).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("agent");
    const { id: followupId } = await params;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const contactIds = Array.isArray(body?.contact_ids) ? (body!.contact_ids as string[]) : [];

    if (contactIds.length === 0) {
      return NextResponse.json({ error: "contact_ids array is required" }, { status: 400 });
    }

    // Verify the follow-up exists and belongs to this account.
    const { data: followup } = await ctx.supabase
      .from("ai_followups")
      .select("id, max_followups, status")
      .eq("id", followupId)
      .eq("account_id", ctx.accountId)
      .maybeSingle();

    if (!followup) {
      return NextResponse.json({ error: "AI follow-up not found" }, { status: 404 });
    }
    if (followup.status !== "active") {
      return NextResponse.json(
        { error: "Follow-up must be active to run. Update its status first." },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const executions = contactIds.map((contactId) => ({
      account_id: ctx.accountId,
      followup_id: followupId,
      contact_id: contactId,
      status: "active" as const,
      current_step: 0,
      total_steps: followup.max_followups || 3,
      next_action_at: now,
      vars: {},
    }));

    // Upsert — don't create duplicate executions for the same followup+contact.
    const { data, error } = await supabaseAdmin()
      .from("ai_followup_executions")
      .upsert(executions, {
        onConflict: "followup_id,contact_id",
        ignoreDuplicates: true,
      })
      .select("id");

    if (error) {
      console.error("Failed to create follow-up executions:", error);
      return NextResponse.json({ error: "Failed to create executions" }, { status: 500 });
    }

    // execution_count / last_executed_at do not exist on the live table,
    // so only the timestamp is bumped after a manual run.
    await supabaseAdmin()
      .from("ai_followups")
      .update({ updated_at: now })
      .eq("id", followupId);

    return NextResponse.json({
      created: data?.length ?? 0,
      contact_ids: contactIds,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
