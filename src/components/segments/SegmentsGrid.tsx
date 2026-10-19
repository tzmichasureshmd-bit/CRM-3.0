/**
 * CRM 3.0 — Segments Grid
 * Premium glassmorphism grid of segment cards with explicit text visibility.
 */

'use client';

import { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Search, Filter, RefreshCw, Grid, List, Users, ArrowRight, Activity, Brain,
} from 'lucide-react';

import SegmentCard from '@/components/segments/SegmentCard';

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

interface SegmentsGridProps {
  segments: Segment[];
  onOpen: (seg: Segment) => void;
  onRefresh: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  refreshing: string | null;
}

export default function SegmentsGrid({
  segments, onOpen, onRefresh, onDelete, refreshing,
}: SegmentsGridProps) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'manual' | 'rule_based' | 'ai_assisted'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'contact_count' | 'updated_at'>('updated_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const filtered = useMemo(() => {
    const list = segments.filter((s) => {
      const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase());
      const matchesType = typeFilter === 'all' || s.type === typeFilter;
      return matchesSearch && matchesType;
    });

    const sorted = [...list].sort((a, b) => {
      let av: any = a[sortBy as keyof Segment];
      let bv: any = b[sortBy as keyof Segment];
      if (sortBy === 'updated_at') {
        av = new Date(av).getTime();
        bv = new Date(bv).getTime();
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [segments, search, typeFilter, sortBy, sortDir]);

  return (
    <div className="relative rounded-[24px] p-6 border border-[#rgba(255,255,255,0.14)] bg-[#FFFFFF] dark:bg-[#11182B] shadow-2xl">
      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row gap-4 items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#64748B] dark:text-[#94A3B8]" />
            <input
              type="text"
              placeholder="Search segments…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#rgba(255,255,255,0.14)] bg-[#FFFFFF] dark:bg-[#11182B] text-[#F8FAFC] dark:text-[#F8FAFC] text-sm outline-none focus:ring-2 focus:ring-[#3B82F6]/20 transition-all placeholder-[#94A3B8] dark:placeholder-[#64748B]"
            />
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-2 rounded-xl border text-[11px] font-bold transition-colors ${
                typeFilter === 'all'
                  ? 'border-[#3B82F6] bg-[#3B82F6]/10 text-[#3B82F6]'
                  : 'border-[#rgba(255,255,255,0.14)] bg-[#11182B] dark:bg-[#1E293B] text-[#A8B5CA] hover:border-[#3B82F6]/30'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setTypeFilter('rule_based')}
              className={`px-3 py-2 rounded-xl border text-[11px] font-bold transition-colors ${
                typeFilter === 'rule_based'
                  ? 'border-[#22D3EE] bg-[#22D3EE]/10 text-[#22D3EE]'
                  : 'border-[#rgba(255,255,255,0.14)] bg-[#11182B] dark:bg-[#1E293B] text-[#A8B5CA] hover:border-[#22D3EE]/30'
              }`}
            >
              Dynamic
            </button>
            <button
              onClick={() => setTypeFilter('manual')}
              className={`px-3 py-2 rounded-xl border text-[11px] font-bold transition-colors ${
                typeFilter === 'manual'
                  ? 'border-[#7C3AED] bg-[#7C3AED]/10 text-[#7C3AED]'
                  : 'border-[#rgba(255,255,255,0.14)] bg-[#11182B] dark:bg-[#1E293B] text-[#A8B5CA] hover:border-[#7C3AED]/30'
              }`}
            >
              Static
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value as any); setSortDir('desc'); }}
            className="w-full max-w-xs px-3 py-2 rounded-xl border border-[#rgba(255,255,255,0.14)] bg-[#FFFFFF] dark:bg-[#11182B] text-[#F8FAFC] dark:text-[#F8FAFC] text-[11px] outline-none focus:ring-2 focus:ring-[#3B82F6]/20"
          >
            <option value="updated_at">Recently Updated</option>
            <option value="name">Name (A-Z)</option>
            <option value="contact_count">Contact Count</option>
          </select>
          <button
            onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
            className="w-9 h-9 rounded-xl border border-[#rgba(255,255,255,0.14)] bg-[#FFFFFF] dark:bg-[#11182B] flex items-center justify-center text-[#F8FAFC] dark:text-[#F8FAFC] hover:bg-[#1E293B] transition-colors"
          >
            <ArrowRight size={12} strokeWidth={2} className={sortDir === 'asc' ? '-rotate-90' : ''} />
          </button>
          <button
            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            className="w-9 h-9 rounded-xl border border-[#rgba(255,255,255,0.14)] bg-[#FFFFFF] dark:bg-[#11182B] flex items-center justify-center text-[#F8FAFC] dark:text-[#F8FAFC] hover:bg-[#1E293B] transition-colors"
            title={viewMode === 'grid' ? 'List view' : 'Grid view'}
          >
            {viewMode === 'grid' ? <List size={14} strokeWidth={2} /> : <Grid size={14} strokeWidth={2} />}
          </button>
          <button
            onClick={() => void onRefresh?.('all')}
            className="w-9 h-9 rounded-xl border border-[#rgba(255,255,255,0.14)] bg-[#FFFFFF] dark:bg-[#11182B] flex items-center justify-center text-[#3B82F6] hover:bg-[#3B82F6]/10 transition-colors"
            title="Refresh all"
          >
            <RefreshCw size={12} strokeWidth={2} className="animate-spin" />
          </button>
        </div>
      </div>

      {/* Results count */}
      <div className="flex items-center gap-2 mb-4">
        <Users size={14} strokeWidth={2} className="text-[#64748B] dark:text-[#94A3B8]" />
        <span className="text-[12px] font-bold text-[#F8FAFC] dark:text-[#F8FAFC]">{filtered.length}</span>
        <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">segments</span>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center text-center py-12">
          <div className="w-16 h-16 rounded-full bg-[#11182B] dark:bg-[#1E293B] flex items-center justify-center mb-4 border border-[#rgba(255,255,255,0.14)]">
            <Filter size={24} strokeWidth={2} className="text-[#64748B] dark:text-[#94A3B8] opacity-40" />
          </div>
          <h3 className="text-lg font-bold text-[#F8FAFC] dark:text-[#F8FAFC] mb-2">No segments found</h3>
          <p className="text-[#64748B] dark:text-[#94A3B8] text-sm mb-6">
            {search ? 'Try adjusting your search or filters.' : 'Create your first segment to start grouping contacts.'}
          </p>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="px-6 py-2 rounded-xl border border-[#rgba(255,255,255,0.14)] bg-[#FFFFFF] dark:bg-[#11182B] text-[#3B82F6] text-[11px] font-medium hover:bg-[#1E293B] transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Grid */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((seg) => (
            <SegmentCard
              key={seg.id}
              segment={seg}
              onOpen={onOpen}
              onRefresh={onRefresh}
              onDelete={onDelete}
              refreshing={refreshing}
            />
          ))}
        </div>
      )}

      {/* List */}
      {viewMode === 'list' && (
        <div className="space-y-2">
          {filtered.map((seg) => (
            <motion.div
              key={seg.id}
              whileHover={{ x: -4 }}
              className="rounded-[16px] p-4 flex items-center justify-between gap-4 border border-[#rgba(255,255,255,0.14)] bg-[#FFFFFF] dark:bg-[#11182B]"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shadow-md ${seg.type === 'rule_based' ? 'bg-[#22D3EE]/20 text-[#22D3EE]' : seg.type === 'manual' ? 'bg-[#7C3AED]/20 text-[#7C3AED]' : 'bg-[#A78BFA]/20 text-[#A78BFA]'}`}
                  style={{ color: seg.type === 'rule_based' ? '#22D3EE' : seg.type === 'manual' ? '#7C3AED' : '#A78BFA' }}
                >
                  {seg.type === 'rule_based' ? <Activity size={10} strokeWidth={2} /> : seg.type === 'manual' ? <Users size={10} strokeWidth={2} /> : <Brain size={10} strokeWidth={2} />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h4 className="font-bold text-[#F8FAFC] dark:text-[#F8FAFC] text-sm truncate">{seg.name}</h4>
                    <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold border ${
                      seg.type === 'rule_based' ? 'border-[#22D3EE]/20 bg-[#22D3EE]/10 text-[#22D3EE]' :
                      seg.type === 'manual' ? 'border-[#7C3AED]/20 bg-[#7C3AED]/10 text-[#7C3AED]' :
                      'border-[#A78BFA]/20 bg-[#A78BFA]/10 text-[#A78BFA]'
                    }`}>
                      {seg.type === 'rule_based' ? 'Dynamic' : seg.type === 'manual' ? 'Static' : 'AI'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate">{seg.description ?? 'No description'}</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className="text-lg font-bold text-[#F8FAFC] dark:text-[#F8FAFC]">{seg.contact_count}</div>
                <div className="text-[10px] text-[#64748B] dark:text-[#94A3B8]">contacts</div>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={() => void onRefresh(seg.id)}
                  disabled={refreshing === seg.id}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[#3B82F6] hover:bg-[#3B82F6]/10 transition-colors disabled:opacity-50"
                  title="Refresh"
                >
                  {refreshing === seg.id ? <RefreshCw size={10} strokeWidth={2} className="animate-spin" /> : <RefreshCw size={10} strokeWidth={2} />}
                </button>
                <button
                  onClick={() => onOpen(seg)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[#A8B5CA] hover:bg-[#1E293B] transition-colors"
                  title="Open"
                >
                  <ChevronIcon strokeWidth={12} />
                </button>
                <button
                  onClick={() => void onDelete(seg.id)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[#FCA5A5] hover:bg-[#FCA5A5]/10 transition-colors"
                  title="Delete"
                >
                  <TrashIcon strokeWidth={12} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChevronIcon({ className, strokeWidth }: { className?: string; strokeWidth?: number }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width={strokeWidth ? strokeWidth : 16} height={strokeWidth ? strokeWidth : 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth ? strokeWidth : 2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function TrashIcon({ className, strokeWidth }: { className?: string; strokeWidth?: number }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width={strokeWidth ? strokeWidth : 16} height={strokeWidth ? strokeWidth : 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth ? strokeWidth : 2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
