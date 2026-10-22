import { NextRequest, NextResponse } from "next/server";
import { verifyRequest, isAuthError } from "@/lib/auth/verify-request";
import { mapTypeToDepartment } from "@/lib/agents/engine";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { agentId } = await params;

    const { data, error } = await db
      .from("crm3_ai_agents")
      .select("*")
      .eq("id", agentId)
      .eq("account_id", user.account_id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...data,
      department: data.config?.department || mapTypeToDepartment(data.type),
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to get agent" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { agentId } = await params;
    const body = await req.json();

    // Prevent overwriting immutable keys
    delete body.id;
    delete body.account_id;
    delete body.created_at;

    body.updated_at = new Date().toISOString();

    if (body.department) {
      body.config = { ...(body.config || {}), department: body.department };
      delete body.department;
    }

    const { data, error } = await db
      .from("crm3_ai_agents")
      .update(body)
      .eq("id", agentId)
      .eq("account_id", user.account_id)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Agent not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...data,
      department: data.config?.department || mapTypeToDepartment(data.type),
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to update agent" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { agentId } = await params;

    const { error } = await db
      .from("crm3_ai_agents")
      .delete()
      .eq("id", agentId)
      .eq("account_id", user.account_id);

    if (error) throw error;
    return NextResponse.json({ success: true, message: "Agent deleted" });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to delete agent" }, { status: 500 });
  }
}
