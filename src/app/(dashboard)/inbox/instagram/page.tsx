'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Heart, MessageCircle, Send, Bookmark, MoreHorizontal,
  Image, Play, RefreshCw, ExternalLink, Eye, Users,
  TrendingUp, AtSign, X, Reply, Settings, Search,
  CheckCheck, Grid, Film, Compass,
} from 'lucide-react';

// ── IG Brand ─────────────────────────────────────────────────
const IG = {
  grad:    'linear-gradient(45deg,#f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%)',
  pink:    '#E1306C',
  purple:  '#833AB4',
  orange:  '#F77737',
  dark:    '#0A0A0A',
  surface: '#121212',
  panel:   '#1C1C1C',
  border:  'rgba(255,255,255,0.12)',
  text:    '#F5F5F5',
  muted:   '#A8A8A8',
  blue:    '#0095F6',
};

// ── Types ─────────────────────────────────────────────────────
interface IGProfile {
  id: string; name: string; username: string; biography: string;
  followers_count: number; follows_count: number; media_count: number;
  profile_picture_url: string; website: string;
}
interface IGMedia {
  id: string; caption: string; media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_url: string; thumbnail_url?: string; permalink: string;
  timestamp: string; like_count: number; comments_count: number;
}
interface IGStory {
  id: string; media_type: string; media_url: string; timestamp: string;
}
interface IGComment {
  id: string; text: string; username: string; timestamp: string; like_count: number;
  replies?: { data: IGComment[] };
}
interface IGConv {
  id: string; username: string; user_id: string;
  last_message: string; timestamp: string; unread: number;
}
interface IGMsg {
  id: string; from: string; from_id: string;
  message: string; created_time: string; is_mine: boolean;
}
interface IGCreds {
  INSTAGRAM_PAGE_ID: string; INSTAGRAM_VERIFY_TOKEN: string;
  INSTAGRAM_APP_SECRET: string; FACEBOOK_PAGE_ACCESS_TOKEN: string;
}

type Tab = 'feed' | 'reels' | 'stories' | 'messages' | 'comments' | 'mentions' | 'insights' | 'profile';

const API = `/api/v3/instagram`;
const getH = () => ({
  Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('crm_token') ?? '' : ''}`,
  'Content-Type': 'application/json',
});

function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'Just now';
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  if (d < 604800) return `${Math.floor(d / 86400)}d`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── IG Gradient Icon ──────────────────────────────────────────
function IGIcon({ size = 24 }: { size?: number }) {
  const id = `ig-grad-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id={id} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f09433" />
          <stop offset="25%" stopColor="#e6683c" />
          <stop offset="50%" stopColor="#dc2743" />
          <stop offset="75%" stopColor="#cc2366" />
          <stop offset="100%" stopColor="#bc1888" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="6" fill={`url(#${id})`} />
      <circle cx="12" cy="12" r="4.5" stroke="white" strokeWidth="1.8" fill="none" />
      <circle cx="17.5" cy="6.5" r="1.2" fill="white" />
    </svg>
  );
}

