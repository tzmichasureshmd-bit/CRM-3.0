/**
 * CRM 3.0 — Segments Table
 * Searchable, sortable, paginated table of segments with actions.
 */

'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Search, Users, Filter, RefreshCw, Trash2, Play, Pause, Edit, Copy, ArrowRight, Clock,
} from 'lucide-react';

interface Segment {
  id: string;
  name: string;
  description: string | null;
  type: 'manual' | 'rule_based' | 'ai_assisted';
  contact_count: number;
  last_computed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SegmentsTableProps {
  segments: Segment[];
  onRefresh: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onToggleStatus?: (id: string, active: boolean) => Promise<void>;
}

const TYPE_META: Record<string, { label: string; color: string }> = {
  manual:      { label: 'Static', color: '#8790aa' },
  rule_based:  { label: 'Dynamic', color: '#28c99a' },
  ai_assisted: { label: 'AI', color: '#8b5cf6' },
};

export default function SegmentsTable({
  segments,
  onRefresh,
  onDelete,
  onToggleStatus,
}: SegmentsTableProps) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'manual' | 'rule_based' | 'ai_assisted'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'contact_count' | 'updated_at'>('updated_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const filtered = useMemo(() => {
    const list = segments.filter((s) => {
      const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase());
      const matchesType = typeFilter === 'all' || s.type === typeFilter;
      return matchesSearch && matchesType;
    });

    list.sort((a, b) => {
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

    return list;
  }, [segments, search, typeFilter, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this segment? This cannot be undone.')) return;
    await onDelete(id);
  };

  const handleRefresh = async (id: string) => {
    await onRefresh(id);
  };

  return (
    <div className="rounded-2xl border border-crm-border/30 bg-crm-card-bg shadow-sm overflow-hidden">
      {/* Toolbar */}
      <div className="px-6 py-4 border-b border-crm-border/20 bg-crm-card-bg/80 backdrop-blur flex flex-col lg:flex-row gap-4 items-center">
        <div className="flex-1 min-w-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-crm-muted" />
            <input
              type="text"
              placeholder="Search segments by name..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-crm-border/30 bg-crm-bg/50 text-sm text-crm-text outline-none focus:ring-2 focus:ring-crm-primary/20"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value as any); setPage(1); }}
            className="px-3 py-2 rounded-xl border border-crm-border/30 bg-crm-bg/50 text-[11px] text-crm-text outline-none focus:ring-2 focus:ring-crm-primary/20"
          >
            <option value="all">All Types</option>
            <option value="manual">Static</option>
            <option value="rule_based">Dynamic</option>
            <option value="ai_assisted">AI</option>
          </select>
          <button
            onClick={() => void onRefresh?.('all')}
            className="px-3 py-2 rounded-lg border border-crm-border/30 bg-crm-bg/50 text-[11px] font-medium text-crm-text hover:bg-crm-accent transition-colors"
            title="Refresh all dynamic segments"
          >
            <RefreshCw size={14} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-crm-border/20 bg-crm-card-bg/50">
              <th className="px-4 py-3 text-[10px] font-bold text-crm-muted uppercase tracking-wider cursor-pointer hover:text-crm-primary" onClick={() => {
                if (sortBy === 'name') setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                setSortBy('name');
              }}>
                Segment Name
                {sortBy === 'name' && <ArrowRight size={10} className="ml-1" />}
              </th>
              <th className="px-4 py-3 text-[10px] font-bold text-crm-muted uppercase tracking-wider">Type</th>
              <th className="px-4 py-3 text-[10px] font-bold text-crm-muted uppercase tracking-wider cursor-pointer hover:text-crm-primary" onClick={() => {
                if (sortBy === 'contact_count') setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                setSortBy('contact_count');
              }}>
                Matching Contacts
                {sortBy === 'contact_count' && <ArrowRight size={10} className="ml-1" />}
              </th>
              <th className="px-4 py-3 text-[10px] font-bold text-crm-muted uppercase tracking-wider">Created By</th>
              <th className="px-4 py-3 text-[10px] font-bold text-crm-muted uppercase tracking-wider cursor-pointer hover:text-crm-primary" onClick={() => {
                if (sortBy === 'updated_at') setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                setSortBy('updated_at');
              }}>
                Last Updated
                {sortBy === 'updated_at' && <ArrowRight size={10} className="ml-1" />}
              </th>
              <th className="px-4 py-3 text-[10px] font-bold text-crm-muted uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-crm-border/10">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-crm-muted">
                  {filtered.length === 0 ? (
                    <>
                      <Filter size={24} className="mb-3 opacity-20" />
                      <p className="text-[11px]">No segments match your filters</p>
                    </>
                  ) : (
                    <>
                      <Clock size={24} className="mb-3 opacity-20" />
                      <p className="text-[11px]">No segments on this page</p>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              paginated.map((seg) => {
                const tm = TYPE_META[seg.type] ?? TYPE_META.manual;
                const timeAgo = (iso: string) => {
                  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
                  if (diff < 60) return 'just now';
                  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
                  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
                  return `${Math.floor(diff / 86400)}d ago`;
                };
                return (
                  <tr key={seg.id} className="hover:bg-crm-accent/50 transition-colors group">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-crm-text">{seg.name}</div>
                      {seg.description && (
                        <div className="text-[11px] text-crm-muted truncate max-w-[200px]">{seg.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${tm.color}10 ${tm.color} border-${tm.color === '#8790aa' ? 'crm-muted' : tm.color === '#28c99a' ? 'crm-success' : 'crm-purple'}/20`}
                      >
                        {tm.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-crm-text">{seg.contact_count}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-crm-text">You</div>
                      <div className="text-[10px] text-crm-muted">{timeAgo(seg.created_at)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-crm-text">{timeAgo(seg.updated_at)}</div>
                      {seg.last_computed_at && (
                        <div className="text-[10px] text-crm-muted">calc: {timeAgo(seg.last_computed_at)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => void handleRefresh(seg.id)}
                          className="w-7 h-7 rounded-lg bg-crm-bg/50 hover:bg-crm-primary/10 flex items-center justify-center text-crm-primary transition-colors" title="Refresh membership"
                        >
                          <RefreshCw size={12} strokeWidth={2} />
                        </button>
                        <button
                          onClick={() => void handleDelete(seg.id)}
                          className="w-7 h-7 rounded-lg bg-crm-bg/50 hover:bg-crm-danger/10 text-crm-danger transition-colors" title="Delete segment"
                        >
                          <Trash2 size={12} strokeWidth={2} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-4 border-t border-crm-border/20 bg-crm-card-bg/50 flex items-center justify-between">
          <div className="text-[11px] text-crm-muted">
            Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="w-8 h-8 rounded-lg border border-crm-border/30 bg-crm-bg/50 text-[11px] text-crm-text disabled:opacity-30 transition-colors"
            >
              <ArrowRight size={10} className="-rotate-90" />
            </button>
            <button
              onClick={() => setPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="w-8 h-8 rounded-lg border border-crm-border/30 bg-crm-bg/50 text-[11px] text-crm-text disabled:opacity-30 transition-colors"
            >
              <ArrowRight size={10} />
            </button>
            <span className="text-[11px] text-crm-muted ml-2">{currentPage} / {totalPages}</span>
          </div>
        </div>
      )}
    </div>
  );
}
