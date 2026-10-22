'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Navigation, Plus, RefreshCw, CloudDownload, AlertCircle } from 'lucide-react';
import { v3fetch } from '@/lib/auth-client';

import SegmentSummary from '@/components/segments/SegmentSummary';
import SegmentsGrid from '@/components/segments/SegmentsGrid';
import SegmentDetails from '@/components/segments/SegmentDetails';
import CreateSegmentModal from '@/components/segments/CreateSegmentModal';

interface Segment {
  id: string;
  name: string;
  description: string | null;
  type: 'manual' | 'rule_based' | 'ai_assisted';
  contact_count: number;
  last_computed_at: string | null;
  created_at: string;
  updated_at: string;
  rules?: unknown[];
}

export default function SegmentsPage() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [openSegment, setOpenSegment] = useState<Segment | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const loadSegments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await v3fetch('/api/v3/segments');
      if (!res.ok) throw new Error('Failed to load segments');
      const d = await res.json() as { segments?: Segment[] };
      setSegments(d.segments ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load segments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadSegments(); }, [loadSegments]);

  const handleRefreshSegment = async (id: string) => {
    setRefreshing(id);
    try {
      const res = await v3fetch(`/api/v3/segments/${id}/refresh`, { method: 'POST' });
      if (!res.ok) throw new Error('Refresh failed');
      const d = await res.json() as { contact_count: number; calculated_at: string };
      setSegments(prev => prev.map(s => s.id === id ? { ...s, contact_count: d.contact_count, last_computed_at: d.calculated_at } : s));
      if (openSegment?.id === id) setOpenSegment(prev => prev ? { ...prev, contact_count: d.contact_count, last_computed_at: d.calculated_at } : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setRefreshing(null);
    }
  };

  const handleDelete = async (id: string) => {
    const res = await v3fetch(`/api/v3/segments/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string };
      setError(d.error ?? 'Failed to delete');
      return;
    }
    setSegments(prev => prev.filter(s => s.id !== id));
    if (openSegment?.id === id) setOpenSegment(null);
  };

  const handleMembershipChange = async (segmentId: string, action: 'add' | 'remove', contactIds: string[]) => {
    const res = await v3fetch(`/api/v3/segments/${segmentId}/membership`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, contact_ids: contactIds }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string };
      setError(d.error ?? 'Membership update failed');
      return;
    }
    const d = await res.json() as { contact_count: number };
    setSegments(prev => prev.map(s => s.id === segmentId ? { ...s, contact_count: d.contact_count } : s));
    if (openSegment?.id === segmentId) setOpenSegment(prev => prev ? { ...prev, contact_count: d.contact_count } : prev);
  };

  const handleCreate = async (data: { name: string; description: string | undefined; type: string; rules?: unknown[] }) => {
    const res = await v3fetch('/api/v3/segments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(d.error ?? 'Failed to create segment');
    }
    const created = await res.json() as { segment: Segment };
    setSegments(prev => [created.segment, ...prev]);
  };

  return (
    <div className="relative flex h-screen bg-[#080D1B] dark:bg-[#080D1B] overflow-hidden">
      {/* Ambient background */}
      <div className="crm-tab-ambient">
        <div className="crm-tab-ambient-blob" />
        <div className="crm-tab-ambient-blob" />
        <div className="crm-tab-ambient-blob" />
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-8">
          <div className="flex flex-col">
            <div className="flex items-center gap-2.5 mb-2">
              <Navigation strokeWidth={2} className="text-[#3B82F6]" />
              <h1 className="text-2xl font-bold text-[#F8FAFC] dark:text-[#F8FAFC] tracking-tight">Smart Customer Segments</h1>
            </div>
            <p className="text-[13px] text-[#A8B5CA] dark:text-[#CBD5E1] max-w-xl">
              Understand your audience. Discover opportunities. Connect with the right customers.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-[#34D399] animate-pulse" />
              <span className="text-[11px] font-bold text-[#34D399]">Live data • Connected to CRM</span>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => void loadSegments()}
              disabled={loading}
              className="px-5 py-2.5 rounded-xl border border-white/10 bg-[#11182B] text-[#F8FAFC] text-[12px] flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} strokeWidth={2} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Refreshing…' : 'Refresh Data'}
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#3B82F6] text-white text-sm font-bold shadow-lg flex items-center gap-2"
            >
              <Plus size={14} strokeWidth={2} />
              Create Segment
            </button>
            <button
              onClick={() => {
                if (openSegment) window.location.href = `/api/v3/segments/${openSegment.id}/export`;
              }}
              disabled={!openSegment}
              className="px-5 py-2.5 rounded-xl border border-white/10 bg-[#11182B] text-[#F8FAFC] text-[12px] flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CloudDownload size={14} strokeWidth={2} />
              Export
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-6 rounded-xl border border-red-300/30 bg-red-50 dark:bg-red-900/10 px-4 py-3 flex items-center gap-3"
          >
            <AlertCircle size={14} className="text-red-600 dark:text-red-400" />
            <span className="text-[12px] text-red-700 dark:text-red-400 font-medium">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-[10px] font-medium text-red-600 dark:text-red-400 underline">Dismiss</button>
          </motion.div>
        )}

        {/* Analytics Cards */}
        <SegmentSummary segments={segments} />

        <div className="mt-10">
          <SegmentsGrid
            segments={segments}
            onOpen={setOpenSegment}
            onRefresh={handleRefreshSegment}
            onDelete={handleDelete}
            refreshing={refreshing}
          />
        </div>
      </div>

      {/* Segment Details Drawer */}
      <SegmentDetails
        segment={openSegment!}
        open={!!openSegment}
        onClose={() => setOpenSegment(null)}
        onRefresh={handleRefreshSegment}
        onMembershipChange={handleMembershipChange}
        onDelete={handleDelete}
      />

      {/* Create Segment Modal */}
      <CreateSegmentModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreate}
      />
    </div>
  );
}
