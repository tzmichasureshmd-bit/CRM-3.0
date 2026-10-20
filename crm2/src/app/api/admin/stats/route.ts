// GET /api/admin/stats — Platform dashboard stats (super admin only)

import { NextResponse } from "next/server";
import { requireSuperAdmin, toErrorResponse } from "@/lib/auth/super-admin";

export async function GET() {
  try {
    const ctx = await requireSuperAdmin();

    // Parallel counts
    const [
      accountsResult,
      usersResult,
      contactsResult,
      messagesResult,
      conversationsResult,
      broadcastsResult,
      automationsResult,
    ] = await Promise.all([
      ctx.supabase.from("accounts").select("id", { count: "exact", head: true }),
      ctx.supabase.from("profiles").select("id", { count: "exact", head: true }),
      ctx.supabase.from("contacts").select("id", { count: "exact", head: true }),
      ctx.supabase.from("messages").select("id", { count: "exact", head: true }),
      ctx.supabase.from("conversations").select("id", { count: "exact", head: true }),
      ctx.supabase.from("broadcasts").select("id", { count: "exact", head: true }),
      ctx.supabase.from("automations").select("id", { count: "exact", head: true }),
    ]);

    // Subscription breakdown
    const { data: subBreakdown } = await ctx.supabase
      .from("business_subscriptions")
      .select("status, plan_id, subscription_plans(slug, name)")
      .not("status", "is", null);

    const statusCounts: Record<string, number> = {};
    const planCounts: Record<string, number> = {};
    for (const sub of subBreakdown ?? []) {
      statusCounts[sub.status] = (statusCounts[sub.status] ?? 0) + 1;
      const planSlug = (sub.subscription_plans as { slug?: string } | null)?.slug ?? "unknown";
      planCounts[planSlug] = (planCounts[planSlug] ?? 0) + 1;
    }

    // Recent accounts (last 10)
    const { data: recentAccounts } = await ctx.supabase
      .from("accounts")
      .select("id, name, slug, status, created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    // Recent audit entries (last 10)
    const { data: recentAudit } = await ctx.supabase
      .from("audit_log")
      .select("id, action, entity_type, entity_id, account_id, created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    return NextResponse.json({
      totals: {
        accounts: accountsResult.count ?? 0,
        users: usersResult.count ?? 0,
        contacts: contactsResult.count ?? 0,
        messages: messagesResult.count ?? 0,
        conversations: conversationsResult.count ?? 0,
        broadcasts: broadcastsResult.count ?? 0,
        automations: automationsResult.count ?? 0,
      },
      subscriptions: {
        by_status: statusCounts,
        by_plan: planCounts,
      },
      recentAccounts: recentAccounts ?? [],
      recentAudit: recentAudit ?? [],
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
