'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, BookOpen, Edit3, Trash2, X, AlertCircle, ChevronDown } from 'lucide-react';
import { v3fetch } from '@/lib/auth-client';

interface KnowledgeDoc {
  id: string;
  title: string;
  content: string;
  category: string;
  status: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

const CATEGORIES = ['general', 'faq', 'guide', 'policy', 'product', 'support'] as const;
const STATUSES = ['draft', 'published', 'archived'] as const;

const STATUS_COLOR: Record<string, string> = {
  draft: '#f4c95d', published: '#28c99a', archived: '#8790aa',
};
const CAT_COLOR: Record<string, string> = {
  faq: '#4f6df5', guide: '#8b5cf6', policy: '#f46b72',
  product: '#28c99a', support: '#f4c95d', general: '#8790aa',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 10,
  border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.80)',
  fontSize: 13, color: 'var(--crm-text)', boxSizing: 'border-box', outline: 'none',
};

function DocModal({ doc, onClose, onSaved }: {
  doc: KnowledgeDoc | null;
  onClose: () => void;
  onSaved: (d: KnowledgeDoc) => void;
}) {
  const [title, setTitle] = useState(doc?.title ?? '');
  const [content, setContent] = useState(doc?.content ?? '');
  const [category, setCategory] = useState(doc?.category ?? 'general');
  const [status, setStatus] = useState(doc?.status ?? 'draft');
  const [tags, setTags] = useState(doc?.tags?.join(', ') ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required'); return; }
    if (!content.trim()) { setError('Content is required'); return; }
    setSaving(true); setError('');
    try {
      const body = {
        title: title.trim(), content: content.trim(), category, status,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      };
      const res = await v3fetch(
        doc ? `/api/v3/knowledge/${doc.id}` : '/api/v3/knowledge',
        { method: doc ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      );
      if (!res.ok) { const d = await res.json() as { detail?: string }; throw new Error(d.detail ?? 'Save failed'); }
      onSaved(await res.json() as KnowledgeDoc);
    } catch (err) { setError(err instanceof Error ? err.message : 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="crm-glass" style={{ width: '100%', maxWidth: 600, borderRadius: 18, padding: 26, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 750, color: 'var(--crm-text)' }}>{doc ? 'Edit Document' : 'New Document'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}><X size={18} /></button>
        </div>
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, background: 'rgba(244,107,114,0.10)', border: '1px solid rgba(244,107,114,0.25)', color: '#f46b72', fontSize: 12, marginBottom: 14 }}>
            <AlertCircle size={13} />{error}
          </div>
        )}
        <form onSubmit={e => void handleSave(e)} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. How to reset your password" style={inputStyle} autoFocus />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Category</label>
              <div style={{ position: 'relative' }}>
                <select value={category} onChange={e => setCategory(e.target.value)} style={{ ...inputStyle, appearance: 'none', paddingRight: 32 }}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
                <ChevronDown size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--crm-text-muted)' }} />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Status</label>
              <div style={{ position: 'relative' }}>
                <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...inputStyle, appearance: 'none', paddingRight: 32 }}>
                  {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
                <ChevronDown size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--crm-text-muted)' }} />
              </div>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Content *</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Write the document content here..." rows={8} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Tags <span style={{ fontWeight: 400, color: 'var(--crm-text-muted)' }}>(comma-separated)</span></label>
            <input value={tags} onChange={e => setTags(e.target.value)} placeholder="e.g. billing, account, password" style={inputStyle} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 18px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', color: 'var(--crm-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 22px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              <BookOpen size={14} />{saving ? 'Saving...' : doc ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ViewModal({ doc, onClose, onEdit }: { doc: KnowledgeDoc; onClose: () => void; onEdit: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="crm-glass" style={{ width: '100%', maxWidth: 640, borderRadius: 18, padding: 26, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ flex: 1, marginRight: 12 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: `${CAT_COLOR[doc.category] ?? '#8790aa'}18`, color: CAT_COLOR[doc.category] ?? '#8790aa', textTransform: 'uppercase' }}>{doc.category}</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: `${STATUS_COLOR[doc.status] ?? '#8790aa'}18`, color: STATUS_COLOR[doc.status] ?? '#8790aa' }}>{doc.status}</span>
            </div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 750, color: 'var(--crm-text)' }}>{doc.title}</h2>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onEdit} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 9, background: 'rgba(79,109,245,0.10)', border: '1px solid rgba(79,109,245,0.20)', color: '#4f6df5', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><Edit3 size={12} />Edit</button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}><X size={18} /></button>
          </div>
        </div>
        <div style={{ fontSize: 14, color: 'var(--crm-text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{doc.content}</div>
        {doc.tags?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(130,145,190,0.12)' }}>
            {doc.tags.map(t => <span key={t} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(130,145,190,0.10)', color: 'var(--crm-text-muted)' }}>#{t}</span>)}
          </div>
        )}
        <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 12 }}>Updated {new Date(doc.updated_at).toLocaleDateString()}</div>
      </div>
    </div>
  );
}

