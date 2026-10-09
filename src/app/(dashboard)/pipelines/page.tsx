'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, DollarSign } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Deal {
  id: string;
  title: string;
  value: number | null;
  currency: string | null;
  status: string;
  stage_id: string | null;
  contact_id: string | null;
  created_at: string;
  contacts?: { name: string | null } | null;
}

interface Stage {
  id: string;
  name: string;
  position: number;
  color: string | null;
}

const DEFAULT_STAGES = [
  { id: 'new', name: 'New', position: 0, color: '#4d7cff' },
  { id: 'contacted', name: 'Contacted', position: 1, color: '#8b5cf6' },
  { id: 'qualified', name: 'Qualified', position: 2, color: '#28c99a' },
  { id: 'proposal', name: 'Proposal', position: 3, color: '#f4c95d' },
  { id: 'negotiation', name: 'Negotiation', position: 4, color: '#f46b72' },
  { id: 'won', name: 'Won', position: 5, color: '#28c99a' },
];

function fmt(v: number | null, currency: string | null) {
  if (!v) return '—';
  const sym = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : (currency ?? '');
  return v >= 100000 ? `${sym}${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${sym}${(v / 1000).toFixed(0)}K` : `${sym}${v}`;
}

export default function PipelinesPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [stages, setStages] = useState<Stage[]>(DEFAULT_STAGES);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const [dealsRes, stagesRes] = await Promise.all([
      supabase.from('deals').select('*, contacts(name)').eq('status', 'open').order('created_at', { ascending: false }).limit(200),
      supabase.from('pipeline_stages').select('*').order('position'),
    ]);
    setDeals((dealsRes.data as Deal[]) ?? []);
    if (stagesRes.data && stagesRes.data.length > 0) setStages(stagesRes.data as Stage[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const dealsByStage = (stageId: string) => deals.filter(d => d.stage_id === stageId || (!d.stage_id && stageId === 'new'));
  const stageValue = (stageId: string) => dealsByStage(stageId).reduce((s, d) => s + (d.value ?? 0), 0);
  const totalPipeline = deals.reduce((s, d) => s + (d.value ?? 0), 0);
  const currency = deals[0]?.currency ?? 'USD';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: 'calc(100vh - 120px)' }}>
      <div className="crm-page-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Pipeline</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crm-text-secondary)' }}>
            {deals.length} open deals · Total: {fmt(totalPipeline, currency)}
          </p>
        </div>
        <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 12, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={14} /> Add Deal
        </button>
      </div>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--crm-text-muted)' }}>Loading pipeline...</div>
      ) : (
        <div style={{ flex: 1, display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
          {stages.map(stage => {
            const stageDeals = dealsByStage(stage.id);
            const val = stageValue(stage.id);
            const color = stage.color ?? '#4d7cff';
            return (
              <div key={stage.id} style={{ minWidth: 220, width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Stage header */}
                <div style={{ padding: '10px 12px', borderRadius: 12, background: `${color}12`, border: `1px solid ${color}25` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color }}>{stage.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'white', background: color, borderRadius: 6, padding: '1px 6px' }}>{stageDeals.length}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)' }}>
                    <DollarSign size={10} />{fmt(val, currency)}
                  </div>
                </div>

                {/* Deals */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
                  {stageDeals.map(deal => (
                    <div key={deal.id} className="crm-glass-soft" style={{ padding: '12px 14px', cursor: 'pointer', transition: 'transform 150ms', borderLeft: `3px solid ${color}` }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-text)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.title}</div>
                      {deal.contacts?.name && (
                        <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginBottom: 6 }}>{deal.contacts.name}</div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color }}>{fmt(deal.value, deal.currency)}</span>
                        <span style={{ fontSize: 10, color: 'var(--crm-text-muted)' }}>
                          {new Date(deal.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  ))}
                  <button style={{ padding: '8px', borderRadius: 10, border: `1px dashed ${color}40`, background: 'none', color: 'var(--crm-text-muted)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Plus size={12} /> Add deal
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
