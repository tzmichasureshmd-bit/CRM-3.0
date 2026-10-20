'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Search, Loader2, AlertCircle, RefreshCw,
  AtSign, Share2, MessageSquare, Send, FileText,
  Sparkles, ChevronLeft, ChevronRight,
} from 'lucide-react';
import type { ContentItem, ContentStatus, ContentPlatform } from '@/types/crm3';

// ── Constants ─────────────────────────────────────────────────

const PAGE_SIZE = 12;

const STATUS_COLOR: Record<ContentStatus, string> = {
  draft:        '#8790aa',
  ai_generated: '#8b5cf6',
  in_review:    '#f59e0b',
  approved:     '#3b82f6',
  scheduled:    '#6366f1',
  published:    '#10b981',
  failed:       '#ef4444',
};

const PLATFORM_ICON: Record<ContentPlatform, React.ReactNode> = {
  instagram: <AtSign    size={12} color="#e1306c" />,
  facebook:  <Share2    size={12} color="#1877f2" />,
  whatsapp:  <MessageSquare size={12} color="#25d366" />,
  telegram:  <Send      size={12} color="#0088cc" />,
  email:     <FileText  size={12} color="#8790aa" />,
};

type SortField = 'created_at' | 'scheduled_at' | 'status' | 'platform';

// ── Grid card ─────────────────────────────────────────────────

function GridCard({ item }: { item: Partial<ContentItem> }) {
  const color  = STATUS_COLOR[item.status ?? 'draft'];
  const plIcon = PLATFORM_ICON[item.platform ?? 'instagram'];

  return (
    <div
      className="crm-glass"
      style={{
        padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10,
        cursor: 'default', transition: 'transform 120ms',
        borderTop: `3px solid ${color}`,
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {plIcon}
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase' }}>
            {item.platform}
          </span>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, color,
          background: `${color}18`, borderRadius: 5, padding: '1px 7px',
        }}>
          {item.status?.replace('_', ' ')}
        </span>
      </div>

      {/* Title */}
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)', lineHeight: 1.3 }}>
        {item.title ?? 'Untitled'}
      </div>

      {/* Caption preview */}
      {item.caption && (
        <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', lineHeight: 1.5, flex: 1 }}>
          {item.caption.slice(0, 90)}{item.caption.length > 90 ? '…' : ''}
        </div>
      )}

      {/* Hashtags */}
      {item.hashtags && item.hashtags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {item.hashtags.slice(0, 4).map((tag) => (
            <span key={tag} style={{ fontSize: 9, color: '#4f6df5', background: 'rgba(79,109,245,0.10)', borderRadius: 4, padding: '1px 5px' }}>
              #{tag}
            </span>
          ))}
          {item.hashtags.length > 4 && (
            <span style={{ fontSize: 9, color: 'var(--crm-text-muted)' }}>+{item.hashtags.length - 4}</span>
          )}
        </div>
      )}

      {/* AI badge */}
      {item.ai_generated && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#8b5cf6' }}>
          <Sparkles size={10} /> AI Generated
        </div>
      )}

      {/* Attribution metrics */}
      {((item.leads_generated ?? 0) > 0 || (item.revenue_attributed ?? 0) > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)' }}>{item.leads_generated ?? 0}</div>
            <div style={{ fontSize: 9, color: 'var(--crm-text-muted)' }}>Leads</div>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)' }}>{item.deals_attributed ?? 0}</div>
            <div style={{ fontSize: 9, color: 'var(--crm-text-muted)' }}>Deals</div>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)' }}>
              {item.revenue_attributed ? `$${(item.revenue_attributed / 1000).toFixed(1)}K` : '—'}
            </div>
            <div style={{ fontSize: 9, color: 'var(--crm-text-muted)' }}>Revenue</div>
          </div>
        </div>
      )}

      {/* Date */}
      <div style={{ fontSize: 10, color: 'var(--crm-text-muted)', marginTop: 'auto' }}>
        {item.scheduled_at
          ? `Scheduled: ${new Date(item.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
          : item.published_at
          ? `Published: ${new Date(item.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
          : item.created_at
          ? `Created: ${new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
          : ''}
      </div>
    </div>
  );
}

// ── Main Grid component ───────────────────────────────────────

export function ContentGrid() {
  const [items, setItems]         = useState<Partial<ContentItem>[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(false);
  const [search, setSearch]       = useState('');
  const [filterStatus, setFilterStatus]     = useState('');
  const [filterPlatform, setFilterPlatform] = useState('');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [page, setPage]           = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams();
      if (filterStatus)   params.set('status', filterStatus);
      if (filterPlatform) params.set('platform', filterPlatform);
      const res = await fetch(`/api/v3/content?${params.toString()}`);
      if (!res.ok) throw new Error('Failed');
      const d = await res.json() as { data: Partial<ContentItem>[] };
      setItems(d.data ?? []);
      setPage(0);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterPlatform]);

  useEffect(() => { void load(); }, [load]);

  // Client-side search + sort
  const filtered = items
    .filter((item) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (item.title ?? '').toLowerCase().includes(q) ||
        (item.caption ?? '').toLowerCase().includes(q) ||
        (item.hashtags ?? []).some((h) => h.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      const va = (a[sortField] as string) ?? '';
      const vb = (b[sortField] as string) ?? '';
      return va < vb ? 1 : va > vb ? -1 : 0; // descending
    });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--crm-text-muted)' }} />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search content…"
            style={{ width: '100%', paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7, borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'var(--crm-text)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {/* Status filter */}
        <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(0); }}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'var(--crm-text)', fontSize: 12 }}>
          <option value="">All statuses</option>
          {(['draft','ai_generated','in_review','approved','scheduled','published','failed'] as ContentStatus[]).map((s) => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>

        {/* Platform filter */}
        <select value={filterPlatform} onChange={(e) => { setFilterPlatform(e.target.value); setPage(0); }}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'var(--crm-text)', fontSize: 12 }}>
          <option value="">All platforms</option>
          {(['instagram','facebook','whatsapp','telegram','email'] as ContentPlatform[]).map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        {/* Sort */}
        <select value={sortField} onChange={(e) => setSortField(e.target.value as SortField)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'var(--crm-text)', fontSize: 12 }}>
          <option value="created_at">Sort: Created</option>
          <option value="scheduled_at">Sort: Scheduled</option>
          <option value="status">Sort: Status</option>
          <option value="platform">Sort: Platform</option>
        </select>

        <button onClick={() => void load()} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'var(--crm-text-muted)', cursor: 'pointer' }}>
          <RefreshCw size={13} />
        </button>

        <span style={{ fontSize: 12, color: 'var(--crm-text-muted)', marginLeft: 'auto' }}>
          {filtered.length} item{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Grid body */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 48, color: 'var(--crm-text-muted)', fontSize: 13 }}>
          <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading content…
        </div>
      ) : error ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 48, color: '#f46b72', fontSize: 13 }}>
          <AlertCircle size={16} /> Failed to load content.
          <button onClick={() => void load()} style={{ marginLeft: 8, fontSize: 12, color: '#4f6df5', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Retry</button>
        </div>
      ) : pageItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--crm-text-muted)', fontSize: 13 }}>
          {search || filterStatus || filterPlatform ? 'No content matches your filters.' : 'No content yet. Generate some with AI!'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {pageItems.map((item, i) => (
            <GridCard key={item.id ?? i} item={item} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'var(--crm-text)', cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.4 : 1 }}
          >
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'var(--crm-text)', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', opacity: page >= totalPages - 1 ? 0.4 : 1 }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
