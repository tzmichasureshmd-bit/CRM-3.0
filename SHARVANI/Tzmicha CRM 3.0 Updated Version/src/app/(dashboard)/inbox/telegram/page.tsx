'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, X, Send, Users, MessageSquare, Bot, Zap, Settings, CheckCheck, Circle } from 'lucide-react';
import Link from 'next/link';

// ── Telegram brand colors ─────────────────────────────────────
const TG = {
  blue:    '#229ED9',
  dark:    '#17212B',
  darker:  '#0E1621',
  panel:   '#1C2733',
  bubble:  '#2B5278',
  bubbleOut: '#182533',
  text:    '#F5F5F5',
  muted:   '#708499',
  green:   '#4DCA5A',
  divider: '#0D1117',
};

// ── Types ─────────────────────────────────────────────────────
interface TGBot {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
  supports_inline_queries?: boolean;
}

interface TGChat {
  id: string;
  contact_name: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  platform: string;
}

interface Creds {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
}

const BACKEND = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000')
  : 'http://localhost:8000';

const getH = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('crm_token') ?? '' : ''}`,
});

function timeAgo(iso: string | null) {
  if (!iso) return '';
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'now';
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
}

// ── Telegram SVG Icon ─────────────────────────────────────────
function TGIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="12" fill="#229ED9" />
      <path d="M5.5 11.5l10-4.5-1.5 9-3-2.5-2 2v-3l5-4.5-6 3.5-2.5-1z" fill="white" />
    </svg>
  );
}

// ── Connect Modal ─────────────────────────────────────────────
function ConnectModal({ creds, onChange, onSave, onClose, saving, msg }: {
  creds: Creds;
  onChange: (k: keyof Creds, v: string) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  msg: string;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 440, background: TG.panel, borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, border: `1px solid ${TG.blue}30` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <TGIcon size={36} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: TG.text }}>Connect Telegram Bot</div>
              <div style={{ fontSize: 11, color: TG.muted }}>Credentials saved to your account DB</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TG.muted }}><X size={16} /></button>
        </div>

        <div style={{ padding: '12px 14px', borderRadius: 10, background: `${TG.blue}15`, border: `1px solid ${TG.blue}30`, fontSize: 12, color: TG.muted, lineHeight: 1.6 }}>
          1. Open <strong style={{ color: TG.blue }}>@BotFather</strong> on Telegram<br />
          2. Send <code style={{ background: TG.darker, padding: '1px 5px', borderRadius: 4, color: TG.text }}>/newbot</code> and follow steps<br />
          3. Copy the token below, then register webhook after saving
        </div>

        {([
          { key: 'TELEGRAM_BOT_TOKEN', label: 'Bot Token', ph: '123456789:ABCdefGHI...', secret: true },
          { key: 'TELEGRAM_WEBHOOK_SECRET', label: 'Webhook Secret (optional)', ph: 'any-secure-string', secret: false },
        ] as { key: keyof Creds; label: string; ph: string; secret: boolean }[]).map(f => (
          <div key={f.key}>
            <label style={{ fontSize: 11, fontWeight: 700, color: TG.muted, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{f.label}</label>
            <input
              type={f.secret ? 'password' : 'text'}
              placeholder={f.ph}
              value={creds[f.key]}
              onChange={e => onChange(f.key, e.target.value)}
              style={{ width: '100%', padding: '10px 13px', borderRadius: 10, border: `1px solid ${TG.blue}40`, background: TG.darker, color: TG.text, fontSize: 13, boxSizing: 'border-box', outline: 'none' }}
            />
          </div>
        ))}

        {msg && <div style={{ fontSize: 12, fontWeight: 600, color: msg.startsWith('✓') ? TG.green : '#f46b72' }}>{msg}</div>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onSave} disabled={saving} style={{ flex: 1, padding: '11px', borderRadius: 10, background: TG.blue, border: 'none', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : 'Save & Connect'}
          </button>
          <Link href="/settings/integrations" style={{ padding: '11px 14px', borderRadius: 10, border: `1px solid ${TG.muted}40`, color: TG.muted, fontSize: 12, textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
            Full Settings
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────
function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <div style={{ background: TG.panel, borderRadius: 14, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, border: `1px solid ${color}20` }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 750, color: TG.text }}>{value}</div>
        <div style={{ fontSize: 11, color: TG.muted, marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

// ── Chat Row ──────────────────────────────────────────────────
function ChatRow({ chat }: { chat: TGChat }) {
  const initials = chat.contact_name?.[0]?.toUpperCase() ?? '?';
  return (
    <Link href="/inbox?channel=telegram" style={{ textDecoration: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', cursor: 'pointer', borderBottom: `1px solid ${TG.divider}` }}
        onMouseEnter={e => (e.currentTarget.style.background = TG.bubbleOut)}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <div style={{ width: 46, height: 46, borderRadius: '50%', background: `linear-gradient(135deg,${TG.blue},#1a6fa8)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: 'white', flexShrink: 0, position: 'relative' }}>
          {initials}
          {chat.unread_count > 0 && (
            <div style={{ position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, background: TG.green, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white', padding: '0 4px', border: `2px solid ${TG.dark}` }}>
              {chat.unread_count > 9 ? '9+' : chat.unread_count}
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: TG.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chat.contact_name}</span>
            <span style={{ fontSize: 11, color: TG.muted, flexShrink: 0, marginLeft: 8 }}>{timeAgo(chat.last_message_at)}</span>
          </div>
          <div style={{ fontSize: 13, color: TG.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
            {chat.last_message || 'No messages yet'}
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function TelegramPage() {
  const [bot, setBot]           = useState<TGBot | null>(null);
  const [chats, setChats]       = useState<TGChat[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creds, setCreds]       = useState<{ TELEGRAM_BOT_TOKEN: string; TELEGRAM_WEBHOOK_SECRET: string }>({ TELEGRAM_BOT_TOKEN: '', TELEGRAM_WEBHOOK_SECRET: '' });
  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState('');
  const [webhookCopied, setWebhookCopied] = useState(false);

  const webhookUrl = `https://crm3.tzmicha.com/api/v1/webhooks/telegram`;

  const loadCreds = useCallback(async () => {
    try {
      const r = await fetch(`${BACKEND}/api/v1/settings/integrations/telegram`, { headers: getH() });
      if (r.ok) {
        const d = await r.json() as Record<string, string>;
        setCreds(c => ({ ...c, ...d }));
      }
    } catch { /* silent */ }
  }, []);

  const checkBot = useCallback(async () => {
    setLoading(true);
    try {
      // Call Telegram getMe via backend proxy or directly with token from DB
      const r = await fetch(`${BACKEND}/api/v1/settings/integrations/telegram`, { headers: getH() });
      if (!r.ok) { setConnected(false); setLoading(false); return; }
      const d = await r.json() as Record<string, string>;
      const token = d['TELEGRAM_BOT_TOKEN'];
      if (!token) { setConnected(false); setLoading(false); return; }

      // Call Telegram API directly from browser to get bot info
      const tgRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      if (tgRes.ok) {
        const tgData = await tgRes.json() as { ok: boolean; result: TGBot };
        if (tgData.ok) { setBot(tgData.result); setConnected(true); }
        else { setConnected(false); }
      } else {
        setConnected(false);
      }
    } catch { setConnected(false); }
    setLoading(false);
  }, []);

  const loadChats = useCallback(async () => {
    try {
      const r = await fetch(`${BACKEND}/api/v1/conversations?platform=telegram&limit=20`, { headers: getH() });
      if (r.ok) {
        const d = await r.json() as { data?: TGChat[] };
        setChats((d.data ?? []).map((c: TGChat) => ({
          id: c.id,
          contact_name: (c as unknown as { contact?: { name?: string } }).contact?.name ?? 'Unknown',
          last_message: (c as unknown as { last_message_text?: string }).last_message_text ?? '',
          last_message_at: (c as unknown as { last_message_at?: string }).last_message_at ?? '',
          unread_count: (c as unknown as { unread_count?: number }).unread_count ?? 0,
          platform: 'telegram',
        })));
      }
    } catch { /* silent */ }
  }, []);

  const saveCreds = async () => {
    setSaving(true); setSaveMsg('');
    try {
      const r = await fetch(`${BACKEND}/api/v1/settings/integrations/telegram`, {
        method: 'POST', headers: getH(), body: JSON.stringify(creds),
      });
      if (r.ok) {
        setSaveMsg('✓ Saved! Checking bot...');
        setShowModal(false);
        await checkBot();
        await loadChats();
      } else {
        setSaveMsg('Save failed. Try again.');
      }
    } catch { setSaveMsg('Save failed.'); }
    setSaving(false);
  };

  const disconnect = async () => {
    if (!confirm('Disconnect Telegram bot?')) return;
    await fetch(`${BACKEND}/api/v1/settings/integrations/telegram`, {
      method: 'POST', headers: getH(),
      body: JSON.stringify({ TELEGRAM_BOT_TOKEN: '', TELEGRAM_WEBHOOK_SECRET: '' }),
    });
    setBot(null); setConnected(false); setChats([]);
    setCreds({ TELEGRAM_BOT_TOKEN: '', TELEGRAM_WEBHOOK_SECRET: '' });
  };

  useEffect(() => { void loadCreds(); void checkBot(); void loadChats(); }, [loadCreds, checkBot, loadChats]);

  const totalUnread = chats.reduce((s, c) => s + c.unread_count, 0);

  return (
    <div style={{ minHeight: '100vh', background: TG.darker, color: TG.text }}>

      {/* ── Top Bar ── */}
      <div style={{ background: TG.dark, borderBottom: `1px solid ${TG.divider}`, padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <TGIcon size={30} />
          <div>
            <span style={{ fontSize: 18, fontWeight: 700, color: TG.text }}>Telegram</span>
            {bot && <span style={{ fontSize: 12, color: TG.blue, marginLeft: 8 }}>@{bot.username}</span>}
          </div>
          {connected && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, background: `${TG.green}18`, border: `1px solid ${TG.green}40` }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: TG.green }} />
              <span style={{ fontSize: 11, color: TG.green, fontWeight: 600 }}>Connected</span>
            </div>
          )}
          {!connected && !loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, background: 'rgba(244,107,114,0.12)', border: '1px solid rgba(244,107,114,0.30)' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#f46b72' }} />
              <span style={{ fontSize: 11, color: '#f46b72', fontWeight: 600 }}>Not connected</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!connected && (
            <button onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, background: TG.blue, border: 'none', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              Connect Bot
            </button>
          )}
          {connected && (
            <>
              <button onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: `${TG.blue}20`, border: `1px solid ${TG.blue}40`, color: TG.blue, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                <Settings size={13} /> Settings
              </button>
              <button onClick={() => { void checkBot(); void loadChats(); }} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: `${TG.blue}15`, border: `1px solid ${TG.blue}30`, color: TG.blue, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
              </button>
              <button onClick={() => void disconnect()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: 'rgba(244,107,114,0.10)', border: '1px solid rgba(244,107,114,0.25)', color: '#f46b72', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Not connected banner ── */}
        {!connected && !loading && (
          <div style={{ background: TG.panel, borderRadius: 16, padding: '32px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center', border: `1px solid ${TG.blue}25` }}>
            <TGIcon size={64} />
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: TG.text, marginBottom: 6 }}>Telegram Bot Not Connected</div>
              <div style={{ fontSize: 13, color: TG.muted, maxWidth: 380, lineHeight: 1.6 }}>
                Create a bot via <strong style={{ color: TG.blue }}>@BotFather</strong>, paste the token below, and all messages sent to your bot will appear in the Unified Inbox.
              </div>
            </div>
            <button onClick={() => setShowModal(true)} style={{ padding: '12px 32px', borderRadius: 12, background: TG.blue, border: 'none', color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
              Connect Telegram Bot
            </button>
            <Link href="/settings/integrations" style={{ fontSize: 12, color: TG.muted, textDecoration: 'none' }}>Or manage in Settings → Integrations →</Link>
          </div>
        )}

        {loading && (
          <div style={{ background: TG.panel, borderRadius: 16, padding: 32, textAlign: 'center', color: TG.muted, fontSize: 14 }}>
            Checking bot connection...
          </div>
        )}

        {/* ── Bot Profile Card ── */}
        {connected && bot && (
          <div style={{ background: TG.panel, borderRadius: 16, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 20, border: `1px solid ${TG.blue}25` }}>
            {/* Bot avatar */}
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: `linear-gradient(135deg,${TG.blue},#1a6fa8)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' }}>
              <Bot size={34} color="white" />
              <div style={{ position: 'absolute', bottom: 2, right: 2, width: 16, height: 16, borderRadius: '50%', background: TG.green, border: `2px solid ${TG.panel}` }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 750, color: TG.text }}>{bot.first_name}</div>
              <div style={{ fontSize: 14, color: TG.blue, marginTop: 2 }}>@{bot.username}</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: `${TG.blue}18`, color: TG.blue, fontWeight: 600 }}>🤖 Bot</span>
                {bot.can_join_groups && <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: `${TG.green}15`, color: TG.green, fontWeight: 600 }}>Groups ✓</span>}
                {bot.supports_inline_queries && <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', fontWeight: 600 }}>Inline ✓</span>}
                <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: `${TG.green}15`, color: TG.green, fontWeight: 600 }}>ID: {bot.id}</span>
              </div>
            </div>
            {/* Webhook URL */}
            <div style={{ flexShrink: 0, maxWidth: 320 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: TG.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Webhook URL</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: TG.darker, border: `1px solid ${TG.blue}30` }}>
                <code style={{ fontSize: 11, color: TG.blue, wordBreak: 'break-all', flex: 1 }}>{webhookUrl}</code>
                <button
                  onClick={() => { void navigator.clipboard.writeText(webhookUrl); setWebhookCopied(true); setTimeout(() => setWebhookCopied(false), 2000); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: webhookCopied ? TG.green : TG.muted, flexShrink: 0, fontSize: 11, fontWeight: 600 }}
                >
                  {webhookCopied ? '✓' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Stats Row ── */}
        {connected && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            <StatCard icon={<MessageSquare size={20} />} label="Total Chats" value={chats.length} color={TG.blue} />
            <StatCard icon={<Circle size={20} />} label="Unread Messages" value={totalUnread} color={TG.green} />
            <StatCard icon={<Users size={20} />} label="Active Users" value={chats.filter(c => c.unread_count > 0).length} color="#8b5cf6" />
            <StatCard icon={<Zap size={20} />} label="Bot Status" value="Online" color={TG.green} />
          </div>
        )}

        {/* ── Recent Chats ── */}
        {connected && (
          <div style={{ background: TG.dark, borderRadius: 16, overflow: 'hidden', border: `1px solid ${TG.divider}` }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${TG.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: TG.text }}>Recent Chats</span>
              <Link href="/inbox?channel=telegram" style={{ fontSize: 12, color: TG.blue, textDecoration: 'none', fontWeight: 600 }}>
                Open Inbox →
              </Link>
            </div>
            {chats.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: TG.muted, fontSize: 13 }}>
                <Send size={28} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.3 }} />
                No Telegram chats yet. Share your bot link to start receiving messages.
              </div>
            ) : (
              chats.map(c => <ChatRow key={c.id} chat={c} />)
            )}
          </div>
        )}

        {/* ── Setup Guide ── */}
        {connected && (
          <div style={{ background: TG.panel, borderRadius: 16, padding: '18px 22px', border: `1px solid ${TG.blue}20` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: TG.text, marginBottom: 12 }}>Register Webhook with Telegram</div>
            <div style={{ fontFamily: 'monospace', fontSize: 12, background: TG.darker, borderRadius: 10, padding: '12px 14px', color: TG.blue, lineHeight: 1.8, wordBreak: 'break-all' }}>
              curl &quot;https://api.telegram.org/bot<span style={{ color: '#f4c95d' }}>&lt;BOT_TOKEN&gt;</span>/setWebhook?url=<span style={{ color: TG.green }}>{webhookUrl}</span>&amp;secret_token=<span style={{ color: '#f4c95d' }}>&lt;WEBHOOK_SECRET&gt;</span>&quot;
            </div>
            <div style={{ fontSize: 11, color: TG.muted, marginTop: 8 }}>Run this once after saving your credentials. Replace the placeholders with your actual values.</div>
          </div>
        )}

      </div>

      {showModal && (
        <ConnectModal
          creds={creds}
          onChange={(k, v) => setCreds(c => ({ ...c, [k]: v }))}
          onSave={() => void saveCreds()}
          onClose={() => setShowModal(false)}
          saving={saving}
          msg={saveMsg}
        />
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
