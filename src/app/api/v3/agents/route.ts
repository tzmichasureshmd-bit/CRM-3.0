/**
 * CRM 3.0 — Agents API
 * GET  /api/v3/agents — list agents for account
 * POST /api/v3/agents — create agent
 *
 * Auth: FastAPI JWT verified server-side via verifyRequest().
 * DB:   Service-role client — account_id always from verified token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

const VALID_TYPES = ['lead_qualification', 'sales_assistant', 'followup', 'customer_support', 'content', 'appointment', 'customer_success'];

export async function GET(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { data, error } = await db
      .from('crm3_ai_agents')
      .select('id, name, type, description, status, enabled, instructions, allowed_tools, requires_approval, max_actions_per_run, model, provider, temperature, execution_count, success_count, failure_count, last_run_at, created_at, updated_at')
      .eq('account_id', user.account_id)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ agents: data ?? [] });
  } catch (err) {
    console.error('[agents GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
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

    const { data, error } = await db
      .from('crm3_ai_agents')
      .insert({
        account_id: user.account_id,
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

    await db.from('crm3_agent_audit_log').insert({
      account_id: user.account_id,
      agent_id: data.id,
      user_id: user.user_id,
      event_type: 'agent_created',
      event_data: { name: body.name, type: body.type },
    });

    return NextResponse.json({ agent: data }, { status: 201 });
  } catch (err) {
    console.error('[agents POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
