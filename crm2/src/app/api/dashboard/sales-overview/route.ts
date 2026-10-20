import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";

export const dynamic = "force-dynamic";

const QUALIFIED_STATUSES = new Set([
  "qualified",
  "proposal",
  "negotiation",
  "won",
]);

/**
 * Sales Overview — aggregate pipeline + lead-source data for the
 * dashboard's "Sales Overview" section. Computed server-side against
 * the authenticated user's account using grouped data (never client
 * side, never from a frontend-supplied tenant id). RLS scopes every
 * query to the tenant.
 */
export async function GET() {
  try {
    const ctx = await requireRole("viewer");
    const accountId = ctx.accountId;

    const [contactsRes, dealsRes] = await Promise.all([
      ctx.supabase
        .from("contacts")
        .select("source, source_platform, lead_status")
        .eq("account_id", accountId),
      ctx.supabase
        .from("deals")
        .select("status, value, created_at")
        .eq("account_id", accountId),
    ]);

    if (contactsRes.error && dealsRes.error) {
      return NextResponse.json(
        { error: "Could not load sales overview" },
        { status: 500 },
      );
    }

    // --- Lead sources -------------------------------------------------
    // Normalize every contact to a stable source key, mirroring the
    // bucketing used by /api/social-media/overview so the dashboard and
    // social-media pages tell the same story from the same columns.
    type SourceRow = { source: string | null; source_platform: string | null; lead_status: string | null };
    const sourceCounts: Record<string, number> = {};
    let totalLeads = 0;
    let qualifiedLeads = 0;
    for (const r of (contactsRes.data as SourceRow[] | null) ?? []) {
      totalLeads += 1;
      if (r.lead_status && QUALIFIED_STATUSES.has(r.lead_status)) {
        qualifiedLeads += 1;
      }
      const s = ((r.source_platform ?? r.source) || "").toLowerCase();
      let key: string | null = null;
      if (s === "facebook") key = "facebook";
      else if (s === "instagram") key = "instagram";
      else if (s.includes("google")) key = "google_form";
      else if (s.includes("whatsapp")) key = "whatsapp";
      else if (s.includes("facebook")) key = "facebook";
      else if (s.includes("instagram")) key = "instagram";
      else if (s.includes("website") || s.includes("web")) key = "website";
      else if (s.includes("manual")) key = "manual";
      if (key) sourceCounts[key] = (sourceCounts[key] ?? 0) + 1;
    }

    const sources = (Object.entries(sourceCounts) as [string, number][])
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count);

    // --- Deals ----------------------------------------------------------
    type DealRow = { status: string | null; value: number | null; created_at: string | null };
    const deals = (dealsRes.data as DealRow[] | null) ?? [];

    let openDealsValue = 0;
    let wonDealsValue = 0;
    let openCount = 0;
    let wonCount = 0;
    let lostCount = 0;
    for (const d of deals) {
      const v = Number(d.value ?? 0);
      if (d.status === "won") {
        wonDealsValue += v;
        wonCount += 1;
      } else if (d.status === "lost") {
        lostCount += 1;
      } else {
        // 'open' (and legacy 'active') all count as pipeline value.
        openDealsValue += v;
        openCount += 1;
      }
    }

    const closedTotal = wonCount + lostCount;
    const winRate =
      closedTotal === 0 ? null : Math.round((wonCount / closedTotal) * 100);

    // --- Deals created per month (last 12 months) -----------------------
    // No close/won timestamp exists on deals, so this buckets by
    // creation date. Still real, tenant-scoped momentum data.
    const now = new Date();
    const monthKeys: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    const byMonth = new Map<string, { open: number; won: number; lost: number; wonValue: number }>();
    for (const k of monthKeys) byMonth.set(k, { open: 0, won: 0, lost: 0, wonValue: 0 });

    for (const d of deals) {
      if (!d.created_at) continue;
      const date = new Date(d.created_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const bucket = byMonth.get(key);
      if (!bucket) continue;
      if (d.status === "won") {
        bucket.won += 1;
        bucket.wonValue += Number(d.value ?? 0);
      } else if (d.status === "lost") {
        bucket.lost += 1;
      } else {
        bucket.open += 1;
      }
    }

    const dealsByMonth = monthKeys.map((key) => {
      const b = byMonth.get(key)!;
      const [y, m] = key.split("-").map(Number);
      const label = new Date(y, m - 1, 1).toLocaleDateString(undefined, {
        month: "short",
        year: "2-digit",
      });
      return { label, ...b };
    });

    return NextResponse.json({
      cards: {
        totalLeads,
        qualifiedLeads,
        openDealsValue,
        wonDealsValue,
        openCount,
        wonCount,
        lostCount,
        winRate,
      },
      sources,
      dealsByMonth,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}