import { NextRequest, NextResponse } from "next/server";
import { verifyRequest, isAuthError } from "@/lib/auth/verify-request";
import { executeAgent, mapTypeToDepartment } from "@/lib/agents/engine";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { agentId } = await params;
    const body = await req.json().catch(() => ({}));

    // Fetch agent scoped to authenticated account — prevents cross-tenant execution
    const { data: agent, error } = await db
      .from("crm3_ai_agents")
      .select("*")
      .eq("id", agentId)
      .eq("account_id", user.account_id)
      .single();

    if (error || !agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    if (agent.enabled === false) {
      return NextResponse.json(
        { error: `Agent '${agent.name}' is disabled.`, status: "disabled" },
        { status: 400 }
      );
    }

    const agentWithDept = {
      ...agent,
      department: agent.config?.department || mapTypeToDepartment(agent.type),
    };

    const context = body.context || {};
    const executionResult = await executeAgent(db, agentWithDept, context, user.user_id);

    return NextResponse.json({
      success: true,
      requires_approval: executionResult.requires_approval,
      run: executionResult.run,
    });
  } catch (err: any) {
    console.error("Agent run error:", err);
    return NextResponse.json({ error: "Agent execution failed" }, { status: 500 });
  }
}
