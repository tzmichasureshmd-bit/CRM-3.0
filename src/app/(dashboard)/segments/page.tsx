/**
 * CRM 3.0 — Smart Customer Segments (Premium Redesign)
 * Glassmorphism segmentation page with explicit text colors for visibility.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Navigation, Plus, RefreshCw, Search, X,
  AlertCircle, CloudDownload,
} from 'lucide-react';

import SegmentSummary from '@/components/segments/SegmentSummary';
import SegmentRuleBuilder from '@/components/segments/SegmentRuleBuilder';
import SegmentLivePreview from '@/components/segments/SegmentLivePreview';
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
  rules?: any[];
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
      const res = await fetch('/api/v3/segments');
      if (!res.ok) throw new Error('Failed to load segments');
      const d = await res.json();
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
      const res = await fetch(`/api/v3/segments/${id}/refresh`, { method: 'POST' });
      if (!res.ok) throw new Error('Refresh failed');
      const d = await res.json();
      setSegments((prev) => prev.map((s) => s.id === id ? { ...s, contact_count: d.contact_count, last_computed_at: d.calculated_at } : s));
      if (openSegment?.id === id) setOpenSegment((prev) => prev ? { ...prev, contact_count: d.contact_count, last_computed_at: d.calculated_at } : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setRefreshing(null);
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/v3/segments/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || 'Failed to delete');
      return;
    }
    setSegments((prev) => prev.filter((s) => s.id !== id));
    if (openSegment?.id === id) setOpenSegment(null);
  };

  const handleMembershipChange = async (segmentId: string, action: 'add' | 'remove', contactIds: string[]) => {
    const res = await fetch(`/api/v3/segments/${segmentId}/membership`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, contact_ids: contactIds }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || 'Membership update failed');
      return;
    }
    const d = await res.json();
    setSegments((prev) => prev.map((s) => s.id === segmentId ? { ...s, contact_count: d.contact_count } : s));
    if (openSegment?.id === segmentId) setOpenSegment((prev) => prev ? { ...prev, contact_count: d.contact_count } : prev);
  };

  const handleCreate = async (data: { name: string; description: string | undefined; type: string; rules?: any[] }) => {
    const res = await fetch('/api/v3/segments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || 'Failed to create segment');
    }
    const created = await res.json();
    setSegments((prev) => [created.segment, ...prev]);
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
        {/* Premium Header */}
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
              <span className="text-[11px] font-bold text-[#34D399]">Live data • Connected to Supabase</span>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => void loadSegments()}
              disabled={loading}
              className="px-5 py-2.5 rounded-xl border border-[#rgba(255,255,255,0.14)] bg-[#11182B] dark:bg-[#11182B] text-[#F8FAFC] dark:text-[#F8FAFC] text-[12px] flex items-center gap-2 transition-colors disabled:opacity-50"
              title="Refresh Data"
            >
              <RefreshCw size={14} strokeWidth={2} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Refreshing…' : 'Refresh Data'}
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="px-6 py-2.5 rounded-xl border border-transparent bg-linear-gradient-to-r from-[#7C3AED] to-[#3B82F6] text-white text-sm font-bold shadow-lg hover:shadow-[#7C3AED]/30 transition-all relative overflow-hidden"
            >
              <Plus size={14} strokeWidth={2} />
              Create Segment
              <div className="absolute top-[30%] right-[-6px] w-2 h-2 rounded-full bg-white animate-pulse" style={{ animationDelay: '0.2s' }} />
              <div className="absolute top-[60%] right-[-10px] w-2 h-2 rounded-full bg-white animate-pulse" style={{ animationDelay: '0.8s' }} />
              <div className="absolute top-[10%] right-[-14px] w-2 h-2 rounded-full bg-white animate-pulse" style={{ animationDelay: '1.4s' }} />
            </button>
            <button
              onClick={() => {
                window.location.href = `/api/v3/segments/${openSegment?.id || 'all'}/export`;
              }}
              disabled={!openSegment}
              className="px-5 py-2.5 rounded-xl border border-[#rgba(255,255,255,0.14)] bg-[#11182B] dark:bg-[#11182B] text-[#F8FAFC] dark:text-[#F8FAFC] text-[12px] flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Export Contacts"
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
            className="mb-6 rounded-xl border border-[#FCA5A5]/30 bg-[#FEE2E2] dark:bg-[#B91C1C]/10 px-4 py-3 flex items-center gap-3"
          >
            <AlertCircleIcon strokeWidth={14} />
            <span className="text-[12px] text-[#B91C1C] dark:text-[#FCA5A5] font-medium">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-[10px] font-medium text-[#B91C1C] dark:text-[#FCA5A5] underline">Dismiss</button>
          </motion.div>
        )}

        {/* Premium Analytics Cards */}
        <SegmentSummary segments={segments} />

        <div className="mt-10">
          {/* Segments Grid Workspace */}
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

function AlertCircleIcon({ className, strokeWidth }: { className?: string; strokeWidth?: number }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width={strokeWidth ? strokeWidth : 16} height={strokeWidth ? strokeWidth : 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth ? strokeWidth : 2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
