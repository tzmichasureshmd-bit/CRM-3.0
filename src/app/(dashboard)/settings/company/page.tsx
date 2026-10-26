'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, Plus, Trash2, Edit2, Check, X, Users, Shield, Mail, RefreshCw } from 'lucide-react';
import { v3fetch } from '@/lib/auth-client';

const ROLES = ['admin','manager','sales','support','marketing','agent'] as const;
const CHANNELS = ['whatsapp','instagram','facebook','email','telegram'] as const;
const CHANNEL_ICONS: Record<string,string> = {
  whatsapp:'💬', instagram:'📸', facebook:'📘', email:'✉️', telegram:'✈️'
};
const ROLE_COLORS: Record<string,string> = {
  owner:'#f4c95d', admin:'#f46b72', manager:'#8b5cf6',
  sales:'#28c99a', support:'#4f6df5', marketing:'#e1306c', agent:'#8790aa'
};

interface Employee {
  id: string; name: string; email: string; role: string;
  channel_permissions: Record<string,boolean>;
  can_view_conversations: boolean; can_reply_messages: boolean;
  can_manage_contacts: boolean; can_assign_conversations: boolean;
  can_access_reports: boolean; can_manage_integrations: boolean;
  can_invite_employees: boolean; is_active: boolean;
  joined_at: string | null; invited_at: string;
}

const DEFAULT_FORM = {
  name:'', email:'', role:'agent',
  channel_permissions: { whatsapp:true, instagram:true, facebook:true, email:true, telegram:true },
  can_view_conversations:true, can_reply_messages:true,
  can_manage_contacts:false, can_assign_conversations:false,
  can_access_reports:false, can_manage_integrations:false, can_invite_employees:false,
};

