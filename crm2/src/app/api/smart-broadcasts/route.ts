import { NextResponse } from "next/server";
import { getCurrentAccount, toErrorResponse } from "@/lib/auth/account";

export async function GET(request: Request) {
  try {
    const ctx = await getCurrentAccount();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    let query = ctx.supabase
      .from("smart_broadcasts")
      .select("*")
      .eq("account_id", ctx.accountId)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Failed to fetch smart broadcasts:", error);
      return NextResponse.json({ error: "Failed to fetch smart broadcasts" }, { status: 500 });
    }

    return NextResponse.json({ broadcasts: data ?? [] });
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

    const { name, message, category, target_audience, config } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const { data, error } = await ctx.supabase
      .from("smart_broadcasts")
      .insert({
        account_id: ctx.accountId,
        user_id: ctx.userId,
        name: name.trim(),
        message: message.trim(),
        category: typeof category === "string" ? category.trim() || null : null,
        target_audience: target_audience ?? {},
        config: config ?? {},
        status: "draft",
      })
      .select("*")
      .single();

    if (error) {
      console.error("Failed to create smart broadcast:", error);
      return NextResponse.json({ error: "Failed to create smart broadcast" }, { status: 500 });
    }

    return NextResponse.json({ broadcast: data }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
