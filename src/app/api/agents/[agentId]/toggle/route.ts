import { NextRequest, NextResponse } from "next/server";
import { verifyRequest, isAuthError } from "@/lib/auth/verify-request";
import { mapTypeToDepartment } from "@/lib/agents/engine";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { agentId } = await params;
    const body = await req.json().catch(() => ({}));

    const { data: current, error: fetchErr } = await db
      .from("crm3_ai_agents")
      .select("enabled")
      .eq("id", agentId)
      .eq("account_id", user.account_id)
      .single();

    if (fetchErr || !current) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const nextEnabled = typeof body.enabled === "boolean" ? body.enabled : !current.enabled;

    const { data, error } = await db
      .from("crm3_ai_agents")
      .update({
        enabled: nextEnabled,
        status: nextEnabled ? "idle" : "paused",
        updated_at: new Date().toISOString(),
      })
      .eq("id", agentId)
      .eq("account_id", user.account_id)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Failed to toggle agent" }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      agent: {
        ...data,
        department: data.config?.department || mapTypeToDepartment(data.type),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to toggle agent" }, { status: 500 });
  }
}
