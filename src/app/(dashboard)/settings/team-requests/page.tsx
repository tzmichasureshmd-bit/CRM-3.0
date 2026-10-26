'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, Mail, Send, X, Check, RefreshCw, Copy, Clock, Users } from 'lucide-react';
import { v3fetch } from '@/lib/auth-client';

const ROLES = ['admin','manager','sales','support','marketing','agent'];
const STATUS_COLOR: Record<string,string> = {
  pending:'#f4c95d', accepted:'#28c99a', revoked:'#f46b72', expired:'#8790aa',
  approved:'#28c99a', rejected:'#f46b72', cancelled:'#8790aa',
};

interface Invitation { id: string; email: string; role: string; status: string; expires_at: string; created_at: string; }
interface JoinRequest { id: string; requester_name: string; requester_email: string; message: string; status: string; created_at: string; account_id?: string; }

type Tab = 'sent' | 'received' | 'join';

export default function TeamRequestsPage() {
  const [tab, setTab]                   = useState<Tab>('sent');
  const [invitations, setInvitations]   = useState<Invitation[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [myRequests, setMyRequests]     = useState<JoinRequest[]>([]);
  const [loading, setLoading]           = useState(false);
  const [email, setEmail]               = useState('');
  const [role, setRole]                 = useState('agent');
  const [sending, setSending]           = useState(false);
  const [inviteLink, setInviteLink]     = useState('');
  const [copied, setCopied]             = useState(false);
  const [companyId, setCompanyId]       = useState('');
  const [joinMsg, setJoinMsg]           = useState('');
  const [joining, setJoining]           = useState(false);
  const [joinError, setJoinError]       = useState('');
  const [joinSuccess, setJoinSuccess]   = useState('');

  const loadSent = () => {
    setLoading(true);
    v3fetch('/api/v3/employees/invitations').then(r => r.ok ? r.json() : [])
      .then(setInvitations).catch(() => setInvitations([]))
      .finally(() => setLoading(false));
  };

  const loadJoin = () => {
    setLoading(true);
    Promise.all([
      v3fetch('/api/v3/join-requests').then(r => r.ok ? r.json() : []),
      v3fetch('/api/v3/join-requests?mine=1').then(r => r.ok ? r.json() : []),
    ]).then(([company, mine]) => { setJoinRequests(company); setMyRequests(mine); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (tab === 'sent' || tab === 'received') loadSent();
    if (tab === 'join') loadJoin();
  }, [tab]);

  const handleInvite = async () => {
    if (!email.trim()) return;
    setSending(true);
    try {
      const r = await v3fetch('/api/v3/employees/invite', { method:'POST', body: JSON.stringify({ email: email.trim(), role }) });
      if (r.ok) {
        const d = await r.json() as { token?: string };
        if (d.token) setInviteLink(`${window.location.origin}/invite?token=${d.token}`);
        setEmail(''); loadSent();
      }
    } finally { setSending(false); }
  };

  const handleRevoke = async (id: string) => {
    await v3fetch(`/api/v3/employees/invitations/${id}`, { method:'DELETE' });
    loadSent();
  };

  const handleJoinRequest = async () => {
    if (!companyId.trim()) return;
    setJoining(true); setJoinError(''); setJoinSuccess('');
    try {
      const r = await v3fetch('/api/v3/join-requests', { method:'POST', body: JSON.stringify({ company_id: companyId.trim(), message: joinMsg }) });
      const d = await r.json() as { detail?: string };
      if (r.ok) { setJoinSuccess('Request sent! The company admin will review it.'); setCompanyId(''); setJoinMsg(''); loadJoin(); }
      else setJoinError(d.detail ?? 'Failed to send request');
    } finally { setJoining(false); }
  };

  const handleJoinAction = async (id: string, status: 'approved' | 'rejected' | 'cancelled') => {
    await v3fetch(`/api/v3/join-requests/${id}`, { method:'PATCH', body: JSON.stringify({ status }) });
    loadJoin();
  };

  const fmt = (ts: string) => new Date(ts).toLocaleDateString();

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'sent', label: 'Sent Invitations', count: invitations.filter(i => i.status === 'pending').length },
    { id: 'received', label: 'Received Invitations' },
    { id: 'join', label: 'Join Requests', count: joinRequests.filter(r => r.status === 'pending').length },
  ];

  return (
    <div style={{ maxWidth: 860, display:'flex', flexDirection:'column', gap:20 }}>
      <Link href="/settings/team" style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, color:'var(--crm-text-muted)', textDecoration:'none' }}>
        <ChevronLeft size={14}/> Team Members
      </Link>

      <div>
        <h1 style={{ fontSize:22, fontWeight:750, color:'var(--crm-text)', margin:0 }}>Invitations & Requests</h1>
        <p style={{ margin:'4px 0 0', fontSize:13, color:'var(--crm-text-muted)' }}>Manage team invitations and company join requests</p>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, borderBottom:'1px solid rgba(130,145,190,0.15)', paddingBottom:0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'10px 16px', background:'none', border:'none', borderBottom: tab === t.id ? '2px solid #4f6df5' : '2px solid transparent', cursor:'pointer', fontSize:13, fontWeight: tab === t.id ? 700 : 500, color: tab === t.id ? '#4f6df5' : 'var(--crm-text-muted)', marginBottom:-1 }}>
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span style={{ padding:'1px 7px', borderRadius:10, background:'#4f6df5', color:'white', fontSize:10, fontWeight:700 }}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Sent Invitations ── */}
      {tab === 'sent' && (
        <>
          <div className="crm-glass" style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--crm-text)', marginBottom:4 }}>Send New Invitation</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:10, alignItems:'flex-end' }}>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'var(--crm-text-muted)', display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.06em' }}>Email Address</label>
                <input value={email} onChange={e => setEmail(e.target.value)} placeholder="employee@company.com"
                  onKeyDown={e => e.key === 'Enter' && void handleInvite()}
                  style={{ width:'100%', padding:'9px 12px', borderRadius:9, border:'1px solid rgba(130,145,190,0.20)', background:'rgba(255,255,255,0.05)', color:'var(--crm-text)', fontSize:13, boxSizing:'border-box' }}/>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'var(--crm-text-muted)', display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.06em' }}>Role</label>
                <select value={role} onChange={e => setRole(e.target.value)}
                  style={{ padding:'9px 12px', borderRadius:9, border:'1px solid rgba(130,145,190,0.20)', background:'var(--crm-bg)', color:'var(--crm-text)', fontSize:13 }}>
                  {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
                </select>
              </div>
              <button onClick={handleInvite} disabled={sending || !email.trim()}
                style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 18px', borderRadius:10, background:'#4f6df5', border:'none', color:'white', fontSize:13, fontWeight:700, cursor:'pointer', opacity: sending||!email.trim() ? 0.6 : 1, whiteSpace:'nowrap' }}>
                <Send size={14}/> {sending ? 'Sending…' : 'Send Invite'}
              </button>
            </div>
            {inviteLink && (
              <div style={{ padding:'12px 14px', borderRadius:10, background:'rgba(40,201,154,0.08)', border:'1px solid rgba(40,201,154,0.25)' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#28c99a', marginBottom:6 }}>✓ Invitation created — share this link:</div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <code style={{ flex:1, fontSize:11, color:'var(--crm-text)', wordBreak:'break-all' }}>{inviteLink}</code>
                  <button onClick={() => { void navigator.clipboard.writeText(inviteLink); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                    style={{ background:'none', border:'none', cursor:'pointer', color: copied ? '#28c99a' : 'var(--crm-text-muted)', flexShrink:0 }}>
                    {copied ? <Check size={14}/> : <Copy size={14}/>}
                  </button>
                </div>
                <div style={{ fontSize:11, color:'var(--crm-text-muted)', marginTop:6 }}>Link expires in 7 days.</div>
              </div>
            )}
          </div>

          <div className="crm-glass" style={{ overflow:'hidden' }}>
            <div style={{ padding:'12px 18px', borderBottom:'1px solid rgba(130,145,190,0.10)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:13, fontWeight:700, color:'var(--crm-text)' }}>Sent Invitations</span>
              <button onClick={loadSent} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--crm-text-muted)' }}><RefreshCw size={13}/></button>
            </div>
            {loading ? (
              <div style={{ padding:24, textAlign:'center', color:'var(--crm-text-muted)', fontSize:13 }}>Loading…</div>
            ) : invitations.length === 0 ? (
              <div style={{ padding:36, textAlign:'center', color:'var(--crm-text-muted)', fontSize:13 }}>
                <Mail size={28} style={{ margin:'0 auto 8px', opacity:0.2, display:'block' }}/> No invitations sent yet.
              </div>
            ) : (
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid rgba(130,145,190,0.10)' }}>
                    {['Email','Role','Status','Expires','Actions'].map(h => (
                      <th key={h} style={{ padding:'9px 16px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--crm-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((inv, i) => (
                    <tr key={inv.id} style={{ borderBottom: i < invitations.length-1 ? '1px solid rgba(130,145,190,0.07)' : 'none' }}>
                      <td style={{ padding:'10px 16px', fontSize:13, color:'var(--crm-text)' }}>{inv.email}</td>
                      <td style={{ padding:'10px 16px' }}>
                        <span style={{ padding:'2px 8px', borderRadius:6, fontSize:11, fontWeight:700, background:'rgba(79,109,245,0.10)', color:'#4f6df5', textTransform:'capitalize' }}>{inv.role}</span>
                      </td>
                      <td style={{ padding:'10px 16px' }}>
                        <span style={{ padding:'2px 8px', borderRadius:6, fontSize:11, fontWeight:700, background:`${STATUS_COLOR[inv.status]||'#8790aa'}15`, color:STATUS_COLOR[inv.status]||'#8790aa', textTransform:'capitalize' }}>{inv.status}</span>
                      </td>
                      <td style={{ padding:'10px 16px', fontSize:11, color:'var(--crm-text-muted)' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:4 }}><Clock size={11}/> {fmt(inv.expires_at)}</div>
                      </td>
                      <td style={{ padding:'10px 16px' }}>
                        {inv.status === 'pending' && (
                          <button onClick={() => handleRevoke(inv.id)}
                            style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 10px', borderRadius:7, background:'rgba(244,107,114,0.10)', border:'none', color:'#f46b72', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                            <X size={11}/> Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── Received Invitations ── */}
      {tab === 'received' && (
        <div className="crm-glass" style={{ overflow:'hidden' }}>
          <div style={{ padding:'16px 20px', borderBottom:'1px solid rgba(130,145,190,0.10)' }}>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--crm-text)' }}>Invitations Sent to You</div>
            <div style={{ fontSize:12, color:'var(--crm-text-muted)', marginTop:4 }}>
              To accept an invitation, open the invite link sent to your email. Invitation links are secure and expire after 7 days.
            </div>
          </div>
          <div style={{ padding:'32px 20px', textAlign:'center', color:'var(--crm-text-muted)', fontSize:13 }}>
            <Mail size={32} style={{ margin:'0 auto 12px', opacity:0.2, display:'block' }}/>
            <div style={{ fontWeight:600, marginBottom:6 }}>Check your email for invitation links</div>
            <div style={{ fontSize:12 }}>When a company admin invites you, you'll receive a secure link at your email address. Click the link to accept and join the workspace.</div>
          </div>
        </div>
      )}

      {/* ── Join Requests ── */}
      {tab === 'join' && (
        <>
          {/* Submit a join request */}
          <div className="crm-glass" style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--crm-text)' }}>Request to Join a Company</div>
            <div style={{ fontSize:12, color:'var(--crm-text-muted)' }}>Enter the Company ID provided by the company administrator.</div>
            {joinError && <div style={{ padding:'9px 12px', borderRadius:9, background:'rgba(244,107,114,0.08)', border:'1px solid rgba(244,107,114,0.25)', color:'#f46b72', fontSize:12 }}>{joinError}</div>}
            {joinSuccess && <div style={{ padding:'9px 12px', borderRadius:9, background:'rgba(40,201,154,0.08)', border:'1px solid rgba(40,201,154,0.25)', color:'#28c99a', fontSize:12 }}>{joinSuccess}</div>}
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:'var(--crm-text-muted)', display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.06em' }}>Company ID</label>
              <input value={companyId} onChange={e => setCompanyId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                style={{ width:'100%', padding:'9px 12px', borderRadius:9, border:'1px solid rgba(130,145,190,0.20)', background:'rgba(255,255,255,0.05)', color:'var(--crm-text)', fontSize:13, boxSizing:'border-box', fontFamily:'monospace' }}/>
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:'var(--crm-text-muted)', display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.06em' }}>Message (optional)</label>
              <textarea value={joinMsg} onChange={e => setJoinMsg(e.target.value)} rows={2} placeholder="Briefly explain why you'd like to join…"
                style={{ width:'100%', padding:'9px 12px', borderRadius:9, border:'1px solid rgba(130,145,190,0.20)', background:'rgba(255,255,255,0.05)', color:'var(--crm-text)', fontSize:13, boxSizing:'border-box', resize:'vertical' }}/>
            </div>
            <button onClick={handleJoinRequest} disabled={joining || !companyId.trim()}
              style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 18px', borderRadius:10, background:'#4f6df5', border:'none', color:'white', fontSize:13, fontWeight:700, cursor:'pointer', opacity: joining||!companyId.trim() ? 0.6 : 1, alignSelf:'flex-start' }}>
              <Send size={14}/> {joining ? 'Sending…' : 'Send Request'}
            </button>
          </div>

          {/* My submitted requests */}
          {myRequests.length > 0 && (
            <div className="crm-glass" style={{ overflow:'hidden' }}>
              <div style={{ padding:'12px 18px', borderBottom:'1px solid rgba(130,145,190,0.10)', fontSize:13, fontWeight:700, color:'var(--crm-text)' }}>My Requests</div>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid rgba(130,145,190,0.10)' }}>
                    {['Company ID','Message','Status','Date','Action'].map(h => (
                      <th key={h} style={{ padding:'9px 16px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--crm-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {myRequests.map((r, i) => (
                    <tr key={r.id} style={{ borderBottom: i < myRequests.length-1 ? '1px solid rgba(130,145,190,0.07)' : 'none' }}>
                      <td style={{ padding:'10px 16px', fontSize:11, color:'var(--crm-text)', fontFamily:'monospace' }}>{r.account_id?.slice(0,8)}…</td>
                      <td style={{ padding:'10px 16px', fontSize:12, color:'var(--crm-text-muted)' }}>{r.message || '—'}</td>
                      <td style={{ padding:'10px 16px' }}>
                        <span style={{ padding:'2px 8px', borderRadius:6, fontSize:11, fontWeight:700, background:`${STATUS_COLOR[r.status]||'#8790aa'}15`, color:STATUS_COLOR[r.status]||'#8790aa', textTransform:'capitalize' }}>{r.status}</span>
                      </td>
                      <td style={{ padding:'10px 16px', fontSize:11, color:'var(--crm-text-muted)' }}>{fmt(r.created_at)}</td>
                      <td style={{ padding:'10px 16px' }}>
                        {r.status === 'pending' && (
                          <button onClick={() => handleJoinAction(r.id, 'cancelled')}
                            style={{ padding:'4px 10px', borderRadius:7, background:'rgba(135,144,170,0.12)', border:'none', color:'#8790aa', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Incoming requests (admin view) */}
          <div className="crm-glass" style={{ overflow:'hidden' }}>
            <div style={{ padding:'12px 18px', borderBottom:'1px solid rgba(130,145,190,0.10)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:13, fontWeight:700, color:'var(--crm-text)' }}>Incoming Requests to Your Company</span>
              <button onClick={loadJoin} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--crm-text-muted)' }}><RefreshCw size={13}/></button>
            </div>
            {loading ? (
              <div style={{ padding:24, textAlign:'center', color:'var(--crm-text-muted)', fontSize:13 }}>Loading…</div>
            ) : joinRequests.length === 0 ? (
              <div style={{ padding:36, textAlign:'center', color:'var(--crm-text-muted)', fontSize:13 }}>
                <Users size={28} style={{ margin:'0 auto 8px', opacity:0.2, display:'block' }}/> No join requests yet.
              </div>
            ) : (
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid rgba(130,145,190,0.10)' }}>
                    {['Requester','Message','Status','Date','Actions'].map(h => (
                      <th key={h} style={{ padding:'9px 16px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--crm-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {joinRequests.map((r, i) => (
                    <tr key={r.id} style={{ borderBottom: i < joinRequests.length-1 ? '1px solid rgba(130,145,190,0.07)' : 'none' }}>
                      <td style={{ padding:'10px 16px' }}>
                        <div style={{ fontSize:13, fontWeight:600, color:'var(--crm-text)' }}>{r.requester_name || '—'}</div>
                        <div style={{ fontSize:11, color:'var(--crm-text-muted)' }}>{r.requester_email}</div>
                      </td>
                      <td style={{ padding:'10px 16px', fontSize:12, color:'var(--crm-text-muted)', maxWidth:200 }}>{r.message || '—'}</td>
                      <td style={{ padding:'10px 16px' }}>
                        <span style={{ padding:'2px 8px', borderRadius:6, fontSize:11, fontWeight:700, background:`${STATUS_COLOR[r.status]||'#8790aa'}15`, color:STATUS_COLOR[r.status]||'#8790aa', textTransform:'capitalize' }}>{r.status}</span>
                      </td>
                      <td style={{ padding:'10px 16px', fontSize:11, color:'var(--crm-text-muted)' }}>{fmt(r.created_at)}</td>
                      <td style={{ padding:'10px 16px' }}>
                        {r.status === 'pending' && (
                          <div style={{ display:'flex', gap:6 }}>
                            <button onClick={() => handleJoinAction(r.id, 'approved')}
                              style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 10px', borderRadius:7, background:'rgba(40,201,154,0.12)', border:'none', color:'#28c99a', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                              <Check size={11}/> Approve
                            </button>
                            <button onClick={() => handleJoinAction(r.id, 'rejected')}
                              style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 10px', borderRadius:7, background:'rgba(244,107,114,0.10)', border:'none', color:'#f46b72', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                              <X size={11}/> Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
