/**
 * CRM 3.0 — Journey Analytics
 * Real enrollment, completion, and drop-off metrics from execution data.
 */

'use client';

import { useEffect, useState } from 'react';
import { Users, Activity, CheckCircle, AlertCircle, BarChart3 } from 'lucide-react';

interface JourneyAnalyticsProps {
  journeyId: string;
}

interface NodeDropOff {
  nodeId: string;
  nodeLabel: string;
  entered: number;
  exited: number;
  dropOffRate: number;
}

export default function JourneyAnalytics({ journeyId }: JourneyAnalyticsProps) {
  const [analytics, setAnalytics] = useState({
    totalEnrolled: 0,
    totalCompleted: 0,
    totalWaiting: 0,
    totalFailed: 0,
    completionRate: 0,
    avgDurationMs: 0,
    dropOffByNode: [] as NodeDropOff[],
    branchDistribution: [] as { label: string; count: number }[],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/v3/journeys/${journeyId}/executions?limit=100`);
        if (!res.ok) throw new Error('Failed to load executions');
        const d = await res.json();
        const executions = d.executions ?? [];

        const totalEnrolled = executions.length;
        const totalCompleted = executions.filter((e: any) => e.status === 'completed').length;
        const totalWaiting = executions.filter((e: any) => e.status === 'waiting').length;
        const totalFailed = executions.filter((e: any) => e.status === 'failed').length;
        const completionRate = totalEnrolled > 0 ? Math.round((totalCompleted / totalEnrolled) * 100) : 0;

        const durations = executions
          .filter((e: any) => e.duration_ms)
          .map((e: any) => e.duration_ms);
        const avgDurationMs = durations.length > 0
          ? Math.round(durations.reduce((a: number, b: number) => a + b, 0) / durations.length)
          : 0;

        // Drop-off by node: count how many executions passed through each node vs completed it
        const nodeStats = new Map<string, { entered: number; completed: number; label: string }>();
        executions.forEach((ex: any) => {
          (ex.nodes_executed || []).forEach((n: any) => {
            if (!nodeStats.has(n.nodeId)) {
              nodeStats.set(n.nodeId, { entered: 0, completed: 0, label: n.nodeType });
            }
            const s = nodeStats.get(n.nodeId)!;
            s.entered += 1;
            if (n.status === 'completed') s.completed += 1;
          });
        });

        const dropOffByNode: NodeDropOff[] = Array.from(nodeStats.entries()).map(([id, s]) => ({
          nodeId: id,
          nodeLabel: s.label,
          entered: s.entered,
          exited: s.entered - s.completed,
          dropOffRate: s.entered > 0 ? Math.round(((s.entered - s.completed) / s.entered) * 100) : 0,
        })).sort((a, b) => b.dropOffRate - a.dropOffRate);

        // Branch distribution from condition/ai_decision nodes
        const branchCounts = new Map<string, number>();
        executions.forEach((ex: any) => {
          (ex.nodes_executed || []).forEach((n: any) => {
            if (n.result?.branch) {
              const key = `${n.nodeType}:${n.result.branch}`;
              branchCounts.set(key, (branchCounts.get(key) || 0) + 1);
            }
          });
        });
        const branchDistribution = Array.from(branchCounts.entries()).map(([label, count]) => ({ label, count }));

        if (!cancelled) {
          setAnalytics({
            totalEnrolled,
            totalCompleted,
            totalWaiting,
            totalFailed,
            completionRate,
            avgDurationMs,
            dropOffByNode,
            branchDistribution,
          });
        }
      } catch (err) {
        console.error('[JourneyAnalytics] Failed to load:', err);
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
        <BarChart3 size={24} className="mb-3 animate-spin opacity-40" />
        <p className="text-xs">Loading analytics...</p>
      </div>
    );
  }

  const { totalEnrolled, totalCompleted, totalWaiting, completionRate, avgDurationMs, dropOffByNode, branchDistribution } = analytics;

  const hasData = totalEnrolled > 0;

  return (
    <div className="space-y-6">
      {/* Overview stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-crm-border/30 bg-crm-card-bg p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-crm-primary/10 text-crm-primary">
              <Users size={16} strokeWidth={2} />
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold text-crm-muted uppercase tracking-wider">Total Enrolled</div>
              <div className="text-2xl font-bold text-crm-text">{totalEnrolled}</div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-crm-border/30 bg-crm-card-bg p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-crm-success/10 text-crm-success">
              <CheckCircle size={16} strokeWidth={2} />
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold text-crm-muted uppercase tracking-wider">Completed</div>
              <div className="text-2xl font-bold text-crm-text">{totalCompleted}</div>
            </div>
          </div>
          <div className="mt-3">
            <div className="w-full bg-crm-border/20 rounded-full h-2">
              <div className={`bg-crm-success h-2 rounded-full transition-all duration-500`} style={{ width: `${completionRate}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-crm-muted mt-1">
              <span>Completion Rate</span>
              <span>{completionRate}%</span>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-crm-border/30 bg-crm-card-bg p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-crm-warning/10 text-crm-warning">
              <Activity size={16} strokeWidth={2} />
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold text-crm-muted uppercase tracking-wider">Currently Waiting</div>
              <div className="text-2xl font-bold text-crm-text">{totalWaiting}</div>
            </div>
          </div>
          {avgDurationMs > 0 && (
            <div className="mt-3 text-xs text-crm-muted">
              Avg duration: {avgDurationMs}ms
            </div>
          )}
        </div>
      </div>

      {/* Drop-off by node */}
      <div className="rounded-2xl border border-crm-border/30 bg-crm-card-bg p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-crm-text">Drop-off by Node</h3>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${hasData ? 'bg-crm-success/10 text-crm-success' : 'bg-crm-muted/10 text-crm-muted'}`}>
            {hasData ? 'Real data' : 'No data'}
          </span>
        </div>

        {!hasData ? (
          <div className="flex flex-col items-center justify-center py-8 text-crm-muted">
            <AlertCircle size={24} className="mb-3 opacity-20" />
            <p className="text-xs">No execution data yet</p>
            <p className="text-[10px] mt-1">Run your journey to see drop-off analysis</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-crm-border/20 text-[10px] font-bold text-crm-muted uppercase tracking-wider">
                  <th className="px-4 py-3">Node</th>
                  <th className="px-4 py-3 text-right">Entered</th>
                  <th className="px-4 py-3 text-right">Dropped Off</th>
                  <th className="px-4 py-3 text-right">Drop-off Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-crm-border/10">
                {dropOffByNode.map((node) => (
                  <tr key={node.nodeId} className="hover:bg-crm-accent/5 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded flex items-center justify-center bg-crm-border text-crm-muted text-[10px] font-bold">
                          {node.nodeLabel.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs text-crm-text">{node.nodeLabel}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-crm-text">{node.entered}</td>
                    <td className="px-4 py-3 text-right text-xs text-crm-text">{node.exited}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 bg-crm-border/20 rounded-full h-2">
                          <div className={`bg-crm-danger h-2 rounded-full transition-all duration-500`} style={{ width: `${Math.min(node.dropOffRate, 100)}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-crm-text">{node.dropOffRate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Branch distribution */}
      {branchDistribution.length > 0 && (
        <div className="rounded-2xl border border-crm-border/30 bg-crm-card-bg p-5 shadow-sm">
          <h3 className="text-sm font-bold text-crm-text mb-4">Branch Distribution</h3>
          <div className="space-y-3">
            {branchDistribution.map((b) => (
              <div key={b.label} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center bg-crm-primary/10 text-crm-primary text-[10px] font-bold">
                    {b.label.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs text-crm-text">{b.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-24 bg-crm-border/20 rounded-full h-2">
                    <div className="bg-crm-primary h-2 rounded-full transition-all duration-500" style={{ width: `${Math.min((b.count / Math.max(1, ...branchDistribution.map(x => x.count))) * 100, 100)}%` }} />
                  </div>
                  <span className="text-[10px] font-bold text-crm-text">{b.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
