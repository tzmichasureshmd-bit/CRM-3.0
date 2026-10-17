'use client';

import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import type { ReportChart } from '@/lib/reports-types';
import { currencySymbol, formatCurrency, formatNumber } from '@/lib/report-export';
import { kindForKey } from './theme';

const AXIS = { fontSize: 11, fill: 'var(--crm-text-muted)' };
const GRID = 'rgba(130,145,190,0.12)';

function compact(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return `${Math.round(v)}`;
}

export function ReportChartCard({
  chart, currency, onSelect,
}: {
  chart: ReportChart;
  currency: string;
  onSelect?: (datum: Record<string, unknown>, chart: ReportChart) => void;
}) {
  const data = chart.data ?? [];
  const series = chart.series ?? [];
  const isEmpty = data.length === 0 || series.length === 0 ||
    data.every(row => series.every(s => !Number(row[s.key])));

  const anyCurrency = series.some(s => kindForKey(s.key) === 'currency');
  const sym = currencySymbol(currency);
  const kindByLabel = new Map(series.map(s => [s.label, kindForKey(s.key)]));

  const fmt = (value: number | string, name: string): string => {
    const kind = kindByLabel.get(name) ?? 'number';
    const n = Number(value) || 0;
    if (kind === 'percent') return `${Math.round(n)}%`;
    if (kind === 'currency') return formatCurrency(n, currency);
    return formatNumber(n);
  };
  const tooltipFormatter = (value: unknown, name: unknown): [string, string] => [fmt(Number(value) || 0, String(name)), String(name)];
  const axisFormatter = (v: number): string => (anyCurrency ? sym + compact(v) : compact(v));

  const clickable = typeof onSelect === 'function';
  const pick = (d: unknown): Record<string, unknown> | null => {
    if (!d || typeof d !== 'object') return null;
    const o = d as Record<string, unknown>;
    if (o.payload && typeof o.payload === 'object') return o.payload as Record<string, unknown>;
    return o;
  };
  const handleClick = (d: unknown) => {
    if (!onSelect) return;
    const row = pick(d);
    if (row) onSelect(row, chart);
  };

  const tooltipStyle = {
    background: 'rgba(255,255,255,0.96)',
    border: '1px solid rgba(130,145,190,0.22)',
    borderRadius: 10,
    fontSize: 12,
  } as const;

  return (
    <div className={`crm-rpt-card${clickable ? ' is-clickable' : ''}`}>
      <div className="crm-rpt-card-head">
        <h3 className="crm-rpt-card-title">{chart.title}</h3>
        {clickable && <span className="crm-rpt-card-hint">click to inspect</span>}
      </div>
      {isEmpty ? (
        <div className="crm-rpt-empty">No data for this period.</div>
      ) : (
        <ResponsiveContainer width="100%" height={chart.height ?? 220}>
          {chart.type === 'pie' ? (
            <PieChart>
              <Pie data={data} dataKey={series[0].key} nameKey={chart.xKey} innerRadius={48} outerRadius={72} paddingAngle={2} onClick={clickable ? (e => handleClick(e)) : undefined} cursor={clickable ? 'pointer' : undefined}>
                {data.map((row, i) => (
                  <Cell key={i} fill={String(row.color ?? series[i % series.length].color)} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          ) : chart.type === 'area' ? (
            <AreaChart data={data}>
              <defs>
                {series.map(s => (
                  <linearGradient key={s.key} id={`grad-${chart.key}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={s.color} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={s.color} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey={chart.xKey} tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={axisFormatter} tick={AXIS} axisLine={false} tickLine={false} width={52} />
              <Tooltip formatter={tooltipFormatter} contentStyle={tooltipStyle} />
              {series.map(s => (
                <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} fill={`url(#grad-${chart.key}-${s.key})`} dot={false} onClick={clickable ? (d => handleClick(d)) : undefined} cursor={clickable ? 'pointer' : undefined} />
              ))}
            </AreaChart>
          ) : chart.type === 'line' ? (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey={chart.xKey} tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={axisFormatter} tick={AXIS} axisLine={false} tickLine={false} width={52} />
              <Tooltip formatter={tooltipFormatter} contentStyle={tooltipStyle} />
              {series.map(s => (
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={{ r: 3, fill: s.color }} onClick={clickable ? (d => handleClick(d)) : undefined} cursor={clickable ? 'pointer' : undefined} />
              ))}
            </LineChart>
          ) : (
            <BarChart data={data} layout={chart.orientation === 'horizontal' ? 'vertical' : 'horizontal'}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={GRID}
                horizontal={chart.orientation !== 'horizontal'}
                vertical={chart.orientation === 'horizontal'}
              />
              {chart.orientation === 'horizontal' ? (
                <>
                  <XAxis type="number" tickFormatter={axisFormatter} tick={AXIS} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey={chart.xKey} tick={AXIS} axisLine={false} tickLine={false} width={120} />
                </>
              ) : (
                <>
                  <XAxis dataKey={chart.xKey} tick={AXIS} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={axisFormatter} tick={AXIS} axisLine={false} tickLine={false} width={52} />
                </>
              )}
              <Tooltip formatter={tooltipFormatter} contentStyle={tooltipStyle} cursor={{ fill: 'rgba(130,145,190,0.08)' }} />
              {chart.type === 'stackedBar' && <Legend wrapperStyle={{ fontSize: 11 }} />}
              {series.map(s => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  stackId={chart.type === 'stackedBar' ? '1' : undefined}
                  fill={s.color}
                  radius={chart.type === 'stackedBar' ? 0 : chart.orientation === 'horizontal' ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                  onClick={clickable ? (d => handleClick(d)) : undefined}
                  cursor={clickable ? 'pointer' : undefined}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      )}
    </div>
  );
}
