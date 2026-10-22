'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Image, Film, FileText, Music, File, Edit3, Trash2, X, AlertCircle, ChevronDown, ExternalLink } from 'lucide-react';
import { v3fetch } from '@/lib/auth-client';

interface MediaAsset {
  id: string;
  name: string;
  file_type: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_url: string;
  thumbnail_url: string | null;
  alt_text: string | null;
  tags: string[];
  created_at: string;
}

const FILE_TYPES = ['image', 'video', 'document', 'audio', 'other'] as const;

const TYPE_ICON: Record<string, React.ReactNode> = {
  image: <Image size={20} />, video: <Film size={20} />,
  document: <FileText size={20} />, audio: <Music size={20} />, other: <File size={20} />,
};
const TYPE_COLOR: Record<string, string> = {
  image: '#4f6df5', video: '#8b5cf6', document: '#28c99a', audio: '#f4c95d', other: '#8790aa',
};

function fmtBytes(b: number | null) {
  if (!b) return '';
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${b} B`;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 10,
  border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.80)',
  fontSize: 13, color: 'var(--crm-text)', boxSizing: 'border-box', outline: 'none',
};

function AssetModal({ asset, onClose, onSaved }: {
  asset: MediaAsset | null;
  onClose: () => void;
  onSaved: (a: MediaAsset) => void;
}) {
  const [name, setName] = useState(asset?.name ?? '');
  const [storageUrl, setStorageUrl] = useState(asset?.storage_url ?? '');
  const [fileType, setFileType] = useState(asset?.file_type ?? 'other');
  const [mimeType, setMimeType] = useState(asset?.mime_type ?? '');
  const [altText, setAltText] = useState(asset?.alt_text ?? '');
  const [tags, setTags] = useState(asset?.tags?.join(', ') ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    if (!asset && !storageUrl.trim()) { setError('Storage URL is required'); return; }
    setSaving(true); setError('');
    try {
      const body = asset
        ? { name: name.trim(), alt_text: altText.trim() || null, tags: tags.split(',').map(t => t.trim()).filter(Boolean) }
        : { name: name.trim(), storage_url: storageUrl.trim(), file_type: fileType, mime_type: mimeType.trim() || null, alt_text: altText.trim() || null, tags: tags.split(',').map(t => t.trim()).filter(Boolean) };
      const res = await v3fetch(
        asset ? `/api/v3/media/${asset.id}` : '/api/v3/media',
        { method: asset ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      );
      if (!res.ok) { const d = await res.json() as { detail?: string }; throw new Error(d.detail ?? 'Save failed'); }
      onSaved(await res.json() as MediaAsset);
    } catch (err) { setError(err instanceof Error ? err.message : 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="crm-glass" style={{ width: '100%', maxWidth: 520, borderRadius: 18, padding: 26, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 750, color: 'var(--crm-text)' }}>{asset ? 'Edit Asset' : 'Add Media Asset'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}><X size={18} /></button>
        </div>
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, background: 'rgba(244,107,114,0.10)', border: '1px solid rgba(244,107,114,0.25)', color: '#f46b72', fontSize: 12, marginBottom: 14 }}>
            <AlertCircle size={13} />{error}
          </div>
        )}
        <form onSubmit={e => void handleSave(e)} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. product-hero.png" style={inputStyle} autoFocus />
          </div>
          {!asset && (
            <>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Storage URL *</label>
                <input value={storageUrl} onChange={e => setStorageUrl(e.target.value)} placeholder="https://cdn.example.com/file.png" style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>File Type</label>
                  <div style={{ position: 'relative' }}>
                    <select value={fileType} onChange={e => setFileType(e.target.value)} style={{ ...inputStyle, appearance: 'none', paddingRight: 32 }}>
                      {FILE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                    </select>
                    <ChevronDown size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--crm-text-muted)' }} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>MIME Type <span style={{ fontWeight: 400, color: 'var(--crm-text-muted)' }}>(optional)</span></label>
                  <input value={mimeType} onChange={e => setMimeType(e.target.value)} placeholder="image/png" style={inputStyle} />
                </div>
              </div>
            </>
          )}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Alt Text <span style={{ fontWeight: 400, color: 'var(--crm-text-muted)' }}>(optional)</span></label>
            <input value={altText} onChange={e => setAltText(e.target.value)} placeholder="Describe the asset for accessibility" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Tags <span style={{ fontWeight: 400, color: 'var(--crm-text-muted)' }}>(comma-separated)</span></label>
            <input value={tags} onChange={e => setTags(e.target.value)} placeholder="e.g. hero, product, 2024" style={inputStyle} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 18px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', color: 'var(--crm-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 22px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              <Image size={14} />{saving ? 'Saving...' : asset ? 'Update' : 'Add Asset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function MediaPage() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editAsset, setEditAsset] = useState<MediaAsset | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ limit: '50', offset: '0' });
      if (search) params.set('search', search);
      if (filterType) params.set('file_type', filterType);
      const res = await v3fetch(`/api/v3/media?${params}`);
      if (!res.ok) throw new Error('Failed to load');
      const d = await res.json() as { data: MediaAsset[]; total: number };
      setAssets(d.data ?? []); setTotal(d.total ?? 0);
    } catch { setError('Failed to load media assets'); }
    finally { setLoading(false); }
  }, [search, filterType]);

  useEffect(() => { void load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this asset?')) return;
    await v3fetch(`/api/v3/media/${id}`, { method: 'DELETE' });
    setAssets(prev => prev.filter(a => a.id !== id));
    setTotal(t => t - 1);
  };

  const handleSaved = (saved: MediaAsset) => {
    setAssets(prev => {
      const idx = prev.findIndex(a => a.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [saved, ...prev];
    });
    if (!editAsset) setTotal(t => t + 1);
    setShowModal(false); setEditAsset(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {(showModal || editAsset) && (
        <AssetModal asset={editAsset} onClose={() => { setShowModal(false); setEditAsset(null); }} onSaved={handleSaved} />
      )}

      <div className="crm-page-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Media Library</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crm-text-secondary)' }}>{total} assets</p>
        </div>
        <button onClick={() => { setEditAsset(null); setShowModal(true); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 12, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={14} /> Add Asset
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.70)', border: '1px solid rgba(130,145,190,0.22)', borderRadius: 10, padding: '7px 12px', flex: 1, minWidth: 200 }}>
          <Search size={13} color="var(--crm-text-muted)" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search assets..." style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 13, color: 'var(--crm-text)' }} />
          {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)', padding: 0 }}><X size={12} /></button>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['', ...FILE_TYPES].map(t => (
            <button key={t} onClick={() => setFilterType(t)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: filterType === t ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(255,255,255,0.55)', color: filterType === t ? 'white' : 'var(--crm-text-secondary)' }}>
              {t ? TYPE_ICON[t] : null}{t ? t.charAt(0).toUpperCase() + t.slice(1) : 'All'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.20)', color: '#f46b72', fontSize: 13 }}>
          <AlertCircle size={14} />{error}
        </div>
      )}

      {loading ? (
        <div className="crm-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--crm-text-muted)' }}>Loading media library...</div>
      ) : assets.length === 0 ? (
        <div className="crm-glass" style={{ padding: 56, textAlign: 'center', color: 'var(--crm-text-muted)' }}>
          <Image size={40} style={{ margin: '0 auto 14px', opacity: 0.2 }} />
          <p style={{ margin: '0 0 14px', fontSize: 14 }}>{search || filterType ? 'No assets match your filters' : 'No media assets yet'}</p>
          {!search && !filterType && (
            <button onClick={() => setShowModal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <Plus size={13} /> Add First Asset
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {assets.map(asset => {
            const color = TYPE_COLOR[asset.file_type] ?? '#8790aa';
            const isImage = asset.file_type === 'image';
            const thumb = asset.thumbnail_url ?? (isImage ? asset.storage_url : null);
            return (
              <div key={asset.id} className="crm-glass-soft" style={{ overflow: 'hidden', borderRadius: 14 }}>
                {/* Preview */}
                <div style={{ height: 140, background: `${color}10`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                  {thumb
                    ? <img src={thumb} alt={asset.alt_text ?? asset.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    : <div style={{ color, opacity: 0.5 }}>{TYPE_ICON[asset.file_type]}</div>
                  }
                  <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }}>
                    <a href={asset.storage_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', textDecoration: 'none' }}><ExternalLink size={11} /></a>
                  </div>
                </div>
                {/* Info */}
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>{asset.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 5, background: `${color}18`, color }}>{asset.file_type}</span>
                      {asset.size_bytes && <span style={{ fontSize: 10, color: 'var(--crm-text-muted)' }}>{fmtBytes(asset.size_bytes)}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 3 }}>
                      <button onClick={() => { setEditAsset(asset); setShowModal(true); }} style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(79,109,245,0.08)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f6df5' }}><Edit3 size={11} /></button>
                      <button onClick={() => void handleDelete(asset.id)} style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(244,107,114,0.08)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f46b72' }}><Trash2 size={11} /></button>
                    </div>
                  </div>
                  {asset.tags?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 6 }}>
                      {asset.tags.slice(0, 3).map(t => <span key={t} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(130,145,190,0.10)', color: 'var(--crm-text-muted)' }}>#{t}</span>)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
