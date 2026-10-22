/**
 * CRM 3.0 — Billing & Usage API
 * GET /api/v3/billing — get current plan and usage metrics
 *
 * Auth: FastAPI JWT verified via verifyRequest().
 * account_id always from verified token.
 *
 * Note: CRM 3.0 uses a consultant-contact billing model (no payment processor).
 * This endpoint returns usage metrics and plan limits for display purposes.
 * Actual plan changes are handled via WhatsApp consultant contact.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

// Plan definitions — update when plans change
const PLANS: Record<string, {
  name: string;
  limits: Record<string, number>;
  features: string[];
}> = {
  starter: {
    name: 'Starter',
    limits: { contacts: 500, broadcasts_per_month: 10, automations: 5, agents: 2, storage_mb: 100 },
    features: ['WhatsApp Inbox', 'Basic CRM', 'Email Broadcasts'],
  },
  growth: {
    name: 'Growth',
    limits: { contacts: 5000, broadcasts_per_month: 50, automations: 20, agents: 5, storage_mb: 1000 },
    features: ['All Starter features', 'AI Lead Scoring', 'Journeys', 'Campaigns', 'Analytics'],
  },
  scale: {
    name: 'Scale',
    limits: { contacts: 50000, broadcasts_per_month: 500, automations: 100, agents: 20, storage_mb: 10000 },
    features: ['All Growth features', 'AI Agents', 'A/B Testing', 'Revenue Intelligence', 'API Access'],
  },
  enterprise: {
    name: 'Enterprise',
    limits: { contacts: -1, broadcasts_per_month: -1, automations: -1, agents: -1, storage_mb: -1 },
    features: ['All Scale features', 'Custom integrations', 'Dedicated support', 'SLA'],
  },
};

export async function GET(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    // Get account plan from account_settings
    const { data: settings } = await db
      .from('account_settings')
      .select('plan, plan_started_at')
      .eq('account_id', user.account_id)
      .maybeSingle();

    const planKey = (settings?.plan as string) ?? 'growth';
    const plan = PLANS[planKey] ?? PLANS.growth;

    // Compute current usage in parallel
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [contactsRes, broadcastsRes, automationsRes, agentsRes] = await Promise.all([
      db.from('contacts').select('id', { count: 'exact', head: true }).eq('account_id', user.account_id),
      db.from('broadcasts').select('id', { count: 'exact', head: true }).eq('account_id', user.account_id).gte('created_at', monthStart),
      db.from('automations').select('id', { count: 'exact', head: true }).eq('account_id', user.account_id),
      db.from('crm3_ai_agents').select('id', { count: 'exact', head: true }).eq('account_id', user.account_id),
    ]);

    const usage = {
      contacts: contactsRes.count ?? 0,
      broadcasts_this_month: broadcastsRes.count ?? 0,
      automations: automationsRes.count ?? 0,
      agents: agentsRes.count ?? 0,
    };

    // Compute utilization percentages (null = unlimited)
    const utilization: Record<string, number | null> = {};
    for (const [key, used] of Object.entries(usage)) {
      const limitKey = key === 'broadcasts_this_month' ? 'broadcasts_per_month' : key;
      const limit = plan.limits[limitKey];
      utilization[key] = limit === -1 ? null : limit > 0 ? Math.round((used / limit) * 100) : 0;
    }

    return NextResponse.json({
      plan: {
        key: planKey,
        name: plan.name,
        limits: plan.limits,
        features: plan.features,
        started_at: settings?.plan_started_at ?? null,
      },
      usage,
      utilization,
      billing_contact: {
        method: 'whatsapp',
        number: '919346947043',
        message: 'Hello, I need assistance with TZMICHA CRM billing.',
      },
    });
  } catch (err) {
    console.error('[billing GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
