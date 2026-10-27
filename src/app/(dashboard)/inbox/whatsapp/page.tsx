'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, X, Send, Phone, MessageCircle, Users, Settings, CheckCheck, Search } from 'lucide-react';
import Link from 'next/link';

const WA = {
  green:   '#25D366',
  dark:    '#111B21',
  darker:  '#0B141A',
  panel:   '#202C33',
  bubble:  '#005C4B',
  bubbleIn:'#202C33',
  text:    '#E9EDEF',
  muted:   '#8696A0',
  divider: '#222D34',
  teal:    '#00A884',
};

interface WAConv {
  id: string;
  contact_name: string;
  phone: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
}

interface WAMsg {
  id: string;
  content: string;
  sender_type: 'contact' | 'agent';
  created_at: string;
}

interface Creds {
  WHATSAPP_PHONE_NUMBER_ID: string;
  WHATSAPP_ACCESS_TOKEN: string;
  WHATSAPP_VERIFY_TOKEN: string;
  WHATSAPP_APP_SECRET: string;
}

const BACKEND = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000')
  : 'http://localhost:8000';

const getH = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('crm_token') ?? '' : ''}`,
});

// Use Next.js v3 proxy for conversations (avoids direct backend calls)
const v3 = (path: string, opts?: RequestInit) =>
  fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('crm_token') ?? '' : ''}`, ...(opts?.headers ?? {}) } });

function timeAgo(iso: string | null) {
  if (!iso) return '';
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'now';
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
}

function WAIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="12" fill="#25D366" />
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" fill="white"/>
    </svg>
  );
}

