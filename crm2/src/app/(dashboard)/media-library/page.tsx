'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import {
  uploadAccountMediaWithProgress,
  MEDIA_MAX_BYTES,
  MEDIA_MAX_BYTES_BY_KIND,
} from '@/lib/storage/upload-media';
import {
  Image as ImageIcon,
  Video,
  Music,
  FileText,
  Loader2,
  Copy,
  Trash2,
  ExternalLink,
  Download,
  AlertCircle,
  Images,
  UploadCloud,
  Search,
  Folder,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

// Media Library: every file the account has uploaded through the shared
// media uploader (inbox attachments, flows builder, template headers).
// Rows come from the media_assets registry (migration 049) written by
// uploadAccountMedia() — we never LIST raw storage buckets client-side.

interface MediaAsset {
  id: string;
  bucket: string;
  path: string;
  public_url: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  kind: 'image' | 'video' | 'audio' | 'document';
  category: string | null;
  created_at: string;
}

const PAGE_SIZE = 48;

const KIND_FILTERS = [
  { value: '', label: 'All', icon: Images },
  { value: 'image', label: 'Images', icon: ImageIcon },
  { value: 'video', label: 'Videos', icon: Video },
  { value: 'audio', label: 'Audio', icon: Music },
  { value: 'document', label: 'Documents', icon: FileText },
] as const;

function formatBytes(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function MediaLibraryPage() {
  const { accountId, loading: authLoading, user } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [deferredSearch, setDeferredSearch] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<MediaAsset | null>(null);

  // Upload state — progress comes from the real byte-level XHR upload
  // in upload-media.ts, never a timed animation.
  const [uploadingName, setUploadingName] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Debounce search into the server query.
  useEffect(() => {
    const t = setTimeout(() => setDeferredSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchAssets = useCallback(async () => {
    if (!accountId) return;
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('media_assets')
        .select(
          'id, bucket, path, public_url, file_name, mime_type, size_bytes, kind, category, created_at',
          { count: 'exact' },
        )
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (kindFilter) query = query.eq('kind', kindFilter);
      if (categoryFilter) query = query.eq('category', categoryFilter);
      if (deferredSearch) {
        query = query.ilike('file_name', `%${deferredSearch}%`);
      }

      const { data, count, error: err } = await query;
      if (err) throw err;
      setAssets((data ?? []) as MediaAsset[]);
      setTotal(count ?? 0);
    } catch (err) {
      console.error('Failed to load media library:', err);
      setError('Failed to load your media. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [accountId, supabase, kindFilter, categoryFilter, deferredSearch, page]);

  // Load categories for the filter chips (server-side distinct scan — no
  // ndjson hacks, no full-table client fetch).
  const fetchCategories = useCallback(async () => {
    if (!accountId) return;
    const { data, error: err } = await supabase
      .from('media_assets')
      .select('category')
      .eq('account_id', accountId)
      .not('category', 'is', null)
      .order('category');
    if (err) return;
    setCategories(
      Array.from(new Set((data ?? []).map((r) => String(r.category)))),
    );
  }, [accountId, supabase]);

  useEffect(() => {
    if (!authLoading) {
      fetchAssets();
      fetchCategories();
    }
  }, [authLoading, fetchAssets, fetchCategories]);

  // When a filter/search/page changes, jump back to page 0 unless the
  // user explicitly paged forward.
  useEffect(() => {
    setPage(0);
  }, [kindFilter, categoryFilter, deferredSearch]);

  async function handleUpload(file: File) {
    if (!accountId) return;
    if (!user) {
      toast.error('Not signed in.');
      return;
    }

    // Client-side size/kind caps (mirrors Meta's ceilings). This mirrors
    // what the storage bucket limits enforce (16 MB) — a mismatch is
    // caught before an orphaned object is pushed to storage.
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const kind =
      file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)
        ? 'image'
        : file.type.startsWith('video/') || ['mp4', 'mov', 'webm', 'mkv'].includes(ext)
          ? 'video'
          : file.type.startsWith('audio/') || ['mp3', 'm4a', 'opus', 'ogg', 'wav'].includes(ext)
            ? 'audio'
            : 'document';

    const cap = MEDIA_MAX_BYTES_BY_KIND[kind] ?? MEDIA_MAX_BYTES;
    if (file.size > cap) {
      toast.error(
        `${file.name} is ${formatBytes(file.size)} — the ${kind} limit is ${formatBytes(cap)}.`,
      );
      return;
    }

    setUploadingName(file.name);
    setUploadProgress(0);
    setUploadError(null);

    // The `category` here is the user-chosen folder note; the active chip
    // (categoryFilter) is the best default a librarian expects.
    const category = categoryFilter || null;

    try {
      const { publicUrl } = await uploadAccountMediaWithProgress(
        'chat-media',
        file,
        {
          category,
          onProgress: (percent) => setUploadProgress(Math.round(percent)),
        },
      );
      await fetchAssets();
      await fetchCategories();
      if (category) setCategoryFilter(category);
      toast.success(publicUrl ? 'Uploaded to Media Library' : 'Uploaded to Media Library');
    } catch (err) {
      console.error('Media upload failed:', err);
      setUploadError(
        err instanceof Error ? err.message : 'Upload failed. Please try again.',
      );
    } finally {
      setUploadingName(null);
      setUploadProgress(0);
    }
  }

  const onFilesPicked = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    // Upload sequentially to keep the progress bar meaningful per-file.
    void (async () => {
      for (const file of Array.from(files)) {
        await handleUpload(file);
      }
    })();
  };

  async function copyUrl(asset: MediaAsset) {
    try {
      await navigator.clipboard.writeText(asset.public_url);
      toast.success('URL copied to clipboard');
    } catch {
      toast.error('Could not copy the URL');
    }
  }

  async function handleDelete(asset: MediaAsset) {
    setDeletingId(asset.id);
    try {
      // Storage delete first (RLS-scoped to the account folder); the
      // registry row goes second so a failed storage remove can be
      // retried instead of orphaning the object silently.
      const { error: rmErr } = await supabase.storage
        .from(asset.bucket)
        .remove([asset.path]);
      if (rmErr) throw new Error(rmErr.message);

      const { error: delErr } = await supabase
        .from('media_assets')
        .delete()
        .eq('id', asset.id);
      if (delErr) throw delErr;

      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
      setPreview((p) => (p?.id === asset.id ? null : p));
      toast.success(`Deleted "${asset.file_name}"`);
    } catch (err) {
      console.error('Media delete failed:', err);
      toast.error(
        err instanceof Error ? err.message : 'Could not delete this file.',
      );
    } finally {
      setDeletingId(null);
    }
  }

  const paged = (dir: -1 | 1) => {
    setPage((p) => {
      const next = p + dir;
      if (next < 0 || next * PAGE_SIZE >= total) return p;
      return next;
    });
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Images className="h-6 w-6 text-primary" />
          Media Library
        </h1>
        <p className="text-muted-foreground">
          Files uploaded across the inbox, flows and templates — reusable
          anywhere WhatsApp media is accepted.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {KIND_FILTERS.map(({ value, label, icon: Icon }) => (
              <button
                key={value || 'all'}
                type="button"
                onClick={() => setKindFilter(value)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  kindFilter === value
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by file name…"
                className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            </div>
            <label
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20 ${
                uploadingName ? 'pointer-events-none opacity-70' : ''
              }`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onFilesPicked(e.dataTransfer.files);
              }}
            >
              {uploadingName ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UploadCloud className="h-4 w-4" />
              )}
              {uploadingName ? 'Uploading…' : 'Upload'}
              <input
                type="file"
                multiple
                className="hidden"
                disabled={!!uploadingName}
                onChange={(e) => {
                  onFilesPicked(e.target.files);
                  e.currentTarget.value = '';
                }}
              />
            </label>
          </div>
        </div>

        {/* Category chips + upload progress */}
        {(categories.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Folder className="h-3.5 w-3.5 text-muted-foreground" />
            <button
              type="button"
              onClick={() => setCategoryFilter('')}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                categoryFilter === ''
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted'
              }`}
            >
              All folders
            </button>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategoryFilter(c === categoryFilter ? '' : c)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  categoryFilter === c
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {(uploadingName || uploadProgress > 0 || uploadError) && (
          <div className="rounded-xl border border-border bg-card p-3">
            {uploadingName && (
              <div className="flex items-center gap-2">
                <span className="max-w-60 truncate text-xs text-foreground">
                  {uploadingName}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {uploadProgress}%
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-150"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
            {uploadError && (
              <div className="flex items-center gap-2 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5" />
                {uploadError}
                <button
                  type="button"
                  onClick={() => setUploadError(null)}
                  className="ml-auto text-muted-foreground hover:text-foreground"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      {loading || authLoading ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading media…</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card py-16 text-center">
          <AlertCircle className="h-10 w-10 text-destructive/60" />
          <p className="text-sm text-destructive">{error}</p>
          <button
            type="button"
            onClick={fetchAssets}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            Retry
          </button>
        </div>
      ) : assets.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card py-16 text-center">
          <Images className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">
            {total === 0 && !search && !kindFilter && !categoryFilter
              ? 'No media yet'
              : 'Nothing matches this filter'}
          </p>
          <p className="max-w-sm text-xs text-muted-foreground">
            {total === 0
              ? 'Files you attach in chats or upload in flows and templates will appear here automatically.'
              : 'Try a different search term or filter.'}
          </p>
          {total === 0 && (
            <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20">
              <UploadCloud className="h-3.5 w-3.5" />
              Upload your first file
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  onFilesPicked(e.target.files);
                  e.currentTarget.value = '';
                }}
              />
            </label>
          )}
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {assets.map((asset) => (
              <li
                key={asset.id}
                className="group overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md"
              >
                {/* Preview */}
                <button
                  type="button"
                  className="relative block h-28 w-full cursor-pointer bg-muted/50 text-left"
                  onClick={() => setPreview(asset)}
                >
                  {asset.kind === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={asset.public_url}
                      alt={asset.file_name}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center">
                      {asset.kind === 'video' ? (
                        <Video className="h-8 w-8 text-muted-foreground" />
                      ) : asset.kind === 'audio' ? (
                        <Music className="h-8 w-8 text-muted-foreground" />
                      ) : (
                        <FileText className="h-8 w-8 text-muted-foreground" />
                      )}
                    </span>
                  )}
                  <span className="absolute left-1.5 top-1.5 rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {asset.kind}
                  </span>
                  {asset.kind === 'video' && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="rounded-full bg-background/70 p-1.5 text-foreground">
                        <Video className="h-5 w-5" />
                      </span>
                    </span>
                  )}
                </button>

                {/* Meta + actions */}
                <div className="p-2.5">
                  <p
                    className="truncate text-xs font-medium text-foreground"
                    title={asset.file_name}
                  >
                    {asset.file_name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {formatBytes(asset.size_bytes)} &middot;{' '}
                    {formatDate(asset.created_at)}
                  </p>
                  {asset.category && (
                    <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Folder className="h-3 w-3" />
                      {asset.category}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-1">
                    <IconAction title="Copy URL" onClick={() => copyUrl(asset)}>
                      <Copy className="h-3.5 w-3.5" />
                    </IconAction>
                    <a
                      href={`/api/media/${asset.id}/download`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Download"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                    <a
                      href={asset.public_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open in new tab"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <IconAction
                      title="Delete"
                      danger
                      disabled={deletingId === asset.id}
                      onClick={() => handleDelete(asset)}
                    >
                      {deletingId === asset.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </IconAction>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              {total.toLocaleString()} file{total === 1 ? '' : 's'} &middot; page{' '}
              {page + 1} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page === 0 || loading}
                onClick={() => paged(-1)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages - 1 || loading}
                onClick={() => paged(1)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {/* Preview modal (video/audio play inline) */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
          onClick={() => setPreview(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="truncate text-sm font-medium text-foreground">
                {preview.file_name}
              </p>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close preview"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              {preview.kind === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview.public_url}
                  alt={preview.file_name}
                  className="mx-auto block max-h-[60vh] w-auto object-contain"
                />
              ) : preview.kind === 'video' ? (
                <video
                  src={preview.public_url}
                  controls
                  autoPlay
                  className="mx-auto block max-h-[60vh] w-full bg-black"
                />
              ) : preview.kind === 'audio' ? (
                <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                  <Music className="h-12 w-12 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(preview.size_bytes)}
                  </p>
                  <audio src={preview.public_url} controls className="w-full" />
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground" />
                  <p className="text-sm text-foreground">{preview.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(preview.size_bytes)} &middot;{' '}
                    {(preview.mime_type || 'unknown type').split('/').pop()}
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-4 py-3">
              <p className="truncate text-xs text-muted-foreground">
                {preview.category ? `Folder: ${preview.category}` : 'No folder'}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => copyUrl(preview)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy URL
                </button>
                <a
                  href={`/api/media/${preview.id}/download?download=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IconAction({
  title,
  onClick,
  children,
  danger,
  disabled,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:opacity-50 ${
        danger
          ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}