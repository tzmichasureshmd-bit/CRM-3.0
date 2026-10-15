/**
 * CRM 3.0 — Reports: export utilities
 *
 * Dependency-free exporters (no xlsx / jspdf):
 *  - CSV   (RFC-4180 text/csv)
 *  - Excel (SpreadsheetML 2003 XML, opens natively in Excel / Sheets / Numbers)
 *  - PDF   (opens a print-ready window; the user chooses "Save as PDF")
 *
 * All functions operate on the REAL report payload returned by /api/v3/reports.
 */

import type { ColumnType, ExportableReport, ReportTable, ValueKind } from '@/lib/reports-types';

type CellKind = ColumnType | ValueKind;

const CURRENCY_SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', INR: '₹', JPY: '¥' };

export function currencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] ?? (currency ? currency + ' ' : '$');
}

export function formatNumber(v: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(v));
}

export function formatCurrency(v: number, currency: string): string {
  return currencySymbol(currency) + formatNumber(v);
}

/** Human display of a raw cell value according to its column type. */
export function formatCell(type: CellKind, value: unknown, currency: string): string {
  if (value == null || value === '') return '—';
  switch (type) {
    case 'number':
      return typeof value === 'number' ? formatNumber(value) : String(value);
    case 'duration': {
      const n = Number(value);
      if (isNaN(n)) return String(value);
      return n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`;
    }
    case 'currency':
      return formatCurrency(Number(value) || 0, currency);
    case 'percent':
      return `${Math.round(Number(value) || 0)}%`;
    case 'date': {
      const d = new Date(String(value));
      return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }
    case 'score':
      return typeof value === 'number' ? `${value}/100` : String(value);
    case 'badge':
    case 'text':
    default:
      return String(value);
  }
}

/** Raw serialisable value for spreadsheets (numbers stay numeric). */
function rawValue(type: CellKind, value: unknown): string | number {
  if (value == null) return '';
  if (type === 'number' || type === 'currency' || type === 'percent' || type === 'score') {
    const n = Number(value);
    return isNaN(n) ? String(value) : n;
  }
  if (type === 'date') {
    const d = new Date(String(value));
    return isNaN(d.getTime()) ? String(value) : d.toISOString().slice(0, 10);
  }
  return String(value);
}

function downloadBlob(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fileStamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

function tableTitle(res: ExportableReport): string {
  return res.report.replace(/^\w/, c => c.toUpperCase()) + ' Report';
}

// ── CSV ───────────────────────────────────────────────────────
function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportCSV(res: ExportableReport, table: ReportTable | null) {
  const lines: string[] = [];
  lines.push(csvCell('Section') + ',' + csvCell('Key') + ',' + csvCell('Value'));
  res.kpis.forEach(k => {
    lines.push([csvCell('KPI'), csvCell(k.label), csvCell(formatCell(k.kind, k.value, res.meta.currency))].join(','));
  });
  lines.push('');
  if (table) {
    lines.push(table.columns.map(c => csvCell(c.label)).join(','));
    table.rows.forEach(row => {
      lines.push(table.columns.map(c => csvCell(formatCell(c.type, row[c.key], res.meta.currency))).join(','));
    });
  }
  const csv = '\uFEFF' + lines.join('\r\n');
  downloadBlob(`crm-${res.report}-report-${fileStamp()}.csv`, 'text/csv;charset=utf-8', csv);
}

// ── Excel (SpreadsheetML 2003) ────────────────────────────────
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function xmlCell(type: ColumnType, value: unknown, header = false): string {
  if (header) {
    return `<Cell ss:StyleID="header"><Data ss:Type="String">${xmlEscape(String(value))}</Data></Cell>`;
  }
  const raw = rawValue(type, value);
  const ssType = typeof raw === 'number' ? 'Number' : 'String';
  return `<Cell><Data ss:Type="${ssType}">${xmlEscape(String(raw))}</Data></Cell>`;
}

export function exportExcel(res: ExportableReport, table: ReportTable | null) {
  const rows: string[] = [];

  rows.push('<Row>' + `<Cell ss:StyleID="title"><Data ss:Type="String">${xmlEscape(tableTitle(res))}</Data></Cell>` + '</Row>');
  rows.push('<Row>' + `<Cell><Data ss:Type="String">Generated</Data></Cell>` + `<Cell><Data ss:Type="String">${xmlEscape(new Date(res.generated_at).toLocaleString())}</Data></Cell>` + '</Row>');
  rows.push('<Row>' + `<Cell><Data ss:Type="String">Range</Data></Cell>` + `<Cell><Data ss:Type="String">${xmlEscape(`${res.range.from ?? '—'} → ${res.range.to ?? '—'}`)}</Data></Cell>` + '</Row>');
  rows.push('<Row></Row>');

  // KPI block
  rows.push('<Row>' + xmlCell('text', 'Metric', true) + xmlCell('text', 'Value', true) + '</Row>');
  res.kpis.forEach(k => {
    rows.push('<Row>' + xmlCell('text', k.label) + xmlCell('text', formatCell(k.kind, k.value, res.meta.currency)) + '</Row>');
  });
  rows.push('<Row></Row>');

  // Table block
  if (table && table.rows.length) {
    rows.push('<Row>' + table.columns.map(c => xmlCell('text', c.label, true)).join('') + '</Row>');
    table.rows.forEach(row => {
      rows.push('<Row>' + table.columns.map(c => xmlCell(c.type, row[c.key])).join('') + '</Row>');
    });
  } else {
    rows.push('<Row>' + xmlCell('text', 'No tabular rows for the selected range.') + '</Row>');
  }

  const xml =
    `<?xml version="1.0"?>\n` +
    `<?mso-application progid="Excel.Sheet"?>\n` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n` +
    ` xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n` +
    `<Styles>\n` +
    `<Style ss:ID="title"><Font ss:Bold="1" ss:Size="13"/></Style>\n` +
    `<Style ss:ID="header"><Font ss:Bold="1"/><Interior ss:Color="#E8EDFF" ss:Pattern="Solid"/></Style>\n` +
    `</Styles>\n` +
    `<Worksheet ss:Name="Report"><Table>\n${rows.join('\n')}\n</Table></Worksheet>\n` +
    `</Workbook>`;

  downloadBlob(`crm-${res.report}-report-${fileStamp()}.xls`, 'application/vnd.ms-excel', xml);
}

// ── PDF (print window) ────────────────────────────────────────
export function exportPDF(res: ExportableReport, table: ReportTable | null) {
  const cur = res.meta.currency;
  const kpiHtml = res.kpis.length
    ? `<div class="kpis">${res.kpis.map(k => `
        <div class="kpi"><div class="kpi-label">${xmlEscape(k.label)}</div><div class="kpi-value">${xmlEscape(formatCell(k.kind, k.value, cur))}</div>${k.hint ? `<div class="kpi-hint">${xmlEscape(k.hint)}</div>` : ''}</div>`).join('')}</div>`
    : '';
  const tableHtml = table && table.rows.length
    ? `<table><thead><tr>${table.columns.map(c => `<th style="text-align:${c.align ?? 'left'}">${xmlEscape(c.label)}</th>`).join('')}</tr></thead><tbody>${table.rows
        .map(row => `<tr>${table.columns.map(c => `<td style="text-align:${c.align ?? 'left'}">${xmlEscape(formatCell(c.type, row[c.key], cur))}</td>`).join('')}</tr>`)
        .join('')}</tbody></table>`
    : '<p class="muted">No tabular rows for the selected range.</p>';
  const notesHtml = res.notes.length ? `<ul class="notes">${res.notes.map(n => `<li>${xmlEscape(n)}</li>`).join('')}</ul>` : '';

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${xmlEscape(tableTitle(res))}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #1c2333; margin: 32px; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .meta { color: #6b7488; font-size: 12px; margin-bottom: 18px; }
  .kpis { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
  .kpi { flex: 1 1 150px; border: 1px solid #e2e6f0; border-radius: 10px; padding: 12px 14px; }
  .kpi-label { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #6b7488; font-weight: 700; }
  .kpi-value { font-size: 20px; font-weight: 800; margin-top: 4px; }
  .kpi-hint { font-size: 11px; color: #8790aa; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border-bottom: 1px solid #e2e6f0; padding: 7px 9px; text-align: left; }
  th { background: #f4f6fc; font-weight: 700; }
  .muted { color: #8790aa; font-size: 12px; }
  .notes { color: #6b7488; font-size: 11px; margin-top: 16px; }
  @media print { body { margin: 12mm; } }
</style></head><body>
  <h1>${xmlEscape(tableTitle(res))}</h1>
  <div class="meta">${xmlEscape(res.meta.account_name ?? '')} · Range: ${xmlEscape(`${res.range.from ?? '—'} → ${res.range.to ?? '—'}`)} · Generated ${xmlEscape(new Date(res.generated_at).toLocaleString())}</div>
  ${kpiHtml}
  ${tableHtml}
  ${notesHtml}
</body></html>`;

  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) return; // popup blocked
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}
