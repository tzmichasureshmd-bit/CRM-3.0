// ============================================================
// GET /api/admin/accounts/[id] — View a specific business
// PATCH /api/admin/accounts/[id] — Update business status
// ============================================================

import { NextResponse } from "next/server";
import { requireSuperAdmin, toErrorResponse } from "@/lib/auth/super-admin";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireSuperAdmin();
    const { id } = await params;

    const { data: account, error } = await ctx.supabase
      .from("accounts")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Fetch subscription
    const { data: subscription } = await ctx.supabase
      .from("business_subscriptions")
      .select("*, subscription_plans(*)")
      .eq("account_id", id)
      .maybeSingle();

    // Fetch members
    const { data: members } = await ctx.supabase
      .from("profiles")
      .select("user_id, full_name, email, account_role, created_at")
      .eq("account_id", id)
      .order("created_at");

    // Fetch usage
    const { data: usage } = await ctx.supabase
      .from("resource_usage")
      .select("*")
      .eq("account_id", id)
      .order("period_start", { ascending: false })
      .limit(12);

    // Fetch WhatsApp config (masked)
    const { data: whatsapp } = await ctx.supabase
      .from("whatsapp_config")
      .select("id, phone_number_id, status, connected_at, registered_at")
      .eq("account_id", id)
      .order("is_primary", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Counts
    const [contactsResult, conversationsResult, broadcastsResult, automationsResult] = await Promise.all([
      ctx.supabase.from("contacts").select("id", { count: "exact", head: true }).eq("account_id", id),
      ctx.supabase.from("conversations").select("id", { count: "exact", head: true }).eq("account_id", id),
      ctx.supabase.from("broadcasts").select("id", { count: "exact", head: true }).eq("account_id", id),
      ctx.supabase.from("automations").select("id", { count: "exact", head: true }).eq("account_id", id),
    ]);

    return NextResponse.json({
      account,
      subscription,
      members: members ?? [],
      usage: usage ?? [],
      whatsapp,
      counts: {
        contacts: contactsResult.count ?? 0,
        conversations: conversationsResult.count ?? 0,
        broadcasts: broadcastsResult.count ?? 0,
        automations: automationsResult.count ?? 0,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireSuperAdmin();
    const { id } = await params;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    const allowedFields = ["status", "name", "slug", "timezone", "industry"];
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
      .from("accounts")
      .update(updates)
      .eq("id", id)
      .select("id, name, slug, status, updated_at")
      .single();

    if (error) {
      console.error("[PATCH /api/admin/accounts/[id]] update error:", error);
      return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
    }

    return NextResponse.json({ account: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
