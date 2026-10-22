'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ExternalLink, MessageCircle, ThumbsUp, Share2, Settings } from 'lucide-react';
import Link from 'next/link';

interface FBPage {
  id: string; name: string; category: string;
  fan_count: number; followers_count: number;
  about: string; website: string;
  picture?: { data: { url: string } };
  cover?: { source: string };
}

interface FBPost {
  id: string; message?: string; story?: string;
  created_time: string;
  likes?: { summary: { total_count: number } };
  comments?: { summary: { total_count: number } };
  shares?: { count: number };
  full_picture?: string;
  permalink_url?: string;
}
interface FBConv {
  id: string; participant_id: string; name: string; last_message: string; timestamp: string; unread: number;
}
interface FBMsg {
  id: string; from: string; message: string; created_time: string; is_mine: boolean;
}
interface FBComment {
  id: string; message: string; created_time: string; like_count?: number;
  post_id: string; post_text: string; from?: { name: string; id: string };
}

const API = '/api/v3/facebook';
const getH = () => ({ Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('crm_token') ?? '' : ''}` });

function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'Just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n ?? 0);
}

// Facebook SVG icon
function FbIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#1877F2">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
}

function LikeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/>
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18z"/>
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
    </svg>
  );
}

function PostCard({ post, page }: { post: FBPost; page: FBPage | null }) {
  const likes = post.likes?.summary?.total_count ?? 0;
  const comments = post.comments?.summary?.total_count ?? 0;
  const shares = post.shares?.count ?? 0;

  return (
    <div style={{ background: 'white', borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.1)', overflow: 'hidden', marginBottom: 12 }}>
      {/* Post header */}
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {page?.picture?.data?.url
          ? <img src={page.picture.data.url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
          : <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#1877F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FbIcon size={22} /></div>
        }
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#050505' }}>{page?.name ?? 'Page'}</div>
          <div style={{ fontSize: 12, color: '#65676B', display: 'flex', alignItems: 'center', gap: 4 }}>
            {timeAgo(post.created_time)}
            <span>·</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#65676B"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
          </div>
        </div>
        {post.permalink_url && (
          <a href={post.permalink_url} target="_blank" rel="noreferrer" style={{ color: '#65676B', padding: 4 }}>
            <ExternalLink size={16} />
          </a>
        )}
      </div>

      {/* Post text */}
      {(post.message || post.story) && (
        <div style={{ padding: '0 16px 12px', fontSize: 15, color: '#050505', lineHeight: 1.5 }}>
          {post.message || post.story}
        </div>
      )}

      {/* Post image */}
      {post.full_picture && (
        <img src={post.full_picture} alt="" style={{ width: '100%', maxHeight: 400, objectFit: 'cover', display: 'block' }} />
      )}

      {/* Reaction counts */}
      {(likes > 0 || comments > 0 || shares > 0) && (
        <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E4E6EB' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {likes > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#1877F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <LikeIcon />
                </div>
                <span style={{ fontSize: 13, color: '#65676B' }}>{fmt(likes)}</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {comments > 0 && <span style={{ fontSize: 13, color: '#65676B' }}>{fmt(comments)} comments</span>}
            {shares > 0 && <span style={{ fontSize: 13, color: '#65676B' }}>{fmt(shares)} shares</span>}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ padding: '4px 16px', display: 'flex', gap: 0 }}>
        {[
          { icon: <LikeIcon />, label: 'Like', color: '#65676B' },
          { icon: <CommentIcon />, label: 'Comment', color: '#65676B' },
          { icon: <ShareIcon />, label: 'Share', color: '#65676B' },
        ].map(btn => (
          <button key={btn.label} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer', color: btn.color, fontSize: 14, fontWeight: 600, borderRadius: 4 }}
            onMouseEnter={e => (e.currentTarget.style.background = '#F2F2F2')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            {btn.icon} {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function FacebookInboxPage() {
  const [tab, setTab] = useState<'posts' | 'profile' | 'messages' | 'stories' | 'comments'>('posts');
  const [page, setPage] = useState<FBPage | null>(null);
  const [posts, setPosts] = useState<FBPost[]>([]);
  const [stories, setStories] = useState<FBPost[]>([]);
  const [comments, setComments] = useState<FBComment[]>([]);
  const [convs, setConvs] = useState<FBConv[]>([]);
  const [selConv, setSelConv] = useState<FBConv | null>(null);
  const [msgs, setMsgs] = useState<FBMsg[]>([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    try {
      const res = await fetch(`${API}/page`, { headers: getH() });
      if (!res.ok) { setConnected(false); return; }
      setPage(await res.json());
      setConnected(true);

      const [pr, sr, cr, cvr] = await Promise.all([
        fetch(`${API}/posts?limit=20`, { headers: getH() }),
        fetch(`${API}/stories`, { headers: getH() }),
        fetch(`${API}/comments`, { headers: getH() }),
        fetch(`${API}/conversations`, { headers: getH() }),
      ]);

      if (pr.ok) { const d = await pr.json(); setPosts(d.data || []); }
      else {
        const e = await pr.json().catch(() => ({}));
        setApiError(e.detail || 'Failed to load posts — token may be missing pages_read_engagement permission.');
      }
      if (sr.ok) { const d = await sr.json(); setStories(d.data || []); }
      if (cr.ok) { const d = await cr.json(); setComments(d.data || []); }
      if (cvr.ok) { const d = await cvr.json(); setConvs(d.data || []); }
    } catch { setConnected(false); }
    finally { setLoading(false); }
  }, []);

  const loadMsgs = useCallback(async (conv: FBConv) => {
    setMsgs([]);
    const r = await fetch(`${API}/conversations/${conv.id}/messages`, { headers: getH() });
    if (r.ok) { const d = await r.json(); setMsgs(d.data || []); }
  }, []);

  const sendReply = async () => {
    if (!reply.trim() || !selConv || sending) return;
    setSending(true);
    try {
      await fetch(`${API}/send`, {
        method: 'POST', headers: { ...getH(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'facebook', recipient_id: selConv.participant_id, text: reply }),
      });
      setReply(''); void loadMsgs(selConv);
    } finally { setSending(false); }
  };

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5' }}>
      {/* FB-style top bar */}
      <div style={{ background: 'white', borderBottom: '1px solid #E4E6EB', padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56, position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FbIcon size={28} />
          <span style={{ fontSize: 20, fontWeight: 700, color: '#1877F2' }}>Facebook</span>
          {page && <span style={{ fontSize: 13, color: '#65676B', marginLeft: 4 }}>· {page.name}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6, background: '#E7F3FF', border: 'none', color: '#1877F2', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
          </button>
          <Link href="/settings/integrations" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6, background: '#F0F2F5', border: 'none', color: '#050505', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
            <Settings size={13} /> Settings
          </Link>
        </div>
      </div>

      {!connected && !loading && (
        <div style={{ maxWidth: 680, margin: '20px auto', padding: '16px 20px', background: 'white', borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <FbIcon size={32} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#050505' }}>Facebook not connected</div>
            <div style={{ fontSize: 13, color: '#65676B' }}>Configure your credentials in Settings → Integrations</div>
          </div>
          <Link href="/settings/integrations" style={{ padding: '8px 16px', borderRadius: 6, background: '#1877F2', color: 'white', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>Connect</Link>
        </div>
      )}

      {apiError && (
        <div style={{ maxWidth: 680, margin: '12px auto 0', padding: '12px 16px', background: '#FFF3CD', borderRadius: 8, border: '1px solid #FFCA2C', fontSize: 13, color: '#664D03' }}>
          ⚠️ <strong>Permission Error:</strong> {apiError}<br />
          <span style={{ fontSize: 12 }}>Fix: Go to <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer" style={{ color: '#1877F2' }}>Meta Graph API Explorer</a> → regenerate token with <code>pages_read_engagement</code> + <code>pages_read_user_content</code> permissions, then update <code>FACEBOOK_PAGE_ACCESS_TOKEN</code> in backend/.env</span>
        </div>
      )}

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '16px' }}>
        {/* Cover + Profile */}
        {page && (
          <div style={{ background: 'white', borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.1)', overflow: 'hidden', marginBottom: 12 }}>
            {page.cover?.source && (
              <div style={{ height: 200, overflow: 'hidden' }}>
                <img src={page.cover.source} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            )}
            <div style={{ padding: '0 16px 16px', position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginTop: page.cover?.source ? -30 : 16 }}>
                {page.picture?.data?.url
                  ? <img src={page.picture.data.url} alt="" style={{ width: 80, height: 80, borderRadius: '50%', border: '4px solid white', objectFit: 'cover', flexShrink: 0 }} />
                  : <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#1877F2', border: '4px solid white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><FbIcon size={40} /></div>
                }
                <div style={{ flex: 1, paddingBottom: 4 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#050505' }}>{page.name}</div>
                  <div style={{ fontSize: 13, color: '#65676B' }}>{page.category}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 12, paddingTop: 12, borderTop: '1px solid #E4E6EB' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#050505' }}>{fmt(page.fan_count ?? 0)}</div>
                  <div style={{ fontSize: 12, color: '#65676B' }}>Likes</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#050505' }}>{fmt(page.followers_count ?? 0)}</div>
                  <div style={{ fontSize: 12, color: '#65676B' }}>Followers</div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, background: '#E7F3FF', color: '#1877F2', fontSize: 13, fontWeight: 600 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#31A24C' }} /> Connected
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderTop: '1px solid #E4E6EB', padding: '0 16px', overflowX: 'auto' }}>
              {(['messages', 'posts', 'stories', 'comments', 'profile'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} style={{ padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 600, color: tab === t ? '#1877F2' : '#65676B', borderBottom: tab === t ? '3px solid #1877F2' : '3px solid transparent', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages tab */}
        {tab === 'messages' && (
          <div style={{ background: 'white', borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.1)', display: 'flex', minHeight: 500 }}>
            {/* Conv list */}
            <div style={{ width: 280, borderRight: '1px solid #E4E6EB', flexShrink: 0 }}>
              <div style={{ padding: '12px 16px', fontWeight: 700, fontSize: 15, borderBottom: '1px solid #E4E6EB', color: '#050505' }}>Messenger ({convs.length})</div>
              {convs.length === 0 && <div style={{ padding: 24, color: '#65676B', fontSize: 13, textAlign: 'center' }}>No conversations yet</div>}
              {convs.map(c => (
                <div key={c.id} onClick={() => { setSelConv(c); void loadMsgs(c); }}
                  style={{ padding: '10px 16px', cursor: 'pointer', background: selConv?.id === c.id ? '#E7F3FF' : 'white', borderBottom: '1px solid #F0F2F5', display: 'flex', alignItems: 'center', gap: 10 }}
                  onMouseEnter={e => { if (selConv?.id !== c.id) e.currentTarget.style.background = '#F0F2F5'; }}
                  onMouseLeave={e => { if (selConv?.id !== c.id) e.currentTarget.style.background = 'white'; }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#1877F2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{c.name.charAt(0).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#050505', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: '#65676B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.last_message || 'No messages'}</div>
                  </div>
                  {c.unread > 0 && <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#1877F2', color: 'white', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c.unread}</div>}
                </div>
              ))}
            </div>
            {/* Chat */}
            {selConv ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #E4E6EB', fontWeight: 600, fontSize: 14, color: '#050505' }}>{selConv.name}</div>
                <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[...msgs].reverse().map(m => (
                    <div key={m.id} style={{ display: 'flex', justifyContent: m.is_mine ? 'flex-end' : 'flex-start' }}>
                      <div style={{ maxWidth: '70%', padding: '8px 12px', borderRadius: 18, fontSize: 14, background: m.is_mine ? '#1877F2' : '#F0F2F5', color: m.is_mine ? 'white' : '#050505' }}>{m.message}</div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '12px 16px', borderTop: '1px solid #E4E6EB', display: 'flex', gap: 8 }}>
                  <input value={reply} onChange={e => setReply(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') void sendReply(); }}
                    placeholder="Reply via Messenger…"
                    style={{ flex: 1, padding: '8px 14px', borderRadius: 20, border: '1px solid #E4E6EB', fontSize: 14, outline: 'none' }} />
                  <button onClick={() => void sendReply()} disabled={!reply.trim() || sending}
                    style={{ padding: '8px 16px', borderRadius: 20, background: '#1877F2', color: 'white', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: (!reply.trim() || sending) ? 0.5 : 1 }}>Send</button>
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#65676B', fontSize: 14 }}>Select a conversation</div>
            )}
          </div>
        )}

        {/* Posts tab */}
        {tab === 'posts' && (
          <>
            {loading && <div style={{ background: 'white', borderRadius: 8, padding: 24, textAlign: 'center', color: '#65676B', fontSize: 14 }}>Loading posts...</div>}
            {!loading && posts.length === 0 && connected && <div style={{ background: 'white', borderRadius: 8, padding: 24, textAlign: 'center', color: '#65676B', fontSize: 14 }}>No posts found. Your page may not have any posts yet.</div>}
            {posts.map(p => <PostCard key={p.id} post={p} page={page} />)}
          </>
        )}

        {/* Stories tab */}
        {tab === 'stories' && (
          <div style={{ background: 'white', borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.1)', padding: 20 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#050505', marginBottom: 16 }}>Page Stories & Activity</div>
            {stories.length === 0 && <div style={{ color: '#65676B', fontSize: 14, textAlign: 'center', padding: 24 }}>No stories found</div>}
            {stories.map(s => (
              <div key={s.id} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid #F0F2F5' }}>
                {s.full_picture && <img src={s.full_picture} alt="" style={{ width: 60, height: 60, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, color: '#050505', lineHeight: 1.5 }}>{s.story}</div>
                  <div style={{ fontSize: 12, color: '#65676B', marginTop: 4 }}>{timeAgo(s.created_time)}</div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                    <span style={{ fontSize: 12, color: '#65676B' }}>👍 {s.likes?.summary?.total_count ?? 0}</span>
                    <span style={{ fontSize: 12, color: '#65676B' }}>💬 {s.comments?.summary?.total_count ?? 0}</span>
                    {s.permalink_url && <a href={s.permalink_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#1877F2' }}>View on Facebook</a>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Comments tab */}
        {tab === 'comments' && (
          <div style={{ background: 'white', borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.1)', padding: 20 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#050505', marginBottom: 16 }}>Post Comments</div>
            {comments.length === 0 && <div style={{ color: '#65676B', fontSize: 14, textAlign: 'center', padding: 24 }}>No comments found</div>}
            {comments.map(c => (
              <div key={c.id} style={{ padding: '12px 0', borderBottom: '1px solid #F0F2F5' }}>
                <div style={{ fontSize: 11, color: '#1877F2', background: '#E7F3FF', borderRadius: 4, padding: '3px 8px', marginBottom: 8, display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Post: {c.post_text || '(no caption)'}</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#1877F2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{(c.from?.name ?? '?').charAt(0).toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#050505' }}>{c.from?.name ?? 'Unknown'}</div>
                    <div style={{ fontSize: 14, color: '#050505', marginTop: 2, lineHeight: 1.5 }}>{c.message}</div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                      <span style={{ fontSize: 12, color: '#65676B' }}>👍 {c.like_count ?? 0}</span>
                      <span style={{ fontSize: 12, color: '#65676B' }}>{timeAgo(c.created_time)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Profile tab */}
        {tab === 'profile' && page && (
          <div style={{ background: 'white', borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.1)', padding: 20 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#050505', marginBottom: 16 }}>About</div>
            {page.about && <p style={{ fontSize: 14, color: '#050505', lineHeight: 1.6, margin: '0 0 12px' }}>{page.about}</p>}
            {page.website && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <ExternalLink size={16} color="#65676B" />
                <a href={page.website} target="_blank" rel="noreferrer" style={{ fontSize: 14, color: '#1877F2', textDecoration: 'none' }}>{page.website}</a>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '10px 14px', borderRadius: 8, background: '#F0F2F5' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#31A24C' }} />
              <span style={{ fontSize: 13, color: '#050505', fontWeight: 600 }}>Connected · Facebook Messenger API</span>
              <Link href="/settings/integrations" style={{ marginLeft: 'auto', fontSize: 13, color: '#1877F2', textDecoration: 'none' }}>Manage</Link>
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
