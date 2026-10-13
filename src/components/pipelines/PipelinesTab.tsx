'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, DollarSign, Search, X, User, CheckCircle2, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  DEFAULT_PIPELINE_STAGES,
  type DealRecord,
  type PipelineStageRecord,
  encodeStageInNotes,
  extractStageFromDeal,
  formatErrorSummary,
  formatSupabaseError,
  generateLocalId,
  isUuid,
  mergeRecordsById,
  readLocalContacts,
  readLocalDeals,
  resolveDealContactName,
  resolveTenantAccountId,
  updateLocalDeal,
  upsertLocalDeal,
} from '@/lib/crm-pipeline-store';

type Deal = DealRecord;
type Stage = PipelineStageRecord;

interface ContactOption {
  id: string;
  account_id?: string | null;
  name: string | null;
  email: string | null;
  phone?: string | null;
}

function fmt(v: number | null, currency: string | null) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const sym = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : (currency ?? '');
  return v >= 100000 ? `${sym}${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${sym}${(v / 1000).toFixed(0)}K` : `${sym}${v}`;
}

export function PipelinesTab() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [stages, setStages] = useState<Stage[]>(DEFAULT_PIPELINE_STAGES);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [targetStageId, setTargetStageId] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newCurrency, setNewCurrency] = useState('USD');
  const [newContactId, setNewContactId] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const supabase = createClient();

  const syncContactsList = useCallback((remoteContacts: ContactOption[] = []) => {
    const localContacts: ContactOption[] = readLocalContacts().map(c => ({
      id: c.id,
      account_id: c.account_id ?? null,
      name: c.name,
      email: c.email,
      phone: c.phone,
    }));
    const merged = mergeRecordsById(remoteContacts, localContacts);
    setContacts(merged);
    return merged;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dealsRes, stagesRes, contactsRes] = await Promise.all([
        supabase.from('deals').select('*, contacts(name)').order('created_at', { ascending: false }).limit(200),
        supabase.from('pipeline_stages').select('*').order('position'),
        supabase.from('contacts').select('id, account_id, name, email, phone').order('name').limit(200),
      ]);

      if (dealsRes.error) {
        const info = formatSupabaseError(dealsRes.error);
        console.warn(`Pipeline deals query notice (${formatErrorSummary(info)})`, info);
      }
      if (stagesRes.error) {
        const info = formatSupabaseError(stagesRes.error);
        console.warn(`Pipeline stages query notice (${formatErrorSummary(info)})`, info);
      }
      if (contactsRes.error) {
        const info = formatSupabaseError(contactsRes.error);
        console.warn(`Pipeline contacts query notice (${formatErrorSummary(info)})`, info);
      }

      const activeStages =
        stagesRes.data && stagesRes.data.length > 0
          ? (stagesRes.data as Stage[])
          : DEFAULT_PIPELINE_STAGES;
      setStages(activeStages);

      const mergedContacts = syncContactsList((contactsRes.data as ContactOption[]) ?? []);
      const remoteDeals = ((dealsRes.data as Deal[]) ?? []).map(d => {
        const resolvedName = resolveDealContactName(d, mergedContacts);
        return {
          ...d,
          stage_id: extractStageFromDeal(d, activeStages),
          contacts: resolvedName ? { name: resolvedName } : d.contacts ?? null,
        };
      });
      const localDeals = readLocalDeals().map(d => {
        const resolvedName = resolveDealContactName(d, mergedContacts);
        return {
          ...d,
          stage_id: extractStageFromDeal(d, activeStages),
          contacts: resolvedName ? { name: resolvedName } : d.contacts ?? null,
        };
      });

      setDeals(mergeRecordsById(remoteDeals, localDeals));
    } catch (err) {
      const info = formatSupabaseError(err);
      console.warn(`Error loading pipeline data (${formatErrorSummary(info)})`, info);
      const mergedContacts = syncContactsList([]);
      const localDeals = readLocalDeals().map(d => {
        const resolvedName = resolveDealContactName(d, mergedContacts);
        return { ...d, contacts: resolvedName ? { name: resolvedName } : d.contacts ?? null };
      });
      setDeals(localDeals);
    } finally {
      setLoading(false);
    }
  }, [supabase, syncContactsList]);

  useEffect(() => { void load(); }, [load]);

  const dealsByStage = (stageId: string) => {
    return deals.filter(d => {
      const effectiveStage = extractStageFromDeal(d, stages);
      if (effectiveStage !== stageId) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const contactName = resolveDealContactName(d, contacts) ?? '';
      return d.title.toLowerCase().includes(q) || contactName.toLowerCase().includes(q);
    });
  };

  const stageValue = (stageId: string) =>
    dealsByStage(stageId).reduce((s, d) => s + (d.value ?? 0), 0);

  const totalPipeline = deals.reduce((s, d) => s + (d.value ?? 0), 0);
  const currency = deals[0]?.currency ?? 'USD';

  const handleOpenAddModal = (stageId?: string) => {
    syncContactsList(contacts);
    setTargetStageId(stageId ?? stages[0]?.id ?? 'new');
    setNewTitle('');
    setNewValue('');
    setNewCurrency('USD');
    setNewContactId('');
    setFormError(null);
    setIsAddModalOpen(true);
  };

  const handleCreateDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setBanner(null);

    const trimmedTitle = newTitle.trim();
    if (!trimmedTitle) { setFormError('Deal title is required.'); return; }

    const parsedValue = newValue.trim() === '' ? 0 : Number(newValue);
    if (Number.isNaN(parsedValue) || parsedValue < 0) {
      setFormError('Please enter a valid non-negative value.');
      return;
    }

    const selectedStageId = targetStageId || stages[0]?.id || 'new';
    const selectedStage = stages.find(s => s.id === selectedStageId);
    const stageLower = (selectedStage?.name ?? selectedStageId).toLowerCase();
    const dealStatus =
      selectedStageId === 'won' || stageLower === 'won' ? 'won'
      : selectedStageId === 'lost' || stageLower === 'lost' ? 'lost'
      : 'open';

    const associatedContact = newContactId ? contacts.find(c => c.id === newContactId) ?? null : null;
    const associatedContactLabel = associatedContact
      ? associatedContact.name || associatedContact.email || associatedContact.phone || 'Contact'
      : null;

    setSaving(true);
    try {
      const accountId = await resolveTenantAccountId(supabase, [
        ...deals.map(d => d.account_id),
        ...contacts.map(c => c.account_id),
      ]);

      const dbPayload: Record<string, unknown> = {
        title: trimmedTitle,
        value: parsedValue,
        currency: newCurrency,
        stage_id: isUuid(selectedStageId) ? selectedStageId : null,
        contact_id: newContactId && isUuid(newContactId) ? newContactId : null,
        status: dealStatus,
        notes: encodeStageInNotes(selectedStageId, null),
      };
      if (accountId) dbPayload.account_id = accountId;

      const { data, error } = await supabase.from('deals').insert(dbPayload).select('*, contacts(name)').single();

      if (error) {
        const info = formatSupabaseError(error);
        console.warn(`Failed to create deal in Supabase (${formatErrorSummary(info)}). Persisting locally.`, info);

        const localDeal: Deal = {
          id: generateLocalId(),
          account_id: accountId,
          title: trimmedTitle,
          value: parsedValue,
          currency: newCurrency,
          status: dealStatus,
          stage_id: selectedStageId,
          contact_id: newContactId || null,
          notes: encodeStageInNotes(selectedStageId, null),
          created_at: new Date().toISOString(),
          contacts: associatedContactLabel ? { name: associatedContactLabel } : null,
        };

        upsertLocalDeal(localDeal);
        setDeals(prev => [localDeal, ...prev]);
        setIsAddModalOpen(false);
        setBanner({ type: 'success', text: `Deal "${trimmedTitle}" created in ${selectedStage?.name ?? selectedStageId}.` });
      } else if (data) {
        const created = data as Deal;
        const resolvedName = associatedContactLabel ?? resolveDealContactName(created, contacts);
        const normalizedDeal: Deal = {
          ...created,
          stage_id: selectedStageId,
          contact_id: newContactId || created.contact_id || null,
          notes: created.notes ?? encodeStageInNotes(selectedStageId, null),
          contacts: resolvedName ? { name: resolvedName } : null,
        };

        upsertLocalDeal(normalizedDeal);
        setDeals(prev => [normalizedDeal, ...prev.filter(d => d.id !== normalizedDeal.id)]);
        setIsAddModalOpen(false);
        setBanner({ type: 'success', text: `Deal "${trimmedTitle}" created in ${selectedStage?.name ?? selectedStageId}.` });
      }
    } catch (err) {
      const info = formatSupabaseError(err);
      console.warn(`Create deal exception (${formatErrorSummary(info)})`, info);
      setFormError(`Unable to create deal: ${info.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleMoveStage = async (dealId: string, newStageId: string) => {
    const targetStage = stages.find(s => s.id === newStageId);
    const stageLower = (targetStage?.name ?? newStageId).toLowerCase();
    const nextStatus =
      newStageId === 'won' || stageLower === 'won' ? 'won'
      : newStageId === 'lost' || stageLower === 'lost' ? 'lost'
      : 'open';

    const existingDeal = deals.find(d => d.id === dealId);
    const nextNotes = encodeStageInNotes(newStageId, existingDeal?.notes);

    setDeals(prev =>
      prev.map(d => d.id === dealId ? { ...d, stage_id: newStageId, status: nextStatus, notes: nextNotes } : d)
    );
    updateLocalDeal(dealId, { stage_id: newStageId, status: nextStatus, notes: nextNotes });

    try {
      const { error } = await supabase.from('deals').update({
        stage_id: isUuid(newStageId) ? newStageId : null,
        status: nextStatus,
        notes: nextNotes,
      }).eq('id', dealId);

      if (error) {
        const info = formatSupabaseError(error);
        console.warn(`Deal stage update notice (${formatErrorSummary(info)})`, info);
      }
    } catch (err) {
      const info = formatSupabaseError(err);
      console.warn(`Error moving deal stage (${formatErrorSummary(info)})`, info);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {banner && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '10px 14px', borderRadius: 12,
          background: banner.type === 'success' ? 'rgba(40,201,154,0.12)' : 'rgba(244,107,114,0.12)',
          border: `1px solid ${banner.type === 'success' ? 'rgba(40,201,154,0.30)' : 'rgba(244,107,114,0.30)'}`,
          color: banner.type === 'success' ? '#10b981' : '#f46b72', fontSize: 13, fontWeight: 600,
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {banner.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            {banner.text}
          </span>
          <button onClick={() => setBanner(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 2 }}>
            <X size={14} />
          </button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(130,145,190,0.22)', borderRadius: 12, padding: '7px 12px', minWidth: 260 }}>
            <Search size={14} color="var(--crm-text-muted)" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search deals or contacts..."
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 13, color: 'var(--crm-text)' }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <X size={13} color="var(--crm-text-muted)" />
              </button>
            )}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-text-secondary)' }}>
            {deals.length} deals · Total: <span style={{ color: 'var(--crm-text-strong)' }}>{fmt(totalPipeline, currency)}</span>
          </div>
        </div>
        <button
          onClick={() => handleOpenAddModal()}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 12, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 14px rgba(79,109,245,0.25)' }}
        >
          <Plus size={14} /> Add Deal
        </button>
      </div>

      {loading ? (
        <div style={{ minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--crm-text-muted)', fontSize: 14 }}>
          Loading pipeline deals...
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12, minHeight: 'calc(100vh - 240px)' }}>
          {stages.map(stage => {
            const stageDeals = dealsByStage(stage.id);
            const val = stageValue(stage.id);
            const color = stage.color ?? '#4d7cff';
            return (
              <div key={stage.id} style={{ minWidth: 260, width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, background: 'rgba(255,255,255,0.40)', borderRadius: 14, padding: 10, border: '1px solid rgba(130,145,190,0.14)' }}>
                <div style={{ padding: '10px 12px', borderRadius: 10, background: `${color}14`, border: `1px solid ${color}26` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color }}>{stage.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'white', background: color, borderRadius: 6, padding: '1px 7px' }}>{stageDeals.length}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)' }}>
                    <DollarSign size={11} />{fmt(val, currency)}
                  </div>
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
                  {stageDeals.map(deal => {
                    const contactName = resolveDealContactName(deal, contacts);
                    const currentStageId = extractStageFromDeal(deal, stages);
                    return (
                      <div key={deal.id} className="crm-glass-soft" style={{ padding: '12px 14px', borderRadius: 10, borderLeft: `3px solid ${color}`, transition: 'transform 120ms ease, box-shadow 120ms ease' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-text-strong)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {deal.title}
                        </div>
                        {contactName && (
                          <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <User size={10} />{contactName}
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color }}>{fmt(deal.value, deal.currency)}</span>
                          <span style={{ fontSize: 10, color: 'var(--crm-text-muted)' }}>
                            {new Date(deal.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, borderTop: '1px solid rgba(130,145,190,0.10)', paddingTop: 6 }}>
                          <span style={{ fontSize: 10, color: 'var(--crm-text-muted)' }}>Move:</span>
                          <select
                            value={currentStageId}
                            onChange={e => handleMoveStage(deal.id, e.target.value)}
                            style={{ fontSize: 11, padding: '2px 6px', borderRadius: 6, border: '1px solid rgba(130,145,190,0.20)', background: 'white', color: 'var(--crm-text-secondary)', cursor: 'pointer', outline: 'none' }}
                          >
                            {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                  <button
                    onClick={() => handleOpenAddModal(stage.id)}
                    style={{ padding: '8px', borderRadius: 10, border: `1px dashed ${color}50`, background: 'none', color: 'var(--crm-text-muted)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, transition: 'background 120ms' }}
                  >
                    <Plus size={12} /> Add deal
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isAddModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.40)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="crm-glass" style={{ width: '100%', maxWidth: 440, borderRadius: 16, padding: 24, boxShadow: '0 20px 50px rgba(0,0,0,0.20)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--crm-text)' }}>Create New Deal</h3>
              <button onClick={() => setIsAddModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateDeal} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {formError && (
                <div style={{ padding: '9px 12px', borderRadius: 10, background: 'rgba(244,107,114,0.12)', border: '1px solid rgba(244,107,114,0.28)', color: '#f46b72', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertCircle size={14} />{formError}
                </div>
              )}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Deal Title *</label>
                <input type="text" required placeholder="e.g. Enterprise WhatsApp License" value={newTitle} onChange={e => setNewTitle(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'white', fontSize: 13, color: 'var(--crm-text)', boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Value</label>
                  <input type="number" step="any" placeholder="0.00" value={newValue} onChange={e => setNewValue(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'white', fontSize: 13, color: 'var(--crm-text)', boxSizing: 'border-box', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Currency</label>
                  <select value={newCurrency} onChange={e => setNewCurrency(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'white', fontSize: 13, color: 'var(--crm-text)', boxSizing: 'border-box', outline: 'none' }}>
                    <option value="USD">USD ($)</option>
                    <option value="INR">INR (₹)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Stage</label>
                <select value={targetStageId ?? ''} onChange={e => setTargetStageId(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'white', fontSize: 13, color: 'var(--crm-text)', boxSizing: 'border-box', outline: 'none' }}>
                  {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Associated Contact</label>
                <select value={newContactId} onChange={e => setNewContactId(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'white', fontSize: 13, color: 'var(--crm-text)', boxSizing: 'border-box', outline: 'none' }}>
                  <option value="">None (Unassigned)</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.name || c.email || c.phone || c.id}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button type="button" onClick={() => setIsAddModalOpen(false)}
                  style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'white', color: 'var(--crm-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  style={{ padding: '8px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Creating...' : 'Create Deal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
