'use client';
import { useEffect, useState } from 'react';
import { RefreshCw, User, Zap, Bot, Shield } from 'lucide-react';

interface AuditLog {
  id: string; account_id: string | null; actor_type: string; actor_id: string;
  actor_name: string; action: string; entity_type: string; entity_id: string;
  result: string; metadata: Record<string,unknown>; created_at: string;
}

const ACTOR_ICONS: Record<string,React.ReactNode> = {
  user: <User size={11}/>, system: <Zap size={11}/>,
  integration: <Shield size={11}/>, ai_agent: <Bot size={11}/>,
};
const RESULT_COLOR: Record<string,string> = { success:'#28c99a', failure:'#f46b72', denied:'#f4c95d' };

export default function SuperAdminAuditLogs() {
  const [logs, setLogs]           = useState<AuditLog[]>([]);
  const [loading, setLoading]     = useState(true);
  const [companyId, setCompanyId] = useState('');
  const [action, setAction]       = useState('');
  const [result, setResult]       = useState('');

  const token = () => localStorage.getItem('crm_token') ?? '';

  const load = () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (companyId) qs.set('company_id', companyId);
    if (action)    qs.set('action', action);
    if (result)    qs.set('result', result);
    qs.set('limit', '100');
    fetch(`/api/v3/super-admin/audit-logs?${qs}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.ok ? r.json() as Promise<AuditLog[]> : [])
      .then(setLogs).catch(() => setLogs([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [companyId, action, result]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'white' }}>Platform Audit Logs</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#8790aa' }}>All actions across all companies and platform operations</p>
        </div>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: '#8790aa', fontSize: 12, cursor: 'pointer' }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input value={companyId} onChange={e => setCompanyId(e.target.value)} placeholder="Filter by Company ID…"
          style={{ padding: '8px 14px', borderRadius: 10, background: '#111520', border: '1px solid rgba(255,255,255,0.08)', color: 'white', fontSize: 12, fontFamily: 'monospace', flex: 1, minWidth: 200 }} />
        <input value={action} onChange={e => setAction(e.target.value)} placeholder="Filter by action…"
          style={{ padding: '8px 14px', borderRadius: 10, background: '#111520', border: '1px solid rgba(255,255,255,0.08)', color: 'white', fontSize: 12, flex: 1, minWidth: 160 }} />
        <select value={result} onChange={e => setResult(e.target.value)}
          style={{ padding: '8px 14px', borderRadius: 10, background: '#111520', border: '1px solid rgba(255,255,255,0.08)', color: '#8790aa', fontSize: 12 }}>
          <option value="">All Results</option>
          <option value="success">Success</option>
          <option value="failure">Failure</option>
          <option value="denied">Denied</option>
        </select>
      </div>

      <div style={{ background: '#111520', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#8790aa', fontSize: 13 }}>Loading…</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#8790aa', fontSize: 13 }}>No audit events found.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  {['Actor','Action','Company','Entity','Result','Time'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#8790aa', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr key={log.id} style={{ borderBottom: i < logs.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'white' }}>
                        <span style={{ color: '#8790aa' }}>{ACTOR_ICONS[log.actor_type]}</span>
                        {log.actor_name || log.actor_type}
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 11, color: '#4f6df5', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{log.action}</td>
                    <td style={{ padding: '10px 14px', fontSize: 11, color: '#8790aa', fontFamily: 'monospace' }}>
                      {log.account_id ? `${log.account_id.slice(0, 8)}…` : <span style={{ color: '#f46b72' }}>platform</span>}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 11, color: '#8790aa' }}>
                      {log.entity_type && <span style={{ padding: '2px 7px', borderRadius: 5, background: 'rgba(130,145,190,0.10)' }}>{log.entity_type}</span>}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: `${RESULT_COLOR[log.result] || '#8790aa'}15`, color: RESULT_COLOR[log.result] || '#8790aa' }}>
                        {log.result}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 11, color: '#8790aa', whiteSpace: 'nowrap' }}>{new Date(log.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
