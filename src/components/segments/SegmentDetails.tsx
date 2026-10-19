/**
 * CRM 3.0 — Premium Segment Details Drawer
 * Glassmorphism drawer with explicit text visibility.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Users, RefreshCw, ArrowRight, Tag, Clock, Activity, Zap, Trash2, ChevronRight,
} from 'lucide-react';

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

interface SegmentDetailsProps {
  segment: any;
  open: boolean;
  onClose: () => void;
  onRefresh: (id: string) => Promise<void>;
  onMembershipChange: (id: string, action: 'add' | 'remove', contactIds: string[]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const TYPE_CONFIG: Record<string, {
  label: string;
  icon: React.ReactNode;
  gradient: string;
  textColor: string;
  badge: string;
}> = {
  manual: {
    label: 'Static',
    icon: <Users size={12} strokeWidth={2} />,
    gradient: 'bg-gradient-to-tr from-[#7C3AED] to-[#3B82F6]',
    textColor: 'text-[#7C3AED]',
    badge: 'border-[#7C3AED]/20 bg-[#7C3AED]/10 text-[#7C3AED]',
  },
  rule_based: {
    label: 'Dynamic',
    icon: <Activity size={12} strokeWidth={2} />,
    gradient: 'bg-gradient-to-tr from-[#22D3EE] to-[#3B82F6]',
    textColor: 'text-[#22D3EE]',
    badge: 'border-[#22D3EE]/20 bg-[#22D3EE]/10 text-[#22D3EE]',
  },
  ai_assisted: {
    label: 'AI',
    icon: <Zap size={12} strokeWidth={2} />,
    gradient: 'bg-gradient-to-tr from-[#A78BFA] to-[#7C3AED]',
    textColor: 'text-[#A78BFA]',
    badge: 'border-[#A78BFA]/20 bg-[#A78BFA]/10 text-[#A78BFA]',
  },
};

export default function SegmentDetails({
  segment, open, onClose, onRefresh, onMembershipChange, onDelete,
}: SegmentDetailsProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const fetchContacts = useCallback(async () => {
    if (!segment?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v3/segments/${segment.id}/contacts?limit=${limit}&offset=${offset}`);
      if (!res.ok) throw new Error('Failed to load contacts');
      const d = await res.json();
      setContacts(d.contacts ?? []);
      setTotal(d.total ?? 0);
      setHasMore(d.has_more ?? false);
    } catch (err) {
      console.error('[SegmentDetails] Failed to load contacts:', err);
    } finally {
      setLoading(false);
    }
  }, [segment?.id, limit, offset]);

  useEffect(() => {
    if (open) void fetchContacts();
  }, [open, fetchContacts]);

  const toggleContact = (id: string) => {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isSelected = (id: string) => selectedContactIds.has(id);

  const handleMembershipChange = async (action: 'add' | 'remove') => {
    const ids = Array.from(selectedContactIds);
    if (ids.length === 0) return;
    await onMembershipChange(segment.id, action, ids);
    setSelectedContactIds(new Set());
    void fetchContacts();
  };

  const handleDeleteSegment = async () => {
    setDeleting(true);
    try {
      await onDelete(segment.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  if (!open || !segment) return null;

  const typeMeta = TYPE_CONFIG[segment.type] ?? TYPE_CONFIG.manual;
  const timeAgo = (iso: string | null) => {
    if (!iso) return '—';
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed inset-0 z-50 flex items-end px-4 pb-4"
          >
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              className="relative z-10 w-full max-w-2xl bg-[#FFFFFF] dark:bg-[#11182B] rounded-t-[32px] border border-[#rgba(255,255,255,0.14)] shadow-2xl flex flex-col overflow-hidden"
              style={{ maxHeight: '85vh' }}
            >
              {/* Handle */}
              <div className="w-12 h-1.5 rounded-full bg-[#64748B] dark:bg-[#94A3B8] mx-auto mt-3 mb-2" />

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-[#rgba(255,255,255,0.14)] bg-[#FFFFFF] dark:bg-[#11182B] backdrop-blur z-10 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg ${typeMeta.gradient}`} style={{ color: '#fff' }}>
                    {typeMeta.icon}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-[#F8FAFC] dark:text-[#F8FAFC] leading-tight">{segment.name}</h2>
                    <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">{segment.description ?? 'No description'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold border ${typeMeta.badge}`}>
                    {typeMeta.label}
                  </span>
                  <button onClick={onClose} className="w-8 h-8 rounded-xl hover:bg-[#1E293B] flex items-center justify-center text-[#64748B] dark:text-[#94A3B8] transition-colors">
                    <X size={18} strokeWidth={2} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Meta cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-[16px] p-4 border border-[#rgba(255,255,255,0.14)] bg-[#FFFFFF] dark:bg-[#11182B]">
                    <div className="text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider mb-2">Type</div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${typeMeta.badge}`}>
                        {typeMeta.label}
                      </span>
                      <span className="text-[10px] text-[#64748B] dark:text-[#94A3B8]">segment</span>
                    </div>
                  </div>
                  <div className="rounded-[16px] p-4 border border-[#rgba(255,255,255,0.14)] bg-[#FFFFFF] dark:bg-[#11182B]">
                    <div className="text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider mb-2">Matching Contacts</div>
                    <div className="text-2xl font-bold text-[#F8FAFC] dark:text-[#F8FAFC]">{total}</div>
                  </div>
                  <div className="rounded-[16px] p-4 border border-[#rgba(255,255,255,0.14)] bg-[#FFFFFF] dark:bg-[#11182B]">
                    <div className="text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider mb-2">Last Calculated</div>
                    <div className="text-[11px] text-[#F8FAFC] dark:text-[#F8FAFC]">{timeAgo(segment.last_computed_at)}</div>
                  </div>
                </div>

                {/* Rule summary */}
                {segment.rules && segment.rules.length > 0 && (
                  <div className="rounded-[16px] p-5 border border-[#rgba(255,255,255,0.14)] bg-[#FFFFFF] dark:bg-[#11182B]">
                    <div className="flex items-center gap-2 mb-4">
                      <Activity size={14} strokeWidth={2} className="text-[#3B82F6]" />
                      <h4 className="text-xs font-bold text-[#F8FAFC] dark:text-[#F8FAFC] uppercase tracking-wider">Rule Summary</h4>
                    </div>
                    <div className="space-y-2">
                      {segment.rules.map((c: any, i: number) => (
                        <div key={i} className="flex items-start gap-2.5">
                          <div className="w-1 h-1 rounded-full bg-[#3B82F6] mt-[7px] flex-shrink-0" />
                          <div className="flex-1">
                            <span className="font-medium text-[#F8FAFC] dark:text-[#F8FAFC]">{c.field}</span>
                            <span className="text-[10px] text-[#64748B] dark:text-[#94A3B8]">{c.operator.replace(/_/g, ' ')}</span>
                            <span className="font-medium text-[#F8FAFC] dark:text-[#F8FAFC]">"{c.value ?? '—'}"</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Contacts list */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Users size={14} strokeWidth={2} className="text-[#64748B] dark:text-[#94A3B8]" />
                      <h4 className="text-sm font-bold text-[#F8FAFC] dark:text-[#F8FAFC]">Contacts ({total})</h4>
                    </div>
                    {selectedContactIds.size > 0 && (
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border text-[#FCA5A5] border-[#FCA5A5]/20`}>
                          {selectedContactIds.size} selected
                        </span>
                        <button
                          onClick={() => handleMembershipChange(segment.type === 'manual' ? 'remove' : 'add')}
                          disabled={segment.type !== 'manual' || deleting}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                            segment.type === 'manual'
                              ? 'border-[#FCA5A5] bg-[#FCA5A5]/10 text-[#FCA5A5] hover:bg-[#FCA5A5]/20'
                              : 'border-[#3B82F6] bg-[#3B82F6]/10 text-[#3B82F6] hover:bg-[#3B82F6]/20 disabled:opacity-50'
                          }`}
                        >
                          {segment.type === 'manual' ? 'Remove from Segment' : 'Add to Segment'}
                        </button>
                      </div>
                    )}
                    <button
                      onClick={() => void onRefresh(segment.id)}
                      disabled={deleting}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-[#3B82F6] hover:bg-[#1E293B] transition-colors disabled:opacity-50"
                    >
                      {deleting ? <RefreshCw size={12} strokeWidth={2} className="animate-spin" /> : <RefreshCw size={12} strokeWidth={2} />}
                    </button>
                  </div>

                  {loading ? (
                    <div className="h-48 flex flex-col items-center justify-center text-[#64748B] dark:text-[#94A3B8]">
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                        <RefreshCw size={20} strokeWidth={2} className="text-[#3B82F6] opacity-60" />
                      </motion.div>
                      <p className="mt-2 text-[11px]">Loading contacts…</p>
                    </div>
                  ) : contacts.length === 0 ? (
                    <div className="h-48 flex flex-col items-center justify-center text-[#64748B] dark:text-[#94A3B8]">
                      <Users size={28} className="mb-3 opacity-30" />
                      <p className="text-[11px]">No contacts in this segment</p>
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-[16px] border border-[#rgba(255,255,255,0.14)] bg-[#11182B] dark:bg-[#1E293B]">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-[#rgba(255,255,255,0.14)] bg-[#11182B] dark:bg-[#1E293B]">
                            <th className="px-4 py-3 text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider w-8"></th>
                            <th className="px-4 py-3 text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider">Name</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider">Email</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider">Phone</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider">Status</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider text-right">Score</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#rgba(255,255,255,0.14)]">
                          {contacts.map((c) => (
                            <tr key={c.id} className="hover:bg-[#1E293B]/50 transition-colors group">
                              <td className="px-4 py-3">
                                <input
                                  type="checkbox"
                                  checked={isSelected(c.id)}
                                  onChange={() => toggleContact(c.id)}
                                  className="w-4 h-4 rounded border-[#64748B] dark:border-[#94A3B8] text-[#3B82F6] focus:ring-[#3B82F6] bg-[#FFFFFF] dark:bg-[#11182B] accent-[#3B82F6]"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full flex items-center justify-center bg-[#64748B] dark:bg-[#94A3B8] text-[#F8FAFC] dark:text-[#F8FAFC] text-[10px] font-bold">
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
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                  c.lead_status === 'won' ? 'bg-[#34D399]/10 text-[#34D399] border border-[#34D399]/20' :
                                  c.lead_status === 'lost' ? 'bg-[#FCA5A5]/10 text-[#FCA5A5] border border-[#FCA5A5]/20' :
                                  c.lead_status === 'qualified' ? 'bg-[#FBBF24]/10 text-[#FBBF24] border border-[#FBBF24]/20' :
                                  'bg-[#64748B]/10 text-[#64748B] border border-[#64748B]/20'
                                }`}>
                                  {c.lead_status ?? '—'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="text-sm font-medium text-[#F8FAFC] dark:text-[#F8FAFC]">
                                  {c.lead_score !== null && c.lead_score !== undefined ? c.lead_score : '—'}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {hasMore && (
                    <button
                      onClick={() => setOffset((o) => o + limit)}
                      className="w-full py-3 rounded-xl border border-[#rgba(255,255,255,0.14)] bg-[#11182B] dark:bg-[#1E293B] text-[11px] font-bold text-[#F8FAFC] dark:text-[#F8FAFC] hover:bg-[#1E293B] transition-colors"
                    >
                      <ChevronRight size={14} strokeWidth={2} className="mr-2" /> Load More
                    </button>
                  )}
                </div>
              </div>

              {/* Footer actions */}
              <div className="border-t border-[#rgba(255,255,255,0.14)] bg-[#FFFFFF] dark:bg-[#11182B] backdrop-blur p-6 flex items-center justify-between gap-3 z-10">
                <button
                  onClick={onClose}
                  className="flex-1 px-5 py-3 rounded-xl border border-[#rgba(255,255,255,0.14)] bg-[#11182B] dark:bg-[#1E293B] text-[#F8FAFC] dark:text-[#F8FAFC] text-sm font-medium hover:bg-[#1E293B] transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={handleDeleteSegment}
                  disabled={deleting}
                  className="px-5 py-3 rounded-xl border border-transparent bg-[#B91C1C] text-white text-sm font-bold shadow-lg hover:bg-[#B91C1C]/90 transition-all disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Delete Segment'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
