'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Send, RefreshCw, Plus, X, ChevronLeft, AlertCircle, Search, Loader2, Star, Paperclip, Reply, Forward, Trash2, Archive, Inbox, Tag, Clock, CheckCheck, Edit3, Zap, Filter } from 'lucide-react';

// ── Google Colors ─────────────────────────────────────────────
const G = { blue: '#4285F4', red: '#EA4335', yellow: '#FBBC05', green: '#34A853', gray: '#5F6368', lightGray: '#F1F3F4', border: '#E8EAED', white: '#FFFFFF', dark: '#202124', mid: '#3C4043' };

const BASE = 'http://localhost:8000/api/v1';
const getH = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('crm_token') ?? '' : ''}` });

interface EmailConv { id: string; last_message_text: string | null; last_message_at: string | null; status: string | null; unread_count: number; contact: { name: string | null; email: string | null } | null; }
interface Att { filename: string; content_type: string; size: number; data: string; }
interface Msg { id: string; content: string | null; sender_type: 'customer'|'agent'|'bot'|'contact'; status: string | null; created_at: string; metadata?: { attachments?: Att[]; html_body?: string }; }

function fmt(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso), now = new Date(), diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 86400 && d.getDate() === now.getDate()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff < 86400 * 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
function aColor(n: string) {
  const c = [G.blue, G.red, G.yellow, G.green, '#9C27B0', '#FF6D00', '#00BCD4', '#795548'];
  let h = 0; for (let i = 0; i < n.length; i++) h = n.charCodeAt(i) + ((h << 5) - h);
  return c[Math.abs(h) % c.length];
}

// ── Google-style icon button ──────────────────────────────────
function IconBtn({ icon, title, color, onClick }: { icon: React.ReactNode; title: string; color?: string; onClick?: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button title={title} onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: hov ? G.lightGray : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: color ?? G.gray, transition: 'background 150ms', flexShrink: 0 }}>
      {icon}
    </button>
  );
}

// ── Compose ───────────────────────────────────────────────────
function ComposeModal({ onClose, onSent, replyTo, replySubject, convId }: { onClose: () => void; onSent: () => void; replyTo?: string; replySubject?: string; convId?: string; }) {
  const [to, setTo] = useState(replyTo ?? '');
  const [subject, setSubject] = useState(replySubject ? `Re: ${replySubject}` : '');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [min, setMin] = useState(false);
  const [attachments, setAttachments] = useState<Array<{ filename: string; content_type: string; data: string; size: number }>>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        const b64 = (e.target?.result as string).split(',')[1];
        setAttachments(p => [...p, { filename: file.name, content_type: file.type || 'application/octet-stream', data: b64, size: file.size }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const send = async () => {
    if (!to.trim() || !subject.trim() || !body.trim()) { setError('To, Subject and Body required.'); return; }
    setSending(true); setError(null);
    try {
      const r = await fetch(`${BASE}/email/send`, { method: 'POST', headers: getH(), body: JSON.stringify({ to, subject, body, conversation_id: convId ?? null, attachments: attachments.length ? attachments : undefined }) });
      if (!r.ok) { const d = await r.json() as { detail?: string }; throw new Error(d.detail ?? 'Failed'); }
      const d = await r.json() as { conversation_id?: string };
      onSent();
      onClose();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Send failed'); setSending(false); }
  };

  return (
    <div style={{ position: 'fixed', bottom: 0, right: 24, zIndex: 300, width: min ? 256 : 540 }}>
      <div style={{ borderRadius: '8px 8px 0 0', overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.24)', background: G.white, display: 'flex', flexDirection: 'column' }}>
        <div onClick={() => setMin(m => !m)} style={{ padding: '10px 16px', background: G.dark, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Edit3 size={13} color="white" />
            <span style={{ fontSize: 13, fontWeight: 500, color: 'white' }}>{replyTo ? `Reply` : 'New Message'}</span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={e => { e.stopPropagation(); setMin(m => !m); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>—</button>
            <button onClick={e => { e.stopPropagation(); onClose(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center' }}><X size={14} /></button>
          </div>
        </div>
        {!min && <>
          <div>
            {[{ label: 'To', value: to, set: setTo, ph: 'Recipients' }, { label: 'Subject', value: subject, set: setSubject, ph: 'Subject' }].map(f => (
              <div key={f.label} style={{ borderBottom: `1px solid ${G.border}`, display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: G.gray, width: 56, flexShrink: 0, padding: '10px 12px' }}>{f.label}</span>
                <input value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.ph} style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, color: G.dark, padding: '10px 12px 10px 0', background: 'none' }} />
              </div>
            ))}
            {error && <div style={{ padding: '6px 12px', fontSize: 12, color: G.red, background: '#FFF0EE', display: 'flex', gap: 5, alignItems: 'center' }}><AlertCircle size={11} />{error}</div>}
            <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Write your message here..." rows={10}
              style={{ width: '100%', border: 'none', outline: 'none', resize: 'none', fontSize: 14, color: G.dark, padding: '12px', lineHeight: 1.7, boxSizing: 'border-box', background: 'none', fontFamily: 'Google Sans, Roboto, sans-serif' }} />
            {attachments.length > 0 && (
              <div style={{ padding: '0 12px 8px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {attachments.map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 6, background: G.lightGray, border: `1px solid ${G.border}`, fontSize: 12, color: G.dark }}>
                    <span>{a.content_type.startsWith('image/') ? '🖼️' : '📎'}</span>
                    <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.filename}</span>
                    <span style={{ color: G.gray, fontSize: 10 }}>({Math.round(a.size / 1024)}KB)</span>
                    <button onClick={() => setAttachments(p => p.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: G.red, padding: 0, display: 'flex' }}><X size={11} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ padding: '10px 12px', borderTop: `1px solid ${G.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => void send()} disabled={sending}
              style={{ padding: '8px 24px', borderRadius: 20, border: 'none', background: G.blue, color: 'white', fontSize: 14, fontWeight: 500, cursor: sending ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 7, opacity: sending ? 0.7 : 1, boxShadow: '0 1px 3px rgba(66,133,244,0.4)' }}>
              {sending ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
              {sending ? 'Sending...' : 'Send'}
            </button>
            <input ref={fileRef} type="file" multiple accept="*/*" style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />
            <button type="button" onClick={() => fileRef.current?.click()}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: G.gray, padding: 8, borderRadius: '50%', display: 'flex' }} title="Attach files">
              <Paperclip size={18} />
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: G.gray, padding: '8px 12px', borderRadius: 20, fontSize: 14, marginLeft: 'auto' }}>Discard</button>
          </div>
        </>}
      </div>
    </div>
  );
}

