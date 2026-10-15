'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, MessageSquare, Send, RefreshCw,
  Wifi, WifiOff, ChevronLeft, X, Brain,
  Mail, Phone,
  CheckCheck, Circle, AlertCircle, Sparkles, Copy, Edit3,
} from 'lucide-react';
import { getConversations, getMessages } from '@/lib/api-client';
import { useInboxRealtime } from '@/hooks/use-inbox-realtime';
import { ConvAIIntelligencePanel } from '@/components/inbox/ConvAIIntelligencePanel';

// ── Types ────────────────────────────────────────────────────
interface Contact {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  lead_score: number | null;
  lead_score_tier: string | null;
  lead_status: string | null;
  source: string | null;
}

interface Conversation {
  id: string;
  contact_id: string | null;
  platform: string | null;
  status: string | null;
  priority: string | null;
  unread_count: number;
  last_message_at: string | null;
  last_message_text: string | null;
  assigned_agent_id: string | null;
  ai_intent: string | null;
  ai_sentiment: string | null;
  ai_summary: string | null;
  ai_lead_score: number | null;
  ai_next_action: string | null;
  ai_analyzed_at: string | null;
  created_at: string;
  contact: Contact | null;
}

interface Message {
  id: string;
  conversation_id: string;
  content: string | null;
  content_text?: string | null;
  sender_type: 'customer' | 'agent' | 'bot' | 'contact';
  status: string | null;
  created_at: string;
}

// ── Constants ────────────────────────────────────────────────
const PLATFORM_META: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  whatsapp:  { label: 'WA',  color: '#25d366', bg: 'rgba(37,211,102,0.15)',  icon: <Phone size={10} /> },
  instagram: { label: 'IG',  color: '#e1306c', bg: 'rgba(225,48,108,0.15)', icon: <MessageSquare size={10} /> },
  facebook:  { label: 'FB',  color: '#1877f2', bg: 'rgba(24,119,242,0.15)', icon: <MessageSquare size={10} /> },
  email:     { label: 'EM',  color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)', icon: <Mail size={10} /> },
};

const STATUS_COLORS: Record<string, string> = {
  open: '#4d7cff', pending: '#f4c95d', resolved: '#28c99a', closed: '#8790aa',
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#f46b72', high: '#f4c95d', normal: '#4d7cff', low: '#8790aa',
};

const AI_ACTIONS = [
  { key: 'professional', label: 'Professional' },
  { key: 'friendly',     label: 'Friendly' },
  { key: 'short',        label: 'Short' },
  { key: 'detailed',     label: 'Detailed' },
  { key: 'translate',    label: 'Translate' },
  { key: 'qualify',      label: 'Qualify' },
  { key: 'followup',     label: 'Follow Up' },
  { key: 'summarize',    label: 'Summarize' },
] as const;

function timeAgo(iso: string | null) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return 'now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function PlatformBadge({ platform }: { platform: string | null }) {
  const meta = PLATFORM_META[platform ?? ''] ?? { label: '??', color: '#8790aa', bg: 'rgba(135,144,170,0.15)', icon: <MessageSquare size={10} /> };
  return (
    <div style={{ width: 22, height: 22, borderRadius: 6, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: meta.color, flexShrink: 0 }} title={platform ?? 'unknown'}>
      {meta.icon}
    </div>
  );
}

