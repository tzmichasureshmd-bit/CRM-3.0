'use client';
import Link from 'next/link';
import { ChevronLeft, Check, X } from 'lucide-react';

const ROLES = ['owner','admin','manager','sales','support','marketing','agent'] as const;

const PERMISSIONS: { group: string; items: { key: string; label: string; roles: string[] }[] }[] = [
  {
    group: 'Integrations',
    items: [
      { key: 'view_integration_status',    label: 'View integration status',     roles: ['owner','admin','manager','sales','support','marketing','agent'] },
      { key: 'connect_integrations',       label: 'Connect integrations',        roles: ['owner','admin'] },
      { key: 'disconnect_integrations',    label: 'Disconnect integrations',     roles: ['owner','admin'] },
      { key: 'manage_provider_config',     label: 'Manage provider config',      roles: ['owner','admin'] },
    ],
  },
  {
    group: 'Inbox & Conversations',
    items: [
      { key: 'view_assigned_convs',        label: 'View assigned conversations', roles: ['owner','admin','manager','sales','support','marketing','agent'] },
      { key: 'view_team_convs',            label: 'View team conversations',     roles: ['owner','admin','manager'] },
      { key: 'view_all_convs',             label: 'View all conversations',      roles: ['owner','admin'] },
      { key: 'reply_messages',             label: 'Reply to messages',           roles: ['owner','admin','manager','sales','support','marketing','agent'] },
      { key: 'send_attachments',           label: 'Send attachments',            roles: ['owner','admin','manager','sales','support'] },
      { key: 'assign_conversations',       label: 'Assign conversations',        roles: ['owner','admin','manager'] },
      { key: 'close_conversations',        label: 'Close/reopen conversations',  roles: ['owner','admin','manager','sales','support'] },
    ],
  },
  {
    group: 'CRM',
    items: [
      { key: 'view_leads',                 label: 'View leads',                  roles: ['owner','admin','manager','sales','marketing'] },
      { key: 'create_leads',               label: 'Create leads',                roles: ['owner','admin','manager','sales'] },
      { key: 'update_leads',               label: 'Update leads',                roles: ['owner','admin','manager','sales'] },
      { key: 'delete_leads',               label: 'Delete leads',                roles: ['owner','admin'] },
      { key: 'manage_contacts',            label: 'Manage contacts',             roles: ['owner','admin','manager','sales','support'] },
      { key: 'export_records',             label: 'Export records',              roles: ['owner','admin','manager'] },
    ],
  },
  {
    group: 'Marketing',
    items: [
      { key: 'create_campaigns',           label: 'Create campaigns',            roles: ['owner','admin','manager','marketing'] },
      { key: 'approve_campaigns',          label: 'Approve campaigns',           roles: ['owner','admin','manager'] },
      { key: 'send_broadcasts',            label: 'Send broadcasts',             roles: ['owner','admin','manager','marketing'] },
      { key: 'manage_segments',            label: 'Manage segments',             roles: ['owner','admin','manager','marketing'] },
      { key: 'view_campaign_reports',      label: 'View campaign reports',       roles: ['owner','admin','manager','marketing','sales'] },
    ],
  },
  {
    group: 'Administration',
    items: [
      { key: 'invite_employees',           label: 'Invite employees',            roles: ['owner','admin'] },
      { key: 'change_employee_roles',      label: 'Change employee roles',       roles: ['owner','admin'] },
      { key: 'manage_company_settings',    label: 'Manage company settings',     roles: ['owner','admin'] },
      { key: 'view_audit_logs',            label: 'View audit logs',             roles: ['owner','admin','manager'] },
      { key: 'manage_subscriptions',       label: 'Manage subscriptions',        roles: ['owner'] },
    ],
  },
];

const ROLE_COLORS: Record<string,string> = {
  owner:'#f4c95d', admin:'#f46b72', manager:'#8b5cf6',
  sales:'#28c99a', support:'#4f6df5', marketing:'#e1306c', agent:'#8790aa'
};

export default function RolesPage() {
  return (
    <div style={{ maxWidth: 960, display:'flex', flexDirection:'column', gap:20 }}>
      <Link href="/settings/company" style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, color:'var(--crm-text-muted)', textDecoration:'none' }}>
        <ChevronLeft size={14}/> Team Members
      </Link>

      <div>
        <h1 style={{ fontSize:22, fontWeight:750, color:'var(--crm-text)', margin:0 }}>Roles & Permissions</h1>
        <p style={{ margin:'4px 0 0', fontSize:13, color:'var(--crm-text-muted)' }}>
          Permission matrix — what each role can do across the CRM
        </p>
      </div>

      {/* Role legend */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        {ROLES.map(r => (
          <span key={r} style={{ padding:'4px 12px', borderRadius:8, fontSize:12, fontWeight:700, background:`${ROLE_COLORS[r]}15`, color:ROLE_COLORS[r], textTransform:'capitalize' }}>{r}</span>
        ))}
      </div>

      {PERMISSIONS.map(group => (
        <div key={group.group} className="crm-glass" style={{ overflow:'hidden' }}>
          <div style={{ padding:'12px 20px', borderBottom:'1px solid rgba(130,145,190,0.10)', fontSize:12, fontWeight:700, color:'var(--crm-text-muted)', textTransform:'uppercase', letterSpacing:'0.07em' }}>
            {group.group}
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid rgba(130,145,190,0.08)' }}>
                <th style={{ padding:'8px 20px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--crm-text-muted)', width:'35%' }}>Permission</th>
                {ROLES.map(r => (
                  <th key={r} style={{ padding:'8px 8px', textAlign:'center', fontSize:10, fontWeight:700, color:ROLE_COLORS[r], textTransform:'capitalize', width:`${65/ROLES.length}%` }}>{r}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.items.map((item, i) => (
                <tr key={item.key} style={{ borderBottom: i < group.items.length-1 ? '1px solid rgba(130,145,190,0.06)' : 'none' }}>
                  <td style={{ padding:'9px 20px', fontSize:13, color:'var(--crm-text)' }}>{item.label}</td>
                  {ROLES.map(r => (
                    <td key={r} style={{ padding:'9px 8px', textAlign:'center' }}>
                      {item.roles.includes(r)
                        ? <Check size={14} color="#28c99a" strokeWidth={2.5}/>
                        : <X size={12} color="rgba(130,145,190,0.3)" strokeWidth={2}/>
                      }
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
