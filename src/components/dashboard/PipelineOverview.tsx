'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';


interface StageGroup {
  label: string;
  count: number;
  value: number;
  currency: string;
  color: string;
  bg: string;
  deals: { name: string; val: string; pct: number }[];
}

const STAGE_COLORS = ['#4d7cff', '#8b5cf6', '#28c99a', '#f4c95d', '#f46b72', '#06b6d4'];

function fmt(v: number, cur = 'USD') {
  const sym = cur === 'INR' ? '₹' : '$';
  if (v >= 100_000) return `${sym}${(v / 100_000).toFixed(1)}L`;
  if (v >= 1_000)   return `${sym}${(v / 1_000).toFixed(0)}K`;
  return `${sym}${Math.round(v)}`;
}

export function PipelineOverview() {
  const [stages, setStages] = useState<StageGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [dealsRes, stagesRes] = await Promise.all([
        fetch('/api/v3/deals?status=open&limit=100').then(r => r.json()) as Promise<{ data?: { id: string; title: string; value: number; currency: string; stage_id: string }[] }>,
        fetch('/api/v3/pipeline-stages').then(r => r.json()) as Promise<{ data?: { id: string; name: string }[] }>,
      ]);
      const data = dealsRes.data ?? [];
      const stageMap = Object.fromEntries((stagesRes.data ?? []).map(s => [s.id, s.name]));

      const map = new Map<string, { count: number; value: number; currency: string; deals: { name: string; value: number }[] }>();
      for (const deal of data) {
        const stageName = (deal.stage_id ? stageMap[deal.stage_id] : null) ?? 'Unknown';
        const existing = map.get(stageName) ?? { count: 0, value: 0, currency: deal.currency ?? 'USD', deals: [] as { name: string; value: number }[] };
        existing.count += 1;
        existing.value += deal.value ?? 0;
        if (existing.deals.length < 2) existing.deals.push({ name: deal.title, value: deal.value ?? 0 });
        map.set(stageName, existing);
      }

      const maxVal = Math.max(...Array.from(map.values()).map(s => s.value), 1);
      const result: StageGroup[] = Array.from(map.entries()).slice(0, 4).map(([label, s], i) => ({
        label, count: s.count, value: s.value, currency: s.currency,
        color: STAGE_COLORS[i % STAGE_COLORS.length],
        bg: `rgba(${hexToRgb(STAGE_COLORS[i % STAGE_COLORS.length])},0.08)`,
        deals: s.deals.map(d => ({ name: d.name, val: fmt(d.value, s.currency), pct: Math.round((d.value / maxVal) * 100) })),
      }));
      setStages(result);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <GlassPanel className="crm-table-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text-strong)' }}>Pipeline Overview</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {error && (
            <button onClick={() => void load()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
              <RefreshCw size={11} /> Retry
            </button>
          )}
          <Link href="/pipeline-crm" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--crm-primary)' }}>
            View all <ArrowRight size={12} />
          </Link>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ height: 120, borderRadius: 14, background: 'rgba(255,255,255,0.40)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      ) : error ? (
        <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--crm-text-muted)', fontSize: 12 }}>
          Failed to load pipeline data.
        </div>
      ) : stages.length === 0 ? (
        <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--crm-text-muted)', fontSize: 12 }}>
          No open deals in pipeline yet.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(stages.length, 4)},1fr)`, gap: 10 }}>
          {stages.map(s => (
            <div key={s.label} style={{ background: s.bg, borderRadius: 14, padding: '12px 10px', border: `1px solid ${s.color}22` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: s.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '70%' }}>{s.label}</span>
                <span style={{ fontSize: 10, background: s.color, color: 'white', borderRadius: 6, padding: '1px 6px', fontWeight: 600, flexShrink: 0 }}>{s.count}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text-strong)', marginBottom: 10 }}>{fmt(s.value, s.currency)}</div>
              {s.deals.map(d => (
                <div key={d.name} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <div style={{ width: 20, height: 20, borderRadius: 6, background: `${s.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: s.color, flexShrink: 0 }}>{d.name[0]}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--crm-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--crm-text-muted)' }}>{d.val}</div>
                    </div>
                  </div>
                  <div style={{ height: 3, borderRadius: 2, background: 'rgba(130,145,190,0.15)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${d.pct}%`, background: s.color, borderRadius: 2 }} />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}
