'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Search,
  Plus,
  Phone,
  Mail,
  Building2,
  X,
  Flame,
  Zap,
  CheckCircle2,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import {
  type ContactRecord,
  formatErrorSummary,
  formatSupabaseError,
  generateLocalId,
  mergeRecordsById,
  readLocalContacts,
  resolveTenantAccountId,
  updateLocalContact,
  upsertLocalContact,
} from '@/lib/crm-pipeline-store';

type Contact = ContactRecord;

interface CRMStage {
  id: string;
  name: string;
  color: string;
}

const CRM_STAGES: CRMStage[] = [
  { id: 'new', name: 'New Leads', color: '#4d7cff' },
  { id: 'contacted', name: 'Contacted', color: '#8b5cf6' },
  { id: 'qualified', name: 'Qualified', color: '#28c99a' },
  { id: 'proposal', name: 'Proposal', color: '#f4c95d' },
  { id: 'negotiation', name: 'Negotiation', color: '#f46b72' },
  { id: 'won', name: 'Won', color: '#10b981' },
  { id: 'lost', name: 'Lost', color: '#8790aa' },
];

const TIER_META: Record<string, { color: string; label: string; icon: string }> = {
  hot: { color: '#f46b72', label: 'Hot', icon: '🔥' },
  warm: { color: '#f4c95d', label: 'Warm', icon: '⚡' },
  cold: { color: '#8790aa', label: 'Cold', icon: '❄️' },
};

