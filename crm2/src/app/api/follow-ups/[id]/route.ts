import { NextResponse } from "next/server";
import { getCurrentAccount, toErrorResponse } from "@/lib/auth/account";
import type { FollowUp } from "@/types";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getCurrentAccount();
    const { id } = await params;

    const { data, error } = await ctx.supabase
      .from("follow_ups")
      .select("*")
      .eq("id", id)
      .eq("account_id", ctx.accountId)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: "Follow-up not found" }, { status: 404 });
    }

    return NextResponse.json(data as FollowUp);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getCurrentAccount();
    const { id } = await params;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    const allowedFields = ["title", "description", "due_date", "reminder_at", "status"];
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if (updates.status === "completed") {
      updates.completed_at = new Date().toISOString();
    } else if (updates.status && updates.status !== "completed") {
      updates.completed_at = null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { data, error } = await ctx.supabase
      .from("follow_ups")
      .update(updates)
      .eq("id", id)
      .eq("account_id", ctx.accountId)
      .select("*")
      .single();

    if (error) {
      console.error("Failed to update follow-up:", error);
      return NextResponse.json({ error: "Failed to update follow-up" }, { status: 500 });
    }

    return NextResponse.json(data as FollowUp);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getCurrentAccount();
    const { id } = await params;

    const { error } = await ctx.supabase
      .from("follow_ups")
      .delete()
      .eq("id", id)
      .eq("account_id", ctx.accountId);

    if (error) {
      console.error("Failed to delete follow-up:", error);
      return NextResponse.json({ error: "Failed to delete follow-up" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
