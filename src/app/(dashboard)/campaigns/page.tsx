'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Megaphone, Plus, Search, X, CheckCircle2, AlertCircle,
  Smartphone, AtSign, Mail, MessageSquare, Rss,
  BarChart3, Clock, CheckCheck, Send, Trash2, ExternalLink,
  RefreshCw, ShieldCheck, Layers, Globe, Key, Settings2,
  Eye, EyeOff, HelpCircle, Play, Pause, Archive, Edit2,
  Lock, Unlock, SlidersHorizontal,
} from 'lucide-react';
import Link from 'next/link';
import {
  getMetaCampaigns, syncMetaCampaigns, getMetaSyncStatus,
  getMetaCredentials, saveMetaCredentials, testMetaConnection,
  getMetaPermissions, createMetaCampaign, updateMetaCampaign,
  pauseMetaCampaign, resumeMetaCampaign, archiveMetaCampaign,
  getMetaCampaignLiveDetails,
  type MetaCredentialsInfo, type MetaConnectionTestResult,
  type MetaPermissionsInfo, type MetaCampaignLiveDetails,
} from '@/lib/api-client';

interface Campaign {
  id: string;
  name: string;
  status: string;
  platform: string | null;
  created_at: string;
  meta_campaign_id?: string | null;
  objective?: string | null;
  last_synced_at?: string | null;
  start_time?: string | null;
  stop_time?: string | null;
}

interface CampaignCreate {
  name: string;
  platform: string;
  status: string;
}

const STATUS_META: Record<string, { color: string; label: string }> = {
  draft:     { color: '#8790aa', label: 'Draft' },
  active:    { color: '#4d7cff', label: 'Active' },
  paused:    { color: '#f4c95d', label: 'Paused' },
  completed: { color: '#28c99a', label: 'Completed' },
  archived:  { color: '#8790aa', label: 'Archived' },
};

const PLATFORM_META: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  whatsapp:  { color: '#25D366', icon: <Smartphone size={14} />, label: 'WhatsApp' },
  instagram: { color: '#E1306C', icon: <AtSign size={14} />,     label: 'Instagram' },
  facebook:  { color: '#1877F2', icon: <MessageSquare size={14} />, label: 'Facebook / Meta' },
  email:     { color: '#8b5cf6', icon: <Mail size={14} />,        label: 'Email' },
  sms:       { color: '#f4c95d', icon: <Send size={14} />,        label: 'SMS' },
  all:       { color: '#4f6df5', icon: <Rss size={14} />,         label: 'All Channels' },
};

