/**
 * CRM 3.0 — Premium Segment Card
 * Glassmorphism segment card with explicit text visibility.
 */

'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Target, Zap, Brain, Users, RefreshCw, Trash2, MoreHorizontal, ChevronRight,
  Clock, Activity,
} from 'lucide-react';

interface SegmentCardProps {
  segment: any;
  onOpen: (seg: any) => void;
  onRefresh: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  refreshing: string | null;
}

const TYPE_CONFIG: Record<string, {
  label: string;
  icon: React.ReactNode;
  badge: string;
  textColor: string;
}> = {
  manual: {
    label: 'Static',
    icon: <Users size={12} strokeWidth={2} />,
    badge: 'crm-seg-badge-static',
    textColor: '#7C3AED',
  },
  rule_based: {
    label: 'Dynamic',
    icon: <Activity size={12} strokeWidth={2} />,
    badge: 'crm-seg-badge-dynamic',
    textColor: '#22D3EE',
  },
  ai_assisted: {
    label: 'AI',
    icon: <Brain size={12} strokeWidth={2} />,
    badge: 'crm-seg-badge-ai',
    textColor: '#A78BFA',
  },
};

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function SegmentCard({
  segment, onOpen, onRefresh, onDelete, refreshing,
}: SegmentCardProps) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const type = TYPE_CONFIG[segment.type] ?? TYPE_CONFIG.manual;

  const handleDelete = async () => {
    if (!window.confirm(`Delete segment "${segment.name}"? This cannot be undone.`)) return;
    setActionsOpen(false);
    await onDelete(segment.id);
  };

  const handleRefresh = async () => {
    setActionsOpen(false);
    await onRefresh(segment.id);
  };

  return (
    <motion.div
      whileHover={{ y: -6 }}
      whileTap={{ scale: 0.98 }}
      className="relative overflow-hidden rounded-[20px] p-5 border border-[#rgba(255,255,255,0.14)] bg-[#FFFFFF] dark:bg-[#11182B] group transition-all duration-300"
    >
      {/* Ambient accent glow */}
      <div
        className={`absolute top-0 left-0 w-full h-1 rounded-t-[20px] ${type.textColor === '#7C3AED' ? 'bg-gradient-to-tr from-[#7C3AED] to-[#3B82F6]' : type.textColor === '#22D3EE' ? 'bg-gradient-to-tr from-[#22D3EE] to-[#3B82F6]' : 'bg-gradient-to-tr from-[#A78BFA] to-[#7C3AED]'}`}
      />

      {/* Hover ring */}
      <div
        className={`absolute inset-[-1px] rounded-[21px] p-[1px] pointer-events-none group-hover:opacity-50 ${type.textColor === '#7C3AED' ? 'bg-gradient-to-tr from-[#7C3AED] to-[#3B82F6]' : type.textColor === '#22D3EE' ? 'bg-gradient-to-tr from-[#22D3EE] to-[#3B82F6]' : 'bg-gradient-to-tr from-[#A78BFA] to-[#7C3AED]'}`}
        style={{
          WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'destination-out',
          maskComposite: 'exclude',
          opacity: 0,
          transition: 'opacity 300ms ease',
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg ${type.textColor === '#7C3AED' ? 'bg-gradient-to-tr from-[#7C3AED] to-[#3B82F6]' : type.textColor === '#22D3EE' ? 'bg-gradient-to-tr from-[#22D3EE] to-[#3B82F6]' : 'bg-gradient-to-tr from-[#A78BFA] to-[#7C3AED]'}`}
            style={{ color: '#fff' }}
          >
            {type.icon}
          </div>
          <div>
            <h3 className="font-bold text-[#F8FAFC] dark:text-[#F8FAFC] text-sm leading-tight group-hover:text-[#7C3AED] transition-colors">
              {segment.name}
            </h3>
            <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate max-w-[200px]">
              {segment.description ?? 'No description'}
            </p>
          </div>
        </div>
        <button
          onClick={() => setActionsOpen(!actionsOpen)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[#64748B] dark:text-[#94A3B8] hover:bg-[#1E293B] transition-colors"
        >
          <MoreHorizontal size={14} strokeWidth={2} />
        </button>
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold border ${type.badge} text-[#F8FAFC]`}>
            {type.label}
          </span>
          <span className="text-[10px] font-bold text-[#F8FAFC]">· {segment.contact_count} contacts</span>
        </div>
        <div className="flex items-end gap-1">
          <span className="text-2xl font-bold text-[#F8FAFC]">{segment.contact_count}</span>
          <span className="text-[10px] text-[#64748B] dark:text-[#94A3B8]">total</span>
        </div>
      </div>

      {/* Conditions preview */}
      <div className="mb-4">
        <p className="text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider mb-1">Rules</p>
        <div className="flex items-center gap-1.5 text-xs">
          {(segment.rules || []).slice(0, 3).map((r: any) => (
            <span key={r.id} className="px-2 py-1 rounded border border-[#rgba(255,255,255,0.14)] bg-[#11182B] dark:bg-[#1E293B] text-[#F8FAFC] dark:text-[#F8FAFC]">
              {r.field} {r.operator.replace(/_/g, ' ')} "{r.value ?? '—'}"
            </span>
          ))}
          {(segment.rules || []).length > 3 && (
            <span className="px-2 py-1 rounded border border-[#rgba(255,255,255,0.14)] bg-[#11182B] dark:bg-[#1E293B] text-[#64748B] dark:text-[#94A3B8] text-[10px]">
              +{(segment.rules as any[]).length - 3} more
            </span>
          )}
          {(segment.rules || []).length === 0 && (
            <span className="px-2 py-1 rounded border border-[#rgba(255,255,255,0.14)] bg-[#11182B] dark:bg-[#1E293B] text-[#64748B] dark:text-[#94A3B8] text-[10px]">
              No rules
            </span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-[#rgba(255,255,255,0.14)] mt-auto">
        <div className="flex items-center gap-2">
          <Clock size={11} strokeWidth={2} className="text-[#64748B] dark:text-[#94A3B8]" />
          <span className="text-[10px] text-[#64748B] dark:text-[#94A3B8]">
            Updated {timeAgo(segment.updated_at)}
          </span>
        </div>
        <button
          onClick={() => onOpen(segment)}
          className="flex items-center gap-1.5 text-[11px] font-bold text-[#3B82F6] group-hover:text-[#7C3AED] transition-colors"
        >
          Open <ChevronRight size={12} strokeWidth={2} />
        </button>
      </div>

      {/* Actions dropdown */}
      <AnimatePresence>
        {actionsOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute right-0 top-14 w-48 rounded-xl border border-[#rgba(255,255,255,0.14)] bg-[#FFFFFF] dark:bg-[#11182B] backdrop-blur shadow-xl p-2 z-20"
          >
            <button
              onClick={handleRefresh}
              disabled={refreshing === segment.id}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left rounded-lg text-[12px] text-[#F8FAFC] dark:text-[#F8FAFC] hover:bg-[#1E293B] transition-colors disabled:opacity-50"
            >
              {refreshing === segment.id ? (
                <RefreshCw size={12} strokeWidth={2} className="animate-spin" />
              ) : (
                <RefreshCw size={12} strokeWidth={2} />
              )}
              Refresh
            </button>
            <button
              onClick={handleDelete}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left rounded-lg text-[12px] text-[#FCA5A5] hover:bg-[#FEE2E2] transition-colors"
            >
              <Trash2 size={12} strokeWidth={2} /> Delete
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
