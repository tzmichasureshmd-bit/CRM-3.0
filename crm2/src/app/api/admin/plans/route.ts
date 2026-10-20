// ============================================================
// GET /api/admin/plans — List all subscription plans (super admin)
// POST /api/admin/plans — Create a new plan (super admin)
// ============================================================

import { NextResponse } from "next/server";
import { requireSuperAdmin, toErrorResponse } from "@/lib/auth/super-admin";

export async function GET() {
  try {
    const ctx = await requireSuperAdmin();

    const { data: plans, error } = await ctx.supabase
      .from("subscription_plans")
      .select("*")
      .order("sort_order");

    if (error) {
      console.error("[GET /api/admin/plans] fetch error:", error);
      return NextResponse.json({ error: "Failed to load plans" }, { status: 500 });
    }

    return NextResponse.json({ plans: plans ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireSuperAdmin();

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { slug, name, description, price_monthly_cents, price_yearly_cents, ...limits } = body;

    if (!slug || !name) {
      return NextResponse.json({ error: "slug and name are required" }, { status: 400 });
    }

    const { data: plan, error } = await ctx.supabase
      .from("subscription_plans")
      .insert({
        slug,
        name,
        description: description ?? null,
        price_monthly_cents: price_monthly_cents ?? 0,
        price_yearly_cents: price_yearly_cents ?? 0,
        max_contacts: limits.max_contacts ?? 100,
        max_team_members: limits.max_team_members ?? 2,
        max_whatsapp_numbers: limits.max_whatsapp_numbers ?? 1,
        max_monthly_messages: limits.max_monthly_messages ?? 1000,
        max_broadcasts_per_month: limits.max_broadcasts_per_month ?? 10,
        max_automations: limits.max_automations ?? 5,
        max_flows: limits.max_flows ?? 5,
        max_ai_requests_per_month: limits.max_ai_requests_per_month ?? 100,
        max_api_requests_per_day: limits.max_api_requests_per_day ?? 1000,
        max_storage_mb: limits.max_storage_mb ?? 100,
        features: limits.features ?? {},
        sort_order: limits.sort_order ?? 0,
      })
      .select("*")
      .single();

    if (error) {
      console.error("[POST /api/admin/plans] insert error:", error);
      return NextResponse.json({ error: "Failed to create plan" }, { status: 500 });
    }

    return NextResponse.json({ plan }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
