'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, Mail, Copy, Check, X, RefreshCw, Send } from 'lucide-react';
import { v3fetch } from '@/lib/auth-client';

const ROLES = ['admin','manager','sales','support','marketing','agent'];

interface Invitation {
  id: string; email: string; role: string;
  status: string; expires_at: string; created_at: string;
}

const STATUS_COLOR: Record<string,string> = {
  pending:'#f4c95d', accepted:'#28c99a', revoked:'#f46b72', expired:'#8790aa'
};

export default function InvitePage() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading]         = useState(true);
  const [email, setEmail]             = useState('');
  const [role, setRole]               = useState('agent');
  const [sending, setSending]         = useState(false);
  const [inviteLink, setInviteLink]   = useState('');
  const [copied, setCopied]           = useState(false);

  const load = () => {
    setLoading(true);
    v3fetch('/api/v3/employees/invitations').then(r => r.ok ? r.json() : [])
      .then(setInvitations).catch(() => setInvitations([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleInvite = async () => {
    if (!email.trim()) return;
    setSending(true);
    try {
      const r = await v3fetch('/api/v3/employees/invite', {
        method: 'POST', body: JSON.stringify({ email: email.trim(), role })
      });
      if (r.ok) {
        const d = await r.json() as { token?: string; email?: string };
        if (d.token) {
          const link = `${window.location.origin}/invite?token=${d.token}`;
          setInviteLink(link);
        }
        setEmail(''); load();
      }
    } finally { setSending(false); }
  };

  const handleRevoke = async (id: string) => {
    await v3fetch(`/api/v3/employees/invitations/${id}`, { method: 'DELETE' });
    load();
  };

  const copyLink = () => {
    void navigator.clipboard.writeText(inviteLink);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ maxWidth:700, display:'flex', flexDirection:'column', gap:20 }}>
      <Link href="/settings/company" style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, color:'var(--crm-text-muted)', textDecoration:'none' }}>
        <ChevronLeft size={14}/> Team Members
      </Link>

      <div>
        <h1 style={{ fontSize:22, fontWeight:750, color:'var(--crm-text)', margin:0 }}>Invite Employee</h1>
        <p style={{ margin:'4px 0 0', fontSize:13, color:'var(--crm-text-muted)' }}>Send an invitation link to add a team member</p>
      </div>

      {/* Send invite form */}
      <div className="crm-glass" style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:14 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:10, alignItems:'flex-end' }}>
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:'var(--crm-text-muted)', display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.06em' }}>Email Address</label>
            <input value={email} onChange={e => setEmail(e.target.value)}
              placeholder="employee@company.com"
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

        {/* Invite link result */}
        {inviteLink && (
          <div style={{ padding:'12px 14px', borderRadius:10, background:'rgba(40,201,154,0.08)', border:'1px solid rgba(40,201,154,0.25)' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#28c99a', marginBottom:6 }}>✓ Invitation created — share this link:</div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <code style={{ flex:1, fontSize:11, color:'var(--crm-text)', wordBreak:'break-all' }}>{inviteLink}</code>
              <button onClick={copyLink} style={{ background:'none', border:'none', cursor:'pointer', color: copied ? '#28c99a' : 'var(--crm-text-muted)', flexShrink:0 }}>
                {copied ? <Check size={14}/> : <Copy size={14}/>}
              </button>
            </div>
            <div style={{ fontSize:11, color:'var(--crm-text-muted)', marginTop:6 }}>Link expires in 7 days. Share via email or messaging.</div>
          </div>
        )}
      </div>

      {/* Pending invitations */}
      <div className="crm-glass" style={{ overflow:'hidden' }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid rgba(130,145,190,0.10)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:13, fontWeight:700, color:'var(--crm-text)' }}>Sent Invitations</span>
          <button onClick={load} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--crm-text-muted)' }}><RefreshCw size={13}/></button>
        </div>
        {loading ? (
          <div style={{ padding:24, textAlign:'center', color:'var(--crm-text-muted)', fontSize:13 }}>Loading…</div>
        ) : invitations.length === 0 ? (
          <div style={{ padding:32, textAlign:'center', color:'var(--crm-text-muted)', fontSize:13 }}>
            <Mail size={28} style={{ margin:'0 auto 8px', opacity:0.2, display:'block' }}/>
            No invitations sent yet.
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid rgba(130,145,190,0.10)' }}>
                {['Email','Role','Status','Expires','Action'].map(h => (
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
                  <td style={{ padding:'10px 16px', fontSize:11, color:'var(--crm-text-muted)' }}>{new Date(inv.expires_at).toLocaleDateString()}</td>
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
    </div>
  );
}
