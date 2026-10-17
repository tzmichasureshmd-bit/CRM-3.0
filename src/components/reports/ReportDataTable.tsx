'use client';

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Search } from 'lucide-react';
import type { ReportColumn, ReportTable } from '@/lib/reports-types';
import { formatCell } from '@/lib/report-export';
import { toneColor } from './theme';

const BADGE_TONE: Record<string, string> = {
  won: 'green', converted: 'green', completed: 'green', sent: 'green', delivered: 'green', active: 'green', enabled: 'green', success: 'green', qualified: 'green',
  lost: 'red', failed: 'red', cancelled: 'red', error: 'red', hot: 'red', failed_delivery: 'red',
  open: 'blue', new: 'blue', running: 'cyan', scheduled: 'cyan', read: 'cyan', contacted: 'cyan',
  proposal: 'violet', negotiation: 'violet', paused: 'amber', pending: 'amber', awaiting_approval: 'amber', warm: 'amber', queued: 'amber',
  cold: 'slate', draft: 'slate', disabled: 'slate', inactive: 'slate', archived: 'slate',
  true: 'green', false: 'slate', yes: 'green', no: 'slate',
};

function badgeTone(value: unknown): string {
  return toneColor(BADGE_TONE[String(value).toLowerCase()] ?? 'slate');
}

function renderCell(col: ReportColumn, row: Record<string, unknown>, currency: string) {
  const value = row[col.key];
  if (col.type === 'badge') {
    if (value == null || value === '') return <span className="crm-rpt-cell-muted">—</span>;
    const c = badgeTone(value);
    return <span className="crm-rpt-badge" style={{ color: c, background: `${c}18`, borderColor: `${c}33` }}>{String(value).replace(/_/g, ' ')}</span>;
  }
  if (col.type === 'score') {
    const n = Number(value);
    if (isNaN(n)) return <span className="crm-rpt-cell-muted">—</span>;
    const c = n >= 70 ? toneColor('green') : n >= 40 ? toneColor('amber') : toneColor('slate');
    return <span style={{ fontWeight: 700, color: c }}>{Math.round(n)}</span>;
  }
  if (value == null || value === '') return <span className="crm-rpt-cell-muted">—</span>;
  return <>{formatCell(col.type, value, currency)}</>;
}

export function ReportDataTable({
  table, currency, search, onSearch, onSort, onPage, onRowClick,
}: {
  table: ReportTable;
  currency: string;
  search: string;
  onSearch: (v: string) => void;
  onSort: (key: string) => void;
  onPage: (page: number) => void;
  onRowClick?: (row: Record<string, unknown>) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(table.total / table.pageSize));
  const from = table.total === 0 ? 0 : (table.page - 1) * table.pageSize + 1;
  const to = Math.min(table.total, table.page * table.pageSize);

  return (
    <div className="crm-rpt-card">
      <div className="crm-rpt-table-toolbar">
        <h3 className="crm-rpt-card-title">Details</h3>
        <label className="crm-rpt-search">
          <Search size={13} />
          <input value={search} onChange={e => onSearch(e.target.value)} placeholder="Search…" />
        </label>
      </div>

      <div className="crm-rpt-table-scroll">
        <table className="crm-rpt-table">
          <thead>
            <tr>
              {table.columns.map(col => {
                const active = table.sort === col.key;
                return (
                  <th
                    key={col.key}
                    style={{ textAlign: col.align ?? 'left', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => onSort(col.key)}
                  >
                    <span className="crm-rpt-th-inner">
                      {col.label}
                      {active ? (table.order === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {table.rows.length === 0 ? (
              <tr>
                <td colSpan={table.columns.length} className="crm-rpt-table-empty">
                  No rows match the current filters.
                </td>
              </tr>
            ) : table.rows.map((row, i) => (
              <tr
                key={i}
                className={onRowClick ? 'crm-rpt-row-click' : undefined}
                onClick={() => onRowClick?.(row)}
              >
                {table.columns.map(col => (
                  <td key={col.key} style={{ textAlign: col.align ?? 'left' }}>
                    {renderCell(col, row, currency)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="crm-rpt-pager">
        <span className="crm-rpt-pager-info">
          {from}–{to} of {table.total}
        </span>
        <div className="crm-rpt-pager-controls">
          <button disabled={table.page <= 1} onClick={() => onPage(table.page - 1)} aria-label="Previous page">
            <ChevronLeft size={14} />
          </button>
          <span className="crm-rpt-pager-page">{table.page} / {pageCount}</span>
          <button disabled={table.page >= pageCount} onClick={() => onPage(table.page + 1)} aria-label="Next page">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
