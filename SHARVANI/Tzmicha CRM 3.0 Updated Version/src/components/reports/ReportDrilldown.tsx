'use client';

import Link from 'next/link';
import { ArrowUpRight, X } from 'lucide-react';
import type { ReportColumn } from '@/lib/reports-types';
import { formatCell } from '@/lib/report-export';

export function ReportDrilldown({
  open, row, columns, currency, title, href, onClose,
}: {
  open: boolean;
  row: Record<string, unknown> | null;
  columns: ReportColumn[];
  currency: string;
  title: string;
  href?: string;
  onClose: () => void;
}) {
  if (!open || !row) return null;
  return (
    <div className="crm-rpt-drawer-overlay" onClick={onClose}>
      <div className="crm-rpt-drawer" onClick={e => e.stopPropagation()}>
        <div className="crm-rpt-drawer-head">
          <h3>{title}</h3>
          <button onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="crm-rpt-drawer-body">
          {columns.map(col => (
            <div key={col.key} className="crm-rpt-drawer-row">
              <span className="crm-rpt-drawer-label">{col.label}</span>
              <span className="crm-rpt-drawer-value">
                {row[col.key] == null || row[col.key] === ''
                  ? '—'
                  : formatCell(col.type, row[col.key], currency)}
              </span>
            </div>
          ))}
        </div>
        {href && (
          <div className="crm-rpt-drawer-foot">
            <Link href={href} className="crm-rpt-drawer-link" onClick={onClose}>
              Open in {href.replace(/^\//, '').replace(/\//g, ' › ')} <ArrowUpRight size={13} />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
