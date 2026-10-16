import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseClient,
  ensureDefaultAgents,
  calculateAgentMetrics,
  mapTypeToDepartment,
} from "@/lib/agents/engine";
import type { AgentType } from "@/types/crm3";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(req.url);

    // Get account_id from query param or fallback to primary default account
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

    // Ensure default department agents exist for account
    const agents = await ensureDefaultAgents(supabase, accountId);
    const metrics = await calculateAgentMetrics(supabase, accountId);

    return NextResponse.json({
      data: agents,
      metrics,
    });
  } catch (err: any) {
    console.error("GET /api/agents error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to load agents" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const body = await req.json();

    let accountId = body.account_id;
    if (!accountId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("account_id")
        .limit(1)
        .single();
      accountId = profile?.account_id || "e8044875-ceae-4988-9f93-2dde36f0294e";
    }

    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ error: "Agent name is required" }, { status: 400 });
    }

    // Map department to a valid DB type check constraint
    const department = body.department || "custom";
    let dbType: AgentType = "lead_qualification";
    if (body.type && [
      "lead_qualification", "sales_assistant", "followup",
      "customer_support", "content", "campaign", "reporting", "knowledge"
    ].includes(body.type)) {
      dbType = body.type;
    } else {
      switch (department) {
        case "sales": dbType = "sales_assistant"; break;
        case "customer_support": dbType = "customer_support"; break;
        case "marketing": dbType = "content"; break;
        case "finance": dbType = "reporting"; break;
        case "admin": dbType = "knowledge"; break;
        default: dbType = "lead_qualification"; break;
      }
    }

    const newAgent = {
      account_id: accountId,
      name: body.name.trim(),
      type: dbType,
      description: body.description || "",
      instructions: body.instructions || "",
      allowed_tools: Array.isArray(body.allowed_tools) ? body.allowed_tools : [],
      requires_approval: body.requires_approval ?? true,
      max_actions_per_run: body.max_actions_per_run || 10,
      status: "idle",
      enabled: body.enabled ?? true,
      model: body.model || "gpt-4o-mini",
      provider: body.provider || "openai",
      temperature: body.temperature ?? 0.3,
      execution_count: 0,
      success_count: 0,
      failure_count: 0,
      config: {
        department: department,
        ...(body.config || {}),
      },
    };

    const { data, error } = await supabase
      .from("crm3_ai_agents")
      .insert(newAgent)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(
      {
        ...data,
        department: data.config?.department || mapTypeToDepartment(data.type),
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("POST /api/agents error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create agent" },
      { status: 500 }
    );
  }
}
