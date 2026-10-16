import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient, approveAgentRun } from "@/lib/agents/engine";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const supabase = getSupabaseClient();
    const body = await req.json().catch(() => ({}));
    const userId = body.user_id || "operator";

    const updatedRun = await approveAgentRun(supabase, runId, userId);

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