// ── Story Ring ────────────────────────────────────────────────
function StoryRing({ story, label }: { story: IGStory; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div onClick={() => setOpen(true)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer', flexShrink: 0 }}>
        <div style={{ width: 66, height: 66, borderRadius: '50%', padding: 2.5, background: IG.grad }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', border: `2px solid ${IG.dark}`, background: IG.panel }}>
            {story.media_url
              ? <img src={story.media_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Play size={16} color={IG.muted} /></div>
            }
          </div>
        </div>
        <span style={{ fontSize: 11, color: IG.text, maxWidth: 66, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label ?? timeAgo(story.timestamp)}
        </span>
      </div>
      {/* Story viewer */}
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'relative', maxWidth: 400, width: '100%', aspectRatio: '9/16', borderRadius: 16, overflow: 'hidden' }}>
            {story.media_url
              ? <img src={story.media_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', background: IG.panel, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Play size={48} color={IG.muted} /></div>
            }
            <div style={{ position: 'absolute', top: 12, right: 12 }}>
              <button onClick={() => setOpen(false)} style={{ background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white' }}><X size={16} /></button>
            </div>
            <div style={{ position: 'absolute', bottom: 12, left: 12, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{timeAgo(story.timestamp)}</div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Post Card ─────────────────────────────────────────────────
function PostCard({ post, profile, onComment }: { post: IGMedia; profile: IGProfile | null; onComment: (p: IGMedia) => void }) {
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showCaption, setShowCaption] = useState(false);

  return (
    <div style={{ background: IG.surface, border: `1px solid ${IG.border}`, borderRadius: 12, overflow: 'hidden' }}>
      {/* Post header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', padding: 1.5, background: IG.grad, flexShrink: 0 }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', border: `1.5px solid ${IG.dark}` }}>
            {profile?.profile_picture_url
              ? <img src={profile.profile_picture_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', background: IG.panel }} />
            }
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: IG.text }}>{profile?.username ?? 'you'}</div>
          <div style={{ fontSize: 11, color: IG.muted }}>{timeAgo(post.timestamp)}</div>
        </div>
        <a href={post.permalink} target="_blank" rel="noreferrer" style={{ color: IG.muted, display: 'flex' }}><ExternalLink size={14} /></a>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: IG.muted, padding: '0 2px' }}><MoreHorizontal size={16} /></button>
      </div>

      {/* Media */}
      <div style={{ position: 'relative', aspectRatio: '1', background: IG.panel, overflow: 'hidden' }}>
        {post.media_url
          ? <img src={post.media_type === 'VIDEO' ? (post.thumbnail_url ?? post.media_url) : post.media_url}
              alt={post.caption?.slice(0, 40)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Image size={32} color={IG.muted} /></div>
        }
        {post.media_type === 'VIDEO' && (
          <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.65)', borderRadius: 6, padding: '3px 7px', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Play size={10} color="white" fill="white" /><span style={{ fontSize: 10, color: 'white', fontWeight: 600 }}>Reel</span>
          </div>
        )}
        {post.media_type === 'CAROUSEL_ALBUM' && (
          <div style={{ position: 'absolute', top: 10, right: 10 }}>
            <Grid size={18} color="white" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))' }} />
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ padding: '10px 14px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
          <button onClick={() => setLiked(l => !l)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, color: liked ? '#FF3040' : IG.text, padding: 0 }}>
            <Heart size={22} fill={liked ? '#FF3040' : 'none'} color={liked ? '#FF3040' : IG.text} strokeWidth={1.8} />
          </button>
          <button onClick={() => onComment(post)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, color: IG.text, padding: 0 }}>
            <MessageCircle size={22} strokeWidth={1.8} />
          </button>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: IG.text, padding: 0 }}>
            <Send size={22} strokeWidth={1.8} />
          </button>
          <button onClick={() => setSaved(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: IG.text, padding: 0, marginLeft: 'auto' }}>
            <Bookmark size={22} fill={saved ? IG.text : 'none'} strokeWidth={1.8} />
          </button>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: IG.text, marginBottom: 4 }}>
          {fmt(post.like_count + (liked ? 1 : 0))} likes
        </div>
        {post.caption && (
          <div style={{ fontSize: 13, color: IG.text, lineHeight: 1.5 }}>
            <span style={{ fontWeight: 700 }}>{profile?.username ?? 'you'} </span>
            <span style={{ color: showCaption ? IG.text : IG.muted }}>
              {showCaption ? post.caption : post.caption.slice(0, 80)}
            </span>
            {post.caption.length > 80 && (
              <button onClick={() => setShowCaption(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: IG.muted, fontSize: 13, padding: 0, marginLeft: 4 }}>
                {showCaption ? 'less' : 'more'}
              </button>
            )}
          </div>
        )}
        {post.comments_count > 0 && (
          <button onClick={() => onComment(post)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: IG.muted, padding: '4px 0 0', display: 'block' }}>
            View all {fmt(post.comments_count)} comments
          </button>
        )}
        <div style={{ fontSize: 11, color: IG.muted, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{timeAgo(post.timestamp)}</div>
      </div>
    </div>
  );
}

// ── Comment Panel ─────────────────────────────────────────────
function CommentPanel({ post, onClose }: { post: IGMedia; onClose: () => void }) {
  const [comments, setComments] = useState<IGComment[]>([]);
  const [reply, setReply]       = useState('');
  const [replyTo, setReplyTo]   = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetch(`${API}/media/${post.id}/comments`, { headers: getH() })
      .then(r => r.json())
      .then((d: { data?: IGComment[] }) => setComments(d.data ?? []))
      .finally(() => setLoading(false));
  }, [post.id]);

  const sendReply = async (commentId: string) => {
    if (!reply.trim()) return;
    await fetch(`${API}/comments/${commentId}/reply`, {
      method: 'POST', headers: getH(),
      body: JSON.stringify({ text: reply }),
    });
    setReply(''); setReplyTo(null);
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column', background: IG.surface, border: `1px solid ${IG.border}`, borderRadius: 16, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${IG.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: IG.text }}>Comments</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: IG.muted }}><X size={18} /></button>
        </div>
        {/* Post preview */}
        <div style={{ padding: '10px 18px', borderBottom: `1px solid ${IG.border}`, display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: IG.panel }}>
            {post.media_url && <img src={post.media_type === 'VIDEO' ? (post.thumbnail_url ?? '') : post.media_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          </div>
          <div style={{ fontSize: 12, color: IG.muted, lineHeight: 1.4, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.caption || 'No caption'}</div>
        </div>
        {/* Comments list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {loading && <div style={{ color: IG.muted, fontSize: 13 }}>Loading comments…</div>}
          {!loading && comments.length === 0 && <div style={{ color: IG.muted, fontSize: 13 }}>No comments yet.</div>}
          {comments.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: IG.grad, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                {c.username?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: IG.text }}>
                  <span style={{ fontWeight: 700 }}>@{c.username} </span>{c.text}
                </div>
                <div style={{ display: 'flex', gap: 14, marginTop: 5, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: IG.muted }}>{timeAgo(c.timestamp)}</span>
                  {c.like_count > 0 && <span style={{ fontSize: 11, color: IG.muted }}>{c.like_count} likes</span>}
                  <button onClick={() => setReplyTo(replyTo === c.id ? null : c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: IG.muted, padding: 0 }}>Reply</button>
                </div>
                {replyTo === c.id && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input value={reply} onChange={e => setReply(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') void sendReply(c.id); }}
                      placeholder={`Reply to @${c.username}…`}
                      style={{ flex: 1, padding: '8px 12px', borderRadius: 20, border: `1px solid ${IG.border}`, background: IG.panel, color: IG.text, fontSize: 13, outline: 'none' }} />
                    <button onClick={() => void sendReply(c.id)} style={{ padding: '8px 14px', borderRadius: 20, background: IG.blue, border: 'none', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Post</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        {/* Add comment */}
        <div style={{ padding: '12px 18px', borderTop: `1px solid ${IG.border}`, display: 'flex', gap: 10, alignItems: 'center' }}>
          <input value={reply} onChange={e => setReply(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !replyTo) void sendReply(comments[0]?.id ?? ''); }}
            placeholder="Add a comment…"
            style={{ flex: 1, padding: '9px 14px', borderRadius: 20, border: `1px solid ${IG.border}`, background: IG.panel, color: IG.text, fontSize: 13, outline: 'none' }} />
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: reply.trim() ? IG.blue : IG.muted }}>Post</button>
        </div>
      </div>
    </div>
  );
}

// ── DM Panel ──────────────────────────────────────────────────
function DMPanel({ convs, onRefresh }: { convs: IGConv[]; onRefresh: () => void }) {
  const [sel, setSel]       = useState<IGConv | null>(null);
  const [msgs, setMsgs]     = useState<IGMsg[]>([]);
  const [text, setText]     = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const lastCountRef        = useRef(0);
  const atBottomRef         = useRef(true);
  const listRef             = useRef<HTMLDivElement>(null);
  const bottomRef           = useRef<HTMLDivElement>(null);

  const loadMsgs = useCallback(async (conv: IGConv, silent = false) => {
    const r = await fetch(`${API}/conversations/${conv.id}/messages`, { headers: getH() });
    if (r.ok) {
      const d = await r.json() as { data?: IGMsg[] };
      const next = d.data ?? [];
      if (silent && next.length === lastCountRef.current) return;
      lastCountRef.current = next.length;
      setMsgs(next);
    }
  }, []);

  useEffect(() => {
    if (!sel) return;
    void loadMsgs(sel);
    const id = setInterval(() => void loadMsgs(sel, true), 5000);
    return () => clearInterval(id);
  }, [sel, loadMsgs]);

  useEffect(() => {
    if (atBottomRef.current && bottomRef.current)
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  const send = async () => {
    if (!text.trim() || !sel || sending) return;
    setSending(true);
    const t = text; setText('');
    try {
      await fetch(`${API}/conversations/${sel.id}/reply`, {
        method: 'POST', headers: getH(),
        body: JSON.stringify({ text: t, recipient_id: sel.user_id }),
      });
      await loadMsgs(sel);
    } finally { setSending(false); }
  };

  const filtered = convs.filter(c => c.username.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ display: 'flex', height: 560, background: IG.surface, border: `1px solid ${IG.border}`, borderRadius: 16, overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ width: 280, flexShrink: 0, borderRight: `1px solid ${IG.border}`, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${IG.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: IG.text }}>Messages</span>
          <button onClick={onRefresh} style={{ background: 'none', border: 'none', cursor: 'pointer', color: IG.muted }}><RefreshCw size={14} /></button>
        </div>
        <div style={{ padding: '8px 12px', borderBottom: `1px solid ${IG.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10, background: IG.panel }}>
            <Search size={13} color={IG.muted} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: IG.text, fontSize: 13 }} />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 && <div style={{ padding: 20, color: IG.muted, fontSize: 13 }}>No conversations</div>}
          {filtered.map(c => (
            <div key={c.id} onClick={() => setSel(c)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', background: sel?.id === c.id ? 'rgba(225,48,108,0.10)' : 'transparent', borderBottom: `1px solid ${IG.border}` }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', padding: 2, background: c.unread > 0 ? IG.grad : IG.panel, flexShrink: 0 }}>
                <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: IG.panel, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: 'white', border: `2px solid ${IG.surface}` }}>
                  {c.username[0].toUpperCase()}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: c.unread > 0 ? 700 : 500, color: IG.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{c.username}</div>
                <div style={{ fontSize: 12, color: IG.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.last_message || 'No messages'}</div>
              </div>
              {c.unread > 0 && <div style={{ minWidth: 20, height: 20, borderRadius: 10, background: IG.pink, color: 'white', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{c.unread}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Chat */}
      {sel ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${IG.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: IG.grad, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'white' }}>{sel.username[0].toUpperCase()}</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: IG.text }}>@{sel.username}</div>
              <div style={{ fontSize: 11, color: IG.muted }}>Instagram DM</div>
            </div>
          </div>
          <div ref={listRef} onScroll={() => { const el = listRef.current; if (el) atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}
            style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...msgs].reverse().map(m => (
              <div key={m.id} style={{ display: 'flex', justifyContent: m.is_mine ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '70%', padding: '9px 14px', borderRadius: m.is_mine ? '18px 18px 4px 18px' : '18px 18px 18px 4px', fontSize: 13.5, lineHeight: 1.5, background: m.is_mine ? IG.grad : IG.panel, color: 'white' }}>
                  {m.message}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <div style={{ padding: '10px 14px', borderTop: `1px solid ${IG.border}`, display: 'flex', gap: 10, alignItems: 'center' }}>
            <input value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
              placeholder="Message…"
              style={{ flex: 1, padding: '10px 16px', borderRadius: 22, border: `1px solid ${IG.border}`, background: IG.panel, color: IG.text, fontSize: 14, outline: 'none' }} />
            <button onClick={() => void send()} disabled={!text.trim() || sending}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: text.trim() ? IG.blue : IG.muted, fontWeight: 700, fontSize: 14, opacity: sending ? 0.5 : 1 }}>Send</button>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: IG.muted }}>
          <MessageCircle size={48} strokeWidth={1} />
          <div style={{ fontSize: 16, fontWeight: 600, color: IG.text }}>Your messages</div>
          <div style={{ fontSize: 13, color: IG.muted }}>Select a conversation to start chatting</div>
        </div>
      )}
    </div>
  );
}

// ── Insights Tab ──────────────────────────────────────────────
function InsightsTab({ profile }: { profile: IGProfile | null }) {
  if (!profile) return (
    <div style={{ padding: '40px 20px', textAlign: 'center', color: IG.muted, fontSize: 13 }}>Connect Instagram to see insights</div>
  );
  const stats = [
    { label: 'Followers',  value: fmt(profile.followers_count), icon: <Users size={18} />,     color: IG.pink,   bg: 'rgba(225,48,108,0.12)' },
    { label: 'Following',  value: fmt(profile.follows_count),   icon: <Heart size={18} />,     color: '#833AB4', bg: 'rgba(131,58,180,0.12)' },
    { label: 'Posts',      value: fmt(profile.media_count),     icon: <Grid size={18} />,      color: '#F77737', bg: 'rgba(247,119,55,0.12)' },
    { label: 'Reach',      value: '—',                          icon: <Eye size={18} />,       color: '#28c99a', bg: 'rgba(40,201,154,0.12)' },
    { label: 'Impressions',value: '—',                          icon: <TrendingUp size={18} />,color: '#4f6df5', bg: 'rgba(79,109,245,0.12)' },
    { label: 'Saves',      value: '—',                          icon: <Bookmark size={18} />,  color: '#f4c95d', bg: 'rgba(244,201,93,0.12)' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Profile hero */}
      <div style={{ background: IG.surface, border: `1px solid ${IG.border}`, borderRadius: 16, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', padding: 3, background: IG.grad, flexShrink: 0 }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', border: `2px solid ${IG.dark}` }}>
            {profile.profile_picture_url
              ? <img src={profile.profile_picture_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', background: IG.panel }} />
            }
          </div>
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: IG.text }}>{profile.name}</div>
          <div style={{ fontSize: 13, color: IG.pink, marginTop: 2 }}>@{profile.username}</div>
          {profile.biography && <div style={{ fontSize: 12, color: IG.muted, marginTop: 6, lineHeight: 1.5, maxWidth: 360 }}>{profile.biography}</div>}
        </div>
      </div>
      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: IG.surface, border: `1px solid ${IG.border}`, borderRadius: 14, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color, flexShrink: 0 }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 750, color: IG.text }}>{s.value}</div>
              <div style={{ fontSize: 11, color: IG.muted, marginTop: 1 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Connect Modal ─────────────────────────────────────────────
function ConnectModal({ creds, onChange, onSave, onClose, saving, msg }: {
  creds: IGCreds; onChange: (k: keyof IGCreds, v: string) => void;
  onSave: () => void; onClose: () => void; saving: boolean; msg: string;
}) {
  const fields: { key: keyof IGCreds; label: string; ph: string; secret?: boolean }[] = [
    { key: 'INSTAGRAM_PAGE_ID',          label: 'Instagram Page ID',    ph: '17641442196029096' },
    { key: 'FACEBOOK_PAGE_ACCESS_TOKEN', label: 'Page Access Token',    ph: 'EAAxxxxx…', secret: true },
    { key: 'INSTAGRAM_VERIFY_TOKEN',     label: 'Verify Token',         ph: 'tzmicha_crm3_verify' },
    { key: 'INSTAGRAM_APP_SECRET',       label: 'App Secret',           ph: 'abc123…', secret: true },
  ];
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, background: IG.surface, border: `1px solid ${IG.border}`, borderRadius: 18, padding: 26, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <IGIcon size={38} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: IG.text }}>Connect Instagram</div>
              <div style={{ fontSize: 11, color: IG.muted }}>Credentials saved to your account</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: IG.muted }}><X size={18} /></button>
        </div>
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(225,48,108,0.08)', border: '1px solid rgba(225,48,108,0.20)', fontSize: 12, color: IG.muted, lineHeight: 1.6 }}>
          1. Go to <strong style={{ color: IG.pink }}>Meta for Developers</strong> → Instagram → API Setup<br />
          2. Copy your Page ID and access token<br />
          3. Webhook URL: <code style={{ color: IG.text, fontSize: 11 }}>https://crm3.tzmicha.com/api/v1/webhooks/instagram</code>
        </div>
        {fields.map(f => (
          <div key={f.key}>
            <label style={{ fontSize: 11, fontWeight: 700, color: IG.muted, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{f.label}</label>
            <input type={f.secret ? 'password' : 'text'} placeholder={f.ph} value={creds[f.key]}
              onChange={e => onChange(f.key, e.target.value)}
              style={{ width: '100%', padding: '10px 13px', borderRadius: 10, border: `1px solid ${IG.border}`, background: IG.panel, color: IG.text, fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />
          </div>
        ))}
        {msg && <div style={{ fontSize: 12, fontWeight: 600, color: msg.startsWith('✓') ? '#28c99a' : '#f46b72' }}>{msg}</div>}
        <button onClick={onSave} disabled={saving}
          style={{ padding: '12px', borderRadius: 12, background: IG.grad, border: 'none', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving…' : 'Save & Connect'}
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function InstagramPage() {
  const [tab, setTab]         = useState<Tab>('profile');
  const [profile, setProfile] = useState<IGProfile | null>(null);
  const [media, setMedia]     = useState<IGMedia[]>([]);
  const [stories, setStories] = useState<IGStory[]>([]);
  const [convs, setConvs]     = useState<IGConv[]>([]);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected]   = useState(false);
  const [commentPost, setCommentPost] = useState<IGMedia | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [creds, setCreds] = useState<IGCreds>({ INSTAGRAM_PAGE_ID: '', INSTAGRAM_VERIFY_TOKEN: '', INSTAGRAM_APP_SECRET: '', FACEBOOK_PAGE_ACCESS_TOKEN: '' });
  const [saving, setSaving]   = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const lastMediaCount        = useRef(0);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const statusRes = await fetch(`${API}/status`, { headers: getH() });
      if (statusRes.ok) {
        const st = await statusRes.json() as { configured: boolean };
        if (!st.configured) { setConnected(false); return; }
        setConnected(true);
      }
      const [profileRes, mediaRes, storiesRes, convsRes] = await Promise.allSettled([
        fetch(`${API}/profile`, { headers: getH() }),
        fetch(`${API}/media?limit=24`, { headers: getH() }),
        fetch(`${API}/stories`, { headers: getH() }),
        fetch(`${API}/conversations`, { headers: getH() }),
      ]);
      if (profileRes.status === 'fulfilled' && profileRes.value.ok)
        setProfile(await profileRes.value.json());
      if (mediaRes.status === 'fulfilled' && mediaRes.value.ok) {
        const md = await mediaRes.value.json() as { data?: IGMedia[] };
        const next = md.data ?? [];
        if (!silent || next.length !== lastMediaCount.current) {
          lastMediaCount.current = next.length;
          setMedia(next);
        }
      }
      if (storiesRes.status === 'fulfilled' && storiesRes.value.ok) {
        const st = await storiesRes.value.json() as { data?: IGStory[] };
        setStories(st.data ?? []);
      }
      if (convsRes.status === 'fulfilled' && convsRes.value.ok) {
        const cv = await convsRes.value.json() as { data?: IGConv[] };
        setConvs(cv.data ?? []);
      }
    } finally { if (!silent) setLoading(false); }
  }, []);

  const loadCreds = useCallback(async () => {
    const r = await fetch(`${API}/settings/integrations/instagram`, { headers: getH() });
    if (r.ok) { const d = await r.json() as Partial<IGCreds>; setCreds(p => ({ ...p, ...d })); }
  }, []);

  useEffect(() => { void loadCreds(); void loadAll(); }, [loadAll, loadCreds]);

  // Re-fetch after session renewal so page recovers without manual refresh
  useEffect(() => {
    const handler = () => void loadAll();
    window.addEventListener('crm:session-renewed', handler);
    return () => window.removeEventListener('crm:session-renewed', handler);
  }, [loadAll]);

  // silent poll every 10s
  useEffect(() => {
    const id = setInterval(() => void loadAll(true), 10000);
    return () => clearInterval(id);
  }, [loadAll]);

  const saveCreds = async () => {
    setSaving(true); setSaveMsg('');
    try {
      const r = await fetch(`${API}/settings/integrations/instagram`, {
        method: 'POST', headers: getH(), body: JSON.stringify(creds),
      });
      if (r.ok) { setSaveMsg('✓ Saved! Loading profile…'); void loadAll(); setTimeout(() => { setShowConnect(false); setSaveMsg(''); }, 1400); }
      else setSaveMsg('✗ Save failed. Check credentials.');
    } finally { setSaving(false); }
  };

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'profile',  label: 'Profile',  icon: <Users size={14} /> },
    { id: 'feed',     label: 'Feed',     icon: <Grid size={14} /> },
    { id: 'reels',    label: 'Reels',    icon: <Film size={14} /> },
    { id: 'stories',  label: 'Stories',  icon: <Compass size={14} /> },
    { id: 'messages', label: 'Messages', icon: <MessageCircle size={14} /> },
    { id: 'comments', label: 'Comments', icon: <Reply size={14} /> },
    { id: 'mentions', label: 'Mentions', icon: <AtSign size={14} /> },
    { id: 'insights', label: 'Insights', icon: <TrendingUp size={14} /> },
  ];

  const reels = media.filter(m => m.media_type === 'VIDEO');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, background: IG.dark, minHeight: '100%', borderRadius: 16, overflow: 'hidden' }}>

      {/* ── Top bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', background: IG.surface, borderBottom: `1px solid ${IG.border}` }}>
        <IGIcon size={28} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: IG.text, letterSpacing: '-0.01em' }}>Instagram</div>
          {profile && <div style={{ fontSize: 11, color: IG.pink }}>@{profile.username} · {fmt(profile.followers_count)} followers</div>}
          {!connected && !loading && <div style={{ fontSize: 11, color: IG.muted }}>Not connected</div>}
        </div>
        {/* Story rings in topbar */}
        {stories.length > 0 && (
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', maxWidth: 300 }}>
            {stories.slice(0, 4).map(s => <StoryRing key={s.id} story={s} />)}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {!connected && (
            <button onClick={() => setShowConnect(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, background: IG.grad, border: 'none', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Connect
            </button>
          )}
          {connected && (
            <button onClick={() => setShowConnect(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, background: 'rgba(225,48,108,0.12)', border: '1px solid rgba(225,48,108,0.25)', color: IG.pink, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <Settings size={13} /> Settings
            </button>
          )}
          <button onClick={() => void loadAll()} disabled={loading}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 10, background: IG.panel, border: `1px solid ${IG.border}`, color: IG.muted, cursor: 'pointer' }}>
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${IG.border}`, background: IG.surface, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 18px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: 'transparent', color: tab === t.id ? IG.text : IG.muted, borderBottom: tab === t.id ? `2px solid ${IG.pink}` : '2px solid transparent', transition: 'all 0.15s', flexShrink: 0 }}>
            {t.icon} {t.label}
            {t.id === 'messages' && convs.filter(c => c.unread > 0).length > 0 && (
              <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: IG.pink, color: 'white', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                {convs.filter(c => c.unread > 0).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Not connected banner ── */}
      {!connected && !loading && (
        <div style={{ margin: 16, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderRadius: 12, background: 'rgba(225,48,108,0.08)', border: '1px solid rgba(225,48,108,0.20)' }}>
          <IGIcon size={32} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: IG.pink }}>Instagram not connected</div>
            <div style={{ fontSize: 12, color: IG.muted, marginTop: 2 }}>Add your Meta credentials to load feed, stories & DMs.</div>
          </div>
          <button onClick={() => setShowConnect(true)} style={{ padding: '9px 18px', borderRadius: 10, background: IG.grad, border: 'none', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>Connect Now</button>
        </div>
      )}

      {/* ── Tab content ── */}
      <div style={{ flex: 1, padding: 16, overflowY: 'auto' }}>

        {/* PROFILE */}
        {tab === 'profile' && (
          <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {!connected ? (
              <div style={{ padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center', background: IG.surface, border: `1px solid ${IG.border}`, borderRadius: 16 }}>
                <IGIcon size={64} />
                <div style={{ fontSize: 18, fontWeight: 700, color: IG.text }}>Connect your Instagram</div>
                <div style={{ fontSize: 13, color: IG.muted, maxWidth: 320, lineHeight: 1.6 }}>Link your Instagram Business account to manage your profile, feed, stories and DMs all in one place.</div>
                <button onClick={() => setShowConnect(true)} style={{ padding: '12px 32px', borderRadius: 12, background: IG.grad, border: 'none', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Connect Instagram</button>
              </div>
            ) : !profile ? (
              <div style={{ color: IG.muted, fontSize: 13, padding: 20 }}>Loading profile…</div>
            ) : (
              <>
                {/* Profile header */}
                <div style={{ background: IG.surface, border: `1px solid ${IG.border}`, borderRadius: 16, padding: '24px 28px', display: 'flex', gap: 32, alignItems: 'flex-start' }}>
                  <div style={{ width: 90, height: 90, borderRadius: '50%', padding: 3, background: IG.grad, flexShrink: 0 }}>
                    <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', border: `3px solid ${IG.dark}` }}>
                      {profile.profile_picture_url
                        ? <img src={profile.profile_picture_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <div style={{ width: '100%', height: '100%', background: IG.panel }} />
                      }
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                      <div style={{ fontSize: 20, fontWeight: 300, color: IG.text }}>{profile.username}</div>
                      <button onClick={() => setShowConnect(true)} style={{ padding: '6px 14px', borderRadius: 8, background: IG.panel, border: `1px solid ${IG.border}`, color: IG.text, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Edit profile</button>
                    </div>
                    <div style={{ display: 'flex', gap: 28, marginBottom: 14 }}>
                      {[{ v: fmt(profile.media_count), l: 'posts' }, { v: fmt(profile.followers_count), l: 'followers' }, { v: fmt(profile.follows_count), l: 'following' }].map(s => (
                        <div key={s.l} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: IG.text }}>{s.v}</div>
                          <div style={{ fontSize: 13, color: IG.text }}>{s.l}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: IG.text }}>{profile.name}</div>
                    {profile.biography && <div style={{ fontSize: 13, color: IG.text, marginTop: 4, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{profile.biography}</div>}
                    {profile.website && <a href={profile.website} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#385185', marginTop: 4, display: 'block' }}>{profile.website}</a>}
                  </div>
                </div>
                {/* Mini feed grid */}
                {media.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
                    {media.slice(0, 9).map(p => (
                      <div key={p.id} onClick={() => setCommentPost(p)} style={{ aspectRatio: '1', overflow: 'hidden', cursor: 'pointer', position: 'relative', background: IG.panel }}>
                        {p.media_url && <img src={p.media_type === 'VIDEO' ? (p.thumbnail_url ?? p.media_url) : p.media_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                        {p.media_type === 'VIDEO' && <div style={{ position: 'absolute', top: 6, right: 6 }}><Play size={14} color="white" fill="white" /></div>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* FEED */}
        {tab === 'feed' && (
          <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Stories row */}
            {stories.length > 0 && (
              <div style={{ background: IG.surface, border: `1px solid ${IG.border}`, borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ display: 'flex', gap: 18, overflowX: 'auto', paddingBottom: 4 }}>
                  {stories.map(s => <StoryRing key={s.id} story={s} />)}
                </div>
              </div>
            )}
            {media.length === 0 && !loading && <div style={{ color: IG.muted, fontSize: 13, textAlign: 'center', padding: 40 }}>No posts found</div>}
            {media.map(p => <PostCard key={p.id} post={p} profile={profile} onComment={setCommentPost} />)}
          </div>
        )}

        {/* REELS */}
        {tab === 'reels' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 3 }}>
            {reels.length === 0 && <div style={{ color: IG.muted, fontSize: 13, padding: 40, gridColumn: '1/-1', textAlign: 'center' }}>No reels found</div>}
            {reels.map(p => (
              <div key={p.id} onClick={() => setCommentPost(p)} style={{ aspectRatio: '9/16', overflow: 'hidden', cursor: 'pointer', position: 'relative', background: IG.panel, borderRadius: 4 }}>
                {p.media_url && <img src={p.thumbnail_url ?? p.media_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 50%)' }} />
                <div style={{ position: 'absolute', bottom: 8, left: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Play size={12} color="white" fill="white" />
                  <span style={{ fontSize: 12, color: 'white', fontWeight: 600 }}>{fmt(p.like_count)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* STORIES */}
        {tab === 'stories' && (
          <div>
            {stories.length === 0 && <div style={{ color: IG.muted, fontSize: 13, textAlign: 'center', padding: 40 }}>No active stories</div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
              {stories.map(s => (
                <div key={s.id} style={{ aspectRatio: '9/16', borderRadius: 12, overflow: 'hidden', position: 'relative', background: IG.panel, cursor: 'pointer' }}>
                  {s.media_url && <img src={s.media_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 40%)' }} />
                  <div style={{ position: 'absolute', bottom: 8, left: 8, fontSize: 11, color: 'white' }}>{timeAgo(s.timestamp)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MESSAGES */}
        {tab === 'messages' && <DMPanel convs={convs} onRefresh={() => void loadAll()} />}

        {/* COMMENTS */}
        {tab === 'comments' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {media.filter(p => p.comments_count > 0).map(p => (
              <button key={p.id} onClick={() => setCommentPost(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                <div style={{ background: IG.surface, border: `1px solid ${IG.border}`, borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ aspectRatio: '1', background: IG.panel, overflow: 'hidden' }}>
                    {p.media_url && <img src={p.media_type === 'VIDEO' ? (p.thumbnail_url ?? '') : p.media_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>
                  <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <MessageCircle size={14} color={IG.pink} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: IG.text }}>{fmt(p.comments_count)} comments</span>
                  </div>
                </div>
              </button>
            ))}
            {media.filter(p => p.comments_count > 0).length === 0 && <div style={{ color: IG.muted, fontSize: 13, padding: 40, gridColumn: '1/-1', textAlign: 'center' }}>No posts with comments</div>}
          </div>
        )}

        {/* MENTIONS */}
        {tab === 'mentions' && (
          <div style={{ padding: '40px 20px', textAlign: 'center', background: IG.surface, border: `1px solid ${IG.border}`, borderRadius: 16 }}>
            <AtSign size={40} color={IG.muted} strokeWidth={1} style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: IG.text, marginBottom: 6 }}>Mentions</div>
            <div style={{ fontSize: 13, color: IG.muted, maxWidth: 320, margin: '0 auto', lineHeight: 1.6 }}>When someone tags your account, it appears here automatically via webhook.</div>
          </div>
        )}

        {/* INSIGHTS */}
        {tab === 'insights' && <InsightsTab profile={profile} />}

      </div>

      {/* Modals */}
      {commentPost && <CommentPanel post={commentPost} onClose={() => setCommentPost(null)} />}
      {showConnect && (
        <ConnectModal
          creds={creds}
          onChange={(k, v) => setCreds(p => ({ ...p, [k]: v }))}
          onSave={() => void saveCreds()}
          onClose={() => { setShowConnect(false); setSaveMsg(''); }}
          saving={saving}
          msg={saveMsg}
        />
      )}
    </div>
  );
}
