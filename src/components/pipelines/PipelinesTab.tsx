'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  DollarSign,
  Search,
  X,
  User,
  CheckCircle2,
  AlertCircle,
  Pencil,
  Trash2,
  Sparkles,
  Inbox,
} from 'lucide-react';
import { v3fetch } from '@/lib/auth-client';
import {
  DEFAULT_PIPELINE_STAGES,
  type DealRecord,
  type PipelineStageRecord,
  type ContactRecord,
  appendAutomationLog,
  deleteLocalDeal,
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
  upsertLocalFollowUp,
} from '@/lib/crm-pipeline-store';
import { DealAutomationModal } from './DealAutomationModal';

type Deal = DealRecord;
type Stage = PipelineStageRecord;

interface ContactOption {
  id: string;
  account_id?: string | null;
  name: string | null;
  email: string | null;
  phone?: string | null;
  company?: string | null;
}

function fmt(v: number | null, currency: string | null) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const sym = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : (currency ?? '');
  return v >= 100000 ? `${sym}${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${sym}${(v / 1000).toFixed(0)}K` : `${sym}${v.toLocaleString()}`;
}

export function PipelinesTab() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [stages, setStages] = useState<Stage[]>(DEFAULT_PIPELINE_STAGES);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Add Deal Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [targetStageId, setTargetStageId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newCurrency, setNewCurrency] = useState('USD');
  const [newContactId, setNewContactId] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit Deal Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editValue, setEditValue] = useState('');
  const [editCurrency, setEditCurrency] = useState('USD');
  const [editStageId, setEditStageId] = useState('');
  const [editContactId, setEditContactId] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [updating, setUpdating] = useState(false);

  // Delete Deal Confirmation State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingDeal, setDeletingDeal] = useState<Deal | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Automation Modal State
  const [isAutomationModalOpen, setIsAutomationModalOpen] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  

  const syncContactsList = useCallback((remoteContacts: ContactOption[] = []) => {
    const localContacts: ContactOption[] = readLocalContacts().map(c => ({
      id: c.id,
      account_id: c.account_id ?? null,
      name: c.name,
      email: c.email,
      phone: c.phone,
      company: c.company,
    }));
    const merged = mergeRecordsById(remoteContacts, localContacts);
    setContacts(merged);
    return merged;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dealsJson, stagesJson, contactsJson] = await Promise.all([
        v3fetch('/api/v3/deals?limit=200').then(r => r.ok ? r.json() : { data: [] }),
        v3fetch('/api/v3/pipeline-stages').then(r => r.ok ? r.json() : { data: [] }),
        v3fetch('/api/v3/contacts?limit=200').then(r => r.ok ? r.json() : { data: [] }),
      ]);
      const dealsRes = { data: (dealsJson as { data?: unknown[] }).data ?? [], error: null };
      const stagesRes = { data: (stagesJson as { data?: unknown[] }).data ?? [], error: null };
      const contactsRes = { data: (contactsJson as { data?: unknown[]; contacts?: unknown[] }).data ?? (contactsJson as { contacts?: unknown[] }).contacts ?? [], error: null };

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
  }, [syncContactsList]);

  useEffect(() => {
    void load();
  }, [load]);

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

  // ── Open Add Deal Modal ───────────────────────────────────────
  const handleOpenAddModal = (stageId?: string) => {
    syncContactsList(contacts);
    setTargetStageId(stageId ?? stages[0]?.id ?? 'new');
    setNewTitle('');
    setNewValue('');
    setNewCurrency('USD');
    setNewContactId('');
    setNewNotes('');
    setFormError(null);
    setIsAddModalOpen(true);
  };

  // ── Open Edit Deal Modal ──────────────────────────────────────
  const handleOpenEditModal = (deal: Deal) => {
    syncContactsList(contacts);
    setEditingDeal(deal);
    setEditTitle(deal.title || '');
    setEditValue(deal.value !== null && deal.value !== undefined ? String(deal.value) : '');
    setEditCurrency(deal.currency || 'USD');
    setEditStageId(extractStageFromDeal(deal, stages));
    setEditContactId(deal.contact_id || '');
    const cleanNotes = (deal.notes || '').replace(/\[stage:[a-z0-9_-]+\]/gi, '').trim();
    setEditNotes(cleanNotes);
    setFormError(null);
    setIsEditModalOpen(true);
  };

  // ── Open Delete Deal Confirmation Modal ───────────────────────
  const handleOpenDeleteModal = (deal: Deal) => {
    setDeletingDeal(deal);
    setIsDeleteModalOpen(true);
  };

  // ── Confirm Delete Deal ───────────────────────────────────────
  const handleConfirmDelete = async () => {
    if (!deletingDeal) return;
    setIsDeleting(true);
    setBanner(null);

    const dealToDelete = deletingDeal;
    try {
      // 1. Call server API endpoint for deal deletion
      const res = await fetch(`/api/v3/deals/${encodeURIComponent(dealToDelete.id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const errMsg = errJson.error || `Server responded with status ${res.status}`;
        throw new Error(errMsg);
      }

      // 2. Persist to local storage
      deleteLocalDeal(dealToDelete.id);

      // 3. Update state
      setDeals(prev => prev.filter(d => d.id !== dealToDelete.id));

      setBanner({
        type: 'success',
        text: `Deal "${dealToDelete.title}" was successfully deleted.`,
      });
      setIsDeleteModalOpen(false);
      setDeletingDeal(null);
    } catch (err: unknown) {
      console.error(`Error deleting deal:`, err);
      const msg = err instanceof Error ? err.message : 'Deletion failed';
      setBanner({
        type: 'error',
        text: `Failed to delete deal: ${msg}`,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // ── Create Deal ───────────────────────────────────────────────
  const handleCreateDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setBanner(null);

    const trimmedTitle = newTitle.trim();
    if (!trimmedTitle) {
      setFormError('Deal title is required.');
      return;
    }

    const parsedValue = newValue.trim() === '' ? 0 : Number(newValue);
    if (Number.isNaN(parsedValue) || parsedValue < 0) {
      setFormError('Please enter a valid non-negative value.');
      return;
    }

    const selectedStageId = targetStageId || stages[0]?.id || 'new';
    const selectedStage = stages.find(s => s.id === selectedStageId);
    const stageLower = (selectedStage?.name ?? selectedStageId).toLowerCase();
    const dealStatus =
      selectedStageId === 'won' || stageLower === 'won'
        ? 'won'
        : selectedStageId === 'lost' || stageLower === 'lost'
        ? 'lost'
        : 'open';

    const associatedContact = newContactId ? contacts.find(c => c.id === newContactId) ?? null : null;
    const associatedContactLabel = associatedContact
      ? associatedContact.name || associatedContact.company || associatedContact.email || associatedContact.phone || 'Contact'
      : null;

    setSaving(true);
    try {
      const accountId = (typeof window !== 'undefined'
        ? (JSON.parse(localStorage.getItem('crm_user') ?? '{}') as { account_id?: string }).account_id
        : null) ?? deals.find(d => d.account_id)?.account_id ?? contacts.find(c => c.account_id)?.account_id ?? null;

      const dbPayload: Record<string, unknown> = {
        title: trimmedTitle,
        value: parsedValue,
        currency: newCurrency,
        stage_id: isUuid(selectedStageId) ? selectedStageId : null,
        contact_id: newContactId && isUuid(newContactId) ? newContactId : null,
        status: dealStatus,
        notes: encodeStageInNotes(selectedStageId, newNotes.trim() || null),
      };
      if (accountId) dbPayload.account_id = accountId;

      let data: Deal | null = null;
      try {
        const cr = await v3fetch('/api/v3/deals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dbPayload) });
        if (cr.ok) data = ((await cr.json() as { deal?: Deal }).deal ?? null);
      } catch { /* local fallback */ }

      if (!data) {
        console.warn('Failed to create deal via API. Persisting locally.');

        const localDeal: Deal = {
          id: generateLocalId(),
          account_id: accountId,
          title: trimmedTitle,
          value: parsedValue,
          currency: newCurrency,
          status: dealStatus,
          stage_id: selectedStageId,
          contact_id: newContactId || null,
          notes: encodeStageInNotes(selectedStageId, newNotes.trim() || null),
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
          notes: created.notes ?? encodeStageInNotes(selectedStageId, newNotes.trim() || null),
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

  // ── Update Existing Deal ──────────────────────────────────────
  const handleUpdateDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDeal) return;

    setFormError(null);
    setBanner(null);

    const trimmedTitle = editTitle.trim();
    if (!trimmedTitle) {
      setFormError('Deal title is required.');
      return;
    }

    const parsedValue = editValue.trim() === '' ? 0 : Number(editValue);
    if (Number.isNaN(parsedValue) || parsedValue < 0) {
      setFormError('Please enter a valid non-negative value.');
      return;
    }

    const selectedStageId = editStageId || stages[0]?.id || 'new';
    const selectedStage = stages.find(s => s.id === selectedStageId);
    const stageLower = (selectedStage?.name ?? selectedStageId).toLowerCase();
    const dealStatus =
      selectedStageId === 'won' || stageLower === 'won'
        ? 'won'
        : selectedStageId === 'lost' || stageLower === 'lost'
        ? 'lost'
        : 'open';

    const associatedContact = editContactId ? contacts.find(c => c.id === editContactId) ?? null : null;
    const associatedContactLabel = associatedContact
      ? associatedContact.name || associatedContact.company || associatedContact.email || associatedContact.phone || 'Contact'
      : null;

    const encodedNotes = encodeStageInNotes(selectedStageId, editNotes.trim() || null);

    setUpdating(true);
    try {
      const updatedDeal: Deal = {
        ...editingDeal,
        title: trimmedTitle,
        value: parsedValue,
        currency: editCurrency,
        stage_id: selectedStageId,
        contact_id: editContactId || null,
        status: dealStatus,
        notes: encodedNotes,
        contacts: associatedContactLabel ? { name: associatedContactLabel } : null,
      };

      setDeals(prev => prev.map(d => (d.id === editingDeal.id ? updatedDeal : d)));
      updateLocalDeal(editingDeal.id, {
        title: trimmedTitle,
        value: parsedValue,
        currency: editCurrency,
        stage_id: selectedStageId,
        contact_id: editContactId || null,
        status: dealStatus,
        notes: encodedNotes,
      });

      if (isUuid(editingDeal.id)) {
        const updatePayload: Record<string, unknown> = {
          title: trimmedTitle, value: parsedValue, currency: editCurrency,
          stage_id: isUuid(selectedStageId) ? selectedStageId : null,
          contact_id: editContactId && isUuid(editContactId) ? editContactId : null,
          status: dealStatus, notes: encodedNotes, updated_at: new Date().toISOString(),
        };
        try {
          await v3fetch(`/api/v3/deals/${editingDeal.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatePayload) });
        } catch { /* local already updated */ }
      }

      setIsEditModalOpen(false);
      setEditingDeal(null);
      setBanner({ type: 'success', text: `Deal "${trimmedTitle}" updated successfully.` });
    } catch (err) {
      const info = formatSupabaseError(err);
      console.warn(`Update deal exception (${formatErrorSummary(info)})`, info);
      setFormError(`Unable to update deal: ${info.message}`);
    } finally {
      setUpdating(false);
    }
  };

  // ── Move Stage (Dropdown on card) ─────────────────────────────
  const handleMoveStage = async (dealId: string, newStageId: string) => {
    const targetStage = stages.find(s => s.id === newStageId);
    const stageLower = (targetStage?.name ?? newStageId).toLowerCase();
    const nextStatus =
      newStageId === 'won' || stageLower === 'won'
        ? 'won'
        : newStageId === 'lost' || stageLower === 'lost'
        ? 'lost'
        : 'open';

    const existingDeal = deals.find(d => d.id === dealId);
    const nextNotes = encodeStageInNotes(newStageId, existingDeal?.notes);

    setDeals(prev =>
      prev.map(d => (d.id === dealId ? { ...d, stage_id: newStageId, status: nextStatus, notes: nextNotes } : d))
    );
    updateLocalDeal(dealId, { stage_id: newStageId, status: nextStatus, notes: nextNotes });

    try {
      if (isUuid(dealId)) {
        try {
          await v3fetch(`/api/v3/deals/${dealId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stage_id: isUuid(newStageId) ? newStageId : null, status: nextStatus, notes: nextNotes, updated_at: new Date().toISOString() }),
          });
        } catch (err) {
          const info = formatSupabaseError(err);
          console.warn(`Error moving deal stage (${formatErrorSummary(info)})`, info);
        }
      }
    } catch { /* local already updated */ }
  };

  // ── Automation Execution Callback ─────────────────────────────
  const handleConfirmAutomation = async (params: {
    title: string;
    value: number;
    currency: string;
    stageId: string;
    contactId: string | null;
    notes: string;
    followUp?: {
      title: string;
      dueDate: string;
    } | null;
    rulesApplied: string[];
    originalPrompt: string;
  }): Promise<{ success: boolean; dealId?: string; error?: string }> => {
    const targetStage = stages.find(s => s.id === params.stageId) ?? stages[0];
    const stageLower = (targetStage?.name ?? params.stageId).toLowerCase();
    const dealStatus =
      params.stageId === 'won' || stageLower === 'won'
        ? 'won'
        : params.stageId === 'lost' || stageLower === 'lost'
        ? 'lost'
        : 'open';

    const associatedContact = params.contactId ? contacts.find(c => c.id === params.contactId) ?? null : null;
    const contactLabel = associatedContact
      ? associatedContact.name || associatedContact.company || associatedContact.email || 'Contact'
      : null;

    try {
      const accountId = (typeof window !== 'undefined'
        ? (JSON.parse(localStorage.getItem('crm_user') ?? '{}') as { account_id?: string }).account_id
        : null) ?? deals.find(d => d.account_id)?.account_id ?? contacts.find(c => c.account_id)?.account_id ?? null;

      const dealId = generateLocalId();
      const localDeal: Deal = {
        id: dealId,
        account_id: accountId,
        title: params.title,
        value: params.value,
        currency: params.currency,
        status: dealStatus,
        stage_id: params.stageId,
        contact_id: params.contactId,
        notes: encodeStageInNotes(params.stageId, params.notes),
        created_at: new Date().toISOString(),
        contacts: contactLabel ? { name: contactLabel } : null,
      };

      if (accountId) {
        try {
          const dbPayload: Record<string, unknown> = {
            title: params.title,
            value: params.value,
            currency: params.currency,
            stage_id: isUuid(params.stageId) ? params.stageId : null,
            contact_id: params.contactId && isUuid(params.contactId) ? params.contactId : null,
            status: dealStatus,
            notes: encodeStageInNotes(params.stageId, params.notes),
            account_id: accountId,
          };

          const cr = await v3fetch('/api/v3/deals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dbPayload) });
          if (cr.ok) {
            const cd = await cr.json() as { deal?: { id: string } };
            if (cd.deal?.id) localDeal.id = cd.deal.id;
          }
        } catch {
          // Keep local fallback ID
        }
      }

      upsertLocalDeal(localDeal);
      setDeals(prev => [localDeal, ...prev]);

      if (params.followUp) {
        const followUpId = generateLocalId();
        const followUpItem = {
          id: followUpId,
          account_id: accountId,
          contact_id: params.contactId || null,
          title: params.followUp.title,
          due_date: params.followUp.dueDate,
          status: 'pending',
          notes: `Automated follow-up for deal "${params.title}"`,
          created_at: new Date().toISOString(),
        };

        upsertLocalFollowUp(followUpItem);

        if (accountId && isUuid(accountId)) {
          try {
            await v3fetch('/api/v3/follow-ups', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                account_id: accountId,
                contact_id: params.contactId && isUuid(params.contactId) ? params.contactId : null,
                title: params.followUp.title,
                due_date: params.followUp.dueDate,
                status: 'pending',
                notes: `Automated follow-up for deal "${params.title}"`,
              }),
            });
          } catch {
            // Local fallback already saved
          }
        }
      }

      appendAutomationLog({
        id: generateLocalId(),
        timestamp: new Date().toISOString(),
        prompt: params.originalPrompt,
        deal_id: localDeal.id,
        deal_title: localDeal.title,
        deal_value: localDeal.value,
        currency: localDeal.currency,
        stage_name: targetStage?.name ?? params.stageId,
        contact_id: params.contactId,
        contact_name: contactLabel,
        follow_up_title: params.followUp?.title ?? null,
        rules_applied: params.rulesApplied,
        status: 'completed',
        message: `Successfully created deal "${params.title}" in stage "${targetStage?.name}".`,
      });

      setBanner({
        type: 'success',
        text: `Automation completed: Deal "${params.title}" created in ${targetStage?.name}.`,
      });

      return { success: true, dealId: localDeal.id };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Automation failed';
      return { success: false, error: msg };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Banner Message */}
      {banner && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 12,
            background: banner.type === 'success' ? 'rgba(40,201,154,0.12)' : 'rgba(244,107,114,0.12)',
            border: `1px solid ${banner.type === 'success' ? 'rgba(40,201,154,0.30)' : 'rgba(244,107,114,0.30)'}`,
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

      {/* Control & Action Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
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
              placeholder="Search deals or contacts..."
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
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-text-secondary)' }}>
            {deals.length} deals · Total:{' '}
            <span style={{ color: 'var(--crm-text-strong)', fontWeight: 700 }}>
              {fmt(totalPipeline, currency)}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setIsAutomationModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 12,
              background: 'rgba(255, 255, 255, 0.85)',
              border: '1px solid rgba(79, 109, 245, 0.35)',
              color: '#4f6df5',
              fontSize: 13,
              fontWeight: 650,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(79, 109, 245, 0.12)',
              transition: 'all 120ms ease',
            }}
          >
            <Sparkles size={14} color="#4f6df5" /> Automate Deal
          </button>

          <button
            onClick={() => handleOpenAddModal()}
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
            <Plus size={14} /> Add Deal
          </button>
        </div>
      </div>

      {/* Pipeline Board Columns */}
      {loading ? (
        <div
          style={{
            minHeight: 280,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--crm-text-muted)',
            fontSize: 14,
          }}
        >
          Loading pipeline deals...
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            gap: 12,
            overflowX: 'auto',
            paddingBottom: 12,
          }}
        >
          {stages.map(stage => {
            const stageDeals = dealsByStage(stage.id);
            const val = stageValue(stage.id);
            const color = stage.color ?? '#4d7cff';

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
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 4,
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
                      {stageDeals.length}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--crm-text-secondary)',
                    }}
                  >
                    <DollarSign size={11} />
                    {fmt(val, currency)}
                  </div>
                </div>

                {/* Deal Cards in Column */}
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    overflowY: 'auto',
                    minHeight: 120,
                  }}
                >
                  {stageDeals.length === 0 ? (
                    <div
                      style={{
                        padding: '18px 12px',
                        textAlign: 'center',
                        color: 'var(--crm-text-muted)',
                        fontSize: 12,
                        borderRadius: 10,
                        border: '1px dashed rgba(130, 145, 190, 0.25)',
                      }}
                    >
                      <Inbox size={18} style={{ margin: '0 auto 4px', opacity: 0.35 }} />
                      No deals in this stage
                    </div>
                  ) : (
                    stageDeals.map(deal => {
                      const contactName = resolveDealContactName(deal, contacts);
                      const currentStageId = extractStageFromDeal(deal, stages);

                      return (
                        <div
                          key={deal.id}
                          className="crm-glass-soft"
                          style={{
                            padding: '12px 14px',
                            borderRadius: 10,
                            borderLeft: `3px solid ${color}`,
                            transition: 'transform 120ms ease, box-shadow 120ms ease',
                          }}
                        >
                          {/* Deal Title & Action Buttons (Edit + Delete) */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              justifyContent: 'space-between',
                              gap: 6,
                              marginBottom: 4,
                            }}
                          >
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 650,
                                color: 'var(--crm-text-strong)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                flex: 1,
                              }}
                              title={deal.title}
                            >
                              {deal.title}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(deal)}
                                title="Edit deal"
                                style={{
                                  background: 'rgba(130,145,190,0.12)',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: '3px 6px',
                                  borderRadius: 6,
                                  color: 'var(--crm-text-secondary)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 3,
                                  fontSize: 11,
                                  fontWeight: 600,
                                }}
                              >
                                <Pencil size={11} /> Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenDeleteModal(deal)}
                                title="Delete deal"
                                style={{
                                  background: 'rgba(244,107,114,0.12)',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: '3px 6px',
                                  borderRadius: 6,
                                  color: '#f46b72',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 3,
                                  fontSize: 11,
                                  fontWeight: 600,
                                }}
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </div>

                          {/* Contact Info */}
                          {contactName && (
                            <div
                              style={{
                                fontSize: 11,
                                color: 'var(--crm-text-muted)',
                                marginBottom: 8,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <User size={10} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {contactName}
                              </span>
                            </div>
                          )}

                          {/* Value & Date */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginBottom: 8,
                            }}
                          >
                            <span style={{ fontSize: 13, fontWeight: 700, color }}>
                              {fmt(deal.value, deal.currency)}
                            </span>
                            <span style={{ fontSize: 10, color: 'var(--crm-text-muted)' }}>
                              {new Date(deal.created_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          </div>

                          {/* Move Stage Selector */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 6,
                              borderTop: '1px solid rgba(130,145,190,0.10)',
                              paddingTop: 6,
                            }}
                          >
                            <span style={{ fontSize: 10, color: 'var(--crm-text-muted)' }}>Move:</span>
                            <select
                              value={currentStageId}
                              onChange={e => handleMoveStage(deal.id, e.target.value)}
                              style={{
                                fontSize: 11,
                                padding: '2px 6px',
                                borderRadius: 6,
                                border: '1px solid rgba(130,145,190,0.20)',
                                background: 'white',
                                color: 'var(--crm-text-secondary)',
                                cursor: 'pointer',
                                outline: 'none',
                                maxWidth: 140,
                              }}
                            >
                              {stages.map(s => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })
                  )}

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
                    <Plus size={12} /> Add deal
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Deal Modal */}
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--crm-text)' }}>Create New Deal</h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateDeal} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                  Deal Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Enterprise WhatsApp License"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>
                    Value
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={newValue}
                    onChange={e => setNewValue(e.target.value)}
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
                    Currency
                  </label>
                  <select
                    value={newCurrency}
                    onChange={e => setNewCurrency(e.target.value)}
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
                    <option value="USD">USD ($)</option>
                    <option value="INR">INR (₹)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>
                  Stage
                </label>
                <select
                  value={targetStageId ?? ''}
                  onChange={e => setTargetStageId(e.target.value)}
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
                  {stages.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>
                  Associated Contact
                </label>
                <select
                  value={newContactId}
                  onChange={e => setNewContactId(e.target.value)}
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
                  <option value="">None (Unassigned)</option>
                  {contacts.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.company || c.email || c.phone || c.id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>
                  Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={newNotes}
                  onChange={e => setNewNotes(e.target.value)}
                  placeholder="Key deal context or requirements..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
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
                  {saving ? 'Creating...' : 'Create Deal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Deal Modal */}
      {isEditModalOpen && editingDeal && (
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
              maxWidth: 450,
              borderRadius: 16,
              padding: 24,
              boxShadow: '0 20px 50px rgba(0,0,0,0.20)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Pencil size={16} color="var(--crm-primary)" />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--crm-text)' }}>Edit Deal</h3>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleUpdateDeal} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                  Deal Title *
                </label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>
                    Value
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
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
                    Currency
                  </label>
                  <select
                    value={editCurrency}
                    onChange={e => setEditCurrency(e.target.value)}
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
                    <option value="USD">USD ($)</option>
                    <option value="INR">INR (₹)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>
                  Sales Stage
                </label>
                <select
                  value={editStageId}
                  onChange={e => setEditStageId(e.target.value)}
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
                  {stages.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>
                  Associated Contact
                </label>
                <select
                  value={editContactId}
                  onChange={e => setEditContactId(e.target.value)}
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
                  <option value="">None (Unassigned)</option>
                  {contacts.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.company || c.email || c.phone || c.id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  placeholder="Notes, qualification details, requirements..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
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
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
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
                  disabled={updating}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 10,
                    border: 'none',
                    background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)',
                    color: 'white',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    opacity: updating ? 0.7 : 1,
                  }}
                >
                  {updating ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Deal Confirmation Dialog */}
      {isDeleteModalOpen && deletingDeal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1100,
            background: 'rgba(10,16,38,0.45)',
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
              maxWidth: 420,
              borderRadius: 18,
              padding: 24,
              background: 'rgba(255,255,255,0.98)',
              boxShadow: '0 20px 50px rgba(0,0,0,0.22)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'rgba(244,107,114,0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#f46b72',
                }}
              >
                <Trash2 size={18} />
              </div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--crm-text)' }}>Delete Deal</h3>
            </div>
            <p style={{ fontSize: 13, color: 'var(--crm-text-secondary)', lineHeight: 1.5, margin: '0 0 16px' }}>
              Are you sure you want to delete <strong>&ldquo;{deletingDeal.title}&rdquo;</strong> valued at{' '}
              <strong>{fmt(deletingDeal.value, deletingDeal.currency)}</strong>? This action will permanently remove the
              deal from the pipeline.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setDeletingDeal(null);
                }}
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
                type="button"
                disabled={isDeleting}
                onClick={() => void handleConfirmDelete()}
                style={{
                  padding: '8px 20px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#f46b72',
                  color: 'white',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: isDeleting ? 0.7 : 1,
                }}
              >
                {isDeleting ? 'Deleting...' : 'Delete Deal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deal Automation Modal */}
      <DealAutomationModal
        isOpen={isAutomationModalOpen}
        onClose={() => setIsAutomationModalOpen(false)}
        stages={stages}
        contacts={contacts as unknown as ContactRecord[]}
        existingDeals={deals}
        onConfirmCreate={handleConfirmAutomation}
      />
    </div>
  );
}
