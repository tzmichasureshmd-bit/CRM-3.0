import { NextResponse, NextRequest } from "next/server";
import { getCurrentAccount, toErrorResponse } from "@/lib/auth/account";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getCurrentAccount();
    const { id } = await params;

    const { data: campaign, error: campaignErr } = await ctx.supabase
      .from("ai_call_campaigns")
      .select("*")
      .eq("id", id)
      .eq("account_id", ctx.accountId)
      .maybeSingle();

    if (campaignErr || !campaign) {
      return NextResponse.json({ error: "Call campaign not found" }, { status: 404 });
    }

    const { data: records, error: recordsErr } = await ctx.supabase
      .from("ai_call_records")
      .select("*")
      .eq("campaign_id", id)
      .order("created_at", { ascending: false });

    if (recordsErr) {
      console.error("Failed to fetch call records:", recordsErr);
      return NextResponse.json(
        { campaign, call_records: [] },
        { status: 200 },
      );
    }

    return NextResponse.json({ campaign, call_records: records ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getCurrentAccount();
    const { id } = await params;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    const allowedFields = [
      "name",
      "description",
      "script",
      "target_contacts",
      "config",
      "status",
    ];
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if (updates.status) {
      const validStatuses = ["draft", "active", "paused", "completed", "archived"];
      if (!validStatuses.includes(updates.status as string)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
          { status: 400 },
        );
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await ctx.supabase
      .from("ai_call_campaigns")
      .update(updates)
      .eq("id", id)
      .eq("account_id", ctx.accountId)
      .select("*")
      .single();

    if (error) {
      console.error("Failed to update call campaign:", error);
      return NextResponse.json({ error: "Failed to update call campaign" }, { status: 500 });
    }

    return NextResponse.json({ campaign: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getCurrentAccount();
    const { id } = await params;

    await ctx.supabase
      .from("ai_call_records")
      .delete()
      .eq("campaign_id", id);

    const { error } = await ctx.supabase
      .from("ai_call_campaigns")
      .delete()
      .eq("id", id)
      .eq("account_id", ctx.accountId);

    if (error) {
      console.error("Failed to delete call campaign:", error);
      return NextResponse.json({ error: "Failed to delete call campaign" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
