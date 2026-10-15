'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CreditCard, ChevronLeft, CheckCircle2, Zap, Star, Building2, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface AccountData {
  plan: string;
  name: string;
  currency: string;
}

interface UsageStats {
  contacts: number;
  conversations: number;
  deals: number;
  automations: number;
}

const PLANS = [
  {
    id: 'free', label: 'Free', price: '$0', period: '/month', color: '#8790aa',
    icon: <Zap size={18} />,
    features: ['500 contacts', '1,000 messages/month', '3 automations', '1 user', 'Basic analytics'],
  },
  {
    id: 'starter', label: 'Starter', price: '$29', period: '/month', color: '#4f6df5',
    icon: <Star size={18} />,
    features: ['5,000 contacts', '10,000 messages/month', '20 automations', '5 users', 'AI lead scoring', 'WhatsApp + Instagram'],
  },
  {
    id: 'pro', label: 'Pro', price: '$79', period: '/month', color: '#8b5cf6',
    icon: <Star size={18} />,
    features: ['Unlimited contacts', 'Unlimited messages', 'Unlimited automations', '20 users', 'All AI features', 'All channels', 'Priority support'],
    popular: true,
  },
  {
    id: 'enterprise', label: 'Enterprise', price: 'Custom', period: '', color: '#f4c95d',
    icon: <Building2 size={18} />,
    features: ['Everything in Pro', 'Dedicated support', 'Custom integrations', 'SLA guarantee', 'On-premise option'],
  },
];

const INVOICES = [
  { id: 'INV-001', date: 'Jan 1, 2025', amount: '$0.00', status: 'paid', plan: 'Free' },
];