// ── Conversation List Panel ──────────────────────────────────
function ConvListPanel({
  conversations, activeId, onSelect, loading, search, onSearch,
  platform, onPlatform, status, onStatus, unreadOnly, onUnreadOnly,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (c: Conversation) => void;
  loading: boolean;
  search: string;
  onSearch: (v: string) => void;
  platform: string;
  onPlatform: (v: string) => void;
  status: string;
  onStatus: (v: string) => void;
  unreadOnly: boolean;
  onUnreadOnly: (v: boolean) => void;
}) {
  const filtered = conversations.filter(c => {
    if (unreadOnly && c.unread_count === 0) return false;
    if (platform !== 'all' && c.platform !== platform) return false;
    if (status !== 'all' && c.status !== status) return false;
    if (search) {
      const s = search.toLowerCase();
      const name = (c.contact?.name ?? '').toLowerCase();
      const msg  = (c.last_message_text ?? '').toLowerCase();
      if (!name.includes(s) && !msg.includes(s)) return false;
    }
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Search */}
      <div style={{ padding: '12px 12px 8px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(255,255,255,0.80)', borderRadius: 12, padding: '7px 11px' }}>
          <Search size={13} color="var(--crm-text-muted)" />
          <input
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder="Search conversations..."
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 12, color: 'var(--crm-text)' }}
          />
          {search && <button onClick={() => onSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)', padding: 0 }}><X size={12} /></button>}
        </div>
      </div>

      {/* Filters row */}
      <div style={{ padding: '0 12px 8px', display: 'flex', gap: 5, flexWrap: 'wrap', flexShrink: 0 }}>
        {/* Platform filter */}
        <select
          value={platform}
          onChange={e => onPlatform(e.target.value)}
          style={{ fontSize: 11, padding: '4px 8px', borderRadius: 8, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', color: 'var(--crm-text)', cursor: 'pointer', outline: 'none' }}
        >
          <option value="all">All Channels</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="instagram">Instagram</option>
          <option value="facebook">Facebook</option>
          <option value="email">Email</option>
        </select>
        {/* Status filter */}
        <select
          value={status}
          onChange={e => onStatus(e.target.value)}
          style={{ fontSize: 11, padding: '4px 8px', borderRadius: 8, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', color: 'var(--crm-text)', cursor: 'pointer', outline: 'none' }}
        >
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="pending">Pending</option>
          <option value="resolved">Resolved</option>
        </select>
        {/* Unread toggle */}
        <button
          onClick={() => onUnreadOnly(!unreadOnly)}
          style={{ fontSize: 11, padding: '4px 8px', borderRadius: 8, border: '1px solid rgba(130,145,190,0.25)', background: unreadOnly ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(255,255,255,0.60)', color: unreadOnly ? 'white' : 'var(--crm-text)', cursor: 'pointer', fontWeight: unreadOnly ? 700 : 400 }}
        >
          Unread
        </button>
      </div>

      {/* Count */}
      <div style={{ padding: '0 12px 6px', fontSize: 11, color: 'var(--crm-text-muted)', flexShrink: 0 }}>
        {filtered.length} conversation{filtered.length !== 1 ? 's' : ''}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ height: 68, borderRadius: 12, background: 'rgba(255,255,255,0.40)', marginBottom: 4, animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--crm-text-muted)' }}>
            <MessageSquare size={32} style={{ margin: '0 auto 10px', opacity: 0.2 }} />
            <p style={{ margin: 0, fontSize: 13 }}>No conversations found</p>
          </div>
        ) : (
          filtered.map(conv => {
            const isActive = conv.id === activeId;
            const name = conv.contact?.name ?? 'Unknown';
            const score = conv.ai_lead_score ?? conv.contact?.lead_score ?? 0;
            const scoreColor = score >= 70 ? '#f46b72' : score >= 40 ? '#f4c95d' : '#8790aa';
            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv)}
                style={{
                  width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 9,
                  padding: '9px 10px', borderRadius: 12, marginBottom: 3, border: 'none', cursor: 'pointer',
                  background: isActive
                    ? 'linear-gradient(135deg,rgba(79,109,245,0.18),rgba(139,92,246,0.12))'
                    : 'rgba(255,255,255,0.45)',
                  borderLeft: isActive ? '3px solid #4f6df5' : '3px solid transparent',
                  transition: 'all 150ms ease',
                }}
              >
                {/* Avatar */}
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 13, fontWeight: 700, flexShrink: 0, position: 'relative' }}>
                  {name[0]?.toUpperCase() ?? '?'}
                  {conv.unread_count > 0 && (
                    <div style={{ position: 'absolute', top: -2, right: -2, width: 16, height: 16, borderRadius: '50%', background: '#f46b72', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'white', border: '2px solid white' }}>
                      {conv.unread_count > 9 ? '9+' : conv.unread_count}
                    </div>
                  )}
                </div>
                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    <span style={{ fontSize: 10, color: 'var(--crm-text-muted)', flexShrink: 0 }}>{timeAgo(conv.last_message_at)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                    {conv.last_message_text ?? 'No messages yet'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                    <PlatformBadge platform={conv.platform} />
                    {conv.status && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: STATUS_COLORS[conv.status] ?? '#8790aa', background: `${STATUS_COLORS[conv.status] ?? '#8790aa'}18`, borderRadius: 5, padding: '1px 5px', textTransform: 'uppercase' }}>
                        {conv.status}
                      </span>
                    )}
                    {conv.priority && conv.priority !== 'normal' && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: PRIORITY_COLORS[conv.priority] ?? '#8790aa', background: `${PRIORITY_COLORS[conv.priority] ?? '#8790aa'}18`, borderRadius: 5, padding: '1px 5px', textTransform: 'uppercase' }}>
                        {conv.priority}
                      </span>
                    )}
                    {score > 0 && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: scoreColor, marginLeft: 'auto' }}>{score}</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Message Thread ───────────────────────────────────────────
