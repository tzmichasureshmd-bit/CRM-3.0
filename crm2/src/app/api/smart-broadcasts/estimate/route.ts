import { NextResponse, NextRequest } from "next/server";
import { getCurrentAccount, toErrorResponse } from "@/lib/auth/account";

export async function POST(request: NextRequest) {
  try {
    const ctx = await getCurrentAccount();

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { recipients, category } = body;

    if (typeof recipients !== "number" || recipients <= 0) {
      return NextResponse.json(
        { error: "recipients must be a positive number" },
        { status: 400 },
      );
    }

    if (!category || typeof category !== "string") {
      return NextResponse.json({ error: "category is required" }, { status: 400 });
    }

    const { data: rule, error: ruleErr } = await ctx.supabase
      .from("pricing_rules")
      .select("rate_cents")
      .eq("category", category.trim())
      .eq("account_id", ctx.accountId)
      .maybeSingle();

    if (ruleErr) {
      console.error("Failed to fetch pricing rule:", ruleErr);
      return NextResponse.json({ error: "Failed to fetch pricing rule" }, { status: 500 });
    }

    if (!rule) {
      return NextResponse.json(
        { error: `No pricing rule found for category '${category}'` },
        { status: 404 },
      );
    }

    const rateCents = rule.rate_cents as number;
    const estimatedMetaCostCents = Math.ceil(recipients * rateCents);
    const serviceFeeCents = Math.ceil(estimatedMetaCostCents * 0.1);
    const totalEstimatedCents = estimatedMetaCostCents + serviceFeeCents;

    return NextResponse.json({
      recipients,
      category: category.trim(),
      rate_cents: rateCents,
      estimated_meta_cost_cents: estimatedMetaCostCents,
      service_fee_cents: serviceFeeCents,
      total_estimated_cents: totalEstimatedCents,
      currency: "usd",
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
