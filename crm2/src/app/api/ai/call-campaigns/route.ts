import { NextResponse } from "next/server";
import { getCurrentAccount, toErrorResponse } from "@/lib/auth/account";

export async function GET(request: Request) {
  try {
    const ctx = await getCurrentAccount();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    let query = ctx.supabase
      .from("ai_call_campaigns")
      .select("*")
      .eq("account_id", ctx.accountId)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Failed to fetch call campaigns:", error);
      return NextResponse.json({ error: "Failed to fetch call campaigns" }, { status: 500 });
    }

    return NextResponse.json({ campaigns: data ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getCurrentAccount();

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { name, description, script, target_contacts, config } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const { data, error } = await ctx.supabase
      .from("ai_call_campaigns")
      .insert({
        account_id: ctx.accountId,
        user_id: ctx.userId,
        name: name.trim(),
        description: typeof description === "string" ? description.trim() || null : null,
        script: typeof script === "string" ? script.trim() || null : null,
        target_contacts: target_contacts ?? [],
        config: config ?? {},
        status: "draft",
      })
      .select("*")
      .single();

    if (error) {
      console.error("Failed to create call campaign:", error);
      return NextResponse.json({ error: "Failed to create call campaign" }, { status: 500 });
    }

    return NextResponse.json({ campaign: data }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