function MessageThread({
  conversation, messages, loadingMsgs, onSend, sending,
  aiReply, aiLoading, aiAction, onAIAction, onUseReply, onEditReply, onRegenerateReply,
  replyText, onReplyChange,
}: {
  conversation: Conversation;
  messages: Message[];
  loadingMsgs: boolean;
  onSend: () => void;
  sending: boolean;
  aiReply: string;
  aiLoading: boolean;
  aiAction: string;
  onAIAction: (action: string) => void;
  onUseReply: () => void;
  onEditReply: () => void;
  onRegenerateReply: () => void;
  replyText: string;
  onReplyChange: (v: string) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const name = conversation.contact?.name ?? 'Unknown';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Thread header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(130,145,190,0.12)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, background: 'rgba(255,255,255,0.30)' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
          {name[0]?.toUpperCase() ?? '?'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--crm-text)' }}>{name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <PlatformBadge platform={conversation.platform} />
            <span style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>
              {conversation.platform ?? 'unknown'} · {conversation.status ?? 'open'}
            </span>
            {conversation.contact?.lead_status && (
              <span style={{ fontSize: 10, fontWeight: 600, color: '#28c99a', background: 'rgba(40,201,154,0.12)', borderRadius: 6, padding: '1px 6px' }}>
                {conversation.contact.lead_status}
              </span>
            )}
          </div>
        </div>
        {conversation.priority && conversation.priority !== 'normal' && (
          <span style={{ fontSize: 11, fontWeight: 700, color: PRIORITY_COLORS[conversation.priority] ?? '#8790aa', background: `${PRIORITY_COLORS[conversation.priority] ?? '#8790aa'}18`, borderRadius: 8, padding: '3px 8px' }}>
            {conversation.priority.toUpperCase()}
          </span>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loadingMsgs ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.40)', width: i % 2 === 0 ? '60%' : '45%', alignSelf: i % 2 === 0 ? 'flex-start' : 'flex-end' }} />
          ))
        ) : messages.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--crm-text-muted)', flexDirection: 'column', gap: 8 }}>
            <MessageSquare size={32} style={{ opacity: 0.2 }} />
            <span style={{ fontSize: 13 }}>No messages yet</span>
          </div>
        ) : (
          messages.map(msg => {
            const isAgent = msg.sender_type === 'agent' || msg.sender_type === 'bot';
            return (
              <div key={msg.id} style={{ display: 'flex', justifyContent: isAgent ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '72%', padding: '9px 13px', borderRadius: isAgent ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: isAgent
                    ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)'
                    : 'rgba(255,255,255,0.72)',
                  color: isAgent ? 'white' : 'var(--crm-text)',
                  fontSize: 13, lineHeight: 1.5,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  border: isAgent ? 'none' : '1px solid rgba(255,255,255,0.80)',
                }}>
                  <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content ?? msg.content_text ?? ''}</div>
                  <div style={{ fontSize: 10, marginTop: 4, opacity: 0.65, textAlign: isAgent ? 'right' : 'left', display: 'flex', alignItems: 'center', justifyContent: isAgent ? 'flex-end' : 'flex-start', gap: 3 }}>
                    {timeAgo(msg.created_at)}
                    {isAgent && msg.status === 'read' && <CheckCheck size={10} />}
                    {isAgent && msg.status !== 'read' && <Circle size={8} />}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* AI Reply suggestion */}
      {aiReply && (
        <div style={{ margin: '0 12px 8px', padding: '10px 12px', borderRadius: 12, background: 'linear-gradient(135deg,rgba(79,109,245,0.10),rgba(139,92,246,0.07))', border: '1px solid rgba(79,109,245,0.20)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Sparkles size={11} color="#4f6df5" />
            <span style={{ fontSize: 10, fontWeight: 700, color: '#4f6df5', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Suggestion · {aiAction}</span>
          </div>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--crm-text)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{aiReply}</p>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onUseReply} style={{ padding: '5px 12px', borderRadius: 8, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              Use Reply
            </button>
            <button onClick={onEditReply} style={{ padding: '5px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(130,145,190,0.25)', color: 'var(--crm-text-secondary)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Edit3 size={10} /> Edit
            </button>
            <button onClick={onRegenerateReply} style={{ padding: '5px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(130,145,190,0.25)', color: 'var(--crm-text-secondary)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={10} /> Regenerate
            </button>
            <button onClick={() => { void navigator.clipboard.writeText(aiReply); }} style={{ padding: '5px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(130,145,190,0.25)', color: 'var(--crm-text-secondary)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Copy size={10} /> Copy
            </button>
          </div>
        </div>
      )}

      {/* AI action buttons */}
      <div style={{ padding: '0 12px 6px', display: 'flex', gap: 5, flexWrap: 'wrap', flexShrink: 0 }}>
        {AI_ACTIONS.map(a => (
          <button
            key={a.key}
            onClick={() => onAIAction(a.key)}
            disabled={aiLoading}
            style={{
              padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
              background: aiAction === a.key && aiLoading ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(255,255,255,0.55)',
              color: aiAction === a.key && aiLoading ? 'white' : 'var(--crm-text-secondary)',
              opacity: aiLoading && aiAction !== a.key ? 0.5 : 1,
            }}
          >
            {aiLoading && aiAction === a.key ? '...' : a.label}
          </button>
        ))}
      </div>

      {/* Composer */}
      <div style={{ padding: '8px 12px 12px', flexShrink: 0, borderTop: '1px solid rgba(130,145,190,0.10)' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(255,255,255,0.80)', borderRadius: 14, padding: '8px 10px' }}>
          <textarea
            value={replyText}
            onChange={e => onReplyChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
            placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
            rows={2}
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', resize: 'none', fontSize: 13, color: 'var(--crm-text)', lineHeight: 1.5 }}
          />
          <button
            onClick={onSend}
            disabled={sending || !replyText.trim()}
            style={{ width: 36, height: 36, borderRadius: 10, background: replyText.trim() ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(130,145,190,0.20)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: replyText.trim() ? 'pointer' : 'default', flexShrink: 0 }}
          >
            <Send size={14} color={replyText.trim() ? 'white' : 'var(--crm-text-muted)'} />
          </button>
        </div>
        <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--crm-text-muted)' }}>
          AI replies are suggestions only. You must explicitly send them.
        </p>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────
export default function InboxPage() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('crm_token') : '';
  const BASE = 'http://localhost:8000/api/v1';
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` };

  // ── State ──────────────────────────────────────────────────
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState('all');
  const [status, setStatus] = useState('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [showMobileThread, setShowMobileThread] = useState(false);
  const [aiReply, setAiReply] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAction, setAiAction] = useState('');
  const [aiError, setAiError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const [showAIPanel, setShowAIPanel] = useState(false);

  // ── URL Parameters ─────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ch = params.get('channel');
    if (ch && ['whatsapp', 'instagram', 'facebook', 'email'].includes(ch)) {
      setPlatform(ch);
    } else {
      setPlatform('all');
    }
  }, [typeof window !== 'undefined' ? window.location.pathname : '']);

  // ── Load conversations ─────────────────────────────────────
  const loadConversations = useCallback(async () => {
    setLoadingConvs(true);
    try {
      const res = await getConversations({ limit: '100' });
      setConversations((res.data ?? []).map(c => ({
        ...c,
        contact: c.contacts as Contact | null ?? null,
      })) as unknown as Conversation[]);
    } catch { /* silent */ }
    setLoadingConvs(false);
  }, []);

  useEffect(() => { void loadConversations(); }, [loadConversations]);

  // ── Load messages ──────────────────────────────────────────
  const loadMessages = useCallback(async (convId: string) => {
    setLoadingMsgs(true);
    try {
      const res = await getMessages(convId, { limit: '50' });
      setMessages((res.data ?? []) as unknown as Message[]);
    } catch { /* silent */ }
    setLoadingMsgs(false);
    // Mark as read via API
    try {
      await fetch(`${BASE}/conversations/${convId}/status`, { method: 'PATCH', headers, body: JSON.stringify({ unread_count: 0 }) });
    } catch { /* silent */ }
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, unread_count: 0 } : c));
  }, []);

  // ── Select conversation ────────────────────────────────────
  const handleSelect = useCallback((conv: Conversation) => {
    setActiveConv(conv);
    setMessages([]);
    setAiReply('');
    setAiError(null);
    setSendError(null);
    setShowMobileThread(true);
    void loadMessages(conv.id);
  }, [loadMessages]);

  // ── Send message ───────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!activeConv || !replyText.trim()) return;
    setSending(true);
    setSendError(null);
    const text = replyText.trim();
    setReplyText('');
    const tempId = `temp-${Date.now()}`;
    const tempMsg: Message = { id: tempId, conversation_id: activeConv.id, content: text, content_text: text, sender_type: 'agent', status: 'sending', created_at: new Date().toISOString() };
    setMessages(prev => [...prev, tempMsg]);
    try {
      const res = await fetch(`${BASE}/conversations/${activeConv.id}/messages`, { method: 'POST', headers, body: JSON.stringify({ content: text, sender_type: 'agent' }) });
      if (!res.ok) throw new Error('Send failed');
      const data = await res.json() as Message;
      setMessages(prev => prev.map(m => m.id === tempId ? data : m));
      setConversations(prev => prev.map(c => c.id === activeConv.id ? { ...c, last_message_text: text, last_message_at: new Date().toISOString() } : c));
    } catch {
      setSendError('Failed to send message. Please try again.');
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setReplyText(text);
    }
    setSending(false);
  }, [activeConv, replyText]);

  // ── AI Reply ───────────────────────────────────────────────
  const handleAIAction = useCallback(async (action: string) => {
    if (!activeConv) return;
    setAiLoading(true);
    setAiAction(action);
    setAiError(null);
    setAiReply('');
    try {
      const res = await fetch('/api/v3/ai/reply-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: activeConv.id, action }),
      });
      if (!res.ok) throw new Error('AI unavailable');
      const data = await res.json() as { reply?: string; error?: string };
      if (data.reply) setAiReply(data.reply);
      else throw new Error(data.error ?? 'No reply generated');
    } catch {
      setAiError('AI analysis temporarily unavailable. CRM data is unaffected.');
    } finally {
      setAiLoading(false);
    }
  }, [activeConv]);

  const handleUseReply = useCallback(() => {
    setReplyText(aiReply);
    setAiReply('');
  }, [aiReply]);

  const handleEditReply = useCallback(() => {
    setReplyText(aiReply);
    setAiReply('');
  }, [aiReply]);

  const handleRegenerateReply = useCallback(() => {
    if (aiAction) void handleAIAction(aiAction);
  }, [aiAction, handleAIAction]);

  // ── Realtime ───────────────────────────────────────────────
  const { isConnected } = useInboxRealtime({
    onMessageEvent: useCallback((event) => {
      if (event.eventType === 'INSERT') {
        const msg = event.new as unknown as Message;
        if (activeConv && msg.conversation_id === activeConv.id) {
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev.filter(m => !m.id.startsWith('temp-')), msg];
          });
        }
        setConversations(prev =>
          prev.map(c => c.id === msg.conversation_id
            ? {
                ...c,
                last_message_text: msg.content_text ?? '',
                last_message_at: msg.created_at,
                unread_count: activeConv?.id === msg.conversation_id ? 0 : c.unread_count + 1,
              }
            : c
          )
        );
      }
      if (event.eventType === 'UPDATE') {
        const msg = event.new as unknown as Message;
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, ...msg } : m));
      }
    }, [activeConv]),
    onConversationEvent: useCallback((event) => {
      if (event.eventType === 'UPDATE') {
        const conv = event.new as unknown as Conversation;
        setConversations(prev =>
          prev.map(c => c.id === conv.id ? { ...c, ...conv, contact: c.contact } : c)
        );
        if (activeConv?.id === conv.id) {
          setActiveConv(prev => prev ? { ...prev, ...conv, contact: prev.contact } : prev);
        }
      }
      if (event.eventType === 'INSERT') {
        void loadConversations();
      }
    }, [activeConv, loadConversations]),
    enabled: true,
  });

  // ── Render ─────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 80px)', gap: 8, overflow: 'hidden' }}>

      {/* ── Panel 1: Conversation List ── */}
      <div
        className="crm-glass"
        style={{
          width: 300, minWidth: 260, flexShrink: 0, overflow: 'hidden', padding: 0,
          display: showMobileThread ? 'none' : 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{ padding: '14px 14px 8px', borderBottom: '1px solid rgba(130,145,190,0.10)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 750, color: 'var(--crm-text)' }}>Inbox</h2>
              {/* Realtime indicator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 6px', borderRadius: 6, background: isConnected ? 'rgba(40,201,154,0.08)' : 'rgba(244,201,93,0.08)', border: `1px solid ${isConnected ? 'rgba(40,201,154,0.20)' : 'rgba(244,201,93,0.20)'}` }}>
                {isConnected
                  ? <><Wifi size={10} color="#28c99a" /><span style={{ fontSize: 9, color: '#28c99a', fontWeight: 600 }}>Live</span></>
                  : <><WifiOff size={10} color="#f4c95d" /><span style={{ fontSize: 9, color: '#f4c95d', fontWeight: 600 }}>...</span></>
                }
              </div>
            </div>
            <button onClick={() => void loadConversations()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)', padding: 4 }}>
              <RefreshCw size={13} />
            </button>
          </div>
        </div>
        <ConvListPanel
          conversations={conversations}
          activeId={activeConv?.id ?? null}
          onSelect={handleSelect}
          loading={loadingConvs}
          search={search}
          onSearch={setSearch}
          platform={platform}
          onPlatform={setPlatform}
          status={status}
          onStatus={setStatus}
          unreadOnly={unreadOnly}
          onUnreadOnly={setUnreadOnly}
        />
      </div>

      {/* ── Panel 2: Message Thread ── */}
      {activeConv ? (
        <div
          className="crm-glass"
          style={{ flex: 1, minWidth: 0, overflow: 'hidden', padding: 0, display: 'flex', flexDirection: 'column' }}
        >
          {/* Mobile back */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid rgba(130,145,190,0.08)', flexShrink: 0 }}>
            <button
              onClick={() => { setShowMobileThread(false); setActiveConv(null); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
            >
              <ChevronLeft size={14} /> Back
            </button>
          </div>

          {sendError && (
            <div style={{ margin: '0 12px', padding: '8px 12px', borderRadius: 10, background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.20)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={12} color="#f46b72" />
              <span style={{ fontSize: 11, color: '#f46b72' }}>{sendError}</span>
              <button onClick={() => setSendError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#f46b72' }}><X size={11} /></button>
            </div>
          )}
          {aiError && (
            <div style={{ margin: '0 12px', padding: '8px 12px', borderRadius: 10, background: 'rgba(244,201,93,0.08)', border: '1px solid rgba(244,201,93,0.20)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={12} color="#f4c95d" />
              <span style={{ fontSize: 11, color: '#f4c95d' }}>{aiError}</span>
              <button onClick={() => setAiError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#f4c95d' }}><X size={11} /></button>
            </div>
          )}

          <MessageThread
            conversation={activeConv}
            messages={messages}
            loadingMsgs={loadingMsgs}
            onSend={() => void handleSend()}
            sending={sending}
            aiReply={aiReply}
            aiLoading={aiLoading}
            aiAction={aiAction}
            onAIAction={(a) => void handleAIAction(a)}
            onUseReply={handleUseReply}
            onEditReply={handleEditReply}
            onRegenerateReply={handleRegenerateReply}
            replyText={replyText}
            onReplyChange={setReplyText}
          />
        </div>
      ) : (
        <div className="crm-glass" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--crm-text-muted)' }}>
          <MessageSquare size={48} style={{ opacity: 0.15 }} />
          <p style={{ margin: 0, fontSize: 14 }}>Select a conversation to start</p>
          <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>AI intelligence will appear here</p>
        </div>
      )}

      {/* ── Panel 3: AI Intelligence ── */}
      {activeConv && showAIPanel && (
        <div
          className="crm-glass-ai"
          style={{ width: 240, minWidth: 220, flexShrink: 0, overflow: 'hidden', padding: '14px 12px', overflowY: 'auto' }}
        >
          <ConvAIIntelligencePanel
            conversationId={activeConv.id}
            contactName={activeConv.contact?.name ?? 'Unknown'}
            platform={activeConv.platform ?? 'unknown'}
            existingScore={activeConv.ai_lead_score ?? activeConv.contact?.lead_score ?? null}
            existingIntent={activeConv.ai_intent}
            existingSentiment={activeConv.ai_sentiment}
            existingSummary={activeConv.ai_summary}
            existingNextAction={activeConv.ai_next_action}
          />
        </div>
      )}

      {/* AI panel toggle button (desktop) */}
      {activeConv && (
        <button
          onClick={() => setShowAIPanel(p => !p)}
          style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            width: 28, height: 56, borderRadius: '8px 0 0 8px',
            background: showAIPanel
              ? 'linear-gradient(135deg,rgba(79,109,245,0.35),rgba(139,92,246,0.28))'
              : 'linear-gradient(135deg,rgba(79,109,245,0.20),rgba(139,92,246,0.15))',
            border: '1px solid rgba(79,109,245,0.25)', borderRight: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#4f6df5', zIndex: 5,
          }}
          title={showAIPanel ? 'Hide AI Intelligence Panel' : 'Show AI Intelligence Panel'}
        >
          <Brain size={13} />
        </button>
      )}
    </div>
  );
}
