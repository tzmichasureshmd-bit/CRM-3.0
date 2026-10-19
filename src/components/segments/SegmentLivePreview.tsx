/**
 * CRM 3.0 — Premium Segment Live Audience Preview
 * Glassmorphism preview with explicit text visibility.
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Users, AlertCircle, Clock, Zap, ChevronRight } from 'lucide-react';

interface Contact {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  lead_status: string | null;
  lead_score: number | null;
  lead_score_tier: string | null;
  tags: string[] | null;
  created_at: string;
}

interface SegmentLivePreviewProps {
  segmentId: string;
  rules: any[];
  segmentType: string;
}

export default function SegmentLivePreview({ segmentId, rules, segmentType }: SegmentLivePreviewProps) {
  const [preview, setPreview] = useState<{
    matching_count: number;
    sample_contacts: Contact[];
    calculated_at: string | null;
    message: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPreview = useCallback(async () => {
    if (!segmentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v3/segments/${segmentId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules, limit: 50 }),
      });
      if (!res.ok) throw new Error('Preview failed');
      const d = await res.json();
      setPreview({
        matching_count: d.matching_count ?? 0,
        sample_contacts: d.sample_contacts ?? [],
        calculated_at: d.calculated_at ?? null,
        message: d.message ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to calculate preview');
    } finally {
      setLoading(false);
    }
  }, [segmentId, JSON.stringify(rules)]);

  useEffect(() => {
    void fetchPreview();
  }, [fetchPreview]);

  const timeAgo = (iso: string | null) => {
    if (!iso) return '—';
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const STATUS_CONFIG: Record<string, { bg: string; text: string; border: string }> = {
    won:   { bg: 'bg-[#34D399]/10', text: 'text-[#34D399]', border: 'border-[#34D399]/20' },
    lost:  { bg: 'bg-[#FCA5A5]/10', text: 'text-[#FCA5A5]', border: 'border-[#FCA5A5]/20' },
    qualified: { bg: 'bg-[#FBBF24]/10', text: 'text-[#FBBF24]', border: 'border-[#FBBF24]/20' },
    default: { bg: 'bg-[#64748B]/10', text: 'text-[#64748B]', border: 'border-[#64748B]/20' },
  };

  if (loading) {
    return (
      <div className="relative rounded-[24px] p-8 flex flex-col items-center justify-center py-16 text-[#64748B] dark:text-[#94A3B8] border border-[#rgba(255,255,255,0.14)] bg-[#FFFFFF] dark:bg-[#11182B]">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
          <RefreshCw size={28} strokeWidth={2} className="text-[#3B82F6] opacity-60" />
        </motion.div>
        <p className="mt-4 text-[12px] font-medium text-[#F8FAFC] dark:text-[#F8FAFC]">Calculating audience preview…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="relative rounded-[24px] p-8 flex flex-col items-center justify-center py-16 border border-[#rgba(255,255,255,0.14)] bg-[#FFFFFF] dark:bg-[#11182B]">
        <AlertCircle size={32} className="mb-3 text-[#FCA5A5] opacity-60" />
        <p className="text-[11px] text-[#FCA5A5] font-medium mb-3">{error}</p>
        <button
          onClick={() => void fetchPreview()}
          className="px-5 py-2 rounded-xl border border-[#rgba(255,255,255,0.14)] bg-[#FFFFFF] dark:bg-[#11182B] text-[#3B82F6] text-[11px] font-medium hover:bg-[#3B82F6]/10 transition-colors"
        >
          <RefreshCw size={14} strokeWidth={2} className="mr-2" />
          Retry
        </button>
      </div>
    );
  }

  if (!preview) return null;

  const { matching_count, sample_contacts, calculated_at, message } = preview;

  return (
    <div className="relative rounded-[24px] p-6 border border-[#rgba(255,255,255,0.14)] bg-[#FFFFFF] dark:bg-[#11182B] shadow-2xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap size={14} strokeWidth={2} className="text-[#3B82F6]" />
            <h3 className="text-sm font-bold text-[#F8FAFC] dark:text-[#F8FAFC]">Live Audience Preview</h3>
          </div>
          <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">Based on current contact data</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider">Last calculated</span>
          <span className="text-[11px] text-[#F8FAFC] dark:text-[#F8FAFC]">{timeAgo(calculated_at)}</span>
        </div>
      </div>

      {/* Count banner */}
      <div className="relative rounded-[16px] p-4 flex items-center justify-between border border-[#rgba(255,255,255,0.14)] bg-[#11182B] dark:bg-[#1E293B]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#3B82F6]/10 text-[#3B82F6]">
            <Users size={16} strokeWidth={2} />
          </div>
          <div>
            <div className="text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider">Matching Contacts</div>
            <div className="text-2xl font-bold text-[#F8FAFC] dark:text-[#F8FAFC]">{matching_count}</div>
          </div>
        </div>
        {message && (
          <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">{message}</span>
        )}
      </div>

      {/* Sample contacts */}
      <div className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#rgba(255,255,255,0.14)] bg-[#11182B] dark:bg-[#1E293B]">
                <th className="px-4 py-3 text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider">Contact</th>
                <th className="px-4 py-3 text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider">Email</th>
                <th className="px-4 py-3 text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider">Phone</th>
                <th className="px-4 py-3 text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider text-right">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#rgba(255,255,255,0.14)]">
              {sample_contacts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <Clock size={24} className="mb-2 text-[#64748B] dark:text-[#94A3B8] opacity-40" />
                      <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">No matching contacts found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                <AnimatePresence>
                  {sample_contacts.map((c, i) => (
                    <motion.tr
                      key={c.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="hover:bg-[#1E293B]/50 transition-colors border-b border-[#rgba(255,255,255,0.14)] last:border-0"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center bg-[#3B82F6]/10 text-[#3B82F6] text-[10px] font-bold">
                            {c.name?.charAt(0)?.toUpperCase() ?? '?'}
                          </div>
                          <div className="text-sm font-medium text-[#F8FAFC] dark:text-[#F8FAFC]">{c.name ?? 'Unnamed contact'}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-[#F8FAFC] dark:text-[#F8FAFC]">{c.email ?? '—'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-[#F8FAFC] dark:text-[#F8FAFC]">{c.phone ?? '—'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${c.lead_status ? STATUS_CONFIG[c.lead_status]?.bg ?? STATUS_CONFIG.default.bg : STATUS_CONFIG.default.bg} ${c.lead_status ? STATUS_CONFIG[c.lead_status]?.text ?? STATUS_CONFIG.default.text : STATUS_CONFIG.default.text} ${c.lead_status ? STATUS_CONFIG[c.lead_status]?.border ?? STATUS_CONFIG.default.border : STATUS_CONFIG.default.border}`}>
                          {c.lead_status ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="text-sm font-medium text-[#F8FAFC] dark:text-[#F8FAFC]">
                          {c.lead_score !== null && c.lead_score !== undefined ? c.lead_score : '—'}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {sample_contacts.length > 0 && matching_count > sample_contacts.length && (
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">Showing {sample_contacts.length} of {matching_count} matching contacts</span>
          <button
            onClick={() => void fetchPreview()}
            className="flex items-center gap-1 text-[11px] font-bold text-[#3B82F6] transition-colors"
          >
            Refresh <ChevronRight size={12} strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  );
}
