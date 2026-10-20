import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient, rejectAgentRun } from "@/lib/agents/engine";

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

    const updatedRun = await rejectAgentRun(supabase, runId, userId);

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
