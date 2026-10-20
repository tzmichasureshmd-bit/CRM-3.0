/**
 * CRM 3.0 — Journey Execution History
 * Real execution records from the journeys API.
 */

'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, AlertCircle, Play, RefreshCw } from 'lucide-react';

interface Execution {
  id: string;
  contact_id: string | null;
  status: string;
  triggered_by: string;
  nodes_executed: any[];
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
}

interface JourneyContact {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

interface ExecutionHistoryProps {
  journeyId: string;
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  completed: { bg: 'bg-crm-success/10', text: 'text-crm-success', icon: <CheckCircle size={12} strokeWidth={2} /> },
  failed:    { bg: 'bg-crm-danger/10',  text: 'text-crm-danger',  icon: <XCircle size={12} strokeWidth={2} /> },
  waiting:   { bg: 'bg-crm-warning/10', text: 'text-crm-warning', icon: <Clock size={12} strokeWidth={2} /> },
  running:   { bg: 'bg-crm-primary/10', text: 'text-crm-primary', icon: <Play size={12} strokeWidth={2} className="animate-spin" /> },
  cancelled: { bg: 'bg-crm-muted/10',   text: 'text-crm-muted',   icon: <AlertCircle size={12} strokeWidth={2} /> },
};

export default function ExecutionHistory({ journeyId }: ExecutionHistoryProps) {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [contacts, setContacts] = useState<Record<string, JourneyContact>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/v3/journeys/${journeyId}/executions?limit=50`);
        if (!res.ok) throw new Error('Failed to load executions');
        const d = await res.json();
        const data: Execution[] = d.executions ?? [];

        if (!cancelled) setExecutions(data);

        const contactIds: string[] = [];
        const seen = new Set<string>();
        for (const e of data) {
          if (e.contact_id && !seen.has(e.contact_id)) {
            seen.add(e.contact_id);
            contactIds.push(e.contact_id);
          }
        }

        if (contactIds.length > 0) {
          const contactMap: Record<string, JourneyContact> = {};
          for (const cid of contactIds) {
            try {
              const cRes = await fetch(`/api/v3/contacts/${cid}`);
              if (cRes.ok) {
                const cD = await cRes.json();
                contactMap[cid] = {
                  id: cD.id ?? cid,
                  name: cD.name ?? null,
                  email: cD.email ?? null,
                  phone: cD.phone ?? null,
                };
              }
            } catch { /* skip */ }
          }
          if (!cancelled) setContacts(contactMap);
        }
      } catch (err) {
        console.error('[ExecutionHistory] Failed to load:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [journeyId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-crm-muted">
        <RefreshCw size={24} className="mb-3 animate-spin opacity-40" />
        <p className="text-xs">Loading execution history...</p>
      </div>
    );
  }

  if (executions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-crm-muted">
        <Clock size={32} className="mb-4 opacity-20" />
        <p className="text-sm">No executions yet</p>
        <p className="text-xs mt-1">Run a journey to see execution history here</p>
      </div>
    );
  }

  const timeAgo = (iso: string) => {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-crm-border/30 bg-crm-card-bg shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-crm-border/20 bg-crm-card-bg/50">
              <th className="px-4 py-3 text-[10px] font-bold text-crm-muted uppercase tracking-wider">Contact</th>
              <th className="px-4 py-3 text-[10px] font-bold text-crm-muted uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-[10px] font-bold text-crm-muted uppercase tracking-wider">Nodes</th>
              <th className="px-4 py-3 text-[10px] font-bold text-crm-muted uppercase tracking-wider">Duration</th>
              <th className="px-4 py-3 text-[10px] font-bold text-crm-muted uppercase tracking-wider">Started</th>
              <th className="px-4 py-3 text-[10px] font-bold text-crm-muted uppercase tracking-wider text-right">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-crm-border/10">
            {executions.map((ex) => {
              const contact = contacts[ex.contact_id ?? ''];
              const contactName = contact?.name ?? (contact?.email ?? (contact?.phone ?? 'Unknown contact'));
              const statusInfo = STATUS_CONFIG[ex.status] ?? STATUS_CONFIG.cancelled;
              const nodeCount = ex.nodes_executed?.length ?? 0;
              const failedNodes = ex.nodes_executed?.filter((n: any) => n.status === 'failed').length ?? 0;

              return (
                <tr key={ex.id} className="border-b border-crm-border/10 hover:bg-crm-accent/50 transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center bg-crm-primary/10 text-crm-primary text-xs font-bold">
                        {contactName?.charAt(0)?.toUpperCase() ?? '?'}
                      </div>
                      <div>
                        <div className="text-xs font-medium text-crm-text">{contactName}</div>
                        <div className="text-[10px] text-crm-muted">{ex.contact_id ? ex.contact_id.slice(0, 8) : '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${statusInfo.bg} ${statusInfo.text} border`}>
                      {statusInfo.icon}
                      <span>{ex.status}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium text-crm-text">{nodeCount}</span>
                      <span className="text-crm-muted">nodes</span>
                      {failedNodes > 0 && (
                        <span className="text-[10px] text-crm-danger font-bold">{failedNodes} failed</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-crm-text">{ex.duration_ms ? `${ex.duration_ms}ms` : '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-crm-text">{timeAgo(ex.started_at)}</div>
                    <div className="text-[10px] text-crm-muted">{ex.triggered_by}</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {ex.error_message ? (
                      <div className="flex items-center justify-end gap-1.5 text-[10px]">
                        <AlertCircle size={10} strokeWidth={2} className="text-crm-danger" />
                        <span className="text-crm-danger font-medium truncate max-w-[150px]" title={ex.error_message}>{ex.error_message}</span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-crm-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
