'use client';

import { useEffect, useState } from 'react';
import { Calendar } from 'lucide-react';
import { RANGE_PRESETS, type RangePreset } from '@/lib/reports-types';

export function ReportRangePicker({
  preset, from, to, onApply, presets: presetOptions = RANGE_PRESETS,
}: {
  preset: RangePreset;
  from: string;
  to: string;
  onApply: (preset: RangePreset, from: string, to: string) => void;
  /** preset buttons to render; defaults to the shared RANGE_PRESETS */
  presets?: { id: RangePreset; label: string }[];
}) {
  const [showCustom, setShowCustom] = useState(preset === 'custom');
  const [cf, setCf] = useState(from);
  const [ct, setCt] = useState(to);

  useEffect(() => { setShowCustom(preset === 'custom'); }, [preset]);
  useEffect(() => { setCf(from); }, [from]);
  useEffect(() => { setCt(to); }, [to]);

  const presets = presetOptions.filter(p => p.id !== 'custom');

  return (
    <div className="crm-rpt-range">
      <div className="crm-rpt-range-presets">
        {presets.map(p => (
          <button
            key={p.id}
            className={`crm-rpt-range-btn${preset === p.id ? ' is-active' : ''}`}
            onClick={() => onApply(p.id, '', '')}
          >
            {p.label}
          </button>
        ))}
        <button
          className={`crm-rpt-range-btn${preset === 'custom' ? ' is-active' : ''}`}
          onClick={() => setShowCustom(v => !v)}
        >
          <Calendar size={12} /> Custom
        </button>
      </div>
      {showCustom && (
        <div className="crm-rpt-range-custom">
          <input type="date" value={cf} max={ct || undefined} onChange={e => setCf(e.target.value)} />
          <span className="crm-rpt-range-dash">→</span>
          <input type="date" value={ct} min={cf || undefined} onChange={e => setCt(e.target.value)} />
          <button
            className="crm-rpt-range-apply"
            disabled={!cf || !ct || cf > ct}
            onClick={() => onApply('custom', cf, ct)}
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
