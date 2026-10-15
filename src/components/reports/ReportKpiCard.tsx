'use client';

import { ArrowDownRight, ArrowUpRight, DollarSign, Hash, Minus, Percent, Sparkles, Target, Timer } from 'lucide-react';
import type { ReportKpi } from '@/lib/reports-types';
import { formatCell } from '@/lib/report-export';
import { toneColor } from './theme';

function iconFor(kind: ReportKpi['kind']) {
  switch (kind) {
    case 'currency': return DollarSign;
    case 'percent': return Percent;
    case 'duration': return Timer;
    case 'number': return Hash;
    default: return Target;
  }
}

function DeltaChip({ kpi, currency }: { kpi: ReportKpi; currency: string }) {
  if (kpi.deltaPct === undefined) return null;
  const prev = kpi.prevValue ?? 0;

  if (kpi.deltaPct === null) {
    return (
      <span className="crm-rpt-delta is-new" title="No value in the previous period">
        <Sparkles size={11} /> new
      </span>
    );
  }
  const d = kpi.deltaPct;
  const cls = d > 0 ? 'is-up' : d < 0 ? 'is-down' : 'is-flat';
  const Icon = d > 0 ? ArrowUpRight : d < 0 ? ArrowDownRight : Minus;
  return (
    <span className={`crm-rpt-delta ${cls}`} title={`vs previous period (${formatCell(kpi.kind, prev, currency)})`}>
      <Icon size={11} /> {d > 0 ? '+' : ''}{d}%
    </span>
  );
}

export function ReportKpiCard({ kpi, currency, onClick }: { kpi: ReportKpi; currency: string; onClick?: () => void }) {
  const color = toneColor(kpi.tone);
  const Icon = iconFor(kpi.kind);
  const clickable = typeof onClick === 'function';
  return (
    <div
      className={`crm-rpt-kpi${clickable ? ' is-clickable' : ''}`}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }) : undefined}
      title={clickable ? 'View matching records' : undefined}
    >
      <div className="crm-rpt-kpi-top">
        <span className="crm-rpt-kpi-icon" style={{ background: `${color}18`, color, borderColor: `${color}30` }}>
          <Icon size={15} />
        </span>
        <span className="crm-rpt-kpi-label">{kpi.label}</span>
        {kpi.hint && (
          <span className="crm-rpt-kpi-hint" title={kpi.hint}>
            <ArrowUpRight size={11} /> {kpi.hint}
          </span>
        )}
      </div>
      <div className="crm-rpt-kpi-value">
        {formatCell(kpi.kind, kpi.value, currency)}
        <DeltaChip kpi={kpi} currency={currency} />
      </div>
    </div>
  );
}