function ConnectModal({ creds, onChange, onSave, onClose, saving, msg }: {
  creds: Creds; onChange: (k: keyof Creds, v: string) => void;
  onSave: () => void; onClose: () => void; saving: boolean; msg: string;
}) {
  const fields: { key: keyof Creds; label: string; ph: string; secret: boolean }[] = [
    { key: 'WHATSAPP_PHONE_NUMBER_ID', label: 'Phone Number ID', ph: '123456789012345', secret: false },
    { key: 'WHATSAPP_ACCESS_TOKEN', label: 'Access Token', ph: 'EAAxxxxx...', secret: true },
    { key: 'WHATSAPP_VERIFY_TOKEN', label: 'Verify Token', ph: 'tzmicha_crm3_verify', secret: false },
    { key: 'WHATSAPP_APP_SECRET', label: 'App Secret', ph: 'abc123...', secret: true },
  ];
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 440, background: WA.panel, borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, border: `1px solid ${WA.green}30` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <WAIcon size={36} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: WA.text }}>Connect WhatsApp Business</div>
              <div style={{ fontSize: 11, color: WA.muted }}>Credentials saved to your account</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: WA.muted }}><X size={16} /></button>
        </div>
        <div style={{ padding: '12px 14px', borderRadius: 10, background: `${WA.green}15`, border: `1px solid ${WA.green}30`, fontSize: 12, color: WA.muted, lineHeight: 1.6 }}>
          1. Go to <strong style={{ color: WA.green }}>Meta for Developers</strong> → WhatsApp → API Setup<br />
          2. Copy your Phone Number ID and access token<br />
          3. Set webhook URL: <code style={{ color: WA.text, fontSize: 11 }}>https://crm3.tzmicha.com/api/v1/webhooks/whatsapp</code>
        </div>
        {fields.map(f => (
          <div key={f.key}>
            <label style={{ fontSize: 11, fontWeight: 700, color: WA.muted, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{f.label}</label>
            <input type={f.secret ? 'password' : 'text'} placeholder={f.ph} value={creds[f.key]}
              onChange={e => onChange(f.key, e.target.value)}
              style={{ width: '100%', padding: '10px 13px', borderRadius: 10, border: `1px solid ${WA.green}40`, background: WA.darker, color: WA.text, fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />
          </div>
        ))}
        {msg && <div style={{ fontSize: 12, fontWeight: 600, color: msg.startsWith('✓') ? WA.green : '#f46b72' }}>{msg}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onSave} disabled={saving} style={{ flex: 1, padding: '11px', borderRadius: 10, background: WA.green, border: 'none', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : 'Save & Connect'}
          </button>
          <Link href="/settings/integrations" style={{ padding: '11px 14px', borderRadius: 10, border: `1px solid ${WA.muted}40`, color: WA.muted, fontSize: 12, textDecoration: 'none', display: 'flex', alignItems: 'center' }}>Full Settings</Link>
        </div>
      </div>
    </div>
  );
}

function ConvRow({ conv, selected, onClick }: { conv: WAConv; selected: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', background: selected ? `${WA.green}15` : 'transparent', borderBottom: `1px solid ${WA.divider}` }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = WA.panel; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = selected ? `${WA.green}15` : 'transparent'; }}
    >
      <div style={{ width: 46, height: 46, borderRadius: '50%', background: `linear-gradient(135deg,${WA.green},#128C7E)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: 'white', flexShrink: 0, position: 'relative' }}>
        {(conv.contact_name?.[0] ?? '?').toUpperCase()}
        {conv.unread_count > 0 && (
          <div style={{ position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, background: WA.green, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white', padding: '0 4px', border: `2px solid ${WA.dark}` }}>
            {conv.unread_count > 9 ? '9+' : conv.unread_count}
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: WA.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.contact_name}</span>
          <span style={{ fontSize: 11, color: WA.muted, flexShrink: 0, marginLeft: 8 }}>{timeAgo(conv.last_message_at)}</span>
        </div>
        <div style={{ fontSize: 13, color: WA.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{conv.last_message || 'No messages yet'}</div>
      </div>
    </div>
  );
}

// ─── Part 2: ChatPanel ───────────────────────────────────────────────────────

function ChatPanel({ conv, onClose }: { conv: WAConv; onClose: () => void }) {
  const [msgs, setMsgs] = useState<WAMsg[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = { current: null as HTMLDivElement | null };
  const lastCountRef = { current: 0 };
  const atBottomRef = { current: true };
  const listRef = { current: null as HTMLDivElement | null };

  const loadMsgs = useCallback(async (silent = false) => {
    try {
      const r = await fetch(`${BACKEND}/api/v1/conversations/${conv.id}/messages`, { headers: getH() });
      if (r.ok) {
        const j = await r.json() as { messages?: WAMsg[]; data?: WAMsg[] };
        const next = j.messages ?? j.data ?? [];
        // silent refresh: only update if new messages arrived
        if (silent && next.length === lastCountRef.current) return;
        lastCountRef.current = next.length;
        setMsgs(next);
      }
    } finally { if (!silent) setLoading(false); }
  }, [conv.id]);

  // track if user is scrolled to bottom
  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  useEffect(() => { void loadMsgs(); }, [loadMsgs]);

  // silent poll every 5s — only scrolls if user is already at bottom
  useEffect(() => {
    const id = setInterval(() => void loadMsgs(true), 5000);
    return () => clearInterval(id);
  }, [loadMsgs]);

  useEffect(() => {
    if (atBottomRef.current && bottomRef.current)
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setText('');
    try {
      await fetch(`${BACKEND}/api/v1/meta/send`, {
        method: 'POST',
        headers: getH(),
        body: JSON.stringify({ conversation_id: conv.id, content: t, platform: 'whatsapp' }),
      });
      await loadMsgs();
    } finally { setSending(false); }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: WA.dark, minWidth: 0 }}>
      {/* Chat header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: WA.panel, borderBottom: `1px solid ${WA.divider}`, flexShrink: 0 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: `linear-gradient(135deg,${WA.green},#128C7E)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: 'white' }}>
          {(conv.contact_name?.[0] ?? '?').toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: WA.text }}>{conv.contact_name}</div>
          <div style={{ fontSize: 12, color: WA.muted }}>{conv.phone}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: WA.muted, padding: 4 }}><X size={18} /></button>
      </div>

      {/* Messages */}
      <div ref={el => { listRef.current = el; }} onScroll={onScroll} style={{ flex: 1, overflowY: 'auto', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: WA.muted, fontSize: 13, marginTop: 40 }}>Loading messages…</div>
        ) : msgs.length === 0 ? (
          <div style={{ textAlign: 'center', color: WA.muted, fontSize: 13, marginTop: 40 }}>No messages yet. Say hello! 👋</div>
        ) : msgs.map(m => {
          const isOut = m.sender_type === 'agent';
          return (
            <div key={m.id} style={{ display: 'flex', justifyContent: isOut ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: '72%', padding: '8px 12px', borderRadius: isOut ? '12px 12px 2px 12px' : '12px 12px 12px 2px', background: isOut ? WA.bubble : WA.bubbleIn, color: WA.text, fontSize: 13.5, lineHeight: 1.5, position: 'relative' }}>
                {m.content}
                <div style={{ fontSize: 10, color: WA.muted, textAlign: 'right', marginTop: 3, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                  {new Date(m.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  {isOut && <CheckCheck size={12} color={WA.teal} />}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={el => { bottomRef.current = el; }} />
      </div>

      {/* Input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: WA.panel, borderTop: `1px solid ${WA.divider}`, flexShrink: 0 }}>
        {/* Media attach */}
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: '50%', background: WA.panel, cursor: 'pointer', flexShrink: 0 }}>
          <input type="file" accept="image/*,video/*,application/pdf" style={{ display: 'none' }}
            onChange={async e => {
              const file = e.target.files?.[0];
              if (!file || sending) return;
              setSending(true);
              try {
                const fd = new FormData();
                fd.append('file', file);
                fd.append('conversation_id', conv.id);
                fd.append('platform', 'whatsapp');
                await fetch(`${BACKEND}/api/v1/meta/send-media`, { method: 'POST', headers: { Authorization: getH().Authorization }, body: fd });
                await loadMsgs();
              } finally { setSending(false); e.target.value = ''; }
            }} />
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={WA.muted} strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
        </label>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
          placeholder="Type a message…"
          style={{ flex: 1, padding: '10px 14px', borderRadius: 24, background: WA.darker, border: 'none', color: WA.text, fontSize: 14, outline: 'none' }}
        />
        <button onClick={() => void send()} disabled={!text.trim() || sending}
          style={{ width: 42, height: 42, borderRadius: '50%', background: WA.green, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: (!text.trim() || sending) ? 0.5 : 1, flexShrink: 0 }}>
          <Send size={18} color="white" />
        </button>
      </div>
    </div>
  );
}

// ─── Part 3: Main Page ───────────────────────────────────────────────────────

export default function WhatsAppPage() {
  const [convs, setConvs]         = useState<WAConv[]>([]);
  const [selected, setSelected]   = useState<WAConv | null>(null);
  const [search, setSearch]       = useState('');
  const [loading, setLoading]     = useState(true);
  const [showConnect, setShowConnect] = useState(false);
  const [connected, setConnected] = useState(false);
  const [phoneDisplay, setPhoneDisplay] = useState('');
  const [creds, setCreds]         = useState<Creds>({ WHATSAPP_PHONE_NUMBER_ID: '', WHATSAPP_ACCESS_TOKEN: '', WHATSAPP_VERIFY_TOKEN: '', WHATSAPP_APP_SECRET: '' });
  const [saving, setSaving]       = useState(false);
  const [saveMsg, setSaveMsg]     = useState('');

  // Load existing creds + conversations
  const init = useCallback(async () => {
    try {
      const [credsRes, convsRes, statusRes] = await Promise.all([
        fetch(`${BACKEND}/api/v1/settings/integrations/whatsapp`, { headers: getH() }),
        v3('/api/v3/conversations?platform=whatsapp&limit=50'),
        fetch(`${BACKEND}/api/v1/whatsapp/status`, { headers: getH() }),
      ]);
      if (credsRes.ok) {
        const c = await credsRes.json() as Partial<Creds>;
        setCreds(prev => ({ ...prev, ...c }));
        setConnected(!!(c.WHATSAPP_PHONE_NUMBER_ID && c.WHATSAPP_ACCESS_TOKEN));
      }
      if (statusRes.ok) {
        const s = await statusRes.json() as { configured?: boolean; valid?: boolean; phone_number?: string; verified_name?: string };
        if (s.valid && s.phone_number) setPhoneDisplay(`${s.verified_name ?? ''} · ${s.phone_number}`.trim());
        if (s.configured) setConnected(true);
      }
      if (convsRes.ok) {
        const j = await convsRes.json() as { data?: { id: string; contact?: { name?: string; phone?: string } | null; last_message_text?: string; last_message_at?: string; unread_count?: number }[] };
        const mapped = (j.data ?? []).map(c => ({
          id: c.id,
          contact_name: c.contact?.name ?? c.contact?.phone ?? 'Unknown',
          phone: c.contact?.phone ?? '',
          last_message: c.last_message_text ?? '',
          last_message_at: c.last_message_at ?? '',
          unread_count: c.unread_count ?? 0,
        }));
        setConvs(mapped);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void init(); }, [init]);

  // Re-fetch after session renewal so page recovers without manual refresh
  useEffect(() => {
    const handler = () => void init();
    window.addEventListener('crm:session-renewed', handler);
    return () => window.removeEventListener('crm:session-renewed', handler);
  }, [init]);

  // silent sidebar poll every 8s — refreshes conv list without any visual disruption
  useEffect(() => {
    const id = setInterval(() => void init(), 8000);
    return () => clearInterval(id);
  }, [init]);

  const saveCreds = async () => {
    setSaving(true); setSaveMsg('');
    try {
      const r = await fetch(`${BACKEND}/api/v1/settings/integrations/whatsapp`, {
        method: 'POST', headers: getH(), body: JSON.stringify(creds),
      });
      if (r.ok) {
        setSaveMsg('✓ Connected successfully!');
        setConnected(true);
        setTimeout(() => { setShowConnect(false); setSaveMsg(''); }, 1200);
        void init();
      } else { setSaveMsg('✗ Failed to save. Check credentials.'); }
    } finally { setSaving(false); }
  };

  const filtered = convs.filter(c =>
    c.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  );

  const totalUnread = convs.reduce((s, c) => s + (c.unread_count ?? 0), 0);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: WA.darker, borderRadius: 16, overflow: 'hidden', border: `1px solid ${WA.divider}` }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: WA.panel, borderBottom: `1px solid ${WA.divider}`, flexShrink: 0 }}>
        <WAIcon size={28} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: WA.text }}>WhatsApp Business</div>
          <div style={{ fontSize: 11, color: connected ? WA.green : WA.muted }}>
            {connected ? `● Connected via Meta API${phoneDisplay ? ` — ${phoneDisplay}` : ''}` : '○ Not connected'}
          </div>
        </div>
        {/* Stats chips */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 20, background: `${WA.green}18`, border: `1px solid ${WA.green}30`, fontSize: 12, color: WA.green }}>
            <MessageCircle size={13} /> {convs.length} chats
          </div>
          {totalUnread > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 20, background: `${WA.green}30`, border: `1px solid ${WA.green}50`, fontSize: 12, color: WA.green, fontWeight: 700 }}>
              {totalUnread} unread
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 20, background: `${WA.green}18`, border: `1px solid ${WA.green}30`, fontSize: 12, color: WA.green }}>
            <Users size={13} /> {convs.length} contacts
          </div>
        </div>
        <button onClick={() => setShowConnect(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, background: connected ? `${WA.green}20` : WA.green, border: `1px solid ${connected ? WA.green + '40' : WA.green}`, color: connected ? WA.green : 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          <Settings size={13} /> {connected ? 'Settings' : 'Connect'}
        </button>
        <button onClick={() => void init()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: WA.muted, padding: 4 }}>
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* Sidebar — conversation list */}
        <div style={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${WA.divider}`, background: WA.dark }}>
          {/* Search */}
          <div style={{ padding: '10px 12px', borderBottom: `1px solid ${WA.divider}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 24, background: WA.panel }}>
              <Search size={14} color={WA.muted} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search conversations…"
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: WA.text, fontSize: 13 }} />
            </div>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${WA.divider}` }}>
                  <div style={{ width: 46, height: 46, borderRadius: '50%', background: WA.panel }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ height: 13, borderRadius: 6, background: WA.panel, width: '60%' }} />
                    <div style={{ height: 11, borderRadius: 6, background: WA.panel, width: '80%' }} />
                  </div>
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: WA.muted, fontSize: 13 }}>
                {connected ? (search ? 'No results' : 'No conversations yet.\nMessages will appear here when customers contact you.') : 'Connect WhatsApp to see conversations.'}
              </div>
            ) : filtered.map(c => (
              <ConvRow key={c.id} conv={c} selected={selected?.id === c.id} onClick={() => setSelected(c)} />
            ))}
          </div>
        </div>

        {/* Main area */}
        {selected ? (
          <ChatPanel conv={selected} onClose={() => setSelected(null)} />
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: WA.muted }}>
            <WAIcon size={64} />
            <div style={{ fontSize: 20, fontWeight: 700, color: WA.text }}>WhatsApp Business</div>
            <div style={{ fontSize: 13, color: WA.muted, textAlign: 'center', maxWidth: 320, lineHeight: 1.6 }}>
              {connected
                ? 'Select a conversation from the left to start chatting.'
                : 'Click Connect to link your WhatsApp Business account via Meta API.'}
            </div>
            {!connected && (
              <button onClick={() => setShowConnect(true)}
                style={{ marginTop: 8, padding: '12px 28px', borderRadius: 12, background: WA.green, border: 'none', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Phone size={16} /> Connect WhatsApp
              </button>
            )}
          </div>
        )}
      </div>

      {/* Connect modal */}
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
