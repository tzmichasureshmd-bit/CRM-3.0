'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Sparkles, FileText, Calendar, Grid3X3,
  Plus, Loader2, Copy, Check, AtSign, Share2,
  MessageSquare, Send, RefreshCw, Wand2, TrendingUp,
} from 'lucide-react';
import type { ContentItem, ContentStatus, ContentPlatform } from '@/types/crm3';
import Link from 'next/link';
import { ContentCalendar } from '@/components/content-studio/ContentCalendar';
import { ContentGrid } from '@/components/content-studio/ContentGrid';

// ── Status badge ──────────────────────────────────────────────
function StatusBadge({ status }: { status: ContentStatus }) {
  const map: Record<ContentStatus, string> = {
    draft: 'bg-gray-100 text-gray-600',
    ai_generated: 'bg-purple-100 text-purple-700',
    in_review: 'bg-yellow-100 text-yellow-700',
    approved: 'bg-blue-100 text-blue-700',
    scheduled: 'bg-indigo-100 text-indigo-700',
    published: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${map[status]}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

// ── Platform icon ─────────────────────────────────────────────
function PlatformIcon({ platform }: { platform: ContentPlatform }) {
  const map: Record<ContentPlatform, React.ReactNode> = {
    instagram: <AtSign className="h-4 w-4 text-pink-500" />,
    facebook: <Share2 className="h-4 w-4 text-blue-600" />,
    whatsapp: <MessageSquare className="h-4 w-4 text-green-500" />,
    telegram: <Send className="h-4 w-4 text-sky-500" />,
    email: <FileText className="h-4 w-4 text-gray-500" />,
  };
  return <>{map[platform]}</>;
}

// ── AI Generator Panel ────────────────────────────────────────
function AIGeneratorPanel({ onGenerated }: { onGenerated: (content: GeneratedContent) => Promise<void> }) {
  const [prompt, setPrompt] = useState('');
  const [platform, setPlatform] = useState<ContentPlatform>('instagram');
  const [tone, setTone] = useState('professional');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GeneratedContent | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const generate = useCallback(async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/v3/ai/generate-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, options: { platform, tone } }),
      });
      if (!res.ok) throw new Error('Generation failed');
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({
        headline: 'Generation failed',
        caption: 'Could not generate content. Please try again.',
        cta: '',
        hashtags: [],
        variants: {},
      });
    } finally {
      setLoading(false);
    }
  }, [prompt, platform, tone, loading]);

  const copy = (text: string, key: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Wand2 className="h-5 w-5 text-primary" />
        <h2 className="text-[15px] font-semibold text-foreground">AI Content Generator</h2>
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder='e.g. "Create a Diwali promotion for our premium service" or "New product launch post for young professionals"'
        rows={3}
        className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
      />

      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Platform</label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as ContentPlatform)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="telegram">Telegram</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Tone</label>
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="professional">Professional</option>
            <option value="friendly">Friendly</option>
            <option value="exciting">Exciting</option>
            <option value="informative">Informative</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={() => void generate()}
            disabled={!prompt.trim() || loading}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate
          </button>
        </div>
      </div>

      {result && (
        <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-primary uppercase tracking-wide">Generated Content</span>
            <button
              onClick={() => void generate()}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="h-3 w-3" /> Regenerate
            </button>
          </div>

          {result.headline && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Headline</p>
              <div className="flex items-start gap-2">
                <p className="flex-1 text-sm font-semibold text-foreground">{result.headline}</p>
                <button onClick={() => copy(result.headline, 'headline')} className="shrink-0 text-muted-foreground hover:text-foreground">
                  {copied === 'headline' ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          )}

          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Caption</p>
            <div className="flex items-start gap-2">
              <p className="flex-1 text-sm text-foreground whitespace-pre-wrap">{result.caption}</p>
              <button onClick={() => copy(result.caption, 'caption')} className="shrink-0 text-muted-foreground hover:text-foreground">
                {copied === 'caption' ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {result.cta && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">CTA</p>
              <p className="text-sm font-semibold text-primary">{result.cta}</p>
            </div>
          )}

          {result.hashtags.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Hashtags</p>
              <div className="flex flex-wrap gap-1">
                {result.hashtags.map((tag) => (
                  <span key={tag} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => void onGenerated(result)}
            className="w-full rounded-xl border border-primary bg-primary/10 py-2 text-sm font-semibold text-primary hover:bg-primary/20 transition-colors"
          >
            Save to Drafts
          </button>
        </div>
      )}
    </div>
  );
}

// ── Content Card ──────────────────────────────────────────────
function ContentCard({ item, onPublish }: { item: Partial<ContentItem>; onPublish?: (id: string) => Promise<void> }) {
  const [publishing, setPublishing] = useState(false);
  const handlePublish = async () => {
    if (!item.id || !onPublish) return;
    setPublishing(true);
    await onPublish(item.id);
    setPublishing(false);
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3 hover:shadow-md transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <PlatformIcon platform={item.platform ?? 'instagram'} />
          <p className="text-sm font-semibold text-foreground truncate">{item.title ?? 'Untitled'}</p>
        </div>
        <StatusBadge status={item.status ?? 'draft'} />
      </div>
      <p className="text-xs text-muted-foreground line-clamp-2">{item.caption ?? ''}</p>
      {item.ai_generated && (
        <div className="flex items-center gap-1 text-[10px] text-purple-600">
          <Sparkles className="h-3 w-3" /> AI Generated
        </div>
      )}
      {(item.leads_generated ?? 0) > 0 && (
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-2 text-center">
          <div>
            <p className="text-sm font-bold text-foreground">{item.leads_generated ?? 0}</p>
            <p className="text-[9px] text-muted-foreground">Leads</p>
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">{item.deals_attributed ?? 0}</p>
            <p className="text-[9px] text-muted-foreground">Deals</p>
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">
              {item.revenue_attributed ? `$${(item.revenue_attributed / 1000).toFixed(1)}K` : '—'}
            </p>
            <p className="text-[9px] text-muted-foreground">Revenue</p>
          </div>
        </div>
      )}
      {onPublish && item.status !== 'published' && (
        <button onClick={() => void handlePublish()} disabled={publishing} className="w-full rounded-lg border border-green-200 bg-green-50 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50">
          {publishing ? 'Publishing...' : 'Mark as Published'}
        </button>
      )}
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────
interface GeneratedContent {
  headline: string;
  caption: string;
  cta: string;
  hashtags: string[];
  variants: Record<string, string>;
}

// ── Main Page ─────────────────────────────────────────────────
const TABS = [
  { id: 'create',    label: 'Create',    icon: Wand2 },
  { id: 'drafts',    label: 'Drafts',    icon: FileText },
  { id: 'calendar',  label: 'Calendar',  icon: Calendar },
  { id: 'grid',      label: 'Grid',      icon: Grid3X3 },
  { id: 'published', label: 'Published', icon: TrendingUp },
] as const;

type Tab = (typeof TABS)[number]['id'];

export default function ContentStudioPage() {
  const [activeTab, setActiveTab] = useState<Tab>('create');
  const [draftContent, setDraftContent] = useState<Partial<ContentItem>[]>([]);
  const [publishedContent, setPublishedContent] = useState<Partial<ContentItem>[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [loadingPublished, setLoadingPublished] = useState(false);

  const loadDrafts = useCallback(async () => {
    setLoadingDrafts(true);
    try {
      const res = await fetch('/api/v3/content?status=ai_generated');
      if (res.ok) {
        const d = await res.json() as { data: Partial<ContentItem>[] };
        setDraftContent(d.data ?? []);
      }
    } finally {
      setLoadingDrafts(false);
    }
  }, []);

  const loadPublished = useCallback(async () => {
    setLoadingPublished(true);
    try {
      const res = await fetch('/api/v3/content?status=published');
      if (res.ok) {
        const d = await res.json() as { data: Partial<ContentItem>[] };
        setPublishedContent(d.data ?? []);
      }
    } finally {
      setLoadingPublished(false);
    }
  }, []);

  const handlePublish = useCallback(async (id: string) => {
    const res = await fetch(`/api/v3/content/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'published' }),
    });
    if (res.ok) {
      await Promise.all([loadDrafts(), loadPublished()]);
    }
  }, [loadDrafts, loadPublished]);

  useEffect(() => { void loadDrafts(); void loadPublished(); }, [loadDrafts, loadPublished]);

  const handleGenerated = useCallback(async (content: GeneratedContent) => {
    // Persist to DB
    try {
      const res = await fetch('/api/v3/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: content.headline || 'AI Generated Content',
          caption: content.caption,
          cta: content.cta,
          hashtags: content.hashtags,
          platform: 'instagram',
          content_type: 'text',
          status: 'ai_generated',
          ai_generated: true,
          media_urls: [],
        }),
      });
      if (res.ok) {
        await loadDrafts();
      } else {
        // Fallback: add in-memory
        const newItem: Partial<ContentItem> = {
          id: `draft-${Date.now()}`,
          title: content.headline || 'AI Generated Content',
          caption: content.caption,
          cta: content.cta,
          hashtags: content.hashtags,
          platform: 'instagram',
          status: 'ai_generated',
          ai_generated: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setDraftContent((prev) => [newItem, ...prev]);
      }
    } catch {
      const newItem: Partial<ContentItem> = {
        id: `draft-${Date.now()}`,
        title: content.headline || 'AI Generated Content',
        caption: content.caption,
        status: 'ai_generated',
        ai_generated: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setDraftContent((prev) => [newItem, ...prev]);
    }
    setActiveTab('drafts');
  }, [loadDrafts]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Content Studio</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create, schedule and track content across all channels
          </p>
        </div>
        <button
          onClick={() => setActiveTab('create')}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" /> New Content
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-border bg-muted/50 p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
              activeTab === id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'create' && (
        <AIGeneratorPanel onGenerated={handleGenerated} />
      )}

      {activeTab === 'drafts' && (
        <div>
          {loadingDrafts ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#8790aa', fontSize: 13 }}>Loading drafts...</div>
          ) : draftContent.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No drafts yet</p>
              <p className="text-xs text-muted-foreground mt-1">Generate content with AI to get started</p>
              <button
                onClick={() => setActiveTab('create')}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <Sparkles className="h-4 w-4" /> Generate with AI
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {draftContent.map((item) => (
                <ContentCard key={item.id} item={item} onPublish={handlePublish} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'calendar' && (
        <ContentCalendar onCreateForDate={() => setActiveTab('create')} />
      )}

      {activeTab === 'grid' && (
        <ContentGrid />
      )}

      {activeTab === 'published' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">Published content with attribution metrics</p>
            <Link href="/revenue" className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors">
              <TrendingUp className="h-3 w-3" /> Full Attribution Dashboard
            </Link>
          </div>
          {loadingPublished ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#8790aa', fontSize: 13 }}>Loading...</div>
          ) : publishedContent.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
              <Grid3X3 className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No published content yet</p>
              <p className="text-xs text-muted-foreground mt-1">Mark drafts as published to track attribution</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {publishedContent.map((item) => (
                <ContentCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