export function CrmTab() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedTier, setSelectedTier] = useState<'all' | 'hot' | 'warm' | 'cold'>('all');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  // Add Contact Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState<string>('new');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newTier, setNewTier] = useState<'hot' | 'warm' | 'cold'>('warm');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);

      if (error) {
        const info = formatSupabaseError(error);
        console.warn(`Error loading CRM contacts (${formatErrorSummary(info)})`, info);
        setContacts(readLocalContacts());
      } else {
        const remote = (data as Contact[]) ?? [];
        const local = readLocalContacts();
        setContacts(mergeRecordsById(remote, local));
      }
    } catch (err) {
      const info = formatSupabaseError(err);
      console.warn(`Error loading CRM contacts (${formatErrorSummary(info)})`, info);
      setContacts(readLocalContacts());
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredContacts = contacts.filter(c => {
    if (selectedTier !== 'all' && (c.lead_score_tier ?? 'cold') !== selectedTier) {
      return false;
    }
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (c.name ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.company ?? '').toLowerCase().includes(q) ||
      (c.tags ?? []).some(t => t.toLowerCase().includes(q))
    );
  });

  const contactsByStatus = (statusId: string) => {
    return filteredContacts.filter(c => {
      const current = c.lead_status || 'new';
      return current === statusId;
    });
  };

  const handleOpenAddModal = (statusId = 'new') => {
    setTargetStatus(statusId);
    setNewName('');
    setNewPhone('');
    setNewEmail('');
    setNewCompany('');
    setNewTier('warm');
    setFormError(null);
    setIsAddModalOpen(true);
  };

  const handleMoveStatus = async (contactId: string, newStatus: string) => {
    // Optimistic update
    setContacts(prev =>
      prev.map(c => (c.id === contactId ? { ...c, lead_status: newStatus } : c))
    );
    updateLocalContact(contactId, { lead_status: newStatus });
    if (selectedContact?.id === contactId) {
      setSelectedContact(prev => (prev ? { ...prev, lead_status: newStatus } : null));
    }

    try {
      const { error } = await supabase
        .from('contacts')
        .update({ lead_status: newStatus })
        .eq('id', contactId);
      if (error) {
        const info = formatSupabaseError(error);
        console.warn(`Lead status update notice (${formatErrorSummary(info)})`, info);
      }
    } catch (err) {
      const info = formatSupabaseError(err);
      console.warn(`Failed to update lead status (${formatErrorSummary(info)})`, info);
    }
  };

  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setBanner(null);

    const trimmedName = newName.trim();
    const trimmedPhone = newPhone.trim();
    const trimmedEmail = newEmail.trim();
    const trimmedCompany = newCompany.trim();

    if (!trimmedName && !trimmedPhone && !trimmedEmail) {
      setFormError('Please provide at least a name, phone number, or email address.');
      return;
    }

    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setFormError('Please enter a valid email address.');
      return;
    }

    const score = newTier === 'hot' ? 85 : newTier === 'warm' ? 60 : 25;
    const displayLabel = trimmedName || trimmedPhone || trimmedEmail || 'Lead';

    setSaving(true);
    try {
      const accountId = await resolveTenantAccountId(
        supabase,
        contacts.map(c => c.account_id)
      );

      const payload: Record<string, unknown> = {
        name: trimmedName || null,
        phone: trimmedPhone || null,
        email: trimmedEmail || null,
        company: trimmedCompany || null,
        lead_status: targetStatus,
        lead_score_tier: newTier,
        lead_score: score,
        source: 'manual',
      };
      if (accountId) {
        payload.account_id = accountId;
      }

      const { data, error } = await supabase
        .from('contacts')
        .insert(payload)
        .select('*')
        .single();

      if (error) {
        const info = formatSupabaseError(error);
        console.warn(`Failed to create contact in Supabase (${formatErrorSummary(info)}). Persisting locally.`, info);

        const localContact: Contact = {
          id: generateLocalId(),
          account_id: accountId,
          name: trimmedName || null,
          phone: trimmedPhone || null,
          email: trimmedEmail || null,
          company: trimmedCompany || null,
          source: 'manual',
          lead_status: targetStatus,
          lead_score: score,
          lead_score_tier: newTier,
          lead_score_reason: null,
          tags: null,
          created_at: new Date().toISOString(),
        };

        upsertLocalContact(localContact);
        setContacts(prev => [localContact, ...prev]);
        setIsAddModalOpen(false);
        setBanner({
          type: 'success',
          text: `Contact "${displayLabel}" created successfully.`,
        });
      } else if (data) {
        const created = data as Contact;
        upsertLocalContact(created);
        setContacts(prev => [created, ...prev.filter(c => c.id !== created.id)]);
        setIsAddModalOpen(false);
        setBanner({
          type: 'success',
          text: `Contact "${displayLabel}" created successfully.`,
        });
      }
    } catch (err) {
      const info = formatSupabaseError(err);
      console.warn(`Create contact exception (${formatErrorSummary(info)})`, info);
      setFormError(`Unable to create contact: ${info.message}`);
    } finally {
      setSaving(false);
    }
  };

  const totalCount = contacts.length;
  const hotCount = contacts.filter(c => c.lead_score_tier === 'hot').length;
  const warmCount = contacts.filter(c => c.lead_score_tier === 'warm').length;
  const wonCount = contacts.filter(c => c.lead_status === 'won').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {banner && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 12,
            background:
              banner.type === 'success'
                ? 'rgba(40,201,154,0.12)'
                : 'rgba(244,107,114,0.12)',
            border: `1px solid ${
              banner.type === 'success'
                ? 'rgba(40,201,154,0.30)'
                : 'rgba(244,107,114,0.30)'
            }`,
            color: banner.type === 'success' ? '#10b981' : '#f46b72',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {banner.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            {banner.text}
          </span>
          <button
            onClick={() => setBanner(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 2 }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* KPI Overview */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}
      >
        <div
          className="crm-glass"
          style={{
            padding: '12px 16px',
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'rgba(79,109,245,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#4f6df5',
            }}
          >
            <Users size={18} />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 750, color: 'var(--crm-text-strong)', lineHeight: 1 }}>
              {totalCount}
            </div>
            <div style={{ fontSize: 11, color: 'var(--crm-text-secondary)', marginTop: 2 }}>
              Total Leads
            </div>
          </div>
        </div>

        <div
          className="crm-glass"
          style={{
            padding: '12px 16px',
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'rgba(244,107,114,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#f46b72',
            }}
          >
            <Flame size={18} />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 750, color: '#f46b72', lineHeight: 1 }}>
              {hotCount}
            </div>
            <div style={{ fontSize: 11, color: 'var(--crm-text-secondary)', marginTop: 2 }}>
              Hot Leads
            </div>
          </div>
        </div>

        <div
          className="crm-glass"
          style={{
            padding: '12px 16px',
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'rgba(244,201,93,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#d97706',
            }}
          >
            <Zap size={18} />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 750, color: '#d97706', lineHeight: 1 }}>
              {warmCount}
            </div>
            <div style={{ fontSize: 11, color: 'var(--crm-text-secondary)', marginTop: 2 }}>
              Warm Leads
            </div>
          </div>
        </div>

        <div
          className="crm-glass"
          style={{
            padding: '12px 16px',
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'rgba(16,185,129,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10b981',
            }}
          >
            <CheckCircle2 size={18} />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 750, color: '#10b981', lineHeight: 1 }}>
              {wonCount}
            </div>
            <div style={{ fontSize: 11, color: 'var(--crm-text-secondary)', marginTop: 2 }}>
              Won Conversions
            </div>
          </div>
        </div>
      </div>

      {/* Action and Filter Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(255,255,255,0.60)',
              border: '1px solid rgba(130,145,190,0.22)',
              borderRadius: 12,
              padding: '7px 12px',
              minWidth: 260,
            }}
          >
            <Search size={14} color="var(--crm-text-muted)" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, phone, email, tags..."
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                outline: 'none',
                fontSize: 13,
                color: 'var(--crm-text)',
              }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <X size={13} color="var(--crm-text-muted)" />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 4 }}>
            {(['all', 'hot', 'warm', 'cold'] as const).map(tier => (
              <button
                key={tier}
                onClick={() => setSelectedTier(tier)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background:
                    selectedTier === tier
                      ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)'
                      : 'rgba(255,255,255,0.60)',
                  color: selectedTier === tier ? 'white' : 'var(--crm-text-secondary)',
                  transition: 'all 120ms ease',
                }}
              >
                {tier === 'all'
                  ? 'All'
                  : `${TIER_META[tier]?.icon ?? ''} ${TIER_META[tier]?.label ?? tier}`}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => handleOpenAddModal('new')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            borderRadius: 12,
            background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)',
            border: 'none',
            color: 'white',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(79,109,245,0.25)',
          }}
        >
          <Plus size={14} /> Add Lead
        </button>
      </div>

      {/* CRM Lead Board */}
      {loading ? (
        <div
          style={{
            minHeight: 320,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--crm-text-muted)',
            fontSize: 14,
          }}
        >
          Loading CRM lead board...
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            gap: 12,
            overflowX: 'auto',
            paddingBottom: 12,
            minHeight: 'calc(100vh - 280px)',
          }}
        >
          {CRM_STAGES.map(stage => {
            const stageLeads = contactsByStatus(stage.id);
            const color = stage.color;

            return (
              <div
                key={stage.id}
                style={{
                  minWidth: 260,
                  width: 260,
                  flexShrink: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  background: 'rgba(255,255,255,0.40)',
                  borderRadius: 14,
                  padding: 10,
                  border: '1px solid rgba(130,145,190,0.14)',
                }}
              >
                {/* Column Header */}
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: `${color}14`,
                    border: `1px solid ${color}26`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, color }}>{stage.name}</span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'white',
                      background: color,
                      borderRadius: 6,
                      padding: '1px 7px',
                    }}
                  >
                    {stageLeads.length}
                  </span>
                </div>

                {/* Column Leads List */}
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    overflowY: 'auto',
                  }}
                >
                  {stageLeads.map(lead => {
                    const tier = lead.lead_score_tier ?? 'cold';
                    const tierInfo = TIER_META[tier] ?? TIER_META.cold;

                    return (
                      <div
                        key={lead.id}
                        className="crm-glass-soft"
                        onClick={() => setSelectedContact(lead)}
                        style={{
                          padding: '12px 14px',
                          borderRadius: 10,
                          borderLeft: `3px solid ${color}`,
                          cursor: 'pointer',
                          transition: 'transform 120ms ease, box-shadow 120ms ease',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            marginBottom: 4,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: 'var(--crm-text-strong)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: 160,
                            }}
                          >
                            {lead.name || lead.phone || lead.email || 'Unnamed Lead'}
                          </div>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: tierInfo.color,
                              background: `${tierInfo.color}15`,
                              padding: '1px 6px',
                              borderRadius: 6,
                            }}
                          >
                            {tierInfo.icon} {lead.lead_score ?? 0}
                          </span>
                        </div>

                        {lead.company && (
                          <div
                            style={{
                              fontSize: 11,
                              color: 'var(--crm-text-secondary)',
                              marginBottom: 6,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Building2 size={11} color="var(--crm-text-muted)" />
                            {lead.company}
                          </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
                          {lead.phone && (
                            <div
                              style={{
                                fontSize: 11,
                                color: 'var(--crm-text-muted)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <Phone size={10} />
                              {lead.phone}
                            </div>
                          )}
                          {lead.email && (
                            <div
                              style={{
                                fontSize: 11,
                                color: 'var(--crm-text-muted)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <Mail size={10} />
                              {lead.email}
                            </div>
                          )}
                        </div>

                        {lead.tags && lead.tags.length > 0 && (
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 4,
                              marginBottom: 8,
                            }}
                          >
                            {lead.tags.slice(0, 3).map((t, idx) => (
                              <span
                                key={idx}
                                style={{
                                  fontSize: 9,
                                  fontWeight: 600,
                                  color: 'var(--crm-text-secondary)',
                                  background: 'rgba(130,145,190,0.12)',
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                }}
                              >
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Move stage selector */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            borderTop: '1px solid rgba(130,145,190,0.10)',
                            paddingTop: 6,
                            marginTop: 4,
                          }}
                          onClick={e => e.stopPropagation()}
                        >
                          <span style={{ fontSize: 10, color: 'var(--crm-text-muted)' }}>Status:</span>
                          <select
                            value={lead.lead_status ?? stage.id}
                            onChange={e => handleMoveStatus(lead.id, e.target.value)}
                            style={{
                              fontSize: 11,
                              padding: '2px 6px',
                              borderRadius: 6,
                              border: '1px solid rgba(130,145,190,0.20)',
                              background: 'white',
                              color: 'var(--crm-text-secondary)',
                              cursor: 'pointer',
                              outline: 'none',
                            }}
                          >
                            {CRM_STAGES.map(s => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}

                  <button
                    onClick={() => handleOpenAddModal(stage.id)}
                    style={{
                      padding: '8px',
                      borderRadius: 10,
                      border: `1px dashed ${color}50`,
                      background: 'none',
                      color: 'var(--crm-text-muted)',
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      transition: 'background 120ms',
                    }}
                  >
                    <Plus size={12} /> Add lead
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Lead Modal */}
      {isAddModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.40)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            className="crm-glass"
            style={{
              width: '100%',
              maxWidth: 440,
              borderRadius: 16,
              padding: 24,
              boxShadow: '0 20px 50px rgba(0,0,0,0.20)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 18,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--crm-text)' }}>
                Add New Lead to CRM
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateContact} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {formError && (
                <div
                  style={{
                    padding: '9px 12px',
                    borderRadius: 10,
                    background: 'rgba(244,107,114,0.12)',
                    border: '1px solid rgba(244,107,114,0.28)',
                    color: '#f46b72',
                    fontSize: 12,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <AlertCircle size={14} />
                  {formError}
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>
                  Full Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(130,145,190,0.25)',
                    background: 'white',
                    fontSize: 13,
                    color: 'var(--crm-text)',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>
                    Phone (WhatsApp)
                  </label>
                  <input
                    type="text"
                    placeholder="+91 98765 43210"
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(130,145,190,0.25)',
                      background: 'white',
                      fontSize: 13,
                      color: 'var(--crm-text)',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>
                    Email
                  </label>
                  <input
                    type="email"
                    placeholder="john@example.com"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(130,145,190,0.25)',
                      background: 'white',
                      fontSize: 13,
                      color: 'var(--crm-text)',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>
                  Company Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Acme Corp"
                  value={newCompany}
                  onChange={e => setNewCompany(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(130,145,190,0.25)',
                    background: 'white',
                    fontSize: 13,
                    color: 'var(--crm-text)',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>
                    Stage
                  </label>
                  <select
                    value={targetStatus}
                    onChange={e => setTargetStatus(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(130,145,190,0.25)',
                      background: 'white',
                      fontSize: 13,
                      color: 'var(--crm-text)',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  >
                    {CRM_STAGES.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>
                    Lead Priority / Tier
                  </label>
                  <select
                    value={newTier}
                    onChange={e => setNewTier(e.target.value as 'hot' | 'warm' | 'cold')}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(130,145,190,0.25)',
                      background: 'white',
                      fontSize: 13,
                      color: 'var(--crm-text)',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  >
                    <option value="hot">🔥 Hot</option>
                    <option value="warm">⚡ Warm</option>
                    <option value="cold">❄️ Cold</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 10,
                    border: '1px solid rgba(130,145,190,0.25)',
                    background: 'white',
                    color: 'var(--crm-text-secondary)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 10,
                    border: 'none',
                    background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)',
                    color: 'white',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? 'Adding...' : 'Add Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Selected Contact Detail Slide-out Drawer */}
      {selectedContact && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.30)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          onClick={() => setSelectedContact(null)}
        >
          <div
            className="crm-glass"
            style={{
              width: '100%',
              maxWidth: 380,
              height: '100%',
              background: 'rgba(255,255,255,0.95)',
              padding: 24,
              boxShadow: '-10px 0 30px rgba(0,0,0,0.15)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 16, fontWeight: 750, color: 'var(--crm-text)' }}>
                Lead Details
              </div>
              <button
                onClick={() => setSelectedContact(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px', color: 'var(--crm-text-strong)' }}>
                {selectedContact.name || 'Unnamed Lead'}
              </h2>
              {selectedContact.company && (
                <div style={{ fontSize: 13, color: 'var(--crm-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Building2 size={13} /> {selectedContact.company}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: TIER_META[selectedContact.lead_score_tier ?? 'cold']?.color,
                  background: `${TIER_META[selectedContact.lead_score_tier ?? 'cold']?.color}18`,
                  padding: '3px 10px',
                  borderRadius: 8,
                }}
              >
                {TIER_META[selectedContact.lead_score_tier ?? 'cold']?.icon}{' '}
                {TIER_META[selectedContact.lead_score_tier ?? 'cold']?.label} ({selectedContact.lead_score ?? 0} pts)
              </span>

              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--crm-primary)',
                  background: 'rgba(79,109,245,0.12)',
                  padding: '3px 10px',
                  borderRadius: 8,
                }}
              >
                Status: {selectedContact.lead_status || 'new'}
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                background: 'rgba(130,145,190,0.06)',
                borderRadius: 12,
                padding: 14,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase' }}>
                Contact Info
              </div>
              {selectedContact.phone && (
                <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--crm-text)' }}>
                  <Phone size={14} color="#25D366" />
                  <a href={`tel:${selectedContact.phone}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                    {selectedContact.phone}
                  </a>
                </div>
              )}
              {selectedContact.email && (
                <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--crm-text)' }}>
                  <Mail size={14} color="#4f6df5" />
                  <a href={`mailto:${selectedContact.email}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                    {selectedContact.email}
                  </a>
                </div>
              )}
              <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', marginTop: 4 }}>
                Created: {new Date(selectedContact.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            </div>

            {selectedContact.lead_score_reason && (
              <div
                style={{
                  background: 'rgba(244,201,93,0.12)',
                  border: '1px solid rgba(244,201,93,0.25)',
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: '#d97706', marginBottom: 4 }}>
                  AI Score Rationale
                </div>
                <div style={{ fontSize: 12, color: 'var(--crm-text-secondary)', lineHeight: 1.4 }}>
                  {selectedContact.lead_score_reason}
                </div>
              </div>
            )}

            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Link
                href="/inbox"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '9px',
                  borderRadius: 10,
                  background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)',
                  color: 'white',
                  textDecoration: 'none',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Open in WhatsApp Inbox <ExternalLink size={13} />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
