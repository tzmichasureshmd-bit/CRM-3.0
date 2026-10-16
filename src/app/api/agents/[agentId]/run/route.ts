import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient, executeAgent, mapTypeToDepartment } from "@/lib/agents/engine";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;
    const supabase = getSupabaseClient();
    const body = await req.json().catch(() => ({}));

    // Fetch the agent definition
    const { data: agent, error } = await supabase
      .from("crm3_ai_agents")
      .select("*")
      .eq("id", agentId)
      .single();

    if (error || !agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    if (agent.enabled === false) {
      return NextResponse.json(
        {
          error: `Agent '${agent.name}' is currently disabled. Please enable it before running.`,
          status: "disabled",
        },
        { status: 400 }
      );
    }

    const agentWithDept = {
      ...agent,
      department: agent.config?.department || mapTypeToDepartment(agent.type),
    };

    const userIdentifier = body.user_id || "operator";
    const context = body.context || body || {};

    const executionResult = await executeAgent(
      supabase,
      agentWithDept,
      context,
      userIdentifier
    );

    return NextResponse.json({
      success: true,
      requires_approval: executionResult.requires_approval,
      run: executionResult.run,
    });
  } catch (err: any) {
    console.error("Agent run error:", err);
    return NextResponse.json(
      { error: err.message || "Agent execution failed" },
      { status: 500 }
    );
  }
}
