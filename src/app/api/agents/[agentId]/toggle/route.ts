import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient, mapTypeToDepartment } from "@/lib/agents/engine";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;
    const supabase = getSupabaseClient();
    const body = await req.json().catch(() => ({}));

    // Fetch current agent to determine new enabled state if not explicitly supplied
    const { data: current, error: fetchErr } = await supabase
      .from("crm3_ai_agents")
      .select("enabled")
      .eq("id", agentId)
      .single();

    if (fetchErr || !current) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const nextEnabled = typeof body.enabled === "boolean" ? body.enabled : !current.enabled;

    const { data, error } = await supabase
      .from("crm3_ai_agents")
      .update({
        enabled: nextEnabled,
        status: nextEnabled ? "idle" : "paused",
        updated_at: new Date().toISOString(),
      })
      .eq("id", agentId)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Failed to toggle agent" }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      agent: {
        ...data,
        department: data.config?.department || mapTypeToDepartment(data.type),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to toggle agent" }, { status: 500 });
  }
}
