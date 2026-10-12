'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Loader2, AlertCircle, Plus } from 'lucide-react';
import type { ContentItem, ContentStatus, ContentPlatform } from '@/types/crm3';

// ── Helpers ───────────────────────────────────────────────────

const STATUS_COLOR: Record<ContentStatus, string> = {
  draft:        '#8790aa',
  ai_generated: '#8b5cf6',
  in_review:    '#f59e0b',
  approved:     '#3b82f6',
  scheduled:    '#6366f1',
  published:    '#10b981',
  failed:       '#ef4444',
};

const PLATFORM_LABEL: Record<ContentPlatform, string> = {
  instagram: 'IG',
  facebook:  'FB',
  whatsapp:  'WA',
  telegram:  'TG',
  email:     'EM',
};

function isoDate(d: Date) {
  return d.toISOString().split('T')[0];
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfWeek(d: Date) {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay());
  return r;
}

function sameDay(a: Date, b: Date) {
  return isoDate(a) === isoDate(b);
}

// ── Types ─────────────────────────────────────────────────────

type CalView = 'month' | 'week' | 'day' | 'agenda';

interface CalendarProps {
  onCreateForDate?: (date: string) => void;
}

// ── Content dot ───────────────────────────────────────────────

function ContentDot({ item }: { item: Partial<ContentItem> }) {
  const color = STATUS_COLOR[item.status ?? 'draft'];
  const plat  = PLATFORM_LABEL[item.platform ?? 'instagram'];
  return (
    <div
      title={`${item.title ?? 'Untitled'} · ${item.status} · ${item.platform}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        background: `${color}22`, border: `1px solid ${color}55`,
        borderRadius: 5, padding: '1px 5px', fontSize: 10, fontWeight: 600,
        color, maxWidth: '100%', overflow: 'hidden', whiteSpace: 'nowrap',
        textOverflow: 'ellipsis', cursor: 'default',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {plat} {item.title ? item.title.slice(0, 14) : 'Untitled'}
    </div>
  );
}

// ── Month view ────────────────────────────────────────────────

function MonthView({
  cursor, items, today, onCreateForDate,
}: {
  cursor: Date;
  items: Partial<ContentItem>[];
  today: Date;
  onCreateForDate?: (d: string) => void;
}) {
  const start = startOfMonth(cursor);
  const firstCell = startOfWeek(start);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) cells.push(addDays(firstCell, i));

  const byDay: Record<string, Partial<ContentItem>[]> = {};
  for (const item of items) {
    const d = item.scheduled_at ?? item.published_at ?? item.created_at;
    if (!d) continue;
    const key = isoDate(new Date(d));
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(item);
  }

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {DAY_LABELS.map((d) => (
          <div key={d} style={{ padding: '6px 8px', fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textAlign: 'center' }}>{d}</div>
        ))}
      </div>
      {/* Cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
        {cells.map((cell, i) => {
          const key = isoDate(cell);
          const cellItems = byDay[key] ?? [];
          const isToday = sameDay(cell, today);
          const isCurrentMonth = cell.getMonth() === cursor.getMonth();
          return (
            <div
              key={i}
              onClick={() => onCreateForDate?.(key)}
              style={{
                minHeight: 90, padding: '6px 6px 4px', borderRight: '1px solid rgba(255,255,255,0.06)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                background: isToday ? 'rgba(79,109,245,0.08)' : 'transparent',
                cursor: onCreateForDate ? 'pointer' : 'default',
                opacity: isCurrentMonth ? 1 : 0.35,
              }}
            >
              <div style={{
                fontSize: 12, fontWeight: isToday ? 800 : 500,
                color: isToday ? '#4f6df5' : 'var(--crm-text)',
                marginBottom: 4,
                width: 22, height: 22, borderRadius: '50%',
                background: isToday ? 'rgba(79,109,245,0.15)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {cell.getDate()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {cellItems.slice(0, 3).map((item, j) => (
                  <ContentDot key={item.id ?? j} item={item} />
                ))}
                {cellItems.length > 3 && (
                  <span style={{ fontSize: 10, color: 'var(--crm-text-muted)', paddingLeft: 2 }}>
                    +{cellItems.length - 3} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Week view ─────────────────────────────────────────────────

function WeekView({
  cursor, items, today, onCreateForDate,
}: {
  cursor: Date;
  items: Partial<ContentItem>[];
  today: Date;
  onCreateForDate?: (d: string) => void;
}) {
  const weekStart = startOfWeek(cursor);
  const days: Date[] = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const byDay: Record<string, Partial<ContentItem>[]> = {};
  for (const item of items) {
    const d = item.scheduled_at ?? item.published_at ?? item.created_at;
    if (!d) continue;
    const key = isoDate(new Date(d));
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(item);
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 0 }}>
      {days.map((day) => {
        const key = isoDate(day);
        const dayItems = byDay[key] ?? [];
        const isToday = sameDay(day, today);
        return (
          <div key={key} style={{
            borderRight: '1px solid rgba(255,255,255,0.06)',
            minHeight: 200, padding: 8,
            background: isToday ? 'rgba(79,109,245,0.06)' : 'transparent',
          }}>
            <div style={{ marginBottom: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', fontWeight: 600 }}>
                {day.toLocaleDateString('en-US', { weekday: 'short' })}
              </div>
              <div style={{
                fontSize: 18, fontWeight: isToday ? 800 : 500,
                color: isToday ? '#4f6df5' : 'var(--crm-text)',
                width: 32, height: 32, borderRadius: '50%',
                background: isToday ? 'rgba(79,109,245,0.15)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto',
              }}>
                {day.getDate()}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {dayItems.map((item, j) => (
                <ContentDot key={item.id ?? j} item={item} />
              ))}
              {dayItems.length === 0 && onCreateForDate && (
                <button
                  onClick={() => onCreateForDate(key)}
                  style={{ fontSize: 10, color: 'var(--crm-text-muted)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '2px 0' }}
                >
                  + Add
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Day view ──────────────────────────────────────────────────

function DayView({ cursor, items, today }: { cursor: Date; items: Partial<ContentItem>[]; today: Date }) {
  const key = isoDate(cursor);
  const dayItems = items.filter((item) => {
    const d = item.scheduled_at ?? item.published_at ?? item.created_at;
    return d && isoDate(new Date(d)) === key;
  });
  const isToday = sameDay(cursor, today);

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 16, fontSize: 16, fontWeight: 700, color: isToday ? '#4f6df5' : 'var(--crm-text)' }}>
        {cursor.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        {isToday && <span style={{ marginLeft: 8, fontSize: 11, background: 'rgba(79,109,245,0.15)', color: '#4f6df5', borderRadius: 6, padding: '2px 8px' }}>Today</span>}
      </div>
      {dayItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--crm-text-muted)', fontSize: 13 }}>
          No content scheduled for this day.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {dayItems.map((item, j) => {
            const color = STATUS_COLOR[item.status ?? 'draft'];
            return (
              <div key={item.id ?? j} className="crm-glass" style={{ padding: '12px 16px', borderLeft: `3px solid ${color}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color, background: `${color}18`, borderRadius: 5, padding: '1px 7px' }}>
                    {item.status?.replace('_', ' ')}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>
                    {PLATFORM_LABEL[item.platform ?? 'instagram']}
                  </span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--crm-text)', marginBottom: 4 }}>{item.title ?? 'Untitled'}</div>
                {item.caption && <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', lineHeight: 1.5 }}>{item.caption.slice(0, 120)}{item.caption.length > 120 ? '…' : ''}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Agenda view ───────────────────────────────────────────────

function AgendaView({ items }: { items: Partial<ContentItem>[] }) {
  const sorted = [...items].sort((a, b) => {
    const da = a.scheduled_at ?? a.published_at ?? a.created_at ?? '';
    const db = b.scheduled_at ?? b.published_at ?? b.created_at ?? '';
    return da < db ? -1 : 1;
  });

  if (sorted.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--crm-text-muted)', fontSize: 13 }}>
        No content items found.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
      {sorted.map((item, j) => {
        const color = STATUS_COLOR[item.status ?? 'draft'];
        const d = item.scheduled_at ?? item.published_at ?? item.created_at;
        return (
          <div key={item.id ?? j} className="crm-glass" style={{ padding: '12px 16px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ minWidth: 64, textAlign: 'center' }}>
              {d && (
                <>
                  <div style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>
                    {new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--crm-text-muted)' }}>
                    {new Date(d).toLocaleDateString('en-US', { year: 'numeric' })}
                  </div>
                </>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color, background: `${color}18`, borderRadius: 5, padding: '1px 7px' }}>
                  {item.status?.replace('_', ' ')}
                </span>
                <span style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>{PLATFORM_LABEL[item.platform ?? 'instagram']}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-text)' }}>{item.title ?? 'Untitled'}</div>
              {item.caption && <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', marginTop: 2 }}>{item.caption.slice(0, 80)}{item.caption.length > 80 ? '…' : ''}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Calendar component ───────────────────────────────────

export function ContentCalendar({ onCreateForDate }: CalendarProps) {
  const [view, setView]       = useState<CalView>('month');
  const [cursor, setCursor]   = useState(() => new Date());
  const [today]               = useState(() => new Date());
  const [items, setItems]     = useState<Partial<ContentItem>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  // Filter state
  const [filterStatus, setFilterStatus]     = useState('');
  const [filterPlatform, setFilterPlatform] = useState('');

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
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterPlatform]);

  useEffect(() => { void load(); }, [load]);

  // Navigation
  const navigate = (dir: -1 | 1) => {
    setCursor((prev) => {
      const next = new Date(prev);
      if (view === 'month') next.setMonth(next.getMonth() + dir);
      else if (view === 'week') next.setDate(next.getDate() + dir * 7);
      else next.setDate(next.getDate() + dir);
      return next;
    });
  };

  const headerLabel = () => {
    if (view === 'month') return cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (view === 'week') {
      const ws = startOfWeek(cursor);
      const we = addDays(ws, 6);
      return `${ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${we.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    if (view === 'day') return cursor.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    return 'Agenda';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* Nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => navigate(-1)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '5px 8px', cursor: 'pointer', color: 'var(--crm-text)' }}>
            <ChevronLeft size={14} />
          </button>
          <button onClick={() => setCursor(new Date())} style={{ background: 'rgba(79,109,245,0.10)', border: '1px solid rgba(79,109,245,0.25)', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', color: '#4f6df5', fontSize: 12, fontWeight: 600 }}>
            Today
          </button>
          <button onClick={() => navigate(1)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '5px 8px', cursor: 'pointer', color: 'var(--crm-text)' }}>
            <ChevronRight size={14} />
          </button>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--crm-text)', minWidth: 180 }}>{headerLabel()}</span>
        </div>

        {/* View switcher */}
        <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 3, marginLeft: 'auto' }}>
          {(['month', 'week', 'day', 'agenda'] as CalView[]).map((v) => (
            <button key={v} onClick={() => setView(v)}
              style={{ padding: '4px 10px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: view === v ? 'rgba(79,109,245,0.20)' : 'transparent', color: view === v ? '#4f6df5' : 'var(--crm-text-muted)', textTransform: 'capitalize' }}>
              {v}
            </button>
          ))}
        </div>

        {/* Filters */}
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'var(--crm-text)', fontSize: 12 }}>
          <option value="">All statuses</option>
          {(['draft','ai_generated','in_review','approved','scheduled','published','failed'] as ContentStatus[]).map((s) => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
        <select value={filterPlatform} onChange={(e) => setFilterPlatform(e.target.value)}
          style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'var(--crm-text)', fontSize: 12 }}>
          <option value="">All platforms</option>
          {(['instagram','facebook','whatsapp','telegram','email'] as ContentPlatform[]).map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        {onCreateForDate && (
          <button onClick={() => onCreateForDate(isoDate(cursor))}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={12} /> New
          </button>
        )}
      </div>

      {/* Calendar body */}
      <div className="crm-glass" style={{ overflow: 'hidden', borderRadius: 16 }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 48, color: 'var(--crm-text-muted)', fontSize: 13 }}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading content…
          </div>
        ) : error ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 48, color: '#f46b72', fontSize: 13 }}>
            <AlertCircle size={16} /> Failed to load content.
            <button onClick={() => void load()} style={{ marginLeft: 8, fontSize: 12, color: '#4f6df5', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Retry</button>
          </div>
        ) : (
          <>
            {view === 'month'  && <MonthView  cursor={cursor} items={items} today={today} onCreateForDate={onCreateForDate} />}
            {view === 'week'   && <WeekView   cursor={cursor} items={items} today={today} onCreateForDate={onCreateForDate} />}
            {view === 'day'    && <DayView    cursor={cursor} items={items} today={today} />}
            {view === 'agenda' && <AgendaView items={items} />}
          </>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, paddingLeft: 4 }}>
        {(Object.entries(STATUS_COLOR) as [ContentStatus, string][]).map(([s, c]) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--crm-text-muted)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
            {s.replace('_', ' ')}
          </div>
        ))}
      </div>
    </div>
  );
}
