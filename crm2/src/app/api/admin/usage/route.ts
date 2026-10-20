// ============================================================
// GET /api/admin/usage — Platform-wide usage stats (super admin)
// ============================================================

import { NextResponse } from "next/server";
import { requireSuperAdmin, toErrorResponse } from "@/lib/auth/super-admin";

export async function GET(request: Request) {
  try {
    const ctx = await requireSuperAdmin();

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period"); // optional: YYYY-MM-DD

    // Platform-wide counts
    const [accountsResult, usersResult, contactsResult, messagesResult, conversationsResult] =
      await Promise.all([
        ctx.supabase.from("accounts").select("id", { count: "exact", head: true }),
        ctx.supabase.from("profiles").select("id", { count: "exact", head: true }),
        ctx.supabase.from("contacts").select("id", { count: "exact", head: true }),
        ctx.supabase.from("messages").select("id", { count: "exact", head: true }),
        ctx.supabase.from("conversations").select("id", { count: "exact", head: true }),
      ]);

    // Subscription breakdown
    const { data: subBreakdown } = await ctx.supabase
      .from("business_subscriptions")
      .select("status, plan_id, subscription_plans(slug, name)")
      .not("status", "is", null);

    // Aggregate subscription statuses
    const statusCounts: Record<string, number> = {};
    const planCounts: Record<string, number> = {};
    for (const sub of subBreakdown ?? []) {
      statusCounts[sub.status] = (statusCounts[sub.status] ?? 0) + 1;
      const planSlug = (sub.subscription_plans as { slug?: string } | null)?.slug ?? "unknown";
      planCounts[planSlug] = (planCounts[planSlug] ?? 0) + 1;
    }

    // Recent usage aggregations (if period specified)
    let usageAgg = null;
    if (period) {
      const { data } = await ctx.supabase
        .from("resource_usage")
        .select("messages_sent, messages_received, contacts_created, ai_requests, api_requests")
        .eq("period_start", period);
      if (data && data.length > 0) {
        usageAgg = {
          messages_sent: data.reduce((s, r) => s + (r.messages_sent ?? 0), 0),
          messages_received: data.reduce((s, r) => s + (r.messages_received ?? 0), 0),
          contacts_created: data.reduce((s, r) => s + (r.contacts_created ?? 0), 0),
          ai_requests: data.reduce((s, r) => s + (r.ai_requests ?? 0), 0),
          api_requests: data.reduce((s, r) => s + (r.api_requests ?? 0), 0),
        };
      }
    }

    return NextResponse.json({
      totals: {
        accounts: accountsResult.count ?? 0,
        users: usersResult.count ?? 0,
        contacts: contactsResult.count ?? 0,
        messages: messagesResult.count ?? 0,
        conversations: conversationsResult.count ?? 0,
      },
      subscriptions: {
        by_status: statusCounts,
        by_plan: planCounts,
      },
      usage: usageAgg,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
