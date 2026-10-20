import { NextResponse } from "next/server";
import { getCurrentAccount, toErrorResponse } from "@/lib/auth/account";

/**
 * GET /api/ai/followups  (agent+)
 *
 * Lists AI follow-ups for the account. Optionally filter by status.
 * Note: `ai_followups` is the configuration/recipe, not per-contact
 * executions. There is no contact_id on this table (see migration 051).
 */
export async function GET(request: Request) {
  try {
    const ctx = await getCurrentAccount();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    let query = ctx.supabase
      .from("ai_followups")
      .select("*")
      .eq("account_id", ctx.accountId)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Failed to fetch AI follow-ups:", error);
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 500 },
      );
    }

    return NextResponse.json({ followups: data ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * POST /api/ai/followups  (agent+)
 *
 * Creates a new AI follow-up recipe. Only columns that exist on
 * `ai_followups` (migration 051) are written — anything else the caller
 * sends is ignored rather than failing the insert. Spec-only fields
 * (channel, audience, message, conditions, schedule) live inside
 * `trigger_config`.
 */
export async function POST(request: Request) {
  try {
    const ctx = await getCurrentAccount();

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const {
      name,
      trigger_type,
      trigger_config,
      max_followups,
      delay_hours,
      status,
      ai_system_prompt,
      template_id,
    } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const TRIGGER_TYPES = ['manual','new_contact','tag_added','deal_created','no_response','keyword','webhook','scheduled'];
    if (trigger_type && !TRIGGER_TYPES.includes(trigger_type as string)) {
      return NextResponse.json({ error: `Invalid trigger_type. Must be one of: ${TRIGGER_TYPES.join(', ')}` }, { status: 400 });
    }

    const STATUSES = ["draft", "active", "paused", "archived"];
    if (status !== undefined && !STATUSES.includes(status as string)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${STATUSES.join(', ')}` }, { status: 400 });
    }

    const { data, error } = await ctx.supabase
      .from("ai_followups")
      .insert({
        account_id: ctx.accountId,
        user_id: ctx.userId,
        name: name.trim(),
        trigger_type: typeof trigger_type === "string" ? trigger_type : "manual",
        trigger_config: typeof trigger_config === "object" && trigger_config !== null ? trigger_config : {},
        max_followups: typeof max_followups === "number" ? max_followups : 3,
        delay_hours: typeof delay_hours === "number" ? delay_hours : 24,
        ai_system_prompt: typeof ai_system_prompt === "string" ? ai_system_prompt.trim() || null : null,
        template_id: typeof template_id === "string" && template_id ? template_id : null,
        status: typeof status === "string" ? status : "draft",
      })
      .select("*")
      .single();

    if (error) {
      console.error("Failed to create AI follow-up:", error);
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 500 },
      );
    }

    return NextResponse.json({ followup: data }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
