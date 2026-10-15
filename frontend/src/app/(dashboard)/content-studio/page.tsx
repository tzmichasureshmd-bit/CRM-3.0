"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Sparkles, FileText, Calendar, Grid3X3, Plus, Loader2, Copy, Check, RefreshCw, Wand2 } from "lucide-react";
import type { ContentItem, ContentStatus, GeneratedContent } from "@/types";

const TABS = [
  { id: "create",    label: "AI Create",  icon: Wand2 },
  { id: "drafts",    label: "Drafts",     icon: FileText },
  { id: "scheduled", label: "Scheduled",  icon: Calendar },
  { id: "published", label: "Published",  icon: Grid3X3 },
] as const;
type Tab = (typeof TABS)[number]["id"];

const STATUS_STYLES: Record<ContentStatus, { color: string; bg: string }> = {
  draft:        { color: "#64748B", bg: "rgba(100,116,139,0.1)" },
  ai_generated: { color: "#7C3AED", bg: "rgba(124,58,237,0.1)" },
  in_review:    { color: "#D97706", bg: "rgba(217,119,6,0.1)" },
  approved:     { color: "#2563EB", bg: "rgba(37,99,235,0.1)" },
  scheduled:    { color: "#4F46E5", bg: "rgba(79,70,229,0.1)" },
  published:    { color: "#10B981", bg: "rgba(16,185,129,0.1)" },
  failed:       { color: "#EF4444", bg: "rgba(239,68,68,0.1)" },
};

function AIGenerator({ onGenerated }: { onGenerated: (c: GeneratedContent) => void }) {
  const [prompt, setPrompt]     = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [tone, setTone]         = useState("professional");
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<GeneratedContent | null>(null);
  const [copied, setCopied]     = useState<string | null>(null);

  const generate = useCallback(async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true); setResult(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_AI_URL}/api/content/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, platform, tone }),
      });
      setResult(res.ok ? await res.json() : null);
    } catch { setResult(null); }
    finally { setLoading(false); }
  }, [prompt, platform, tone, loading]);

  const copy = (text: string, key: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(key); setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="rounded-2xl p-5 space-y-4"
      style={{ background: "var(--crm-glass-bg)", border: "1px solid var(--crm-glass-border)", boxShadow: "var(--crm-glass-shadow)", backdropFilter: "blur(16px)" }}>
      <div className="flex items-center gap-2">
        <Wand2 className="h-5 w-5" style={{ color: "var(--crm-brand)" }} />
        <h2 className="text-[15px] font-semibold" style={{ color: "var(--crm-foreground)" }}>AI Content Generator</h2>
      </div>

      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
        placeholder='"Create a Diwali promotion for our premium service" or "New product launch for young professionals"'
        rows={3}
        className="w-full resize-none rounded-xl px-4 py-3 text-sm"
        style={{
          border: "1px solid var(--crm-border)",
          background: "rgba(255,255,255,0.5)",
          color: "var(--crm-foreground)",
        }}
      />

      <div className="flex flex-wrap gap-3">
        {[
          { label: "Platform", value: platform, onChange: setPlatform, options: ["instagram", "facebook", "whatsapp", "telegram"] },
          { label: "Tone",     value: tone,     onChange: setTone,     options: ["professional", "friendly", "exciting", "informative", "urgent"] },
        ].map((sel) => (
          <div key={sel.label} className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: "var(--crm-muted-foreground)" }}>{sel.label}</label>
            <select value={sel.value} onChange={(e) => sel.onChange(e.target.value)}
              className="rounded-lg px-3 py-1.5 text-sm"
              style={{ border: "1px solid var(--crm-border)", background: "rgba(255,255,255,0.5)", color: "var(--crm-foreground)" }}>
              {sel.options.map((o) => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
            </select>
          </div>
        ))}
        <div className="flex items-end">
          <button onClick={() => void generate()} disabled={!prompt.trim() || loading}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold text-white transition-all"
            style={{
              background: "linear-gradient(135deg, #4F6EF7, #7C3AED)",
              opacity: (!prompt.trim() || loading) ? 0.5 : 1,
              boxShadow: "0 2px 8px rgba(79,110,247,0.3)",
            }}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate
          </button>
        </div>
      </div>

      {result && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="space-y-3 rounded-xl p-4"
          style={{ border: "1px solid rgba(79,110,247,0.2)", background: "rgba(79,110,247,0.05)" }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--crm-brand)" }}>Generated Content</span>
            <button onClick={() => void generate()} className="inline-flex items-center gap-1 text-xs transition-colors"
              style={{ color: "var(--crm-muted-foreground)" }}>
              <RefreshCw className="h-3 w-3" /> Regenerate
            </button>
          </div>
          {[
            { key: "headline", label: "Headline", value: result.headline },
            { key: "caption",  label: "Caption",  value: result.caption },
            { key: "cta",      label: "CTA",      value: result.cta },
          ].map((field) => field.value && (
            <div key={field.key}>
              <p className="text-[11px] font-semibold uppercase mb-1" style={{ color: "var(--crm-muted-foreground)" }}>{field.label}</p>
              <div className="flex items-start gap-2">
                <p className="flex-1 text-sm whitespace-pre-wrap" style={{ color: "var(--crm-foreground)" }}>{field.value}</p>
                <button onClick={() => copy(field.value, field.key)} style={{ color: "var(--crm-muted-foreground)" }}>
                  {copied === field.key ? <Check className="h-3.5 w-3.5" style={{ color: "#10B981" }} /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          ))}
          {result.hashtags.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase mb-1" style={{ color: "var(--crm-muted-foreground)" }}>Hashtags</p>
              <div className="flex flex-wrap gap-1">
                {result.hashtags.map((tag) => (
                  <span key={tag} className="rounded-full px-2 py-0.5 text-xs"
                    style={{ background: "rgba(79,110,247,0.1)", color: "var(--crm-brand)" }}>#{tag}</span>
                ))}
              </div>
            </div>
          )}
          <button onClick={() => onGenerated(result)}
            className="w-full rounded-xl py-2 text-sm font-semibold transition-all"
            style={{ border: "1px solid var(--crm-brand)", background: "rgba(79,110,247,0.08)", color: "var(--crm-brand)" }}>
            Use This Content
          </button>
        </motion.div>
      )}
    </div>
  );
}