const STATUS_FILTERS = ['all', 'draft', 'active', 'paused', 'completed', 'archived'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

export default function CampaignsPage() {
  // Navigation Tabs: 'crm' = CRM-created campaigns, 'meta' = Meta Ads synced campaigns
  const [activeTab, setActiveTab] = useState<'crm' | 'meta'>('crm');

  // CRM Campaigns State
  const [crmCampaigns, setCrmCampaigns] = useState<Campaign[]>([]);
  const [loadingCrm, setLoadingCrm] = useState(true);

  // Meta Campaigns State
  const [metaCampaigns, setMetaCampaigns] = useState<Campaign[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{
    ad_account_id: string;
    app_id: string;
    api_version: string;
    token_configured: boolean;
    last_sync: any | null;
  } | null>(null);

  // Meta Credentials State & Modal
  const [isCredsModalOpen, setIsCredsModalOpen] = useState(false);
  const [credsInfo, setCredsInfo] = useState<MetaCredentialsInfo | null>(null);
  const [credAdAccount, setCredAdAccount] = useState('act_2505907436503788');
  const [credAppId, setCredAppId] = useState('1354004176287129');
  const [credAccessToken, setCredAccessToken] = useState('');
  const [credApiVersion, setCredApiVersion] = useState('v26.0');
  const [showToken, setShowToken] = useState(false);
  const [testingConn, setTestingConn] = useState(false);
  const [testResult, setTestResult] = useState<MetaConnectionTestResult | null>(null);
  const [savingCreds, setSavingCreds] = useState(false);
  const [credsError, setCredsError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  // Filters & Selection
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selected, setSelected] = useState<Campaign | null>(null);

  // Create modal (CRM Campaigns)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPlatform, setNewPlatform] = useState('whatsapp');
  const [newStatus, setNewStatus] = useState('draft');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const supabase = createClient();

  // Load CRM Campaigns
  const loadCrmCampaigns = useCallback(async () => {
    setLoadingCrm(true);
    try {
      const { data } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      setCrmCampaigns((data as Campaign[]) ?? []);
    } catch {
      setCrmCampaigns([]);
    } finally {
      setLoadingCrm(false);
    }
  }, [supabase]);

  // Load Meta Campaigns
  const loadMetaCampaigns = useCallback(async () => {
    setLoadingMeta(true);
    try {
      const res = await getMetaCampaigns({ limit: '100' });
      if (res?.data) {
        setMetaCampaigns(res.data as Campaign[]);
      }
    } catch {
      // Fallback: direct Supabase query
      const { data } = await supabase
        .from('campaigns')
        .select('*')
        .eq('platform', 'facebook')
        .order('created_at', { ascending: false });
      setMetaCampaigns((data as Campaign[]) ?? []);
    } finally {
      setLoadingMeta(false);
    }
  }, [supabase]);

  // Load Meta Sync Status
  const loadSyncMetadata = useCallback(async () => {
    try {
      const status = await getMetaSyncStatus();
      if (status) setSyncStatus(status);
    } catch {}
  }, []);

  // Load Meta Credentials
  const loadCredentials = useCallback(async () => {
    try {
      const info = await getMetaCredentials();
      if (info) {
        setCredsInfo(info);
        if (info.ad_account_id) setCredAdAccount(info.ad_account_id);
        if (info.app_id) setCredAppId(info.app_id);
        if (info.api_version) setCredApiVersion(info.api_version);
      }
    } catch {}
  }, []);

  // Meta Permissions & Live Management State
  const [permissionsInfo, setPermissionsInfo] = useState<MetaPermissionsInfo | null>(null);
  const [checkingPermissions, setCheckingPermissions] = useState(false);

  // Create Meta Campaign Modal State
  const [isCreateMetaModalOpen, setIsCreateMetaModalOpen] = useState(false);
  const [createMetaName, setCreateMetaName] = useState('');
  const [createMetaObjective, setCreateMetaObjective] = useState('OUTCOME_LEADS');
  const [createMetaStatus, setCreateMetaStatus] = useState<'PAUSED' | 'ACTIVE'>('PAUSED');
  const [createMetaBudget, setCreateMetaBudget] = useState('');
  const [createMetaCategory, setCreateMetaCategory] = useState('NONE');
  const [creatingMeta, setCreatingMeta] = useState(false);
  const [createMetaError, setCreateMetaError] = useState<string | null>(null);

  // Live Action Confirmation Modal (Pause, Resume, Archive)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    action: 'pause' | 'resume' | 'archive';
    campaign: Campaign | null;
    loading: boolean;
  } | null>(null);

  // Edit Meta Campaign Modal
  const [editModal, setEditModal] = useState<{
    isOpen: boolean;
    campaign: Campaign | null;
    name: string;
    budget: string;
    saving: boolean;
    error: string | null;
  } | null>(null);

  // Live Meta Insights for Drawer
  const [liveDetails, setLiveDetails] = useState<MetaCampaignLiveDetails | null>(null);
  const [loadingLiveDetails, setLoadingLiveDetails] = useState(false);

  // Load Meta Permissions
  const loadPermissions = useCallback(async () => {
    setCheckingPermissions(true);
    try {
      const res = await getMetaPermissions();
      if (res) setPermissionsInfo(res);
    } catch {}
    finally {
      setCheckingPermissions(false);
    }
  }, []);

  useEffect(() => {
    void loadCrmCampaigns();
    void loadMetaCampaigns();
    void loadSyncMetadata();
    void loadCredentials();
    void loadPermissions();
  }, [loadCrmCampaigns, loadMetaCampaigns, loadSyncMetadata, loadCredentials, loadPermissions]);

  // Load live details whenever a Meta campaign is selected
  useEffect(() => {
    if (selected && (selected.meta_campaign_id || selected.platform === 'facebook')) {
      const metaId = selected.meta_campaign_id || selected.id;
      if (metaId) {
        setLoadingLiveDetails(true);
        setLiveDetails(null);
        getMetaCampaignLiveDetails(metaId)
          .then(det => {
            setLiveDetails(det);
            if (det?.meta_campaign_id && (!selected.meta_campaign_id || selected.meta_campaign_id !== det.meta_campaign_id)) {
              setSelected(prev => prev ? { ...prev, meta_campaign_id: det.meta_campaign_id, objective: det.objective || prev.objective } : null);
              setMetaCampaigns(prev => prev.map(c => c.id === selected.id ? { ...c, meta_campaign_id: det.meta_campaign_id, objective: det.objective || c.objective } : c));
            }
          })
          .catch(() => setLiveDetails(null))
          .finally(() => setLoadingLiveDetails(false));
      }
    } else {
      setLiveDetails(null);
    }
  }, [selected]);

  // Handle Create Meta Campaign
  const handleCreateMetaCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createMetaName.trim()) {
      setCreateMetaError('Campaign name is required.');
      return;
    }
    setCreatingMeta(true);
    setCreateMetaError(null);
    try {
      const budgetNum = createMetaBudget ? parseFloat(createMetaBudget) : undefined;
      const res = await createMetaCampaign({
        name: createMetaName.trim(),
        objective: createMetaObjective,
        status: createMetaStatus,
        daily_budget: budgetNum,
        special_ad_categories: [createMetaCategory],
      });
      setIsCreateMetaModalOpen(false);
      setCreateMetaName('');
      setCreateMetaBudget('');
      setBanner({
        type: 'success',
        text: `Meta campaign "${res.name}" created successfully (ID: ${res.meta_campaign_id}). Initial status: ${res.status.toUpperCase()}.`,
      });
      setTimeout(() => setBanner(null), 5000);
      await loadMetaCampaigns();
      await loadSyncMetadata();
    } catch (err: any) {
      setCreateMetaError(err?.message || 'Failed to create Meta campaign.');
    } finally {
      setCreatingMeta(false);
    }
  };

  // Handle Live Mutation Actions (Pause, Resume, Archive)
  const handleExecuteLiveAction = async () => {
    if (!confirmModal || !confirmModal.campaign) return;
    const metaId = confirmModal.campaign.meta_campaign_id || confirmModal.campaign.id;
    if (!metaId) return;
    const { action, campaign } = confirmModal;
    setConfirmModal(prev => prev ? { ...prev, loading: true } : null);
    try {
      if (action === 'pause') {
        await pauseMetaCampaign(metaId);
        setBanner({ type: 'success', text: `Meta campaign "${campaign.name}" paused on live ad account.` });
      } else if (action === 'resume') {
        await resumeMetaCampaign(metaId);
        setBanner({ type: 'success', text: `Meta campaign "${campaign.name}" resumed on live ad account.` });
      } else if (action === 'archive') {
        await archiveMetaCampaign(metaId);
        setBanner({ type: 'success', text: `Meta campaign "${campaign.name}" archived on live ad account.` });
      }
      setConfirmModal(null);
      setTimeout(() => setBanner(null), 5000);
      await loadMetaCampaigns();
      await loadSyncMetadata();
      if (selected && (selected.meta_campaign_id === metaId || selected.id === metaId)) {
        getMetaCampaignLiveDetails(metaId).then(det => setLiveDetails(det)).catch(() => {});
      }
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message || `Failed to ${action} Meta campaign.` });
      setConfirmModal(prev => prev ? { ...prev, loading: false } : null);
    }
  };

  // Handle Save Edit Meta Campaign
  const handleSaveEditMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal || !editModal.campaign) return;
    const metaId = editModal.campaign.meta_campaign_id || editModal.campaign.id;
    if (!metaId) return;
    setEditModal(prev => prev ? { ...prev, saving: true, error: null } : null);
    try {
      const budgetNum = editModal.budget ? parseFloat(editModal.budget) : undefined;
      await updateMetaCampaign(metaId, {
        name: editModal.name.trim(),
        daily_budget: budgetNum,
      });
      setEditModal(null);
      setBanner({ type: 'success', text: `Meta campaign updated successfully.` });
      setTimeout(() => setBanner(null), 4000);
      await loadMetaCampaigns();
      if (selected && (selected.meta_campaign_id === metaId || selected.id === metaId)) {
        getMetaCampaignLiveDetails(metaId).then(det => setLiveDetails(det)).catch(() => {});
      }
    } catch (err: any) {
      setEditModal(prev => prev ? { ...prev, saving: false, error: err?.message || 'Update failed' } : null);
    }
  };

  // Handle Testing Meta Connection
  const handleTestConnection = async () => {
    setTestingConn(true);
    setTestResult(null);
    setCredsError(null);
    try {
      const res = await testMetaConnection({
        ad_account_id: credAdAccount.trim(),
        access_token: credAccessToken.trim() || undefined,
        api_version: credApiVersion.trim() || undefined,
      });
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err?.message || 'Failed to connect to Meta Graph API.',
        hint: 'Please check your internet connection and verify access token.',
      });
    } finally {
      setTestingConn(false);
    }
  };

  // Handle Saving Meta Credentials
  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCreds(true);
    setCredsError(null);
    try {
      await saveMetaCredentials({
        ad_account_id: credAdAccount.trim(),
        app_id: credAppId.trim(),
        access_token: credAccessToken.trim() || undefined,
        api_version: credApiVersion.trim(),
      });
      setIsCredsModalOpen(false);
      setCredAccessToken('');
      setBanner({
        type: 'success',
        text: 'Meta Ads connection credentials saved and activated successfully!',
      });
      setTimeout(() => setBanner(null), 4000);
      await loadCredentials();
      await loadSyncMetadata();
      await loadMetaCampaigns();
    } catch (err: any) {
      setCredsError(err?.message || 'Failed to save Meta credentials.');
    } finally {
      setSavingCreds(false);
    }
  };

  // Trigger manual synchronization with Meta Marketing API
  const handleSyncMeta = async () => {
    setSyncing(true);
    setBanner(null);
    try {
      const res = await syncMetaCampaigns();
      setBanner({
        type: 'success',
        text: `Synced ${res.fetched_count} campaigns from Meta Ads (${res.created_count} added, ${res.updated_count} updated).`
      });
      await loadMetaCampaigns();
      await loadSyncMetadata();
      await loadCrmCampaigns();
    } catch (err: any) {
      setBanner({
        type: 'error',
        text: err?.message || 'Failed to sync with Meta Ads. Please verify META_ACCESS_TOKEN in backend/.env.'
      });
    } finally {
      setSyncing(false);
    }
  };

  // Switch displayed campaigns according to active tab
  const activeList = activeTab === 'crm' ? crmCampaigns : metaCampaigns;
  const activeLoading = activeTab === 'crm' ? loadingCrm : loadingMeta;

  const filtered = activeList.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const nameMatch = c.name.toLowerCase().includes(term);
    const idMatch = c.meta_campaign_id ? c.meta_campaign_id.toLowerCase().includes(term) : false;
    const objMatch = c.objective ? c.objective.toLowerCase().includes(term) : false;
    return nameMatch || idMatch || objMatch;
  });

  // Handle CRM campaign creation
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!newName.trim()) { setFormError('Campaign name is required.'); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles').select('account_id').eq('user_id', user?.id ?? '').maybeSingle();

      const payload: CampaignCreate & { account_id?: string } = {
        name: newName.trim(),
        platform: newPlatform,
        status: newStatus,
      };
      if (profile?.account_id) payload.account_id = profile.account_id;

      const { data, error } = await supabase.from('campaigns').insert(payload).select('*').single();
      if (error) { setFormError(error.message); return; }
      setCrmCampaigns(prev => [data as Campaign, ...prev]);
      setIsModalOpen(false);
      setNewName(''); setNewPlatform('whatsapp'); setNewStatus('draft');
      setBanner({ type: 'success', text: `Campaign "${(data as Campaign).name}" created.` });
      setTimeout(() => setBanner(null), 3000);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create campaign.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete campaign "${name}"?`)) return;
    await supabase.from('campaigns').delete().eq('id', id);
    setCrmCampaigns(prev => prev.filter(c => c.id !== id));
    setMetaCampaigns(prev => prev.filter(c => c.id !== id));
    if (selected?.id === id) setSelected(null);
    setBanner({ type: 'success', text: `Campaign "${name}" deleted.` });
    setTimeout(() => setBanner(null), 3000);
  };

  const handleStatusChange = async (id: string, status: string) => {
    setCrmCampaigns(prev => prev.map(c => c.id === id ? { ...c, status } : c));
    setMetaCampaigns(prev => prev.map(c => c.id === id ? { ...c, status } : c));
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status } : null);
    await supabase.from('campaigns').update({ status }).eq('id', id);
  };

  // KPI counts
  const totalCount = activeList.length;
  const activeCount = activeList.filter(c => c.status === 'active').length;
  const pausedCount = activeList.filter(c => c.status === 'paused').length;
  const draftCount = activeList.filter(c => c.status === 'draft').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Banner */}
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
          <button onClick={() => setBanner(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}><X size={14} /></button>
        </div>
      )}

      {/* Header */}
      <div className="crm-page-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Campaigns</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crm-text-secondary)' }}>
            Manage CRM marketing broadcasts and synchronized Meta Ads campaigns
          </p>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {activeTab === 'meta' && (
            <>
              <button
                onClick={() => {
                  setIsCreateMetaModalOpen(true);
                  setCreateMetaError(null);
                  setCreateMetaName('');
                  setCreateMetaBudget('');
                  setCreateMetaObjective('OUTCOME_LEADS');
                  setCreateMetaStatus('PAUSED');
                  setCreateMetaCategory('NONE');
                }}
                disabled={!permissionsInfo?.can_manage}
                title={!permissionsInfo?.can_manage ? (permissionsInfo?.has_ads_read ? 'Requires ads_management permission to create live campaigns' : 'Requires Meta connection') : 'Create campaign directly on Meta'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 12,
                  background: permissionsInfo?.can_manage ? 'linear-gradient(135deg,#1877F2,#4f6df5)' : 'rgba(130,145,190,0.25)',
                  border: 'none', color: 'white', fontSize: 13, fontWeight: 600,
                  cursor: permissionsInfo?.can_manage ? 'pointer' : 'not-allowed',
                  boxShadow: permissionsInfo?.can_manage ? '0 4px 14px rgba(24,119,242,0.25)' : 'none',
                  opacity: permissionsInfo?.can_manage ? 1 : 0.6,
                }}
              >
                <Plus size={14} /> New Meta Campaign
              </button>

              <button
                onClick={() => { setIsCredsModalOpen(true); void loadCredentials(); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(24,119,242,0.35)', color: '#1877F2',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(24,119,242,0.08)',
                }}
              >
                <Key size={14} />
                <span>Connect Credentials</span>
                {syncStatus?.token_configured ? (
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} title="Token Configured" />
                ) : (
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: 'rgba(245,158,11,0.20)', color: '#d97706', fontWeight: 700 }}>
                    Setup Required
                  </span>
                )}
              </button>

              <button
                onClick={handleSyncMeta}
                disabled={syncing}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 12,
                  background: 'linear-gradient(135deg,#1877F2,#4f6df5)', border: 'none', color: 'white',
                  fontSize: 13, fontWeight: 600, cursor: syncing ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 14px rgba(24,119,242,0.25)', opacity: syncing ? 0.75 : 1,
                }}
              >
                <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
            </>
          )}

          {activeTab === 'crm' && (
            <button
              onClick={() => { setIsModalOpen(true); setFormError(null); setNewName(''); setNewPlatform('whatsapp'); setNewStatus('draft'); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 12, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 14px rgba(79,109,245,0.25)' }}
            >
              <Plus size={14} /> New Campaign
            </button>
          )}
        </div>
      </div>

      {/* Module Tabs: CRM vs Meta Campaigns */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid rgba(130,145,190,0.18)', paddingBottom: 10 }}>
        <button
          onClick={() => { setActiveTab('crm'); setSelected(null); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 12, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 700,
            background: activeTab === 'crm' ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(255,255,255,0.60)',
            color: activeTab === 'crm' ? '#fff' : 'var(--crm-text-secondary)',
            boxShadow: activeTab === 'crm' ? '0 4px 14px rgba(79,109,245,0.25)' : 'none',
            transition: 'all 150ms ease',
          }}
        >
          <Megaphone size={15} /> CRM Campaigns ({crmCampaigns.length})
        </button>
        <button
          onClick={() => { setActiveTab('meta'); setSelected(null); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 12, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 700,
            background: activeTab === 'meta' ? 'linear-gradient(135deg,#1877F2,#4f6df5)' : 'rgba(255,255,255,0.60)',
            color: activeTab === 'meta' ? '#fff' : 'var(--crm-text-secondary)',
            boxShadow: activeTab === 'meta' ? '0 4px 14px rgba(24,119,242,0.25)' : 'none',
            transition: 'all 150ms ease',
          }}
        >
          <MessageSquare size={15} /> Meta Campaigns ({metaCampaigns.length})
        </button>
      </div>

      {/* Meta Observability & Status Bar (Only visible in Meta Tab) */}
      {activeTab === 'meta' && (
        <div className="crm-glass-soft" style={{
          padding: '12px 18px', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 12, border: '1px solid rgba(24,119,242,0.25)', background: 'rgba(24,119,242,0.05)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--crm-text)' }}>
              <ShieldCheck size={15} color="#1877F2" />
              <strong>Account:</strong> <code>{syncStatus?.ad_account_id || 'act_2505907436503788'}</code>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--crm-text)' }}>
              <Globe size={15} color="#1877F2" />
              <strong>App:</strong> TZmicha (Marketing) <code>(1354004176287129)</code>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--crm-text)' }}>
              <Layers size={15} color="#1877F2" />
              <strong>API:</strong> {syncStatus?.api_version || 'v26.0'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--crm-text)' }}>
              <Lock size={14} color={permissionsInfo?.can_manage ? '#10b981' : '#f59e0b'} />
              <strong>Scope:</strong>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                background: permissionsInfo?.can_manage ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                color: permissionsInfo?.can_manage ? '#10b981' : '#d97706',
              }}>
                {permissionsInfo?.can_manage ? 'ads_management (Full Control)' : permissionsInfo?.has_ads_read ? 'ads_read (Read-Only)' : 'No Permissions'}
              </span>
              <button
                onClick={() => void loadPermissions()}
                disabled={checkingPermissions}
                style={{
                  background: 'none', border: 'none', cursor: checkingPermissions ? 'not-allowed' : 'pointer',
                  color: '#1877F2', padding: 2, display: 'flex', alignItems: 'center'
                }}
                title="Re-verify permissions against Meta Graph API"
              >
                <RefreshCw size={11} className={checkingPermissions ? 'animate-spin' : ''} />
              </button>
            </div>
            <button
              onClick={() => { setIsCredsModalOpen(true); void loadCredentials(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8,
                background: 'rgba(24,119,242,0.12)', border: '1px solid rgba(24,119,242,0.25)',
                color: '#1877F2', fontSize: 11, fontWeight: 700, cursor: 'pointer'
              }}
            >
              <Settings2 size={12} /> Configure
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--crm-text-muted)' }}>
            <span>Last Synced: {syncStatus?.last_sync?.created_at ? new Date(syncStatus.last_sync.created_at).toLocaleTimeString() : 'Ready to sync'}</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
              background: syncStatus?.last_sync?.status === 'success' ? '#10b98120' : '#8790aa20',
              color: syncStatus?.last_sync?.status === 'success' ? '#10b981' : '#8790aa',
            }}>
              {syncStatus?.last_sync?.status ? syncStatus.last_sync.status.toUpperCase() : 'IDLE'}
            </span>
          </div>
        </div>
      )}

      {/* Meta Token Missing Alert Banner */}
      {activeTab === 'meta' && syncStatus && !syncStatus.token_configured && (
        <div className="crm-glass-soft" style={{
          padding: '14px 18px', borderRadius: 14, background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.28)', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 14, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <AlertCircle size={20} color="#d97706" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#b45309' }}>
                Meta Ads Access Token Not Configured
              </div>
              <div style={{ fontSize: 12, color: 'var(--crm-text-secondary)', marginTop: 2 }}>
                To synchronize live campaigns for Ad Account <code>{syncStatus?.ad_account_id || 'act_2505907436503788'}</code>, connect a System User Token with <code>ads_read</code> permission.
              </div>
            </div>
          </div>
          <button
            onClick={() => { setIsCredsModalOpen(true); void loadCredentials(); }}
            style={{
              padding: '8px 16px', borderRadius: 10, background: '#1877F2', border: 'none',
              color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 4px 12px rgba(24,119,242,0.25)',
            }}
          >
            <Key size={13} /> Connect Meta Credentials
          </button>
        </div>
      )}


      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
        {[
          { label: activeTab === 'crm' ? 'Total CRM Campaigns' : 'Total Meta Campaigns', value: totalCount, color: '#4f6df5', icon: <Megaphone size={16} /> },
          { label: 'Active Ads', value: activeCount, color: '#28c99a', icon: <Send size={16} /> },
          { label: 'Paused Ads', value: pausedCount, color: '#f4c95d', icon: <Clock size={16} /> },
          { label: activeTab === 'crm' ? 'Drafts' : 'Lead Gen / Other', value: draftCount, color: '#8790aa', icon: <CheckCheck size={16} /> },
        ].map(k => (
          <div key={k.label} className="crm-glass-soft" style={{ padding: '12px 16px', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${k.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: k.color, flexShrink: 0 }}>{k.icon}</div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 750, color: 'var(--crm-text)', lineHeight: 1 }}>{k.value}</div>
              <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 2 }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Search + Filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(130,145,190,0.22)', borderRadius: 12, padding: '7px 12px', minWidth: 260 }}>
          <Search size={14} color="var(--crm-text-muted)" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder={activeTab === 'crm' ? 'Search campaigns...' : 'Search Meta campaigns, IDs, or objectives...'}
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 13, color: 'var(--crm-text)' }}
          />
          {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}><X size={13} color="var(--crm-text-muted)" /></button>}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {STATUS_FILTERS.map(f => (
            <button key={f} onClick={() => setStatusFilter(f)} style={{
              padding: '6px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, textTransform: 'capitalize',
              background: statusFilter === f ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(255,255,255,0.55)',
              color: statusFilter === f ? 'white' : 'var(--crm-text-secondary)',
            }}>{f}</button>
          ))}
        </div>
      </div>

      {/* Main layout: list + detail */}
      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 380px' : '1fr', gap: 12 }}>

        {/* Campaign List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {activeLoading ? (
            <div className="crm-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--crm-text-muted)' }}>
              Loading {activeTab === 'crm' ? 'CRM' : 'Meta'} campaigns...
            </div>
          ) : filtered.length === 0 ? (
            <div className="crm-glass" style={{ padding: 48, textAlign: 'center', color: 'var(--crm-text-muted)' }}>
              <Megaphone size={36} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
              <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>
                {search || statusFilter !== 'all' ? 'No campaigns match your filters' : activeTab === 'crm' ? 'No CRM campaigns yet' : 'No Meta campaigns synchronized yet'}
              </p>
              {!search && statusFilter === 'all' && (
                activeTab === 'crm' ? (
                  <button
                    onClick={() => setIsModalOpen(true)}
                    style={{ padding: '8px 18px', borderRadius: 10, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Create First Campaign
                  </button>
                ) : (
                  <button
                    onClick={handleSyncMeta}
                    disabled={syncing}
                    style={{ padding: '8px 18px', borderRadius: 10, background: 'linear-gradient(135deg,#1877F2,#4f6df5)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: syncing ? 'not-allowed' : 'pointer' }}
                  >
                    Sync Meta Campaigns Now
                  </button>
                )
              )}
            </div>
          ) : filtered.map(c => {
            const sm = STATUS_META[c.status] ?? STATUS_META.draft;
            const pm = PLATFORM_META[c.platform ?? 'all'] ?? PLATFORM_META.all;
            const isSelected = selected?.id === c.id;
            const isMetaSourced = Boolean(c.meta_campaign_id || c.platform === 'facebook');

            return (
              <div
                key={c.id}
                onClick={() => setSelected(isSelected ? null : c)}
                className="crm-glass-soft"
                style={{
                  padding: '14px 18px', borderRadius: 14, cursor: 'pointer',
                  border: isSelected ? '1.5px solid rgba(79,109,245,0.40)' : '1px solid rgba(130,145,190,0.14)',
                  transition: 'all 120ms ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: `${pm.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: pm.color, flexShrink: 0 }}>
                    {pm.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--crm-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                      {isMetaSourced && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 5, background: 'rgba(24,119,242,0.12)', color: '#1877F2' }}>
                          META ADS
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span>{pm.label}</span>
                      {(c.meta_campaign_id || (activeTab === 'meta' && c.id)) && (
                        <span>· ID: <code>{c.meta_campaign_id || c.id}</code></span>
                      )}
                      {c.objective && <span>· Obj: {c.objective}</span>}
                      <span>· {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: sm.color, background: `${sm.color}15`, borderRadius: 8, padding: '3px 8px' }}>
                      {sm.label}
                    </span>
                    {activeTab === 'meta' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={e => e.stopPropagation()}>
                        {c.status === 'active' ? (
                          <button
                            onClick={() => setConfirmModal({ isOpen: true, action: 'pause', campaign: c, loading: false })}
                            disabled={!permissionsInfo?.can_manage}
                            title={permissionsInfo?.can_manage ? "Pause campaign on Meta" : "Requires ads_management permission"}
                            style={{
                              background: 'rgba(244,201,93,0.15)', border: '1px solid rgba(244,201,93,0.30)',
                              cursor: permissionsInfo?.can_manage ? 'pointer' : 'not-allowed',
                              color: '#d97706', padding: '4px 7px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 3,
                              fontSize: 11, fontWeight: 600, opacity: permissionsInfo?.can_manage ? 1 : 0.5,
                            }}
                          >
                            <Pause size={12} /> Pause
                          </button>
                        ) : c.status === 'paused' ? (
                          <button
                            onClick={() => setConfirmModal({ isOpen: true, action: 'resume', campaign: c, loading: false })}
                            disabled={!permissionsInfo?.can_manage}
                            title={permissionsInfo?.can_manage ? "Resume campaign on Meta" : "Requires ads_management permission"}
                            style={{
                              background: 'rgba(40,201,154,0.15)', border: '1px solid rgba(40,201,154,0.30)',
                              cursor: permissionsInfo?.can_manage ? 'pointer' : 'not-allowed',
                              color: '#10b981', padding: '4px 7px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 3,
                              fontSize: 11, fontWeight: 600, opacity: permissionsInfo?.can_manage ? 1 : 0.5,
                            }}
                          >
                            <Play size={12} /> Resume
                          </button>
                        ) : null}

                        <button
                          onClick={() => setEditModal({ isOpen: true, campaign: c, name: c.name, budget: '', saving: false, error: null })}
                          disabled={!permissionsInfo?.can_manage}
                          title={permissionsInfo?.can_manage ? "Edit campaign on Meta" : "Requires ads_management permission"}
                          style={{
                            background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(130,145,190,0.25)',
                            cursor: permissionsInfo?.can_manage ? 'pointer' : 'not-allowed',
                            color: 'var(--crm-text-secondary)', padding: '4px 6px', borderRadius: 6, display: 'flex', alignItems: 'center',
                            opacity: permissionsInfo?.can_manage ? 1 : 0.5,
                          }}
                        >
                          <Edit2 size={12} />
                        </button>

                        {c.status !== 'archived' && (
                          <button
                            onClick={() => setConfirmModal({ isOpen: true, action: 'archive', campaign: c, loading: false })}
                            disabled={!permissionsInfo?.can_manage}
                            title={permissionsInfo?.can_manage ? "Archive campaign on Meta" : "Requires ads_management permission"}
                            style={{
                              background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(130,145,190,0.25)',
                              cursor: permissionsInfo?.can_manage ? 'pointer' : 'not-allowed',
                              color: 'var(--crm-text-muted)', padding: '4px 6px', borderRadius: 6, display: 'flex', alignItems: 'center',
                              opacity: permissionsInfo?.can_manage ? 1 : 0.5,
                            }}
                          >
                            <Archive size={12} />
                          </button>
                        )}
                      </div>
                    )}
                    {activeTab === 'crm' && (
                      <button
                        onClick={e => { e.stopPropagation(); void handleDelete(c.id, c.name); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail Panel */}
        {selected && (() => {
          const sm = STATUS_META[selected.status] ?? STATUS_META.draft;
          const pm = PLATFORM_META[selected.platform ?? 'all'] ?? PLATFORM_META.all;
          const isMeta = Boolean(selected.meta_campaign_id || selected.platform === 'facebook');

          return (
            <div className="crm-glass" style={{ padding: '20px', borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 16, alignSelf: 'start', position: 'sticky', top: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text)' }}>
                  {isMeta ? 'Meta Campaign Details' : 'Campaign Details'}
                </div>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}><X size={16} /></button>
              </div>

              {/* Meta Management Active Banner */}
              {isMeta && permissionsInfo?.can_manage && (
                <div style={{
                  padding: '8px 12px', borderRadius: 10,
                  background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
                  fontSize: 11, color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Unlock size={13} /> Full Management Active (ads_management)
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--crm-text-muted)' }}>Live Control</span>
                </div>
              )}
              {isMeta && !permissionsInfo?.can_manage && (
                <div style={{
                  padding: '8px 12px', borderRadius: 10,
                  background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
                  fontSize: 11, color: '#d97706', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Lock size={13} /> Read-Only Mode (ads_read)
                  </span>
                  <span style={{ fontSize: 10 }}>Requires ads_management</span>
                </div>
              )}

              {/* Icon + name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: `${pm.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: pm.color, flexShrink: 0 }}>
                  {pm.icon}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--crm-text)' }}>{selected.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', marginTop: 2 }}>{pm.label}</div>
                </div>
              </div>

              {/* Status badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: sm.color, background: `${sm.color}15`, borderRadius: 8, padding: '4px 10px' }}>{sm.label}</span>
                <span style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>
                  Created {new Date(selected.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>

              {/* Meta Specific Metadata */}
              {isMeta && (
                <div style={{ background: 'rgba(130,145,190,0.06)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase' }}>Meta Metadata</div>
                  <div style={{ fontSize: 12, color: 'var(--crm-text)' }}>
                    <strong>Meta Campaign ID:</strong> <code style={{ fontSize: 11 }}>{selected.meta_campaign_id || selected.id}</code>
                  </div>
                  {selected.objective && (
                    <div style={{ fontSize: 12, color: 'var(--crm-text)' }}>
                      <strong>Objective:</strong> {selected.objective}
                    </div>
                  )}
                  {liveDetails?.daily_budget && (
                    <div style={{ fontSize: 12, color: 'var(--crm-text)' }}>
                      <strong>Daily Budget:</strong> ${ (Number(liveDetails.daily_budget) / 100).toFixed(2) } USD
                    </div>
                  )}
                  {selected.last_synced_at && (
                    <div style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>
                      Last Synced: {new Date(selected.last_synced_at).toLocaleString()}
                    </div>
                  )}
                </div>
              )}

              {/* Change status (only for CRM campaigns) */}
              {!isMeta && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Change Status</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {Object.entries(STATUS_META).map(([key, meta]) => (
                      <button
                        key={key}
                        onClick={() => void handleStatusChange(selected.id, key)}
                        style={{
                          padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                          background: selected.status === key ? `${meta.color}20` : 'rgba(255,255,255,0.55)',
                          color: selected.status === key ? meta.color : 'var(--crm-text-secondary)',
                          outline: selected.status === key ? `1.5px solid ${meta.color}` : 'none',
                        }}
                      >{meta.label}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* Performance / Attribution */}
              <div style={{ background: 'rgba(130,145,190,0.06)', borderRadius: 12, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase' }}>
                    {isMeta ? 'Live Meta Insights' : 'Performance & Attribution'}
                  </div>
                  {isMeta && loadingLiveDetails && (
                    <span style={{ fontSize: 10, color: '#1877F2', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <RefreshCw size={10} className="animate-spin" /> Live Syncing...
                    </span>
                  )}
                </div>

                {isMeta ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {[
                        { label: 'Impressions', value: liveDetails?.insights?.impressions !== undefined ? Number(liveDetails.insights.impressions).toLocaleString() : (loadingLiveDetails ? '...' : '—') },
                        { label: 'Total Spend', value: liveDetails?.insights?.spend !== undefined ? `$${Number(liveDetails.insights.spend).toFixed(2)}` : (loadingLiveDetails ? '...' : '$0.00') },
                        { label: 'Clicks', value: liveDetails?.insights?.clicks !== undefined ? Number(liveDetails.insights.clicks).toLocaleString() : (loadingLiveDetails ? '...' : '—') },
                        { label: 'CPC', value: liveDetails?.insights?.cpc !== undefined && Number(liveDetails.insights.cpc) > 0 ? `$${Number(liveDetails.insights.cpc).toFixed(2)}` : (loadingLiveDetails ? '...' : '—') },
                      ].map(s => (
                        <div key={s.label} style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.50)', borderRadius: 8, textAlign: 'center' }}>
                          <div style={{ fontSize: 16, fontWeight: 750, color: 'var(--crm-text)' }}>{s.value}</div>
                          <div style={{ fontSize: 10, color: 'var(--crm-text-muted)', marginTop: 2 }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                    {isMeta && !loadingLiveDetails && !liveDetails && (
                      <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', textAlign: 'center', marginTop: 8 }}>
                        Configure your valid Meta access token in &quot;Connect Credentials&quot; to fetch live insights.
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[
                      { label: 'Attributed Leads', value: '0' },
                      { label: 'Qualified', value: '0' },
                      { label: 'Deals Won', value: '0' },
                      { label: 'Attributed Rev', value: '$0' },
                    ].map(s => (
                      <div key={s.label} style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.50)', borderRadius: 8, textAlign: 'center' }}>
                        <div style={{ fontSize: 16, fontWeight: 750, color: 'var(--crm-text)' }}>{s.value}</div>
                        <div style={{ fontSize: 10, color: 'var(--crm-text-muted)', marginTop: 2 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {isMeta ? (
                  <>
                    {/* Live Pause / Resume Action */}
                    {selected.status === 'active' ? (
                      <button
                        onClick={() => setConfirmModal({ isOpen: true, action: 'pause', campaign: selected, loading: false })}
                        disabled={!permissionsInfo?.can_manage}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          padding: '9px', borderRadius: 10, background: 'rgba(244,201,93,0.18)', border: '1px solid rgba(244,201,93,0.35)',
                          color: '#d97706', fontSize: 13, fontWeight: 600, cursor: permissionsInfo?.can_manage ? 'pointer' : 'not-allowed',
                          opacity: permissionsInfo?.can_manage ? 1 : 0.6,
                        }}
                      >
                        <Pause size={14} /> Pause Campaign on Meta
                      </button>
                    ) : selected.status === 'paused' ? (
                      <button
                        onClick={() => setConfirmModal({ isOpen: true, action: 'resume', campaign: selected, loading: false })}
                        disabled={!permissionsInfo?.can_manage}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          padding: '9px', borderRadius: 10, background: 'rgba(40,201,154,0.18)', border: '1px solid rgba(40,201,154,0.35)',
                          color: '#10b981', fontSize: 13, fontWeight: 600, cursor: permissionsInfo?.can_manage ? 'pointer' : 'not-allowed',
                          opacity: permissionsInfo?.can_manage ? 1 : 0.6,
                        }}
                      >
                        <Play size={14} /> Resume Campaign on Meta
                      </button>
                    ) : null}

                    {/* Edit Campaign */}
                    <button
                      onClick={() => setEditModal({
                        isOpen: true,
                        campaign: selected,
                        name: selected.name,
                        budget: liveDetails?.daily_budget ? Number(liveDetails.daily_budget).toFixed(2) : '',
                        saving: false,
                        error: null
                      })}
                      disabled={!permissionsInfo?.can_manage}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        padding: '9px', borderRadius: 10, background: 'rgba(244,201,93,0.10)', border: '1px solid rgba(24,119,242,0.25)',
                        color: '#1877F2', fontSize: 13, fontWeight: 600, cursor: permissionsInfo?.can_manage ? 'pointer' : 'not-allowed',
                        opacity: permissionsInfo?.can_manage ? 1 : 0.6,
                      }}
                    >
                      <Edit2 size={14} /> Edit Campaign
                    </button>

                    {/* Archive Campaign */}
                    {selected.status !== 'archived' && (
                      <button
                        onClick={() => setConfirmModal({ isOpen: true, action: 'archive', campaign: selected, loading: false })}
                        disabled={!permissionsInfo?.can_manage}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          padding: '8px', borderRadius: 10, background: 'none', border: '1px solid rgba(244,107,114,0.30)',
                          color: '#f46b72', fontSize: 12, fontWeight: 600, cursor: permissionsInfo?.can_manage ? 'pointer' : 'not-allowed',
                          opacity: permissionsInfo?.can_manage ? 1 : 0.6,
                        }}
                      >
                        <Archive size={13} /> Archive Campaign on Meta
                      </button>
                    )}

                    {/* External Link to Meta Ads Manager */}
                    <a
                      href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${(syncStatus?.ad_account_id || '2505907436503788').replace('act_', '')}&selected_campaign_ids=${selected.meta_campaign_id || selected.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        padding: '8px', borderRadius: 10, background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(130,145,190,0.25)',
                        color: 'var(--crm-text-secondary)', textDecoration: 'none', fontSize: 12, fontWeight: 600,
                      }}
                    >
                      <ExternalLink size={13} /> View in Meta Ads Manager
                    </a>
                  </>
                ) : (
                  <Link
                    href="/content-studio"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', borderRadius: 10, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}
                  >
                    <BarChart3 size={14} /> Open in Content Studio
                  </Link>
                )}
              </div>

            </div>
          );
        })()}

      </div>

      {/* New Campaign Modal (CRM Campaigns) */}
      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.40)', backdropFilter: 'blur(6px)' }}>
          <div className="crm-glass-strong" style={{ width: '100%', maxWidth: 440, borderRadius: 20, padding: 28, boxShadow: '0 20px 40px rgba(0,0,0,0.20)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--crm-text)' }}>New Campaign</div>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}><X size={18} /></button>
            </div>

            {formError && (
              <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(244,107,114,0.12)', border: '1px solid rgba(244,107,114,0.30)', color: '#f46b72', fontSize: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={14} /> {formError}
              </div>
            )}

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 6 }}>Campaign Name *</label>
                <input
                  type="text" required placeholder="e.g. Summer Sale WhatsApp Blast"
                  value={newName} onChange={e => setNewName(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.30)', background: 'rgba(255,255,255,0.70)', fontSize: 13, outline: 'none', color: 'var(--crm-text)', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 6 }}>Platform</label>
                  <select
                    value={newPlatform} onChange={e => setNewPlatform(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.30)', background: 'rgba(255,255,255,0.70)', fontSize: 13, outline: 'none', color: 'var(--crm-text)' }}
                  >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="instagram">Instagram</option>
                    <option value="facebook">Facebook</option>
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                    <option value="all">All Channels</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 6 }}>Status</label>
                  <select
                    value={newStatus} onChange={e => setNewStatus(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.30)', background: 'rgba(255,255,255,0.70)', fontSize: 13, outline: 'none', color: 'var(--crm-text)' }}
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>

              <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(79,109,245,0.06)', border: '1px solid rgba(79,109,245,0.15)', fontSize: 12, color: 'var(--crm-text-secondary)' }}>
                💡 After creating, go to <strong>Content Studio</strong> to generate AI content for this campaign.
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
                <button
                  type="button" onClick={() => setIsModalOpen(false)}
                  style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.30)', background: 'rgba(255,255,255,0.60)', color: 'var(--crm-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit" disabled={saving}
                  style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', boxShadow: '0 4px 14px rgba(79,109,245,0.30)' }}
                >
                  {saving ? 'Creating...' : 'Create Campaign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Meta Credentials & Connection Modal */}
      {isCredsModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(8px)', padding: 16 }}>
          <div className="crm-glass-strong" style={{ width: '100%', maxWidth: 520, borderRadius: 24, padding: 28, boxShadow: '0 24px 48px rgba(0,0,0,0.25)', maxHeight: '90vh', overflowY: 'auto' }}>
            
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg, #1877F2, #4f6df5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0 }}>
                  <Key size={20} />
                </div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 750, color: 'var(--crm-text)' }}>Meta Ads Connection</div>
                  <div style={{ fontSize: 12, color: 'var(--crm-text-secondary)', marginTop: 2 }}>Configure Meta Marketing API credentials</div>
                </div>
              </div>
              <button onClick={() => { setIsCredsModalOpen(false); setTestResult(null); setCredsError(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}><X size={18} /></button>
            </div>

            {/* Current Status Pill */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 12,
              background: credsInfo?.has_token ? 'rgba(40,201,154,0.08)' : 'rgba(245,158,11,0.08)',
              border: `1px solid ${credsInfo?.has_token ? 'rgba(40,201,154,0.25)' : 'rgba(245,158,11,0.25)'}`,
              marginBottom: 16, fontSize: 12,
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600, color: credsInfo?.has_token ? '#10b981' : '#d97706' }}>
                {credsInfo?.has_token ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                {credsInfo?.has_token ? 'Active Credentials Configured' : 'Access Token Required'}
              </span>
              <span style={{ color: 'var(--crm-text-muted)', fontSize: 11 }}>
                {credsInfo?.has_token ? `Token: ${credsInfo.token_preview}` : 'No token set'}
              </span>
            </div>

            {/* Error Banner */}
            {credsError && (
              <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(244,107,114,0.12)', border: '1px solid rgba(244,107,114,0.30)', color: '#f46b72', fontSize: 12, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={15} /> {credsError}
              </div>
            )}

            {/* Test Connection Live Result */}
            {testResult && (
              <div style={{
                padding: '12px 14px', borderRadius: 12, marginBottom: 16, fontSize: 12,
                background: testResult.success ? 'rgba(40,201,154,0.10)' : 'rgba(244,107,114,0.10)',
                border: `1px solid ${testResult.success ? 'rgba(40,201,154,0.30)' : 'rgba(244,107,114,0.30)'}`,
                color: testResult.success ? '#10b981' : '#f46b72',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13 }}>
                  {testResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  {testResult.success ? 'Connection Verified Successfully' : 'Connection Test Failed'}
                </div>
                {testResult.success ? (
                  <div style={{ marginTop: 6, color: 'var(--crm-text-secondary)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
                    <div><strong>Account Name:</strong> {testResult.account_name}</div>
                    <div><strong>Status:</strong> <span style={{ color: '#10b981', fontWeight: 600 }}>{testResult.account_status}</span></div>
                    <div><strong>Currency:</strong> {testResult.currency}</div>
                    <div><strong>Timezone:</strong> {testResult.timezone}</div>
                  </div>
                ) : (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontWeight: 600 }}>{testResult.error}</div>
                    {testResult.hint && (
                      <div style={{ marginTop: 4, color: 'var(--crm-text-secondary)', fontSize: 11 }}>
                        💡 {testResult.hint}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleSaveCredentials} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Ad Account ID */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>
                  Meta Ad Account ID *
                </label>
                <input
                  type="text" required placeholder="act_2505907436503788 or 2505907436503788"
                  value={credAdAccount} onChange={e => setCredAdAccount(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.30)', background: 'rgba(255,255,255,0.70)', fontSize: 13, outline: 'none', color: 'var(--crm-text)', boxSizing: 'border-box' }}
                />
                <span style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 3, display: 'block' }}>
                  Numeric ID or prefixed with <code>act_</code> (normalized automatically).
                </span>
              </div>

              {/* Developer App ID & API Version Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>
                    Meta App ID
                  </label>
                  <input
                    type="text" placeholder="1354004176287129"
                    value={credAppId} onChange={e => setCredAppId(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.30)', background: 'rgba(255,255,255,0.70)', fontSize: 13, outline: 'none', color: 'var(--crm-text)', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>
                    Graph API Version
                  </label>
                  <input
                    type="text" placeholder="v26.0"
                    value={credApiVersion} onChange={e => setCredApiVersion(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.30)', background: 'rgba(255,255,255,0.70)', fontSize: 13, outline: 'none', color: 'var(--crm-text)', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Access Token */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>
                  System User Access Token (ads_read)
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showToken ? 'text' : 'password'}
                    placeholder={credsInfo?.has_token ? '•••••••••••••••••••• (Leave blank to keep current token)' : 'EAAT... (Paste Meta access token)'}
                    value={credAccessToken} onChange={e => setCredAccessToken(e.target.value)}
                    style={{ width: '100%', padding: '10px 40px 10px 14px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.30)', background: 'rgba(255,255,255,0.70)', fontSize: 13, outline: 'none', color: 'var(--crm-text)', boxSizing: 'border-box' }}
                  />
                  <button
                    type="button" onClick={() => setShowToken(s => !s)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}
                  >
                    {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <span style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 3, display: 'block' }}>
                  Requires <code>ads_read</code> permission. Server-side only; never stored on client.
                </span>
              </div>

              {/* Collapsible Token Generation Guide */}
              <div style={{ borderRadius: 12, border: '1px solid rgba(130,145,190,0.20)', background: 'rgba(255,255,255,0.40)', overflow: 'hidden' }}>
                <button
                  type="button" onClick={() => setShowGuide(g => !g)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--crm-text)' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <HelpCircle size={14} color="#1877F2" />
                    How to get a non-expiring Meta System User Token
                  </span>
                  <span style={{ transform: showGuide ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: 12 }}>▼</span>
                </button>
                {showGuide && (
                  <div style={{ padding: '0 14px 12px', fontSize: 11, color: 'var(--crm-text-secondary)', lineHeight: 1.6, borderTop: '1px solid rgba(130,145,190,0.12)' }}>
                    <ol style={{ margin: '8px 0 0 16px', padding: 0 }}>
                      <li>Go to <strong>Meta Business Settings</strong> → <strong>Users</strong> → <strong>System Users</strong>.</li>
                      <li>Click <strong>Add</strong> or select existing system user.</li>
                      <li>Click <strong>Add Assets</strong> → Ad Accounts → select <code>2505907436503788</code> → toggle <strong>View Performance</strong>.</li>
                      <li>Click <strong>Generate New Token</strong> → Select App <code>TZmicha (Marketing)</code> → Check <code>ads_read</code> → Expiration: <strong>Never</strong>.</li>
                      <li>Copy the token and paste it in the field above.</li>
                    </ol>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, flexWrap: 'wrap', gap: 10 }}>
                <button
                  type="button" onClick={handleTestConnection} disabled={testingConn}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10,
                    border: '1px solid rgba(24,119,242,0.30)', background: 'rgba(24,119,242,0.08)',
                    color: '#1877F2', fontSize: 12, fontWeight: 700, cursor: testingConn ? 'not-allowed' : 'pointer',
                  }}
                >
                  <RefreshCw size={13} className={testingConn ? 'animate-spin' : ''} />
                  {testingConn ? 'Testing...' : 'Test Connection'}
                </button>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button" onClick={() => { setIsCredsModalOpen(false); setTestResult(null); setCredsError(null); }}
                    style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.30)', background: 'rgba(255,255,255,0.60)', color: 'var(--crm-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit" disabled={savingCreds}
                    style={{
                      padding: '9px 20px', borderRadius: 10, border: 'none',
                      background: 'linear-gradient(135deg,#1877F2,#4f6df5)', color: 'white',
                      fontSize: 13, fontWeight: 600, cursor: savingCreds ? 'not-allowed' : 'pointer',
                      boxShadow: '0 4px 14px rgba(24,119,242,0.30)', opacity: savingCreds ? 0.7 : 1,
                    }}
                  >
                    {savingCreds ? 'Saving...' : 'Save & Connect'}
                  </button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Create Meta Campaign Modal */}
      {isCreateMetaModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(8px)', padding: 16 }}>
          <div className="crm-glass-strong" style={{ width: '100%', maxWidth: 500, borderRadius: 22, padding: 28, boxShadow: '0 24px 48px rgba(0,0,0,0.25)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #1877F2, #4f6df5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0 }}>
                  <Plus size={20} />
                </div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 750, color: 'var(--crm-text)' }}>Create Meta Campaign</div>
                  <div style={{ fontSize: 12, color: 'var(--crm-text-secondary)', marginTop: 2 }}>Deploy directly to Meta Ad Account <code>{syncStatus?.ad_account_id || 'act_2505907436503788'}</code></div>
                </div>
              </div>
              <button onClick={() => setIsCreateMetaModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}><X size={18} /></button>
            </div>

            {/* Safety Default Banner */}
            <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(24,119,242,0.08)', border: '1px solid rgba(24,119,242,0.20)', fontSize: 12, color: 'var(--crm-text-secondary)', marginBottom: 16 }}>
              🛡️ <strong>Safety Default:</strong> New campaigns are initialized with <strong>PAUSED</strong> status to prevent unintended live ad spend.
            </div>

            {createMetaError && (
              <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(244,107,114,0.12)', border: '1px solid rgba(244,107,114,0.30)', color: '#f46b72', fontSize: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={15} /> {createMetaError}
              </div>
            )}

            <form onSubmit={handleCreateMetaCampaign} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 6 }}>Campaign Name *</label>
                <input
                  type="text" required placeholder="e.g. Q4 Real Estate Lead Generation"
                  value={createMetaName} onChange={e => setCreateMetaName(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.30)', background: 'rgba(255,255,255,0.70)', fontSize: 13, outline: 'none', color: 'var(--crm-text)', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 6 }}>
                  Objective (Meta ODAX) *
                </label>
                <select
                  value={createMetaObjective} onChange={e => setCreateMetaObjective(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.30)', background: 'rgba(255,255,255,0.70)', fontSize: 13, outline: 'none', color: 'var(--crm-text)', boxSizing: 'border-box' }}
                >
                  <option value="OUTCOME_LEADS">OUTCOME_LEADS — Generate leads for your business</option>
                  <option value="OUTCOME_SALES">OUTCOME_SALES — Drive online conversions or catalog sales</option>
                  <option value="OUTCOME_TRAFFIC">OUTCOME_TRAFFIC — Send traffic to a website or app</option>
                  <option value="OUTCOME_AWARENESS">OUTCOME_AWARENESS — Maximize brand reach & awareness</option>
                  <option value="OUTCOME_ENGAGEMENT">OUTCOME_ENGAGEMENT — Get more messages or engagement</option>
                  <option value="OUTCOME_APP_PROMOTION">OUTCOME_APP_PROMOTION — Drive app installs</option>
                </select>
                <span style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 4, display: 'block' }}>
                  Note: Meta does not allow changing objective after campaign creation.
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 6 }}>Initial Status</label>
                  <select
                    value={createMetaStatus} onChange={e => setCreateMetaStatus(e.target.value as 'PAUSED' | 'ACTIVE')}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.30)', background: 'rgba(255,255,255,0.70)', fontSize: 13, outline: 'none', color: 'var(--crm-text)' }}
                  >
                    <option value="PAUSED">PAUSED (Recommended)</option>
                    <option value="ACTIVE">ACTIVE (Immediate)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 6 }}>Daily Budget ($ USD)</label>
                  <input
                    type="number" step="0.01" min="1" placeholder="Optional (e.g. 20.00)"
                    value={createMetaBudget} onChange={e => setCreateMetaBudget(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.30)', background: 'rgba(255,255,255,0.70)', fontSize: 13, outline: 'none', color: 'var(--crm-text)', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 6 }}>Special Ad Category</label>
                <select
                  value={createMetaCategory} onChange={e => setCreateMetaCategory(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.30)', background: 'rgba(255,255,255,0.70)', fontSize: 13, outline: 'none', color: 'var(--crm-text)', boxSizing: 'border-box' }}
                >
                  <option value="NONE">NONE (Standard commercial products / services)</option>
                  <option value="HOUSING">HOUSING (Real estate, mortgage, home insurance)</option>
                  <option value="EMPLOYMENT">EMPLOYMENT (Job offers, internships, recruitment)</option>
                  <option value="CREDIT">CREDIT (Credit cards, loans, financing)</option>
                  <option value="ISSUES_ELECTIONS_POLITICS">ISSUES_ELECTIONS_POLITICS (Social issues / elections)</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                <button
                  type="button" onClick={() => setIsCreateMetaModalOpen(false)}
                  style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.30)', background: 'rgba(255,255,255,0.60)', color: 'var(--crm-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit" disabled={creatingMeta}
                  style={{
                    padding: '9px 22px', borderRadius: 10, border: 'none',
                    background: 'linear-gradient(135deg,#1877F2,#4f6df5)', color: 'white',
                    fontSize: 13, fontWeight: 600, cursor: creatingMeta ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 14px rgba(24,119,242,0.30)', opacity: creatingMeta ? 0.7 : 1,
                  }}
                >
                  {creatingMeta ? 'Creating on Meta...' : 'Create Campaign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Live Action Confirmation Modal (Pause, Resume, Archive) */}
      {confirmModal?.isOpen && confirmModal.campaign && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.50)', backdropFilter: 'blur(8px)', padding: 16 }}>
          <div className="crm-glass-strong" style={{ width: '100%', maxWidth: 440, borderRadius: 22, padding: 26, boxShadow: '0 24px 48px rgba(0,0,0,0.30)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: confirmModal.action === 'archive' ? 'rgba(244,107,114,0.15)' : confirmModal.action === 'pause' ? 'rgba(244,201,93,0.18)' : 'rgba(40,201,154,0.18)',
                color: confirmModal.action === 'archive' ? '#f46b72' : confirmModal.action === 'pause' ? '#d97706' : '#10b981',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {confirmModal.action === 'archive' ? <Archive size={22} /> : confirmModal.action === 'pause' ? <Pause size={22} /> : <Play size={22} />}
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 750, color: 'var(--crm-text)', textTransform: 'capitalize' }}>
                  Confirm {confirmModal.action} Campaign
                </div>
                <div style={{ fontSize: 12, color: 'var(--crm-text-secondary)', marginTop: 2 }}>
                  Live action on Meta Ad Account
                </div>
              </div>
            </div>

            <div style={{ background: 'rgba(130,145,190,0.08)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)' }}>{confirmModal.campaign.name}</div>
              <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 4 }}>
                Meta ID: <code>{confirmModal.campaign.meta_campaign_id}</code>
              </div>
            </div>

            <div style={{
              padding: '12px 14px', borderRadius: 12, marginBottom: 20, fontSize: 12, lineHeight: 1.5,
              background: confirmModal.action === 'archive' ? 'rgba(244,107,114,0.10)' : 'rgba(245,158,11,0.10)',
              border: `1px solid ${confirmModal.action === 'archive' ? 'rgba(244,107,114,0.30)' : 'rgba(245,158,11,0.30)'}`,
              color: confirmModal.action === 'archive' ? '#b91c1c' : '#b45309',
            }}>
              {confirmModal.action === 'pause' && (
                <div>⏸️ <strong>Halts ad delivery:</strong> This will pause the campaign on Meta Ads immediately. Running ad sets and ads under this campaign will cease spending. You can resume at any time.</div>
              )}
              {confirmModal.action === 'resume' && (
                <div>▶️ <strong>Resumes ad delivery:</strong> This will reactivate the campaign on Meta Ads. Ads will resume delivering and consuming budget according to your schedule.</div>
              )}
              {confirmModal.action === 'archive' && (
                <div>⚠️ <strong>Permanent Action:</strong> Archiving will hide and permanently close this campaign on Meta Ads. Archived campaigns cannot be restored to ACTIVE or PAUSED status via the API.</div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button" onClick={() => setConfirmModal(null)} disabled={confirmModal.loading}
                style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.30)', background: 'rgba(255,255,255,0.60)', color: 'var(--crm-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button" onClick={handleExecuteLiveAction} disabled={confirmModal.loading}
                style={{
                  padding: '9px 22px', borderRadius: 10, border: 'none',
                  background: confirmModal.action === 'archive' ? 'linear-gradient(135deg,#f46b72,#e11d48)' : confirmModal.action === 'pause' ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'linear-gradient(135deg,#10b981,#059669)',
                  color: 'white', fontSize: 13, fontWeight: 600, cursor: confirmModal.loading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.15)', opacity: confirmModal.loading ? 0.7 : 1,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {confirmModal.loading ? <RefreshCw size={14} className="animate-spin" /> : null}
                {confirmModal.loading ? 'Updating Meta...' : `Yes, ${confirmModal.action.toUpperCase()} Campaign`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Meta Campaign Modal */}
      {editModal?.isOpen && editModal.campaign && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.50)', backdropFilter: 'blur(8px)', padding: 16 }}>
          <div className="crm-glass-strong" style={{ width: '100%', maxWidth: 460, borderRadius: 22, padding: 26, boxShadow: '0 24px 48px rgba(0,0,0,0.30)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #1877F2, #4f6df5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0 }}>
                  <Edit2 size={18} />
                </div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 750, color: 'var(--crm-text)' }}>Edit Meta Campaign</div>
                  <div style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>ID: <code>{editModal.campaign.meta_campaign_id}</code></div>
                </div>
              </div>
              <button onClick={() => setEditModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}><X size={18} /></button>
            </div>

            {editModal.error && (
              <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(244,107,114,0.12)', border: '1px solid rgba(244,107,114,0.30)', color: '#f46b72', fontSize: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={15} /> {editModal.error}
              </div>
            )}

            <form onSubmit={handleSaveEditMeta} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 6 }}>Campaign Name *</label>
                <input
                  type="text" required
                  value={editModal.name} onChange={e => setEditModal(prev => prev ? { ...prev, name: e.target.value } : null)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.30)', background: 'rgba(255,255,255,0.70)', fontSize: 13, outline: 'none', color: 'var(--crm-text)', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 6 }}>Daily Budget ($ USD)</label>
                <input
                  type="number" step="0.01" min="1" placeholder="Leave empty to maintain ad set level budget"
                  value={editModal.budget} onChange={e => setEditModal(prev => prev ? { ...prev, budget: e.target.value } : null)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.30)', background: 'rgba(255,255,255,0.70)', fontSize: 13, outline: 'none', color: 'var(--crm-text)', boxSizing: 'border-box' }}
                />
              </div>

              {/* Immutable Objective Notice */}
              <div style={{ background: 'rgba(130,145,190,0.06)', borderRadius: 10, padding: '10px 12px', fontSize: 11, color: 'var(--crm-text-muted)' }}>
                🔒 <strong>Objective:</strong> {editModal.campaign.objective || 'Not specified'} (Cannot be modified after campaign creation).
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                <button
                  type="button" onClick={() => setEditModal(null)} disabled={editModal.saving}
                  style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.30)', background: 'rgba(255,255,255,0.60)', color: 'var(--crm-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit" disabled={editModal.saving}
                  style={{
                    padding: '9px 22px', borderRadius: 10, border: 'none',
                    background: 'linear-gradient(135deg,#1877F2,#4f6df5)', color: 'white',
                    fontSize: 13, fontWeight: 600, cursor: editModal.saving ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 14px rgba(24,119,242,0.30)', opacity: editModal.saving ? 0.7 : 1,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {editModal.saving ? <RefreshCw size={14} className="animate-spin" /> : null}
                  {editModal.saving ? 'Updating on Meta...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