export default function BillingPage() {
  const [account, setAccount] = useState<AccountData | null>(null);
  const [usage, setUsage] = useState<UsageStats>({ contacts: 0, conversations: 0, deals: 0, automations: 0 });
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).maybeSingle();
      if (!profile?.account_id) return;

      const [accRes, contactsRes, convsRes, dealsRes, autoRes] = await Promise.all([
        supabase.from('accounts').select('plan, name, currency').eq('id', profile.account_id).maybeSingle(),
        supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('account_id', profile.account_id),
        supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('account_id', profile.account_id),
        supabase.from('deals').select('id', { count: 'exact', head: true }).eq('account_id', profile.account_id),
        supabase.from('automations').select('id', { count: 'exact', head: true }).eq('account_id', profile.account_id),
      ]);

      if (accRes.data) setAccount(accRes.data as AccountData);
      setUsage({
        contacts: contactsRes.count ?? 0,
        conversations: convsRes.count ?? 0,
        deals: dealsRes.count ?? 0,
        automations: autoRes.count ?? 0,
      });
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  const currentPlan = PLANS.find(p => p.id === (account?.plan ?? 'free')) ?? PLANS[0];

  const usageItems = [
    { label: 'Contacts', value: usage.contacts, limit: currentPlan.id === 'free' ? 500 : currentPlan.id === 'starter' ? 5000 : null, color: '#4f6df5' },
    { label: 'Conversations', value: usage.conversations, limit: null, color: '#8b5cf6' },
    { label: 'Deals', value: usage.deals, limit: null, color: '#28c99a' },
    { label: 'Automations', value: usage.automations, limit: currentPlan.id === 'free' ? 3 : currentPlan.id === 'starter' ? 20 : null, color: '#f4c95d' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 760 }}>
      <Link href="/settings" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--crm-text-muted)', textDecoration: 'none', fontWeight: 500, width: 'fit-content' }}>
        <ChevronLeft size={16} /> Settings
      </Link>

      <div>
        <h1 style={{ fontSize: 24, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Billing</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crm-text-secondary)' }}>Manage your plan and usage</p>
      </div>

      {/* Current Plan */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Current Plan</div>
        <div className="crm-glass" style={{ padding: '20px', borderRadius: 14 }}>
          {loading ? (
            <div style={{ color: 'var(--crm-text-muted)', fontSize: 13 }}>Loading...</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: `${currentPlan.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: currentPlan.color, flexShrink: 0 }}>
                {currentPlan.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 20, fontWeight: 750, color: 'var(--crm-text)' }}>{currentPlan.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: currentPlan.color, background: `${currentPlan.color}15`, borderRadius: 8, padding: '3px 8px' }}>Active</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--crm-text-muted)', marginTop: 4 }}>
                  {account?.name ?? 'Your workspace'} · {currentPlan.price}{currentPlan.period}
                </div>
              </div>
              <a href="https://calculator.aws" target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
                Upgrade <ExternalLink size={12} />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Usage */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Usage This Month</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
          {usageItems.map(item => {
            const pct = item.limit ? Math.min(100, Math.round((item.value / item.limit) * 100)) : null;
            const isNearLimit = pct !== null && pct >= 80;
            return (
              <div key={item.label} className="crm-glass-soft" style={{ padding: '14px 16px', borderRadius: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)' }}>{item.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: isNearLimit ? '#f46b72' : item.color }}>
                    {item.value.toLocaleString()}{item.limit ? ` / ${item.limit.toLocaleString()}` : ''}
                  </span>
                </div>
                {pct !== null && (
                  <div style={{ height: 5, borderRadius: 3, background: 'rgba(130,145,190,0.15)' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: isNearLimit ? '#f46b72' : item.color, borderRadius: 3, transition: 'width 600ms ease' }} />
                  </div>
                )}
                {pct === null && (
                  <div style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>Unlimited on {currentPlan.label}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Plans */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Available Plans</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
          {PLANS.map(plan => {
            const isCurrent = plan.id === (account?.plan ?? 'free');
            return (
              <div key={plan.id} className="crm-glass-soft" style={{ padding: '16px', borderRadius: 14, border: isCurrent ? `1.5px solid ${plan.color}` : '1px solid rgba(130,145,190,0.14)', position: 'relative' }}>
                {(plan as { popular?: boolean }).popular && (
                  <div style={{ position: 'absolute', top: -10, right: 14, fontSize: 10, fontWeight: 700, color: 'white', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', borderRadius: 6, padding: '2px 8px' }}>POPULAR</div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: `${plan.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: plan.color }}>{plan.icon}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--crm-text)' }}>{plan.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 750, color: plan.color }}>{plan.price}<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--crm-text-muted)' }}>{plan.period}</span></div>
                  </div>
                  {isCurrent && <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: plan.color, background: `${plan.color}15`, borderRadius: 6, padding: '2px 7px' }}>Current</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {plan.features.map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--crm-text-secondary)' }}>
                      <CheckCircle2 size={12} color={plan.color} /> {f}
                    </div>
                  ))}
                </div>
                {!isCurrent && (
                  <a href="https://calculator.aws" target="_blank" rel="noreferrer"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 12, padding: '7px', borderRadius: 9, background: `${plan.color}15`, color: plan.color, textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>
                    {plan.id === 'enterprise' ? 'Contact Sales' : 'Upgrade'} <ExternalLink size={11} />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Invoices */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Invoice History</div>
        <div className="crm-glass" style={{ borderRadius: 14, overflow: 'hidden' }}>
          {INVOICES.map((inv, i) => (
            <div key={inv.id} style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14, borderBottom: i < INVOICES.length - 1 ? '1px solid rgba(130,145,190,0.08)' : 'none' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(40,201,154,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#28c99a', flexShrink: 0 }}>
                <CreditCard size={16} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-text)' }}>{inv.id} — {inv.plan} Plan</div>
                <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 2 }}>{inv.date}</div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)' }}>{inv.amount}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#28c99a', background: 'rgba(40,201,154,0.12)', borderRadius: 7, padding: '3px 8px' }}>{inv.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
