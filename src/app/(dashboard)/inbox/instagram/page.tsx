'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Heart, MessageCircle, Send, Bookmark, MoreHorizontal,
  Image, Play, RefreshCw, ExternalLink, Eye, Users,
  TrendingUp, AtSign, X, Reply,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────
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

type Tab = 'feed' | 'stories' | 'comments' | 'mentions' | 'insights' | 'profile';

const API = `/api/v3/instagram`;
const SETTINGS_API = `/api/v3/instagram`;
const getH = () => ({ Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('crm_token') ?? '' : ''}` });

// ── Helpers ──────────────────────────────────────────────────
function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'Just now';
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── Story Ring ───────────────────────────────────────────────
function StoryCard({ story }: { story: IGStory }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer', flexShrink: 0 }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', padding: 2, background: 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)', flexShrink: 0 }}>
        <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--crm-bg)' }}>
          {story.media_url
            ? <img src={story.media_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ width: '100%', height: '100%', background: 'rgba(130,145,190,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Play size={16} color="#8790aa" /></div>
          }
        </div>
      </div>
      <span style={{ fontSize: 10, color: 'var(--crm-text-muted)', maxWidth: 64, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {timeAgo(story.timestamp)}
      </span>
    </div>
  );
}

// ── Post Card ────────────────────────────────────────────────
function PostCard({ post, onComment }: { post: IGMedia; onComment: (p: IGMedia) => void }) {
  return (
    <div className="crm-glass" style={{ overflow: 'hidden', borderRadius: 16 }}>
      {/* Media */}
      <div style={{ position: 'relative', aspectRatio: '1', background: 'rgba(130,145,190,0.1)', overflow: 'hidden' }}>
        {post.media_url
          ? <img src={post.media_type === 'VIDEO' ? (post.thumbnail_url || post.media_url) : post.media_url} alt={post.caption?.slice(0, 40)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Image size={32} color="#8790aa" /></div>
        }
        {post.media_type === 'VIDEO' && (
          <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', borderRadius: 6, padding: '2px 6px', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Play size={10} color="white" fill="white" />
            <span style={{ fontSize: 10, color: 'white' }}>Reel</span>
          </div>
        )}
        {post.media_type === 'CAROUSEL_ALBUM' && (
          <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', borderRadius: 6, padding: '2px 6px' }}>
            <span style={{ fontSize: 10, color: 'white' }}>⊞</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--crm-text-muted)', fontSize: 13 }}>
            <Heart size={16} /> {fmt(post.like_count)}
          </button>
          <button onClick={() => onComment(post)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--crm-text-muted)', fontSize: 13 }}>
            <MessageCircle size={16} /> {fmt(post.comments_count)}
          </button>
          <a href={post.permalink} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', color: 'var(--crm-text-muted)' }}>
            <ExternalLink size={14} />
          </a>
        </div>
        {post.caption && (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--crm-text-secondary)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {post.caption}
          </p>
        )}
        <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 4 }}>{timeAgo(post.timestamp)}</div>
      </div>
    </div>
  );
}

// ── Comment Panel ────────────────────────────────────────────
function CommentPanel({ post, onClose }: { post: IGMedia; onClose: () => void }) {
  const [comments, setComments] = useState<IGComment[]>([]);
  const [reply, setReply]       = useState('');
  const [replyTo, setReplyTo]   = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetch(`${API}/media/${post.id}/comments`)
      .then(r => r.json())
      .then(d => setComments(d.data || []))
      .finally(() => setLoading(false));
  }, [post.id]);

  const sendReply = async (commentId: string) => {
    if (!reply.trim()) return;
    await fetch(`${API}/comments/${commentId}/reply`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: reply }),
    });
    setReply(''); setReplyTo(null);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="crm-glass" style={{ width: '100%', maxWidth: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(130,145,190,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--crm-text)' }}>Comments ({post.comments_count})</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}><X size={16} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loading && <div style={{ color: 'var(--crm-text-muted)', fontSize: 13 }}>Loading...</div>}
          {comments.map(c => (
            <div key={c.id}>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(130,145,190,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--crm-text-muted)', flexShrink: 0 }}>
                  {c.username?.[0]?.toUpperCase() || '?'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--crm-text)' }}>@{c.username}</div>
                  <div style={{ fontSize: 13, color: 'var(--crm-text-secondary)', marginTop: 2 }}>{c.text}</div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>{timeAgo(c.timestamp)}</span>
                    <button onClick={() => setReplyTo(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#4f6df5', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Reply size={10} /> Reply
                    </button>
                  </div>
                  {replyTo === c.id && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <input value={reply} onChange={e => setReply(e.target.value)} placeholder="Write a reply..." style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(130,145,190,0.2)', background: 'rgba(255,255,255,0.05)', color: 'var(--crm-text)', fontSize: 12 }} />
                      <button onClick={() => sendReply(c.id)} style={{ padding: '7px 12px', borderRadius: 8, background: '#E1306C', border: 'none', color: 'white', fontSize: 12, cursor: 'pointer' }}>Send</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Insights Tab ─────────────────────────────────────────────
function InsightsTab({ profile }: { profile: IGProfile | null }) {
  if (!profile) return <div style={{ color: 'var(--crm-text-muted)', fontSize: 13 }}>Connect Instagram to see insights</div>;
  const stats = [
    { label: 'Followers',   value: fmt(profile.followers_count), icon: <Users size={16} />,     color: '#E1306C' },
    { label: 'Following',   value: fmt(profile.follows_count),   icon: <Heart size={16} />,     color: '#8b5cf6' },
    { label: 'Posts',       value: fmt(profile.media_count),     icon: <Image size={16} />,     color: '#4f6df5' },
    { label: 'Profile Views', value: '—',                        icon: <Eye size={16} />,       color: '#28c99a' },
    { label: 'Reach',       value: '—',                          icon: <TrendingUp size={16} />, color: '#f4c95d' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Profile card */}
      <div className="crm-glass" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
        {profile.profile_picture_url
          ? <img src={profile.profile_picture_url} alt="" style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover' }} />
          : <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'linear-gradient(135deg,#E1306C,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>📸</div>
        }
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--crm-text)' }}>{profile.name}</div>
          <div style={{ fontSize: 13, color: '#E1306C' }}>@{profile.username}</div>
          {profile.biography && <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', marginTop: 4, maxWidth: 300 }}>{profile.biography}</div>}
        </div>
      </div>
      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {stats.map(s => (
          <div key={s.label} className="crm-glass" style={{ padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ color: s.color, marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 750, color: 'var(--crm-text)' }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────
export default function InstagramPage() {
  const [tab, setTab]           = useState<Tab>('profile');
  const [profile, setProfile]   = useState<IGProfile | null>(null);
  const [media, setMedia]       = useState<IGMedia[]>([]);
  const [stories, setStories]   = useState<IGStory[]>([]);
  const [loading, setLoading]   = useState(false);
  const [commentPost, setCommentPost] = useState<IGMedia | null>(null);
  const [connected, setConnected]     = useState(false);
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [credentials, setCredentials] = useState({ INSTAGRAM_PAGE_ID: '', INSTAGRAM_VERIFY_TOKEN: '', INSTAGRAM_APP_SECRET: '', FACEBOOK_PAGE_ACCESS_TOKEN: '' });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // Load saved credentials
  const loadCredentials = useCallback(async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('crm_token') ?? '' : '';
      const r = await fetch(`/api/v3/instagram/settings/integrations/instagram`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        const d = await r.json() as Record<string, string>;
        setCredentials(c => ({ ...c, ...d }));
      }
    } catch { /* silent */ }
  }, []);

  const saveCredentials = async () => {
    setSaving(true); setSaveMsg('');
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('crm_token') ?? '' : '';
      const r = await fetch(`/api/v3/instagram/settings/integrations/instagram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(credentials),
      });
      if (r.ok) { setSaveMsg('✓ Saved! Loading profile...'); void load(); setShowConnectModal(false); }
      else setSaveMsg('Save failed. Try again.');
    } catch { setSaveMsg('Save failed.'); }
    setSaving(false);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Check status via proxy
      const statusRes = await fetch(`${API}/status`);
      if (statusRes.ok) {
        const st = await statusRes.json() as { configured: boolean };
        if (st.configured) {
          setConnected(true);
        } else {
          setConnected(false);
          setLoading(false);
          return;
        }
      }
      // Try profile/media/stories — failures don't affect connected state
      const [profileRes, mediaRes, storiesRes] = await Promise.allSettled([
        fetch(`${API}/profile`),
        fetch(`${API}/media?limit=20`),
        fetch(`${API}/stories`),
      ]);
      if (profileRes.status === 'fulfilled' && profileRes.value.ok) {
        setProfile(await profileRes.value.json());
      }
      if (mediaRes.status === 'fulfilled' && mediaRes.value.ok) {
        const md = await mediaRes.value.json() as { data?: IGMedia[] };
        setMedia(md.data || []);
      }
      if (storiesRes.status === 'fulfilled' && storiesRes.value.ok) {
        const st2 = await storiesRes.value.json() as { data?: IGStory[] };
        setStories(st2.data || []);
      }
    } catch {
      // don't set connected=false on network errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadCredentials(); void load(); }, [load, loadCredentials]);

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'profile',  label: 'Profile',  icon: <Users size={14} /> },
    { id: 'feed',     label: 'Feed',     icon: <Image size={14} /> },
    { id: 'stories',  label: 'Stories',  icon: <Play size={14} /> },
    { id: 'comments', label: 'Comments', icon: <MessageCircle size={14} /> },
    { id: 'mentions', label: 'Mentions', icon: <AtSign size={14} /> },
    { id: 'insights', label: 'Insights', icon: <TrendingUp size={14} /> },
  ];

  // Connect Modal
  const ConnectModal = () => (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="crm-glass" style={{ width: '100%', maxWidth: 480, padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 12, background: 'linear-gradient(135deg,#f09433,#dc2743,#bc1888)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📸</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text)' }}>Connect Instagram</div>
              <div style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>Settings are saved to your account</div>
            </div>
          </div>
          <button onClick={() => setShowConnectModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}><X size={16} /></button>
        </div>
        {[{ key: 'INSTAGRAM_PAGE_ID', label: 'Instagram Page ID', ph: '17641442196029096' },
          { key: 'FACEBOOK_PAGE_ACCESS_TOKEN', label: 'Page Access Token', ph: 'EAAxxxxx...', secret: true },
          { key: 'INSTAGRAM_VERIFY_TOKEN', label: 'Verify Token', ph: 'tzmicha_crm3_verify_2024' },
          { key: 'INSTAGRAM_APP_SECRET', label: 'App Secret', ph: 'abc123...', secret: true },
        ].map(f => (
          <div key={f.key}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>{f.label}</label>
            <input
              type={f.secret ? 'password' : 'text'}
              placeholder={f.ph}
              value={credentials[f.key as keyof typeof credentials] ?? ''}
              onChange={e => setCredentials(c => ({ ...c, [f.key]: e.target.value }))}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', color: 'var(--crm-text)', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
        ))}
        {saveMsg && <div style={{ fontSize: 12, color: saveMsg.startsWith('✓') ? '#28c99a' : '#f46b72', fontWeight: 600 }}>{saveMsg}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => void saveCredentials()} disabled={saving} style={{ flex: 1, padding: '10px', borderRadius: 10, background: 'linear-gradient(135deg,#E1306C,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            {saving ? 'Saving...' : 'Save & Connect'}
          </button>
          <a href="/settings/integrations" style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', color: 'var(--crm-text-muted)', fontSize: 12, textDecoration: 'none', display: 'flex', alignItems: 'center' }}>Full Settings</a>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 14, background: 'linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>📸</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 750, color: 'var(--crm-text)' }}>Instagram</h1>
            {profile && <div style={{ fontSize: 12, color: '#E1306C' }}>@{profile.username} · {fmt(profile.followers_count)} followers</div>}
            {!connected && !loading && <div style={{ fontSize: 12, color: '#f4c95d' }}>Not connected</div>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!connected && (
            <button onClick={() => setShowConnectModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, background: 'linear-gradient(135deg,#E1306C,#8b5cf6)', border: 'none', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              Connect
            </button>
          )}
          {connected && (
            <button onClick={() => setShowProfilePanel(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, background: showProfilePanel ? 'rgba(225,48,108,0.18)' : 'rgba(225,48,108,0.08)', border: '1px solid rgba(225,48,108,0.25)', color: '#E1306C', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              <Users size={13} /> {showProfilePanel ? 'Hide Profile' : 'Show Profile'}
            </button>
          )}
          <button onClick={() => void load()} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, background: 'rgba(225,48,108,0.1)', border: '1px solid rgba(225,48,108,0.25)', color: '#E1306C', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
          </button>
        </div>
      </div>

      {/* Not connected banner */}
      {!connected && !loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 12, background: 'rgba(225,48,108,0.08)', border: '1px solid rgba(225,48,108,0.25)' }}>
          <span style={{ fontSize: 20 }}>📸</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#E1306C' }}>Instagram not connected</div>
            <div style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>Add your credentials to load feed, stories & profile data.</div>
          </div>
          <button onClick={() => setShowConnectModal(true)} style={{ padding: '7px 14px', borderRadius: 9, background: '#E1306C', color: 'white', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>Connect Now</button>
        </div>
      )}

      {/* Stories row */}
      {stories.length > 0 && (
        <div className="crm-glass" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--crm-text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Active Stories ({stories.length})</div>
          <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 4 }}>
            {stories.map(s => <StoryCard key={s.id} story={s} />)}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '4px', background: 'rgba(130,145,190,0.08)', borderRadius: 12, width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: tab === t.id ? 'white' : 'transparent', color: tab === t.id ? '#E1306C' : 'var(--crm-text-muted)', boxShadow: tab === t.id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s' }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'feed' && (
        <div>
          {media.length === 0 && !loading && <div style={{ color: 'var(--crm-text-muted)', fontSize: 13 }}>No posts found</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
            {media.map(p => <PostCard key={p.id} post={p} onComment={setCommentPost} />)}
          </div>
        </div>
      )}

      {tab === 'stories' && (
        <div>
          {stories.length === 0 && <div style={{ color: 'var(--crm-text-muted)', fontSize: 13 }}>No active stories</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
            {stories.map(s => (
              <div key={s.id} className="crm-glass" style={{ overflow: 'hidden', borderRadius: 16, aspectRatio: '9/16', position: 'relative' }}>
                {s.media_url
                  ? <img src={s.media_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div style={{ width: '100%', height: '100%', background: 'rgba(130,145,190,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Play size={32} color="#8790aa" /></div>
                }
                <div style={{ position: 'absolute', bottom: 8, left: 8, fontSize: 11, color: 'white', background: 'rgba(0,0,0,0.5)', borderRadius: 6, padding: '2px 6px' }}>{timeAgo(s.timestamp)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'comments' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: 'var(--crm-text-muted)' }}>Click on any post's 💬 to view & reply to comments</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {media.filter(p => p.comments_count > 0).map(p => (
              <button key={p.id} onClick={() => setCommentPost(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                <div className="crm-glass" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
                    {p.media_url ? <img src={p.media_type === 'VIDEO' ? (p.thumbnail_url || '') : p.media_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', background: 'rgba(130,145,190,0.2)' }} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)' }}>{p.comments_count} comments</div>
                    <div style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>{timeAgo(p.timestamp)}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'mentions' && (
        <div className="crm-glass" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 13, color: 'var(--crm-text-muted)' }}>Mentions are fetched via webhook. When someone tags your account, it appears here automatically.</div>
        </div>
      )}

      {tab === 'insights' && <InsightsTab profile={profile} />}

      {tab === 'profile' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 520 }}>
          {!connected ? (
            <div className="crm-glass" style={{ padding: '28px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 48 }}>📸</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--crm-text)' }}>Instagram Not Connected</div>
              <div style={{ fontSize: 13, color: 'var(--crm-text-muted)', maxWidth: 320 }}>Connect your Instagram Business account to see your profile, feed, stories and receive DMs in the inbox.</div>
              <button onClick={() => setShowConnectModal(true)} style={{ padding: '11px 28px', borderRadius: 12, background: 'linear-gradient(135deg,#E1306C,#8b5cf6)', border: 'none', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                Connect Instagram
              </button>
              <a href="/settings/integrations" style={{ fontSize: 12, color: '#4f6df5', textDecoration: 'none' }}>Or go to full Settings →</a>
            </div>
          ) : !profile ? (
            <div style={{ color: 'var(--crm-text-muted)', fontSize: 13 }}>Loading profile...</div>
          ) : (
            <>
              <div className="crm-glass" style={{ padding: '20px 24px', display: 'flex', gap: 20, alignItems: 'center' }}>
                {profile.profile_picture_url
                  ? <img src={profile.profile_picture_url} alt="" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '3px solid #E1306C' }} />
                  : <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg,#E1306C,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>📸</div>
                }
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 18, fontWeight: 750, color: 'var(--crm-text)' }}>{profile.name}</div>
                  <div style={{ fontSize: 14, color: '#E1306C', marginTop: 2 }}>@{profile.username}</div>
                  {profile.website && <a href={profile.website} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#4f6df5', marginTop: 4, display: 'block' }}>{profile.website}</a>}
                  {profile.biography && <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', marginTop: 6, lineHeight: 1.5 }}>{profile.biography}</div>}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                {[
                  { label: 'Followers', value: fmt(profile.followers_count), color: '#E1306C' },
                  { label: 'Following', value: fmt(profile.follows_count), color: '#8b5cf6' },
                  { label: 'Posts', value: fmt(profile.media_count), color: '#4f6df5' },
                ].map(s => (
                  <div key={s.label} className="crm-glass" style={{ padding: '16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 750, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 4 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div className="crm-glass" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c99a' }} />
                <span style={{ fontSize: 13, color: '#28c99a', fontWeight: 600 }}>Connected</span>
                <span style={{ fontSize: 12, color: 'var(--crm-text-muted)', marginLeft: 4 }}>· Instagram Business API</span>
                <a href="/settings/integrations" style={{ marginLeft: 'auto', fontSize: 12, color: '#4f6df5', textDecoration: 'none' }}>Manage →</a>
              </div>
            </>
          )}
        </div>
      )}

      {/* Comment modal */}
      {commentPost && <CommentPanel post={commentPost} onClose={() => setCommentPost(null)} />}
      {/* Connect modal */}
      {showConnectModal && <ConnectModal />}
      </div>{/* end main content */}

      {/* Right-side Profile Panel */}
      {showProfilePanel && (
        <div className="crm-glass" style={{ width: 260, flexShrink: 0, padding: '16px', display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Connected Profile</span>
            <button onClick={() => setShowProfilePanel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)', padding: 0 }}><X size={13} /></button>
          </div>
          {!profile ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '16px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 32 }}>📸</div>
              <div style={{ fontSize: 13, color: 'var(--crm-text-muted)' }}>Not connected</div>
              <button onClick={() => setShowConnectModal(true)} style={{ padding: '8px 16px', borderRadius: 9, background: 'linear-gradient(135deg,#E1306C,#8b5cf6)', border: 'none', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Connect</button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                {profile.profile_picture_url
                  ? <img src={profile.profile_picture_url} alt="" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '3px solid #E1306C' }} />
                  : <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg,#E1306C,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>📸</div>
                }
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text)' }}>{profile.name}</div>
                  <div style={{ fontSize: 12, color: '#E1306C' }}>@{profile.username}</div>
                </div>
              </div>
              {profile.biography && <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', lineHeight: 1.5, textAlign: 'center' }}>{profile.biography}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                {[
                  { label: 'Followers', value: fmt(profile.followers_count) },
                  { label: 'Following', value: fmt(profile.follows_count) },
                  { label: 'Posts', value: fmt(profile.media_count) },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: 'center', padding: '8px 4px', borderRadius: 10, background: 'rgba(225,48,108,0.07)' }}>
                    <div style={{ fontSize: 16, fontWeight: 750, color: '#E1306C' }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: 'var(--crm-text-muted)', marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 10, background: 'rgba(40,201,154,0.08)', border: '1px solid rgba(40,201,154,0.20)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#28c99a', flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: '#28c99a', fontWeight: 600 }}>Connected · Instagram API</span>
              </div>
              {profile.website && <a href={profile.website} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#4f6df5', textAlign: 'center', textDecoration: 'none' }}>{profile.website}</a>}
              <button onClick={() => setShowConnectModal(true)} style={{ fontSize: 11, color: 'var(--crm-text-muted)', textAlign: 'center', padding: '6px', borderRadius: 8, border: '1px solid rgba(130,145,190,0.2)', background: 'none', cursor: 'pointer' }}>⚙ Update Credentials</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
