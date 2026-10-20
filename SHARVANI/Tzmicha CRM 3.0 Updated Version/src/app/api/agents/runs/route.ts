import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/agents/engine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(req.url);

    const queryAccountId = searchParams.get("account_id");
    let accountId = queryAccountId || "";
    if (!accountId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("account_id")
        .limit(1)
        .single();
      accountId = profile?.account_id || "e8044875-ceae-4988-9f93-2dde36f0294e";
    }

    const agentId = searchParams.get("agent_id");
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    let q = supabase
      .from("crm3_ai_agent_runs")
      .select("*, crm3_ai_agents(id, name, type, config)")
      .eq("account_id", accountId)
      .order("started_at", { ascending: false })
      .limit(limit);

    if (agentId) {
      q = q.eq("agent_id", agentId);
    }
    if (status) {
      q = q.eq("status", status);
    }

    const { data, error } = await q;

    if (error) throw error;

    const runs = (data || []).map((r) => ({
      ...r,
      agent_name: r.crm3_ai_agents?.name || "Agent",
      agent_type: r.crm3_ai_agents?.type,
      department: r.crm3_ai_agents?.config?.department,
    }));

    return NextResponse.json({ data: runs });
  } catch (err: any) {
    console.error("GET /api/agents/runs error:", err);
    return NextResponse.json({ error: err.message || "Failed to load runs" }, { status: 500 });
  }
}
