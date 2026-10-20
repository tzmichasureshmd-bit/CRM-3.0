import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseClient,
  ensureDefaultAgents,
  calculateAgentMetrics,
  mapTypeToDepartment,
} from "@/lib/agents/engine";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { AgentType } from "@/types/crm3";

export const dynamic = "force-dynamic";

/**
 * Resolve tenant account_id from all available authentication layers:
 * 1. Explicit account_id in body, query param, or x-account-id header
 * 2. Authenticated user session via SSR cookie client (@/lib/supabase/server)
 * 3. Authorization Bearer token header
 * 4. Most recent active profile in database
 * 5. Primary fallback tenant account ID
 */
async function resolveAccountId(req: NextRequest, bodyAccountId?: string): Promise<string> {
  const supabase = getSupabaseClient();
  const { searchParams } = new URL(req.url);

  // 1. Explicit param / header / body
  const explicit = bodyAccountId || searchParams.get("account_id") || req.headers.get("x-account-id");
  if (explicit && typeof explicit === "string" && explicit.trim()) {
    return explicit.trim();
  }

  // 2. Cookie session (SSR)
  try {
    const serverSupabase = await createServerClient();
    const { data: { user } } = await serverSupabase.auth.getUser();
    if (user?.id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("account_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (profile?.account_id) return profile.account_id;
    }
  } catch {
    // Cookie context not available or SSR error
  }

  // 3. Authorization Bearer token
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user?.id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("account_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (profile?.account_id) return profile.account_id;
      }
    }
  } catch {
    // Token resolution fallback
  }

  // 4. Fallback to existing active profile
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("account_id")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (profile?.account_id) return profile.account_id;
  } catch {
    // Fallback
  }

  return "e8044875-ceae-4988-9f93-2dde36f0294e";
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const accountId = await resolveAccountId(req);

    // Ensure default department agents exist for account
    const agents = await ensureDefaultAgents(supabase, accountId);
    const metrics = await calculateAgentMetrics(supabase, accountId);

    return NextResponse.json({
      data: agents,
      metrics,
    });
  } catch (err: any) {
    console.error("GET /api/agents error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to load agents" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const body = await req.json().catch(() => ({}));

    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ error: "Agent name is required" }, { status: 400 });
    }

    const accountId = await resolveAccountId(req, body.account_id);

    // Map department to a valid DB type check constraint
    const department = body.department || "custom";
    let dbType: AgentType = "lead_qualification";
    if (body.type && [
      "lead_qualification", "sales_assistant", "followup",
      "customer_support", "content", "campaign", "reporting", "knowledge"
    ].includes(body.type)) {
      dbType = body.type;
    } else {
      switch (department) {
        case "sales": dbType = "sales_assistant"; break;
        case "customer_support": dbType = "customer_support"; break;
        case "marketing": dbType = "content"; break;
        case "finance": dbType = "reporting"; break;
        case "admin": dbType = "knowledge"; break;
        default: dbType = "lead_qualification"; break;
      }
    }

    const newAgent = {
      account_id: accountId,
      name: body.name.trim(),
      type: dbType,
      description: body.description?.trim() || "",
      instructions: body.instructions?.trim() || `You are a dedicated ${department} intelligence agent for CRM 3.0. Analyze records and provide actionable business advice.`,
      allowed_tools: Array.isArray(body.allowed_tools) && body.allowed_tools.length > 0
        ? body.allowed_tools
        : ["get_contact", "search_contacts"],
      requires_approval: typeof body.requires_approval === "boolean" ? body.requires_approval : true,
      max_actions_per_run: Number(body.max_actions_per_run) || 10,
      status: "idle",
      enabled: body.enabled !== false,
      model: body.model || "gpt-4o-mini",
      provider: body.provider || "openai",
      temperature: typeof body.temperature === "number" ? body.temperature : 0.3,
      execution_count: 0,
      success_count: 0,
      failure_count: 0,
      config: {
        ...(body.config || {}),
        department: department,
      },
    };

    const { data, error } = await supabase
      .from("crm3_ai_agents")
      .insert(newAgent)
      .select()
      .single();

    if (error) {
      console.error("Database error inserting agent:", error);
      return NextResponse.json({ error: error.message || "Failed to save agent to database" }, { status: 400 });
    }

    const responsePayload = {
      ...data,
      department: data.config?.department || department,
    };

    return NextResponse.json(
      {
        success: true,
        data: responsePayload,
        ...responsePayload,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("POST /api/agents error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create agent" },
      { status: 500 }
    );
  }
}
