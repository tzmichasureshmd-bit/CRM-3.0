'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, RefreshCw, Shield, User, Bot, Zap } from 'lucide-react';
import { v3fetch } from '@/lib/auth-client';

interface AuditLog {
  id: string; actor_type: string; actor_name: string;
  action: string; entity_type: string; entity_id: string;
  result: string; metadata: Record<string,unknown>; created_at: string;
}

const ACTOR_ICONS: Record<string,React.ReactNode> = {
  user: <User size={12}/>, system: <Zap size={12}/>,
  integration: <Shield size={12}/>, ai_agent: <Bot size={12}/>,
};
const RESULT_COLOR: Record<string,string> = {
  success:'#28c99a', failure:'#f46b72', denied:'#f4c95d'
};

export default function AuditPage() {
  const [logs, setLogs]       = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('');

  const load = () => {
    setLoading(true);
    const url = filter ? `/api/v3/audit-logs?action=${encodeURIComponent(filter)}` : '/api/v3/audit-logs';
    v3fetch(url).then(r => r.ok ? r.json() : [])
      .then(setLogs).catch(() => setLogs([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter]);

  const fmt = (ts: string) => new Date(ts).toLocaleString();

  return (
    <div style={{ maxWidth:900, display:'flex', flexDirection:'column', gap:20 }}>
      <Link href="/settings/company" style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, color:'var(--crm-text-muted)', textDecoration:'none' }}>
        <ChevronLeft size={14}/> Team Members
      </Link>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:750, color:'var(--crm-text)', margin:0 }}>Audit Logs</h1>
          <p style={{ margin:'4px 0 0', fontSize:13, color:'var(--crm-text-muted)' }}>Track all actions by employees, system, and AI agents</p>
        </div>
        <button onClick={load} style={{ background:'none', border:'1px solid rgba(130,145,190,0.2)', borderRadius:9, padding:'7px 12px', cursor:'pointer', color:'var(--crm-text-muted)', display:'flex', alignItems:'center', gap:6, fontSize:12 }}>
          <RefreshCw size={12}/> Refresh
        </button>
      </div>

      {/* Filter */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        {['','employee.created','employee.updated','employee.deleted','invitation.sent','invitation.revoked'].map(a => (
          <button key={a} onClick={() => setFilter(a)}
            style={{ padding:'5px 12px', borderRadius:8, border:`1px solid ${filter===a ? '#4f6df5' : 'rgba(130,145,190,0.2)'}`, background: filter===a ? 'rgba(79,109,245,0.10)' : 'transparent', color: filter===a ? '#4f6df5' : 'var(--crm-text-muted)', fontSize:11, fontWeight:600, cursor:'pointer' }}>
            {a || 'All'}
          </button>
        ))}
      </div>

      <div className="crm-glass" style={{ overflow:'hidden' }}>
        {loading ? (
          <div style={{ padding:32, textAlign:'center', color:'var(--crm-text-muted)', fontSize:13 }}>Loading…</div>
        ) : logs.length === 0 ? (
          <div style={{ padding:40, textAlign:'center', color:'var(--crm-text-muted)', fontSize:13 }}>No audit events yet.</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid rgba(130,145,190,0.10)' }}>
                {['Actor','Action','Entity','Result','Time'].map(h => (
                  <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--crm-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr key={log.id} style={{ borderBottom: i < logs.length-1 ? '1px solid rgba(130,145,190,0.07)' : 'none' }}>
                  <td style={{ padding:'10px 16px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--crm-text)' }}>
                      <span style={{ color:'var(--crm-text-muted)' }}>{ACTOR_ICONS[log.actor_type]}</span>
                      {log.actor_name || log.actor_type}
                    </div>
                  </td>
                  <td style={{ padding:'10px 16px', fontSize:12, color:'var(--crm-text)', fontFamily:'monospace' }}>{log.action}</td>
                  <td style={{ padding:'10px 16px', fontSize:11, color:'var(--crm-text-muted)' }}>
                    {log.entity_type && <span style={{ padding:'2px 7px', borderRadius:5, background:'rgba(130,145,190,0.10)' }}>{log.entity_type}</span>}
                  </td>
                  <td style={{ padding:'10px 16px' }}>
                    <span style={{ padding:'2px 8px', borderRadius:6, fontSize:11, fontWeight:700, background:`${RESULT_COLOR[log.result] || '#8790aa'}15`, color: RESULT_COLOR[log.result] || '#8790aa' }}>
                      {log.result}
                    </span>
                  </td>
                  <td style={{ padding:'10px 16px', fontSize:11, color:'var(--crm-text-muted)', whiteSpace:'nowrap' }}>{fmt(log.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
