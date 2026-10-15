'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet, FileText, Printer } from 'lucide-react';

export type ExportFormat = 'csv' | 'xls' | 'pdf';

export function ReportExportMenu({
  onExport, disabled,
}: {
  onExport: (format: ExportFormat) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const items: { id: ExportFormat; label: string; icon: typeof Download }[] = [
    { id: 'csv', label: 'Export CSV', icon: FileText },
    { id: 'xls', label: 'Export Excel', icon: FileSpreadsheet },
    { id: 'pdf', label: 'Export PDF', icon: Printer },
  ];

  return (
    <div className="crm-rpt-export" ref={ref}>
      <button className="crm-rpt-export-btn" disabled={disabled} onClick={() => setOpen(v => !v)}>
        <Download size={13} /> Export <ChevronDown size={12} />
      </button>
      {open && (
        <div className="crm-rpt-export-menu">
          {items.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => { setOpen(false); onExport(item.id); }}
              >
                <Icon size={13} /> {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
