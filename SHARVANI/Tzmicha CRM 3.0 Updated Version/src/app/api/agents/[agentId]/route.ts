import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient, mapTypeToDepartment } from "@/lib/agents/engine";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from("crm3_ai_agents")
      .select("*")
      .eq("id", agentId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...data,
      department: data.config?.department || mapTypeToDepartment(data.type),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to get agent" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;
    const supabase = getSupabaseClient();
    const body = await req.json();

    // Prevent overwriting internal immutable keys
    delete body.id;
    delete body.account_id;
    delete body.created_at;

    body.updated_at = new Date().toISOString();

    // Preserve or update department in config
    if (body.department) {
      body.config = {
        ...(body.config || {}),
        department: body.department,
      };
      delete body.department;
    }

    const { data, error } = await supabase
      .from("crm3_ai_agents")
      .update(body)
      .eq("id", agentId)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Failed to update agent" }, { status: 400 });
    }

    return NextResponse.json({
      ...data,
      department: data.config?.department || mapTypeToDepartment(data.type),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to update agent" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from("crm3_ai_agents")
      .delete()
      .eq("id", agentId);

    if (error) throw error;
    return NextResponse.json({ success: true, message: "Agent deleted" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to delete agent" }, { status: 500 });
  }
}
