/**
 * CRM 3.0 — Journey Dashboard Cards
 * Real summary statistics from the journeys API.
 */

'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, Activity, CheckCircle, Clock, AlertCircle } from 'lucide-react';

interface StatCard {
  title: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon: React.ReactNode;
  color: string;
}

interface JourneyDashboardProps {
  accountId: string;
}

export default function JourneyDashboard({ accountId }: JourneyDashboardProps) {
  const [stats, setStats] = useState<StatCard[]>([
    { title: 'Total Journeys', value: '0', icon: <Users size={16} strokeWidth={2} />, color: '#4f6df5' },
    { title: 'Active Journeys', value: '0', icon: <Activity size={16} strokeWidth={2} />, color: '#28c99a' },
    { title: 'Customers in Journey', value: '0', icon: <CheckCircle size={16} strokeWidth={2} />, color: '#f4c95d' },
    { title: 'Completed', value: '0', icon: <Clock size={16} strokeWidth={2} />, color: '#8b5cf6' },
    { title: 'Failed', value: '0', icon: <AlertCircle size={16} strokeWidth={2} />, color: '#f46b72' },
  ]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // Aggregate stats from journeys list
        const res = await fetch(`/api/v3/journeys`);
        if (!res.ok) throw new Error('Failed to load journeys');
        const d = await res.json();
        const journeys = d.journeys ?? [];

        const total = journeys.length;
        const active = journeys.filter((j: any) => j.status === 'active').length;
        const entered = journeys.reduce((acc: number, j: any) => acc + (j.entry_count || 0), 0);
        const completed = journeys.reduce((acc: number, j: any) => acc + (j.completed_count || 0), 0);

        // Get execution stats across all journeys
        let failedCount = 0;
        let waitingCount = 0;
        for (const j of journeys) {
          try {
            const execRes = await fetch(`/api/v3/journeys/${j.id}/executions?limit=100`);
            if (execRes.ok) {
              const execD = await execRes.json();
              const executions = execD.executions ?? [];
              failedCount += executions.filter((e: any) => e.status === 'failed').length;
              waitingCount += executions.filter((e: any) => e.status === 'waiting').length;
            }
          } catch { /* skip individual failures */ }
        }

        if (!cancelled) {
          setStats([
            { title: 'Total Journeys', value: total, change: '', trend: 'neutral', icon: <Users size={16} strokeWidth={2} />, color: '#4f6df5' },
            { title: 'Active Journeys', value: active, change: '', trend: 'neutral', icon: <Activity size={16} strokeWidth={2} />, color: '#28c99a' },
            { title: 'Customers in Journey', value: waitingCount, change: '', trend: 'neutral', icon: <CheckCircle size={16} strokeWidth={2} />, color: '#f4c95d' },
            { title: 'Completed', value: completed, change: '', trend: 'neutral', icon: <Clock size={16} strokeWidth={2} />, color: '#8b5cf6' },
            { title: 'Failed Executions', value: failedCount, change: '', trend: 'neutral', icon: <AlertCircle size={16} strokeWidth={2} />, color: '#f46b72' },
          ]);
        }
      } catch (err) {
        console.error('[JourneyDashboard] Failed to load stats:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [accountId]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      {stats.map((card, idx) => (
        <motion.div
          key={card.title}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.05, duration: 0.4 }}
          className="rounded-2xl border border-crm-border/30 bg-crm-card-bg p-5 shadow-sm"
        >
          <div className="flex items-center justify-between mb-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${card.color}10`} style={{ color: card.color }}>
              {card.icon}
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold text-crm-muted uppercase tracking-wider">{card.title}</div>
              {card.change && (
                <div className={`text-[10px] font-medium ${card.trend === 'up' ? 'text-crm-success' : card.trend === 'down' ? 'text-crm-danger' : 'text-crm-muted'}`}>
                  {card.change}
                </div>
              )}
            </div>
          </div>
          <div className="text-2xl font-bold text-crm-text">{card.value}</div>
        </motion.div>
      ))}
    </div>
  );
}