export default function KnowledgePage() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editDoc, setEditDoc] = useState<KnowledgeDoc | null>(null);
  const [viewDoc, setViewDoc] = useState<KnowledgeDoc | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ limit: '50', offset: '0' });
      if (search) params.set('search', search);
      if (filterCat) params.set('category', filterCat);
      if (filterStatus) params.set('status', filterStatus);
      const res = await v3fetch(`/api/v3/knowledge?${params}`);
      if (!res.ok) throw new Error('Failed to load');
      const d = await res.json() as { data: KnowledgeDoc[]; total: number };
      setDocs(d.data ?? []); setTotal(d.total ?? 0);
    } catch { setError('Failed to load knowledge base'); }
    finally { setLoading(false); }
  }, [search, filterCat, filterStatus]);

  useEffect(() => { void load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this document?')) return;
    await v3fetch(`/api/v3/knowledge/${id}`, { method: 'DELETE' });
    setDocs(prev => prev.filter(d => d.id !== id));
    setTotal(t => t - 1);
  };

  const handleSaved = (saved: KnowledgeDoc) => {
    setDocs(prev => {
      const idx = prev.findIndex(d => d.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [saved, ...prev];
    });
    if (!editDoc) setTotal(t => t + 1);
    setShowModal(false); setEditDoc(null);
  };

  const published = docs.filter(d => d.status === 'published').length;
  const drafts = docs.filter(d => d.status === 'draft').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {(showModal || editDoc) && (
        <DocModal doc={editDoc} onClose={() => { setShowModal(false); setEditDoc(null); }} onSaved={handleSaved} />
      )}
      {viewDoc && (
        <ViewModal doc={viewDoc} onClose={() => setViewDoc(null)} onEdit={() => { setEditDoc(viewDoc); setViewDoc(null); setShowModal(true); }} />
      )}

      <div className="crm-page-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Knowledge Base</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crm-text-secondary)' }}>{total} documents · {published} published · {drafts} drafts</p>
        </div>
        <button onClick={() => { setEditDoc(null); setShowModal(true); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 12, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={14} /> New Document
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.70)', border: '1px solid rgba(130,145,190,0.22)', borderRadius: 10, padding: '7px 12px', flex: 1, minWidth: 200 }}>
          <Search size={13} color="var(--crm-text-muted)" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search documents..." style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 13, color: 'var(--crm-text)' }} />
          {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)', padding: 0 }}><X size={12} /></button>}
        </div>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.22)', background: 'rgba(255,255,255,0.70)', fontSize: 13, color: 'var(--crm-text)', cursor: 'pointer' }}>
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.22)', background: 'rgba(255,255,255,0.70)', fontSize: 13, color: 'var(--crm-text)', cursor: 'pointer' }}>
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.20)', color: '#f46b72', fontSize: 13 }}>
          <AlertCircle size={14} />{error}
        </div>
      )}

      {loading ? (
        <div className="crm-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--crm-text-muted)' }}>Loading knowledge base...</div>
      ) : docs.length === 0 ? (
        <div className="crm-glass" style={{ padding: 56, textAlign: 'center', color: 'var(--crm-text-muted)' }}>
          <BookOpen size={40} style={{ margin: '0 auto 14px', opacity: 0.2 }} />
          <p style={{ margin: '0 0 14px', fontSize: 14 }}>{search || filterCat || filterStatus ? 'No documents match your filters' : 'No documents yet'}</p>
          {!search && !filterCat && !filterStatus && (
            <button onClick={() => setShowModal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <Plus size={13} /> Create First Document
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {docs.map(doc => (
            <div key={doc.id} className="crm-glass-soft" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer' }} onClick={() => setViewDoc(doc)}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: `${CAT_COLOR[doc.category] ?? '#8790aa'}18`, color: CAT_COLOR[doc.category] ?? '#8790aa', textTransform: 'uppercase' }}>{doc.category}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: `${STATUS_COLOR[doc.status] ?? '#8790aa'}18`, color: STATUS_COLOR[doc.status] ?? '#8790aa' }}>{doc.status}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5 }}>{doc.content}</div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => { setEditDoc(doc); setShowModal(true); }} style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(79,109,245,0.08)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f6df5' }}><Edit3 size={12} /></button>
                  <button onClick={() => void handleDelete(doc.id)} style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(244,107,114,0.08)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f46b72' }}><Trash2 size={12} /></button>
                </div>
              </div>
              {doc.tags?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {doc.tags.slice(0, 4).map(t => <span key={t} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 5, background: 'rgba(130,145,190,0.10)', color: 'var(--crm-text-muted)' }}>#{t}</span>)}
                  {doc.tags.length > 4 && <span style={{ fontSize: 10, color: 'var(--crm-text-muted)' }}>+{doc.tags.length - 4}</span>}
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>Updated {new Date(doc.updated_at).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