export default function CompanyPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showAdd, setShowAdd]     = useState(false);
  const [form, setForm]           = useState(DEFAULT_FORM);
  const [saving, setSaving]       = useState(false);
  const [editId, setEditId]       = useState<string|null>(null);
  const [editRole, setEditRole]   = useState('');

  const load = () => {
    setLoading(true);
    v3fetch('/api/v3/employees').then(r => r.ok ? r.json() : [])
      .then(d => setEmployees(d)).catch(() => setEmployees([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    setSaving(true);
    try {
      const r = await v3fetch('/api/v3/employees', { method:'POST', body: JSON.stringify(form) });
      if (r.ok) { setShowAdd(false); setForm(DEFAULT_FORM); load(); }
    } finally { setSaving(false); }
  };

  const handleRoleChange = async (id: string, role: string) => {
    await v3fetch(`/api/v3/employees/${id}`, { method:'PATCH', body: JSON.stringify({ role }) });
    setEditId(null); load();
  };

  const handleToggleActive = async (emp: Employee) => {
    await v3fetch(`/api/v3/employees/${emp.id}`, {
      method:'PATCH', body: JSON.stringify({ is_active: !emp.is_active })
    });
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this employee?')) return;
    await v3fetch(`/api/v3/employees/${id}`, { method:'DELETE' });
    load();
  };

  const toggleChannel = (ch: string) =>
    setForm(f => ({ ...f, channel_permissions: { ...f.channel_permissions, [ch]: !f.channel_permissions[ch as keyof typeof f.channel_permissions] } }));

  return (
    <div style={{ maxWidth: 860, display:'flex', flexDirection:'column', gap:20 }}>
      <Link href="/settings" style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, color:'var(--crm-text-muted)', textDecoration:'none' }}>
        <ChevronLeft size={14}/> Settings
      </Link>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:750, color:'var(--crm-text)', margin:0 }}>Team Members</h1>
          <p style={{ margin:'4px 0 0', fontSize:13, color:'var(--crm-text-muted)' }}>
            Manage employees, roles & channel permissions
          </p>
        </div>
        <button onClick={() => setShowAdd(true)}
          style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 18px', borderRadius:10, background:'#4f6df5', border:'none', color:'white', fontSize:13, fontWeight:700, cursor:'pointer' }}>
          <Plus size={15}/> Add Employee
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
        {[
          { label:'Total Employees', value: employees.length, icon:<Users size={16}/>, color:'#4f6df5' },
          { label:'Active', value: employees.filter(e=>e.is_active).length, icon:<Check size={16}/>, color:'#28c99a' },
          { label:'Inactive', value: employees.filter(e=>!e.is_active).length, icon:<X size={16}/>, color:'#f46b72' },
        ].map(s => (
          <div key={s.label} className="crm-glass" style={{ padding:'16px 20px', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:`${s.color}15`, display:'flex', alignItems:'center', justifyContent:'center', color:s.color }}>{s.icon}</div>
            <div>
              <div style={{ fontSize:20, fontWeight:750, color:'var(--crm-text)' }}>{s.value}</div>
              <div style={{ fontSize:11, color:'var(--crm-text-muted)' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Employee table */}
      <div className="crm-glass" style={{ overflow:'hidden' }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid rgba(130,145,190,0.10)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:13, fontWeight:700, color:'var(--crm-text)' }}>Employees</span>
          <button onClick={load} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--crm-text-muted)' }}><RefreshCw size={13}/></button>
        </div>
        {loading ? (
          <div style={{ padding:32, textAlign:'center', color:'var(--crm-text-muted)', fontSize:13 }}>Loading…</div>
        ) : employees.length === 0 ? (
          <div style={{ padding:40, textAlign:'center', color:'var(--crm-text-muted)', fontSize:13 }}>
            No employees yet. Click <strong>Add Employee</strong> to get started.
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid rgba(130,145,190,0.10)' }}>
                {['Name','Role','Channel Access','Status','Actions'].map(h => (
                  <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--crm-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map((emp, i) => (
                <tr key={emp.id} style={{ borderBottom: i < employees.length-1 ? '1px solid rgba(130,145,190,0.07)' : 'none' }}>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:34, height:34, borderRadius:'50%', background:`${ROLE_COLORS[emp.role] || '#8790aa'}20`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color: ROLE_COLORS[emp.role] || '#8790aa' }}>
                        {emp.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600, color:'var(--crm-text)' }}>{emp.name}</div>
                        <div style={{ fontSize:11, color:'var(--crm-text-muted)' }}>{emp.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    {editId === emp.id ? (
                      <div style={{ display:'flex', gap:6 }}>
                        <select value={editRole} onChange={e => setEditRole(e.target.value)}
                          style={{ padding:'4px 8px', borderRadius:7, border:'1px solid rgba(130,145,190,0.25)', background:'var(--crm-bg)', color:'var(--crm-text)', fontSize:12 }}>
                          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <button onClick={() => handleRoleChange(emp.id, editRole)} style={{ background:'#28c99a', border:'none', borderRadius:6, padding:'4px 8px', cursor:'pointer', color:'white', fontSize:11 }}>✓</button>
                        <button onClick={() => setEditId(null)} style={{ background:'rgba(244,107,114,0.15)', border:'none', borderRadius:6, padding:'4px 8px', cursor:'pointer', color:'#f46b72', fontSize:11 }}>✕</button>
                      </div>
                    ) : (
                      <span style={{ padding:'3px 10px', borderRadius:6, background:`${ROLE_COLORS[emp.role] || '#8790aa'}15`, color: ROLE_COLORS[emp.role] || '#8790aa', fontSize:11, fontWeight:700, textTransform:'capitalize' }}>
                        {emp.role}
                      </span>
                    )}
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ display:'flex', gap:4 }}>
                      {CHANNELS.map(ch => (
                        <span key={ch} title={ch} style={{ fontSize:14, opacity: emp.channel_permissions?.[ch] ? 1 : 0.25 }}>
                          {CHANNEL_ICONS[ch]}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <span style={{ padding:'3px 10px', borderRadius:6, fontSize:11, fontWeight:700, background: emp.is_active ? 'rgba(40,201,154,0.12)' : 'rgba(135,144,170,0.12)', color: emp.is_active ? '#28c99a' : '#8790aa' }}>
                      {emp.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ display:'flex', gap:6 }}>
                      <button onClick={() => { setEditId(emp.id); setEditRole(emp.role); }}
                        style={{ background:'rgba(79,109,245,0.10)', border:'none', borderRadius:7, padding:'5px 8px', cursor:'pointer', color:'#4f6df5' }}>
                        <Edit2 size={12}/>
                      </button>
                      <button onClick={() => handleToggleActive(emp)}
                        style={{ background: emp.is_active ? 'rgba(244,201,93,0.12)' : 'rgba(40,201,154,0.12)', border:'none', borderRadius:7, padding:'5px 8px', cursor:'pointer', color: emp.is_active ? '#f4c95d' : '#28c99a' }}>
                        {emp.is_active ? <X size={12}/> : <Check size={12}/>}
                      </button>
                      <button onClick={() => handleDelete(emp.id)}
                        style={{ background:'rgba(244,107,114,0.10)', border:'none', borderRadius:7, padding:'5px 8px', cursor:'pointer', color:'#f46b72' }}>
                        <Trash2 size={12}/>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Audit log link */}
      <Link href="/settings/audit" style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 16px', borderRadius:12, background:'rgba(79,109,245,0.06)', border:'1px solid rgba(79,109,245,0.15)', textDecoration:'none', color:'#4f6df5', fontSize:13, fontWeight:600 }}>
        <Shield size={14}/> View Audit Logs →
      </Link>

      {/* Add Employee Modal */}
      {showAdd && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div className="crm-glass" style={{ width:'100%', maxWidth:520, maxHeight:'90vh', overflowY:'auto', borderRadius:18, padding:28 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
              <h2 style={{ margin:0, fontSize:18, fontWeight:750, color:'var(--crm-text)' }}>Add Employee</h2>
              <button onClick={() => setShowAdd(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--crm-text-muted)' }}><X size={18}/></button>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {/* Name + Email */}
              {[{key:'name',label:'Full Name',ph:'Ramesh Kumar'},{key:'email',label:'Email',ph:'ramesh@company.com'}].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize:11, fontWeight:700, color:'var(--crm-text-muted)', display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.06em' }}>{f.label}</label>
                  <input value={(form as any)[f.key]} onChange={e => setForm(p => ({...p, [f.key]: e.target.value}))}
                    placeholder={f.ph}
                    style={{ width:'100%', padding:'9px 12px', borderRadius:9, border:'1px solid rgba(130,145,190,0.20)', background:'rgba(255,255,255,0.05)', color:'var(--crm-text)', fontSize:13, boxSizing:'border-box' }}/>
                </div>
              ))}

              {/* Role */}
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'var(--crm-text-muted)', display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.06em' }}>Role</label>
                <select value={form.role} onChange={e => setForm(p => ({...p, role: e.target.value}))}
                  style={{ width:'100%', padding:'9px 12px', borderRadius:9, border:'1px solid rgba(130,145,190,0.20)', background:'var(--crm-bg)', color:'var(--crm-text)', fontSize:13 }}>
                  {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
                </select>
              </div>

              {/* Channel Permissions */}
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'var(--crm-text-muted)', display:'block', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.06em' }}>Channel Access</label>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {CHANNELS.map(ch => (
                    <button key={ch} onClick={() => toggleChannel(ch)}
                      style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:8, border:`1px solid ${form.channel_permissions[ch as keyof typeof form.channel_permissions] ? 'rgba(79,109,245,0.4)' : 'rgba(130,145,190,0.2)'}`, background: form.channel_permissions[ch as keyof typeof form.channel_permissions] ? 'rgba(79,109,245,0.10)' : 'transparent', cursor:'pointer', fontSize:12, fontWeight:600, color: form.channel_permissions[ch as keyof typeof form.channel_permissions] ? '#4f6df5' : 'var(--crm-text-muted)' }}>
                      {CHANNEL_ICONS[ch]} {ch}
                    </button>
                  ))}
                </div>
              </div>

              {/* Permission checkboxes */}
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'var(--crm-text-muted)', display:'block', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.06em' }}>Permissions</label>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  {[
                    {key:'can_view_conversations', label:'View Conversations'},
                    {key:'can_reply_messages', label:'Reply to Messages'},
                    {key:'can_manage_contacts', label:'Manage Contacts'},
                    {key:'can_assign_conversations', label:'Assign Conversations'},
                    {key:'can_access_reports', label:'Access Reports'},
                    {key:'can_manage_integrations', label:'Manage Integrations'},
                    {key:'can_invite_employees', label:'Invite Employees'},
                  ].map(p => (
                    <label key={p.key} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:12, color:'var(--crm-text)' }}>
                      <input type="checkbox" checked={(form as any)[p.key]}
                        onChange={e => setForm(f => ({...f, [p.key]: e.target.checked}))}
                        style={{ accentColor:'#4f6df5' }}/>
                      {p.label}
                    </label>
                  ))}
                </div>
              </div>

              <button onClick={handleAdd} disabled={saving || !form.name || !form.email}
                style={{ padding:'11px', borderRadius:10, background:'#4f6df5', border:'none', color:'white', fontSize:14, fontWeight:700, cursor:'pointer', opacity: saving || !form.name || !form.email ? 0.6 : 1, marginTop:4 }}>
                {saving ? 'Adding…' : 'Add Employee'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