// ── Attachments ───────────────────────────────────────────────
function AttachmentList({ atts }: { atts?: Att[] }) {
  if (!atts?.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${G.border}` }}>
      {atts.map((a, i) => {
        const isImg = a.content_type.startsWith('image/');
        const url = `data:${a.content_type};base64,${a.data}`;
        const kb = Math.round(a.size / 1024);
        return (
          <a key={i} href={url} download={a.filename} target="_blank" rel="noreferrer"
            style={{ textDecoration: 'none', borderRadius: 8, overflow: 'hidden', border: `1px solid ${G.border}`, background: G.lightGray, display: 'flex', flexDirection: 'column' }}>
            {isImg
              ? <><img src={url} alt={a.filename} style={{ width: 180, height: 120, objectFit: 'cover', display: 'block' }} />
                  <div style={{ padding: '5px 10px', fontSize: 11, color: G.gray }}>🖼️ {a.filename} · {kb}KB</div></>
              : <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: a.content_type.includes('pdf') ? '#FDECEA' : '#E8F0FE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                    {a.content_type.includes('pdf') ? '📄' : '📎'}
                  </div>
                  <div><div style={{ fontSize: 12, fontWeight: 500, color: G.dark }}>{a.filename}</div><div style={{ fontSize: 11, color: G.gray, marginTop: 1 }}>{kb} KB</div></div>
                </div>
            }
          </a>
        );
      })}
    </div>
  );
}

// ── Reading Pane ──────────────────────────────────────────────
function ReadingPane({ conv, onBack, onReply, onDelete, onArchive }: {
  conv: EmailConv; onBack: () => void; onReply: () => void;
  onDelete: (id: string) => Promise<void>; onArchive: (id: string) => Promise<void>;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [forwardTo, setForwardTo] = useState('');
  const [forwardingId, setForwardingId] = useState<string | null>(null);
  const [forwarding, setForwarding] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${BASE}/conversations/${conv.id}/messages?limit=50`, { headers: getH() })
      .then(r => r.json()).then((d: { data?: Msg[] }) => {
        const m = d.data ?? []; setMsgs(m);
        if (m.length) setExpanded(new Set([m[m.length - 1].id]));
      }).catch(() => {}).finally(() => setLoading(false));
  }, [conv.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const handleForward = async (msgId: string) => {
    if (!forwardTo.trim()) return;
    setForwarding(true);
    const msg = msgs.find(m => m.id === msgId);
    const body = (msg?.content ?? '').replace(/^Subject:.*\n\n/, '');
    try {
      await fetch(`${BASE}/email/send`, { method: 'POST', headers: getH(), body: JSON.stringify({ to: forwardTo, subject: `Fwd: ${conv.last_message_text ?? ''}`, body: `---------- Forwarded message ----------\n${body}` }) });
      setForwardingId(null); setForwardTo('');
    } catch { /* silent */ }
    setForwarding(false);
  };

  const cName = conv.contact?.name ?? conv.contact?.email ?? 'Unknown';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: G.white }}>
      {/* Header */}
      <div style={{ padding: '12px 20px', borderBottom: `1px solid ${G.border}`, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <IconBtn icon={<ChevronLeft size={18} />} title="Back" onClick={onBack} />
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 400, color: G.dark, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {conv.last_message_text ?? '(no subject)'}
        </h2>
        <div style={{ display: 'flex', gap: 2 }}>
          <IconBtn icon={<Archive size={16} />} title="Archive" color={G.yellow} onClick={() => { void onArchive(conv.id); onBack(); }} />
          <IconBtn icon={<Trash2 size={16} />} title="Delete" color={G.red} onClick={() => { void onDelete(conv.id); onBack(); }} />
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 16 }}>
            <svg className="g-spin" viewBox="25 25 50 50" style={{ width: 48, height: 48 }}>
              <circle className="g-path" cx="50" cy="50" r="20" fill="none" strokeWidth="3" strokeMiterlimit="10" />
            </svg>
            <span style={{ fontSize: 14, color: G.gray }}>Loading conversation...</span>
          </div>
        ) : msgs.map(msg => {
          const isAgent = msg.sender_type === 'agent' || msg.sender_type === 'bot';
          const isOpen = expanded.has(msg.id);
          const sName = isAgent ? 'Me' : cName;
          const sEmail = isAgent ? 'tzmicha.sureshmd@gmail.com' : (conv.contact?.email ?? '');
          const col = aColor(sName);
          const atts = msg.metadata?.attachments ?? [];
          const bodyText = (msg.content ?? '').replace(/^Subject:.*\n\n/, '');
          const isForwarding = forwardingId === msg.id;

          return (
            <div key={msg.id} style={{ border: `1px solid ${isOpen ? G.border : 'transparent'}`, borderRadius: 8, background: G.white, boxShadow: isOpen ? '0 1px 6px rgba(32,33,36,0.1)' : 'none', transition: 'box-shadow 200ms' }}>
              {/* Header row */}
              <div onClick={() => setExpanded(p => { const s = new Set(p); s.has(msg.id) ? s.delete(msg.id) : s.add(msg.id); return s; })}
                style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                {/* Avatar — Google colored circle */}
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: col, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 16, fontWeight: 500, flexShrink: 0 }}>
                  {sName[0]?.toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: G.dark }}>{sName}</span>
                    <span style={{ fontSize: 12, color: G.gray }}>{'<'}{sEmail}{'>'}</span>
                    {!isOpen && <span style={{ fontSize: 13, color: G.gray, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{bodyText.slice(0, 80)}</span>}
                  </div>
                  {isOpen && <div style={{ fontSize: 12, color: G.gray, marginTop: 2 }}>to {isAgent ? conv.contact?.email : 'me'}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {atts.length > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: G.gray }}><Paperclip size={12} />{atts.length}</div>}
                  <span style={{ fontSize: 12, color: G.gray }}>{fmt(msg.created_at)}</span>
                  {isOpen && <>
                    <IconBtn icon={<Reply size={15} />} title="Reply" onClick={e => { (e as unknown as React.MouseEvent).stopPropagation(); onReply(); }} />
                    <IconBtn icon={<Forward size={15} />} title="Forward" onClick={e => { (e as unknown as React.MouseEvent).stopPropagation(); setForwardingId(isForwarding ? null : msg.id); setForwardTo(''); }} />
                  </>}
                </div>
              </div>

              {/* Body */}
              {isOpen && (
                <div style={{ padding: '0 16px 16px 68px' }}>
                  {msg.metadata?.html_body ? (
                    <div style={{ fontSize: 14, color: G.dark, lineHeight: 1.8 }}
                      dangerouslySetInnerHTML={{ __html: msg.metadata.html_body }} />
                  ) : (
                    <div style={{ fontSize: 14, color: G.dark, lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{bodyText}</div>
                  )}
                  <AttachmentList atts={atts} />

                  {/* Forward inline form */}
                  {isForwarding && (
                    <div style={{ marginTop: 16, padding: 14, borderRadius: 8, border: `1px solid ${G.border}`, background: G.lightGray }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: G.gray, marginBottom: 8 }}>Forward to:</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input value={forwardTo} onChange={e => setForwardTo(e.target.value)} placeholder="recipient@example.com"
                          style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: `1px solid ${G.border}`, fontSize: 13, outline: 'none', background: G.white }} />
                        <button onClick={() => void handleForward(msg.id)} disabled={forwarding || !forwardTo.trim()}
                          style={{ padding: '8px 18px', borderRadius: 20, border: 'none', background: G.blue, color: 'white', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, opacity: forwarding ? 0.7 : 1 }}>
                          {forwarding ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Forward size={12} />} Forward
                        </button>
                        <button onClick={() => setForwardingId(null)} style={{ padding: '8px 14px', borderRadius: 20, border: `1px solid ${G.border}`, background: G.white, fontSize: 13, color: G.gray, cursor: 'pointer' }}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* Reply / Forward buttons */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                    <button onClick={onReply} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', borderRadius: 20, border: `1px solid ${G.border}`, background: G.white, fontSize: 13, color: G.mid, cursor: 'pointer', fontWeight: 500 }}>
                      <Reply size={14} color={G.blue} /> Reply
                    </button>
                    <button onClick={() => setForwardingId(isForwarding ? null : msg.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', borderRadius: 20, border: `1px solid ${G.border}`, background: G.white, fontSize: 13, color: G.mid, cursor: 'pointer', fontWeight: 500 }}>
                      <Forward size={14} color={G.green} /> Forward
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

const FOLDER_KEY: Record<string, string> = { Inbox: 'inbox', Starred: 'starred', Sent: 'sent', 'All Mail': 'all', Trash: 'trash', Archive: 'archive' };

export default function EmailInboxPage() {
  const [convs, setConvs] = useState<EmailConv[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [active, setActive] = useState<EmailConv | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [replyData, setReplyData] = useState<{ to: string; subject: string; convId: string } | null>(null);
  const [search, setSearch] = useState('');
  const [configured, setConfigured] = useState(true);
  const [activeFolder, setActiveFolder] = useState('Inbox');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const load = useCallback(async (folder = 'inbox') => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/email/conversations?folder=${folder}`, { headers: getH() });
      const d = await r.json() as { data?: EmailConv[]; counts?: Record<string, number> };
      setConvs(d.data ?? []);
      if (d.counts) setCounts(d.counts);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load('inbox');
    fetch(`${BASE}/email/status`, { headers: getH() }).then(r => r.json()).then((d: { configured: boolean }) => setConfigured(d.configured)).catch(() => {});
  }, [load]);

  const switchFolder = (label: string) => {
    setActiveFolder(label);
    setActive(null);
    void load(FOLDER_KEY[label] ?? 'inbox');
  };

  const patchConv = (id: string, patch: Record<string, unknown>) =>
    fetch(`${BASE}/email/conversations/${id}`, { method: 'PATCH', headers: getH(), body: JSON.stringify(patch) });

  const sync = async () => {
    setSyncing(true); setSyncMsg(null);
    try {
      const r = await fetch(`${BASE}/email/sync`, { method: 'POST', headers: getH(), body: JSON.stringify({ limit: 50 }) });
      const d = await r.json() as { synced?: number };
      setSyncMsg(d.synced ? `${d.synced} new` : 'Up to date');
      if (d.synced) void load(FOLDER_KEY[activeFolder] ?? 'inbox');
    } catch { setSyncMsg('Failed'); }
    setSyncing(false); setTimeout(() => setSyncMsg(null), 3000);
  };

  const handleDelete = async (id: string) => {
    await patchConv(id, { folder: 'trash' });
    setActive(null);
    void load(FOLDER_KEY[activeFolder] ?? 'inbox');
  };
  const handleArchive = async (id: string) => {
    await patchConv(id, { folder: 'archive' });
    setActive(null);
    void load(FOLDER_KEY[activeFolder] ?? 'inbox');
  };
  const handleRestore = async (id: string) => {
    await patchConv(id, { folder: 'inbox' });
    void load(FOLDER_KEY[activeFolder] ?? 'inbox');
  };
  const handleStar = async (id: string, cur: boolean) => {
    await patchConv(id, { starred: !cur });
    setConvs(p => p.map(c => c.id === id ? { ...c, _starred: !cur } as EmailConv & { _starred: boolean } : c));
  };

  const reply = () => {
    if (!active) return;
    setReplyData({ to: active.contact?.email ?? '', subject: active.last_message_text ?? '', convId: active.id });
    setShowCompose(true);
  };

  const filtered = convs.filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (c.contact?.name ?? '').toLowerCase().includes(s) || (c.contact?.email ?? '').toLowerCase().includes(s) || (c.last_message_text ?? '').toLowerCase().includes(s);
  });

  const FOLDERS = [
    { icon: <Inbox size={16} />,  label: 'Inbox',    count: counts.unread || counts.inbox || 0, color: G.blue },
    { icon: <Star size={16} />,   label: 'Starred',  count: counts.starred || 0,                color: G.yellow },
    { icon: <Clock size={16} />,  label: 'Snoozed',  count: 0,                                  color: G.gray },
    { icon: <Send size={16} />,   label: 'Sent',     count: counts.sent || 0,                   color: G.green },
    { icon: <Tag size={16} />,    label: 'All Mail', count: counts.all || 0,                    color: G.gray },
    { icon: <Trash2 size={16} />, label: 'Trash',    count: counts.trash || 0,                  color: G.red },
  ];

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 80px)', overflow: 'hidden', borderRadius: 12, border: `1px solid ${G.border}`, background: G.white, fontFamily: 'Google Sans, Roboto, Arial, sans-serif' }}>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>

      {/* Toast notification */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 400, padding: '12px 24px', borderRadius: 8, background: toast.type === 'success' ? '#34A853' : '#EA4335', color: 'white', fontSize: 14, fontWeight: 500, boxShadow: '0 4px 20px rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', gap: 8 }}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.msg}
        </div>
      )}

      {showCompose && (
        <ComposeModal onClose={() => { setShowCompose(false); setReplyData(null); }}
          onSent={() => {
            void load(FOLDER_KEY[activeFolder] ?? 'inbox');
            setToast({ msg: '✓ Email sent successfully', type: 'success' });
            setTimeout(() => setToast(null), 3500);
          }}
          replyTo={replyData?.to} replySubject={replyData?.subject} convId={replyData?.convId} />
      )}

      {/* ── Sidebar ── */}
      <div style={{ width: 256, flexShrink: 0, background: G.white, display: 'flex', flexDirection: 'column', padding: '8px 0' }}>
        {/* Logo area */}
        <div style={{ padding: '8px 16px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ display: 'flex', gap: 1 }}>
            {[G.blue, G.red, G.yellow, G.green].map((c, i) => (
              <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />
            ))}
          </div>
          <span style={{ fontSize: 20, fontWeight: 400, color: G.dark, letterSpacing: '-0.5px' }}>Mail</span>
          <span style={{ fontSize: 11, color: G.gray, marginLeft: 2, fontWeight: 400 }}>· CRM</span>
        </div>

        {/* Compose */}
        <div style={{ padding: '0 8px 8px' }}>
          <button onClick={() => { setReplyData(null); setShowCompose(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', borderRadius: 16, border: 'none', background: G.white, boxShadow: '0 1px 3px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.14)', cursor: 'pointer', fontSize: 14, fontWeight: 500, color: G.dark, width: '100%', transition: 'box-shadow 150ms' }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2), 0 2px 4px rgba(0,0,0,0.14)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.14)'}>
            <Plus size={20} color={G.blue} strokeWidth={2} /> Compose
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '0 8px' }}>
          {FOLDERS.map(f => {
            const isActive = activeFolder === f.label;
            return (
              <button key={f.label} onClick={() => switchFolder(f.label)}
                style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 16px', height: 40, borderRadius: '0 20px 20px 0', border: 'none', background: isActive ? '#D3E3FD' : 'none', cursor: 'pointer', fontSize: 14, fontWeight: isActive ? 700 : 400, color: isActive ? '#0B57D0' : G.dark, width: '100%', textAlign: 'left', transition: 'background 120ms', marginBottom: 2 }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = G.lightGray; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'none'; }}>
                <span style={{ color: isActive ? '#0B57D0' : G.gray }}>{f.icon}</span>
                <span style={{ flex: 1 }}>{f.label}</span>
                {f.count > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: isActive ? '#0B57D0' : G.gray }}>{f.count}</span>}
              </button>
            );
          })}
        </nav>

        {/* Status */}
        <div style={{ padding: '8px 16px', borderTop: `1px solid ${G.border}` }}>
          {configured
            ? <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: G.gray }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: G.green }} />
                Connected · {convs.length} threads
              </div>
            : <div style={{ fontSize: 11, color: G.red }}>⚠ Email not configured</div>}
        </div>
      </div>

      {/* ── Main ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, borderLeft: `1px solid ${G.border}` }}>

        {/* Toolbar */}
        <div style={{ padding: '8px 16px', borderBottom: `1px solid ${G.border}`, display: 'flex', alignItems: 'center', gap: 8, background: G.white, flexShrink: 0 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: G.lightGray, borderRadius: 24, padding: '8px 16px', maxWidth: 640 }}>
            <Search size={16} color={G.blue} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search mail"
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 16, color: G.dark, fontFamily: 'inherit' }} />
            {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: G.gray, padding: 0, display: 'flex' }}><X size={14} /></button>}
          </div>
          <button onClick={() => void sync()} disabled={syncing}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 20, border: `1px solid ${G.border}`, background: G.white, fontSize: 13, color: G.gray, cursor: syncing ? 'default' : 'pointer', fontWeight: 500 }}>
            <RefreshCw size={14} color={G.blue} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
            {syncMsg ? <span style={{ color: syncMsg === 'Failed' ? G.red : G.green, fontWeight: 600 }}>{syncMsg}</span> : 'Sync'}
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 20, border: `1px solid ${G.border}`, background: G.white, fontSize: 13, color: G.gray, cursor: 'pointer' }}>
            <Filter size={13} /> Filter
          </button>
        </div>

        {/* Content */}
        {active ? (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <ReadingPane conv={active} onBack={() => setActive(null)} onReply={reply} onDelete={handleDelete} onArchive={handleArchive} />
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', background: G.white }}>
            {/* Folder header */}
            <div style={{ padding: '8px 16px', borderBottom: `1px solid ${G.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: G.white }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: G.gray }}>
                {activeFolder} · {filtered.length} thread{filtered.length !== 1 ? 's' : ''}
                {activeFolder === 'Inbox' && (counts.unread ?? 0) > 0 && <span style={{ marginLeft: 8, color: G.blue, fontWeight: 700 }}>{counts.unread} unread</span>}
              </span>
              {(activeFolder === 'Trash' || activeFolder === 'Archive') && filtered.length > 0 && (
                <span style={{ fontSize: 12, color: G.gray }}>Click email → Restore to move back to Inbox</span>
              )}
            </div>

            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 400, gap: 20 }}>
                <style>{`
                  @keyframes gRotate { 100% { transform: rotate(360deg); } }
                  @keyframes gDash {
                    0%   { stroke-dasharray: 1,200; stroke-dashoffset: 0; }
                    50%  { stroke-dasharray: 89,200; stroke-dashoffset: -35px; }
                    100% { stroke-dasharray: 89,200; stroke-dashoffset: -124px; }
                  }
                  @keyframes gColor {
                    0%,100% { stroke: #EA4335; }
                    25%     { stroke: #4285F4; }
                    50%     { stroke: #34A853; }
                    75%     { stroke: #FBBC05; }
                  }
                  .g-spin { animation: gRotate 2s linear infinite; transform-origin: center center; }
                  .g-path { stroke-dasharray: 1,200; stroke-dashoffset: 0; stroke-linecap: round; animation: gDash 1.5s ease-in-out infinite, gColor 4s ease-in-out infinite; }
                `}</style>
                <div style={{ width: 56, height: 56, position: 'relative' }}>
                  <svg className="g-spin" viewBox="25 25 50 50" style={{ width: 56, height: 56, position: 'absolute', top: 0, left: 0 }}>
                    <circle className="g-path" cx="50" cy="50" r="20" fill="none" strokeWidth="3" strokeMiterlimit="10" />
                  </svg>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 15, color: G.dark, fontWeight: 400 }}>TZMICHA Mail</span>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {[G.blue, G.red, G.yellow, G.green].map((c, i) => (
                      <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: c, animation: `gDotPulse 1.2s ease-in-out ${i * 0.15}s infinite alternate` }} />
                    ))}
                  </div>
                </div>
                <style>{`@keyframes gDotPulse { from { opacity: 0.3; transform: scale(0.8); } to { opacity: 1; transform: scale(1.2); } }`}</style>
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '100px 20px', textAlign: 'center' }}>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 20 }}>
                  {[G.blue, G.red, G.yellow, G.green].map((c, i) => <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: c }} />)}
                </div>
                <p style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 400, color: G.dark }}>Your inbox is empty</p>
                <p style={{ margin: '0 0 24px', fontSize: 14, color: G.gray }}>Sync to fetch emails or compose a new one</p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                  <button onClick={() => void sync()} disabled={syncing}
                    style={{ padding: '10px 24px', borderRadius: 20, border: `1px solid ${G.border}`, background: G.white, fontSize: 14, color: G.mid, cursor: 'pointer', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <RefreshCw size={14} color={G.blue} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} /> Sync Inbox
                  </button>
                  <button onClick={() => { setReplyData(null); setShowCompose(true); }}
                    style={{ padding: '10px 24px', borderRadius: 20, border: 'none', background: G.blue, color: 'white', fontSize: 14, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={14} /> Compose
                  </button>
                </div>
              </div>
            ) : filtered.map(conv => {
              const name = conv.contact?.name ?? conv.contact?.email ?? 'Unknown';
              const isUnread = conv.unread_count > 0;
              const isStarred = false;
              const col = aColor(name);
              return (
                <div key={conv.id} onClick={() => setActive(conv)}
                  style={{ padding: '0 16px', borderBottom: `1px solid ${G.border}`, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', background: isUnread ? G.white : '#F2F6FC', height: 52, transition: 'background 100ms' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#EAF1FB'}
                  onMouseLeave={e => e.currentTarget.style.background = isUnread ? G.white : '#F2F6FC'}>
                  {/* Avatar */}
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: col, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 14, fontWeight: 500, flexShrink: 0 }}>
                    {name[0]?.toUpperCase()}
                  </div>
                  {/* Star */}
                  <button onClick={e => { e.stopPropagation(); void handleStar(conv.id, !!(conv as unknown as Record<string,unknown>)._starred); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: G.border, padding: 2, flexShrink: 0, transition: 'color 150ms' }}>
                    <Star size={16} fill={'none'} />
                  </button>
                  {/* Sender */}
                  <div style={{ width: 160, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14, fontWeight: isUnread ? 700 : 400, color: G.dark }}>
                    {name}
                  </div>
                  {/* Subject + preview */}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                    <span style={{ fontSize: 14, fontWeight: isUnread ? 700 : 400, color: G.dark, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 300 }}>
                      {conv.last_message_text ?? '(no subject)'}
                    </span>
                    <span style={{ fontSize: 13, color: G.gray, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      — {conv.contact?.email ?? ''}
                    </span>
                  </div>
                  {/* Quick actions */}
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    {(activeFolder === 'Trash' || activeFolder === 'Archive')
                      ? <IconBtn icon={<CheckCheck size={15} />} title="Restore to Inbox" color={G.green} onClick={() => void handleRestore(conv.id)} />
                      : <>
                          <IconBtn icon={<Archive size={15} />} title="Archive" color={G.yellow} onClick={() => void handleArchive(conv.id)} />
                          <IconBtn icon={<Trash2 size={15} />} title="Delete" color={G.red} onClick={() => void handleDelete(conv.id)} />
                        </>}
                  </div>
                  {/* Time */}
                  <div style={{ fontSize: 12, color: isUnread ? G.dark : G.gray, flexShrink: 0, fontWeight: isUnread ? 700 : 400, minWidth: 48, textAlign: 'right' }}>
                    {fmt(conv.last_message_at)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
