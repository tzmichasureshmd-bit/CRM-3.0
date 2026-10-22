import { NextRequest, NextResponse } from "next/server";
import { verifyRequest, isAuthError } from "@/lib/auth/verify-request";
import { approveAgentRun } from "@/lib/agents/engine";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { runId } = await params;

    // Verify run belongs to authenticated account before approving
    const { data: run } = await db
      .from("crm3_ai_agent_runs")
      .select("id, account_id, status")
      .eq("id", runId)
      .eq("account_id", user.account_id)
      .single();

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const updatedRun = await approveAgentRun(db, runId, user.account_id, user.user_id);

    return NextResponse.json({
      success: true,
      message: "Run approved and executed",
      run: updatedRun,
    });
  } catch (err: any) {
    console.error("Approve run error:", err);
    return NextResponse.json({ error: err.message || "Failed to approve run" }, { status: 400 });
  }
}
