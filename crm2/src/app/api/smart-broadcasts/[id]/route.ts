import { NextResponse, NextRequest } from "next/server";
import { getCurrentAccount, toErrorResponse } from "@/lib/auth/account";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getCurrentAccount();
    const { id } = await params;

    const { data, error } = await ctx.supabase
      .from("smart_broadcasts")
      .select("*")
      .eq("id", id)
      .eq("account_id", ctx.accountId)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: "Smart broadcast not found" }, { status: 404 });
    }

    return NextResponse.json({ broadcast: data });
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
      "message",
      "category",
      "target_audience",
      "config",
      "status",
    ];
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await ctx.supabase
      .from("smart_broadcasts")
      .update(updates)
      .eq("id", id)
      .eq("account_id", ctx.accountId)
      .select("*")
      .single();

    if (error) {
      console.error("Failed to update smart broadcast:", error);
      return NextResponse.json({ error: "Failed to update smart broadcast" }, { status: 500 });
    }

    return NextResponse.json({ broadcast: data });
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

    const { error } = await ctx.supabase
      .from("smart_broadcasts")
      .delete()
      .eq("id", id)
      .eq("account_id", ctx.accountId);

    if (error) {
      console.error("Failed to delete smart broadcast:", error);
      return NextResponse.json({ error: "Failed to delete smart broadcast" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
