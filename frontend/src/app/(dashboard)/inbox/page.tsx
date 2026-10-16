"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  MessageSquare, RefreshCw, Send, Loader2, Facebook,
  ThumbsUp, MessageCircle, Share2, ExternalLink,
  User, Globe, Users, Info, ChevronRight, Image as ImageIcon,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────
interface Conversation {
  id: string; name: string; platform: string;
  last_message: string; timestamp: string; unread: number;
}
interface Message {
  id: string; from: string; message: string;
  created_time: string; is_mine: boolean;
}
interface Post {
  id: string; message?: string; story?: string; created_time: string;
  full_picture?: string; permalink_url?: string;
  likes?: { summary: { total_count: number } };
  comments?: { summary: { total_count: number } };
  shares?: { count: number };
}
interface PageInfo {
  id: string; name: string; category?: string;
  fan_count?: number; followers_count?: number;
  about?: string; website?: string;
  picture?: { data: { url: string } };
  cover?: { source: string };
}

function fmt(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function ErrBox({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 px-6 text-center">
      <div className="rounded-xl px-4 py-3 text-xs max-w-sm"
        style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#EF4444" }}>
        {msg}
      </div>
      <button onClick={onRetry} className="text-xs underline" style={{ color: "var(--crm-muted-foreground)" }}>Retry</button>
    </div>
  );
}

// ── Messages Tab ───────────────────────────────────────────────
function MessagesTab() {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConvs = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${API}/api/v1/meta/conversations`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail ?? "Failed");
      setConvs(d.data ?? []);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }, []);

  const loadMsgs = useCallback(async (conv: Conversation) => {
    setMsgs([]);
    try {
      const r = await fetch(`${API}/api/v1/meta/conversations/${conv.id}/messages`);
      const d = await r.json();
      if (r.ok) setMsgs(d.data ?? []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void loadConvs(); }, [loadConvs]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const pick = (c: Conversation) => { setSelected(c); void loadMsgs(c); };

  const send = async () => {
    if (!reply.trim() || !selected || sending) return;
    setSending(true);
    try {
      await fetch(`${API}/api/v1/meta/send`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "facebook", recipient_id: selected.id, text: reply }),
      });
      setReply(""); void loadMsgs(selected);
    } finally { setSending(false); }
  };

  return (
    <div className="flex" style={{ height: "100%", minHeight: 0 }}>
      {/* Conversation list */}
      <div className="flex flex-col w-72 shrink-0" style={{ borderRight: "1px solid var(--crm-glass-border)" }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--crm-glass-border)" }}>
          <span className="text-xs font-bold" style={{ color: "var(--crm-foreground)" }}>
            Messenger {convs.length > 0 && <span style={{ color: "var(--crm-muted-foreground)" }}>({convs.length})</span>}
          </span>
          <button onClick={() => void loadConvs()} className="rounded-lg p-1 hover:bg-white/20">
            <RefreshCw className="h-3.5 w-3.5" style={{ color: "var(--crm-muted-foreground)" }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--crm-muted-foreground)" }} /></div>}
          {error && <ErrBox msg={error} onRetry={loadConvs} />}
          {!loading && !error && convs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 px-4 text-center">
              <MessageSquare className="h-8 w-8" style={{ color: "var(--crm-muted-foreground)", opacity: 0.3 }} />
              <p className="text-xs" style={{ color: "var(--crm-muted-foreground)" }}>No conversations yet</p>
              <p className="text-[11px]" style={{ color: "var(--crm-muted-foreground)", opacity: 0.6 }}>
                Messages from your Facebook Page will appear here
              </p>
            </div>
          )}
          {convs.map((c) => (
            <button key={c.id} onClick={() => pick(c)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/10 transition-colors"
              style={selected?.id === c.id ? { background: "rgba(24,119,242,0.08)" } : {}}>
              <div className="relative shrink-0">
                <div className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold text-white"
                  style={{ background: "linear-gradient(135deg, #1877F2, #0a5dc2)" }}>
                  {c.name.charAt(0).toUpperCase()}
                </div>
                {c.unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                    style={{ background: "#1877F2" }}>{c.unread}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color: "var(--crm-foreground)" }}>{c.name}</p>
                <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--crm-muted-foreground)" }}>{c.last_message || "No messages yet"}</p>
                {c.timestamp && <p className="text-[10px] mt-0.5" style={{ color: "var(--crm-muted-foreground)", opacity: 0.6 }}>{fmt(c.timestamp)}</p>}
              </div>
              <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--crm-muted-foreground)" }} />
            </button>
          ))}
        </div>
      </div>

      {/* Chat panel */}
      {selected ? (
        <div className="flex flex-1 flex-col min-w-0">
          <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--crm-glass-border)" }}>
            <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg, #1877F2, #0a5dc2)" }}>
              {selected.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--crm-foreground)" }}>{selected.name}</p>
              <div className="flex items-center gap-1">
                <Facebook className="h-3 w-3" style={{ color: "#1877F2" }} />
                <span className="text-[11px]" style={{ color: "var(--crm-muted-foreground)" }}>Facebook Messenger</span>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {msgs.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--crm-muted-foreground)" }} />
              </div>
            )}
            {[...msgs].reverse().map((m) => (
              <div key={m.id} className={`flex flex-col ${m.is_mine ? "items-end" : "items-start"}`}>
                {!m.is_mine && <p className="text-[10px] mb-0.5 px-1" style={{ color: "var(--crm-muted-foreground)" }}>{m.from}</p>}
                <div className="max-w-[70%] rounded-2xl px-3 py-2 text-sm"
                  style={m.is_mine
                    ? { background: "#1877F2", color: "#fff" }
                    : { background: "rgba(0,0,0,0.06)", color: "var(--crm-foreground)" }}>
                  {m.message}
                </div>
                <p className="text-[10px] mt-0.5 px-1" style={{ color: "var(--crm-muted-foreground)", opacity: 0.6 }}>{fmt(m.created_time)}</p>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="flex items-center gap-2 px-4 py-3" style={{ borderTop: "1px solid var(--crm-glass-border)" }}>
            <input value={reply} onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
              placeholder="Reply via Messenger…"
              className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
              style={{ border: "1px solid var(--crm-border)", background: "rgba(255,255,255,0.5)", color: "var(--crm-foreground)" }} />
            <button onClick={() => void send()} disabled={!reply.trim() || sending}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-white transition-all"
              style={{ background: "#1877F2", opacity: (!reply.trim() || sending) ? 0.4 : 1 }}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <MessageSquare className="h-10 w-10" style={{ color: "var(--crm-muted-foreground)", opacity: 0.2 }} />
          <p className="text-sm" style={{ color: "var(--crm-muted-foreground)" }}>Select a conversation</p>
        </div>
      )}
    </div>
  );
}

// ── Posts Tab ──────────────────────────────────────────────────
function PostsTab() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${API}/api/v1/meta/posts?limit=10`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail ?? "Failed");
      setPosts(d.data ?? []);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed to load posts"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--crm-muted-foreground)" }} /></div>;
  if (error) return <ErrBox msg={error} onRetry={load} />;
  if (posts.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 gap-2">
      <ImageIcon className="h-10 w-10" style={{ color: "var(--crm-muted-foreground)", opacity: 0.3 }} />
      <p className="text-sm" style={{ color: "var(--crm-muted-foreground)" }}>No posts found</p>
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((p) => (
        <div key={p.id} className="rounded-2xl overflow-hidden flex flex-col"
          style={{ background: "var(--crm-glass-bg)", border: "1px solid var(--crm-glass-border)", boxShadow: "var(--crm-glass-shadow)" }}>
          {p.full_picture && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.full_picture} alt="" className="w-full object-cover" style={{ maxHeight: 200 }} />
          )}
          <div className="flex flex-col gap-2 p-4 flex-1">
            <p className="text-xs leading-relaxed line-clamp-3" style={{ color: "var(--crm-foreground)" }}>
              {p.message || p.story || <span style={{ color: "var(--crm-muted-foreground)", fontStyle: "italic" }}>No caption</span>}
            </p>
            <p className="text-[11px]" style={{ color: "var(--crm-muted-foreground)" }}>{fmt(p.created_time)}</p>
            <div className="flex items-center gap-4 pt-2" style={{ borderTop: "1px solid var(--crm-glass-border)" }}>
              <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--crm-muted-foreground)" }}>
                <ThumbsUp className="h-3.5 w-3.5" /> {p.likes?.summary?.total_count ?? 0}
              </span>
              <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--crm-muted-foreground)" }}>
                <MessageCircle className="h-3.5 w-3.5" /> {p.comments?.summary?.total_count ?? 0}
              </span>
              <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--crm-muted-foreground)" }}>
                <Share2 className="h-3.5 w-3.5" /> {p.shares?.count ?? 0}
              </span>
              {p.permalink_url && (
                <a href={p.permalink_url} target="_blank" rel="noreferrer" className="ml-auto" style={{ color: "#1877F2" }}>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Profile Tab ────────────────────────────────────────────────
function ProfileTab() {
  const [page, setPage] = useState<PageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${API}/api/v1/meta/page`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail ?? "Failed");
      setPage(d);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed to load page info"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--crm-muted-foreground)" }} /></div>;
  if (error) return <ErrBox msg={error} onRetry={load} />;
  if (!page) return null;

  const details = [
    { icon: Info,  label: "Category",   value: page.category },
    { icon: Users, label: "Followers",  value: page.followers_count?.toLocaleString() },
    { icon: ThumbsUp, label: "Likes",   value: page.fan_count?.toLocaleString() },
    { icon: Globe, label: "Website",    value: page.website },
    { icon: User,  label: "Page ID",    value: page.id },
  ].filter((r) => r.value);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {page.cover?.source && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={page.cover.source} alt="cover" className="w-full rounded-2xl object-cover" style={{ height: 180 }} />
      )}

      {/* Page header card */}
      <div className="flex items-center gap-4 rounded-2xl p-4"
        style={{ background: "var(--crm-glass-bg)", border: "1px solid var(--crm-glass-border)", boxShadow: "var(--crm-glass-shadow)" }}>
        {page.picture?.data?.url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={page.picture.data.url} alt="page" className="h-16 w-16 rounded-full object-cover shrink-0" />
          : <div className="h-16 w-16 rounded-full flex items-center justify-center text-2xl font-bold text-white shrink-0"
              style={{ background: "#1877F2" }}>{page.name.charAt(0)}</div>
        }
        <div>
          <p className="text-lg font-bold" style={{ color: "var(--crm-foreground)" }}>{page.name}</p>
          {page.category && <p className="text-sm" style={{ color: "var(--crm-muted-foreground)" }}>{page.category}</p>}
          <div className="flex items-center gap-1 mt-1">
            <Facebook className="h-3.5 w-3.5" style={{ color: "#1877F2" }} />
            <span className="text-xs" style={{ color: "#1877F2" }}>Facebook Page</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Followers", value: page.followers_count?.toLocaleString() ?? "—" },
          { label: "Page Likes", value: page.fan_count?.toLocaleString() ?? "—" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl p-4 text-center"
            style={{ background: "var(--crm-glass-bg)", border: "1px solid var(--crm-glass-border)" }}>
            <p className="text-2xl font-bold" style={{ color: "var(--crm-foreground)" }}>{s.value}</p>
            <p className="text-xs mt-1" style={{ color: "var(--crm-muted-foreground)" }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Details list */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: "var(--crm-glass-bg)", border: "1px solid var(--crm-glass-border)" }}>
        {details.map(({ icon: Icon, label, value }, i) => (
          <div key={label} className="flex items-center gap-3 px-4 py-3"
            style={i > 0 ? { borderTop: "1px solid var(--crm-glass-border)" } : {}}>
            <Icon className="h-4 w-4 shrink-0" style={{ color: "var(--crm-muted-foreground)" }} />
            <span className="text-xs w-24 shrink-0 font-medium" style={{ color: "var(--crm-muted-foreground)" }}>{label}</span>
            {label === "Website"
              ? <a href={value} target="_blank" rel="noreferrer" className="text-xs truncate" style={{ color: "#1877F2" }}>{value}</a>
              : <span className="text-xs truncate" style={{ color: "var(--crm-foreground)" }}>{value}</span>
            }
          </div>
        ))}
        {page.about && (
          <div className="px-4 py-3" style={{ borderTop: "1px solid var(--crm-glass-border)" }}>
            <p className="text-xs font-medium mb-1" style={{ color: "var(--crm-muted-foreground)" }}>About</p>
            <p className="text-xs leading-relaxed" style={{ color: "var(--crm-foreground)" }}>{page.about}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────
const TABS = [
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "posts",    label: "Posts",    icon: ImageIcon },
  { id: "profile",  label: "Profile",  icon: User },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function InboxPage() {
  const [tab, setTab] = useState<Tab>("messages");

  return (
    <div className="flex flex-col rounded-2xl overflow-hidden"
      style={{ height: "calc(100vh - 120px)", border: "1px solid var(--crm-glass-border)", background: "var(--crm-glass-bg)", boxShadow: "var(--crm-glass-shadow)" }}>

      {/* Header with tabs */}
      <div className="flex items-center gap-3 px-5 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--crm-glass-border)" }}>
        <div className="flex h-8 w-8 items-center justify-center rounded-xl shrink-0" style={{ background: "#1877F2" }}>
          <Facebook className="h-4 w-4 text-white" />
        </div>
        <div>
          <h1 className="text-sm font-bold" style={{ color: "var(--crm-foreground)" }}>Facebook</h1>
          <p className="text-[11px]" style={{ color: "var(--crm-muted-foreground)" }}>Unified Social Inbox</p>
        </div>

        <div className="ml-auto flex gap-1 rounded-xl p-1" style={{ background: "rgba(0,0,0,0.05)" }}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
              style={tab === id
                ? { background: "#1877F2", color: "#fff" }
                : { color: "var(--crm-muted-foreground)" }}>
              <Icon className="h-3.5 w-3.5" />{label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {tab === "messages" && (
          <div className="h-full flex flex-col" style={{ minHeight: 0 }}>
            <MessagesTab />
          </div>
        )}
        {tab === "posts" && (
          <div className="h-full overflow-y-auto p-5">
            <PostsTab />
          </div>
        )}
        {tab === "profile" && (
          <div className="h-full overflow-y-auto p-5">
            <ProfileTab />
          </div>
        )}
      </div>
    </div>
  );
}
