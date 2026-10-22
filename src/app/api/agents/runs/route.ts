import { NextRequest, NextResponse } from "next/server";
import { verifyRequest, isAuthError } from "@/lib/auth/verify-request";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agent_id");
    const status = searchParams.get("status");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);

    // Verify agent belongs to this account if agent_id filter is supplied
    if (agentId) {
      const { data: agent } = await db
        .from("crm3_ai_agents")
        .select("id")
        .eq("id", agentId)
        .eq("account_id", user.account_id)
        .single();
      if (!agent) {
        return NextResponse.json({ error: "Agent not found" }, { status: 404 });
      }
    }

    let q = db
      .from("crm3_ai_agent_runs")
      .select("*, crm3_ai_agents(id, name, type, config)")
      .eq("account_id", user.account_id)
      .order("started_at", { ascending: false })
      .limit(limit);

    if (agentId) q = q.eq("agent_id", agentId);
    if (status) q = q.eq("status", status);

    const { data, error } = await q;
    if (error) throw error;

    const runs = (data || []).map((r: any) => ({
      ...r,
      agent_name: r.crm3_ai_agents?.name || "Agent",
      agent_type: r.crm3_ai_agents?.type,
      department: r.crm3_ai_agents?.config?.department,
    }));

    return NextResponse.json({ data: runs });
  } catch (err: any) {
    console.error("GET /api/agents/runs error:", err);
    return NextResponse.json({ error: "Failed to load runs" }, { status: 500 });
  }
}
