// ============================================================
// GET /api/admin/accounts — List all businesses (super admin only)
// PATCH /api/admin/accounts — Platform stats overview
// ============================================================

import { NextResponse } from "next/server";
import { requireSuperAdmin, toErrorResponse } from "@/lib/auth/super-admin";

export async function GET() {
  try {
    const ctx = await requireSuperAdmin();

    const { data: accounts, error } = await ctx.supabase
      .from("accounts")
      .select(`
        id, name, slug, status, owner_user_id, created_at, updated_at,
        industry, timezone
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET /api/admin/accounts] fetch error:", error);
      return NextResponse.json({ error: "Failed to load accounts" }, { status: 500 });
    }

    // Fetch subscription info for each account
    const accountIds = (accounts ?? []).map((a) => a.id);
    const { data: subscriptions } = await ctx.supabase
      .from("business_subscriptions")
      .select("account_id, status, plan_id, trial_ends_at, current_period_end")
      .in("account_id", accountIds);

    // Fetch member counts
    const { data: memberCounts } = await ctx.supabase
      .from("profiles")
      .select("account_id")
      .in("account_id", accountIds);

    // Fetch contact counts
    const { data: contactCounts } = await ctx.supabase
      .from("contacts")
      .select("account_id")
      .in("account_id", accountIds);

    // Build lookup maps
    const subMap = new Map((subscriptions ?? []).map((s) => [s.account_id, s]));
    const memberCountMap = new Map<string, number>();
    const contactCountMap = new Map<string, number>();

    for (const m of memberCounts ?? []) {
      memberCountMap.set(m.account_id, (memberCountMap.get(m.account_id) ?? 0) + 1);
    }
    for (const c of contactCounts ?? []) {
      contactCountMap.set(c.account_id, (contactCountMap.get(c.account_id) ?? 0) + 1);
    }

    const enriched = (accounts ?? []).map((a) => ({
      ...a,
      subscription: subMap.get(a.id) ?? null,
      member_count: memberCountMap.get(a.id) ?? 0,
      contact_count: contactCountMap.get(a.id) ?? 0,
    }));

    return NextResponse.json({ accounts: enriched, count: enriched.length });
  } catch (err) {
    return toErrorResponse(err);
  }
}