export default function ContentStudioPage() {
  const [tab, setTab]       = useState<Tab>("create");
  const [drafts, setDrafts] = useState<Partial<ContentItem>[]>([]);

  const handleGenerated = useCallback((content: GeneratedContent) => {
    setDrafts((p) => [{
      id: `draft-${Date.now()}`,
      title: content.headline || "AI Generated Content",
      caption: content.caption,
      cta: content.cta,
      hashtags: content.hashtags,
      platform: "instagram",
      status: "ai_generated",
      ai_generated: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, ...p]);
    setTab("drafts");
  }, []);

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--crm-foreground)" }}>Content Studio</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--crm-muted-foreground)" }}>Create, schedule and track content across all channels</p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-all"
          style={{ background: "linear-gradient(135deg, #4F6EF7, #7C3AED)", boxShadow: "0 2px 8px rgba(79,110,247,0.3)" }}>
          <Plus className="h-4 w-4" /> New Content
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl p-1"
        style={{ border: "1px solid var(--crm-border)", background: "var(--crm-muted)" }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all"
            style={tab === id
              ? { background: "var(--crm-glass-bg)", color: "var(--crm-foreground)", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }
              : { color: "var(--crm-muted-foreground)" }
            }>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {tab === "create" && <AIGenerator onGenerated={handleGenerated} />}

      {tab === "drafts" && (
        drafts.length === 0
          ? <div className="flex flex-col items-center justify-center rounded-2xl py-16 text-center"
              style={{ border: "1px dashed var(--crm-border)" }}>
              <FileText className="h-10 w-10 mb-3" style={{ color: "var(--crm-muted-foreground)", opacity: 0.5 }} />
              <p className="text-sm font-medium" style={{ color: "var(--crm-muted-foreground)" }}>No drafts yet</p>
              <button onClick={() => setTab("create")}
                className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white"
                style={{ background: "linear-gradient(135deg, #4F6EF7, #7C3AED)" }}>
                <Sparkles className="h-4 w-4" /> Generate with AI
              </button>
            </div>
          : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {drafts.map((item) => {
                const s = STATUS_STYLES[item.status as ContentStatus];
                return (
                  <motion.div key={item.id} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                    className="rounded-2xl p-4 space-y-3 transition-all"
                    style={{ background: "var(--crm-glass-bg)", border: "1px solid var(--crm-glass-border)", boxShadow: "var(--crm-glass-shadow)", backdropFilter: "blur(16px)" }}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold truncate" style={{ color: "var(--crm-foreground)" }}>{item.title}</p>
                      {s && (
                        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize"
                          style={{ color: s.color, background: s.bg }}>
                          {(item.status ?? "").replace("_", " ")}
                        </span>
                      )}
                    </div>
                    <p className="text-xs line-clamp-2" style={{ color: "var(--crm-muted-foreground)" }}>{item.caption}</p>
                    {item.ai_generated && (
                      <div className="flex items-center gap-1 text-[10px]" style={{ color: "#7C3AED" }}>
                        <Sparkles className="h-3 w-3" /> AI Generated
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
      )}

      {(tab === "scheduled" || tab === "published") && (
        <div className="flex flex-col items-center justify-center rounded-2xl py-16 text-center"
          style={{ border: "1px dashed var(--crm-border)" }}>
          {tab === "scheduled"
            ? <Calendar className="h-10 w-10 mb-3" style={{ color: "var(--crm-muted-foreground)", opacity: 0.5 }} />
            : <Grid3X3 className="h-10 w-10 mb-3" style={{ color: "var(--crm-muted-foreground)", opacity: 0.5 }} />
          }
          <p className="text-sm font-medium" style={{ color: "var(--crm-muted-foreground)" }}>No {tab} content yet</p>
        </div>
      )}
    </div>
  );
}
