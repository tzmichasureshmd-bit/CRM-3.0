/**
 * CRM 3.0 — Agents API
 * GET  /api/v3/agents — list agents for account
 * POST /api/v3/agents — create agent
 *
 * Security: account_id always from session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function getAccountId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data } = await supabase.from('profiles').select('account_id').eq('user_id', userId).single();
  return (data?.account_id as string) ?? null;
}

const VALID_TYPES = ['lead_qualification', 'sales_assistant', 'followup', 'customer_support', 'content', 'appointment', 'customer_success'];

// ── GET /api/v3/agents ────────────────────────────────────────
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(supabase, user.id);
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 403 });

    const { data, error } = await supabase
      .from('crm3_ai_agents')
      .select('id, name, type, description, status, enabled, instructions, allowed_tools, requires_approval, max_actions_per_run, model, provider, temperature, execution_count, success_count, failure_count, last_run_at, created_at, updated_at')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ agents: data ?? [] });
  } catch (err) {
    console.error('[agents GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ── POST /api/v3/agents ───────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(supabase, user.id);
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 403 });

    const body = await req.json() as {
      name?: string;
      type?: string;
      description?: string;
      instructions?: string;
      allowed_tools?: string[];
      requires_approval?: boolean;
      max_actions_per_run?: number;
      model?: string;
      provider?: string;
      temperature?: number;
      enabled?: boolean;
    };

    if (!body.name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });
    if (!body.type || !VALID_TYPES.includes(body.type)) {
      return NextResponse.json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('crm3_ai_agents')
      .insert({
        account_id: accountId,
        name: body.name.trim(),
        type: body.type,
        description: body.description ?? null,
        instructions: body.instructions ?? '',
        allowed_tools: body.allowed_tools ?? [],
        requires_approval: body.requires_approval ?? true,
        max_actions_per_run: Math.min(body.max_actions_per_run ?? 10, 10),
        model: body.model ?? 'gpt-4o-mini',
        provider: body.provider ?? 'openai',
        temperature: body.temperature ?? 0.3,
        enabled: body.enabled ?? true,
        status: 'idle',
        execution_count: 0,
        success_count: 0,
        failure_count: 0,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Audit log
    await supabase.from('crm3_agent_audit_log').insert({
      account_id: accountId,
      agent_id: data.id,
      user_id: user.id,
      event_type: 'agent_created',
      event_data: { name: body.name, type: body.type },
    });

    return NextResponse.json({ agent: data }, { status: 201 });
  } catch (err) {
    console.error('[agents POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
