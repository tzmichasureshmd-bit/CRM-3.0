import { NextRequest, NextResponse } from "next/server";
import { verifyRequest, isAuthError } from "@/lib/auth/verify-request";
import { rejectAgentRun } from "@/lib/agents/engine";

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

    // Verify run belongs to authenticated account before rejecting
    const { data: run } = await db
      .from("crm3_ai_agent_runs")
      .select("id, account_id, status")
      .eq("id", runId)
      .eq("account_id", user.account_id)
      .single();

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const updatedRun = await rejectAgentRun(db, runId, user.account_id, user.user_id);

    return NextResponse.json({
      success: true,
      message: "Run rejected",
      run: updatedRun,
    });
  } catch (err: any) {
    console.error("Reject run error:", err);
    return NextResponse.json({ error: err.message || "Failed to reject run" }, { status: 400 });
  }
}
