'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  PhoneCall,
  Plus,
  Loader2,
  Play,
  Pause,
  RotateCcw,
  Trash2,
  ArrowLeft,
  Clock,
  Phone,
  PhoneOff,
  AlertCircle,
  CheckCircle2,
  XCircle,
  MessageSquare,
  TrendingUp,
  BarChart3,
} from 'lucide-react';
import type { AiCallCampaign, AiCallRecord, AiCallCampaignStatus } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface CampaignAnalytics {
  totalCalls: number;
  completedCalls: number;
  failedCalls: number;
  interestedCount: number;
  notInterestedCount: number;
  convertedCount: number;
  avgDuration: number;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_META: Record<
  AiCallCampaignStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  draft: { label: 'Draft', variant: 'secondary' },
  running: { label: 'Running', variant: 'default' },
  paused: { label: 'Paused', variant: 'outline' },
  completed: { label: 'Completed', variant: 'secondary' },
  failed: { label: 'Failed', variant: 'destructive' },
};

const RECORD_STATUS_STYLES: Record<string, string> = {
  queued: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  calling: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  completed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  no_answer: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  busy: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  failed: 'bg-red-500/15 text-red-400 border-red-500/30',
  retry: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
};

const OUTCOME_STYLES: Record<string, string> = {
  interested: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  not_interested: 'bg-red-500/15 text-red-400 border-red-500/30',
  call_later: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  converted: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  no_outcome: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

function formatDuration(seconds: number | undefined): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function computeAnalytics(records: AiCallRecord[]): CampaignAnalytics {
  if (!records.length) {
    return {
      totalCalls: 0,
      completedCalls: 0,
      failedCalls: 0,
      interestedCount: 0,
      notInterestedCount: 0,
      convertedCount: 0,
      avgDuration: 0,
    };
  }
  const completed = records.filter((r) => r.status === 'completed');
  const durations = completed.filter((r) => r.duration_seconds);
  return {
    totalCalls: records.length,
    completedCalls: completed.length,
    failedCalls: records.filter((r) => r.status === 'failed').length,
    interestedCount: records.filter((r) => r.outcome === 'interested').length,
    notInterestedCount: records.filter((r) => r.outcome === 'not_interested').length,
    convertedCount: records.filter((r) => r.outcome === 'converted').length,
    avgDuration:
      durations.length > 0
        ? Math.round(durations.reduce((s, r) => s + (r.duration_seconds ?? 0), 0) / durations.length)
        : 0,
  };
}

export default function BulkAiCallsPage() {
  const { accountId, loading: authLoading } = useAuth();
  const t = useTranslations('AiCalls');

  const [campaigns, setCampaigns] = useState<AiCallCampaign[]>([]);
  const [records, setRecords] = useState<AiCallRecord[]>([]);
  const [contacts, setContacts] = useState<{ id: string; name?: string; phone: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState<AiCallCampaign | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('campaigns');

  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formVoiceAgentId, setFormVoiceAgentId] = useState('');
  const [formCallObjective, setFormCallObjective] = useState('');
  const [formHoursStart, setFormHoursStart] = useState('09:00');
  const [formHoursEnd, setFormHoursEnd] = useState('17:00');
  const [formCallingDays, setFormCallingDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [formMaxCalls, setFormMaxCalls] = useState(100);
  const [formMaxRetries, setFormMaxRetries] = useState(2);
  const [formRetryDelay, setFormRetryDelay] = useState(24);
  const [formContactIds, setFormContactIds] = useState<string[]>([]);

  const analytics = computeAnalytics(
    selectedCampaign ? records.filter((r) => r.campaign_id === selectedCampaign.id) : records,
  );

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const [campaignsRes, contactsRes, recordsRes] = await Promise.all([
        supabase
          .from('ai_call_campaigns')
          .select('*')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false }),
        supabase
          .from('contacts')
          .select('id, name, phone')
          .eq('account_id', accountId)
          .order('name', { ascending: true }),
        supabase
          .from('ai_call_records')
          .select('*')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false }),
      ]);
      if (campaignsRes.error) throw campaignsRes.error;
      if (contactsRes.error) throw contactsRes.error;
      if (recordsRes.error) throw recordsRes.error;
      setCampaigns((campaignsRes.data ?? []) as AiCallCampaign[]);
      setContacts((contactsRes.data ?? []) as { id: string; name?: string; phone: string }[]);
      setRecords((recordsRes.data ?? []) as AiCallRecord[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  function resetForm() {
    setFormName('');
    setFormDescription('');
    setFormVoiceAgentId('');
    setFormCallObjective('');
    setFormHoursStart('09:00');
    setFormHoursEnd('17:00');
    setFormCallingDays([1, 2, 3, 4, 5]);
    setFormMaxCalls(100);
    setFormMaxRetries(2);
    setFormRetryDelay(24);
    setFormContactIds([]);
  }

  async function createCampaign() {
    if (!accountId || !formName.trim()) return;
    setActionLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from('ai_call_campaigns').insert({
        account_id: accountId,
        user_id: (await supabase.auth.getUser()).data.user?.id,
        name: formName.trim(),
        description: formDescription.trim() || null,
        status: 'draft' as AiCallCampaignStatus,
        voice_agent_id: formVoiceAgentId.trim() || null,
        call_objective: formCallObjective.trim() || null,
        calling_hours_start: formHoursStart,
        calling_hours_end: formHoursEnd,
        calling_days: formCallingDays,
        max_calls: formMaxCalls,
        max_retries: formMaxRetries,
        retry_delay_hours: formRetryDelay,
        contact_ids: formContactIds,
        contact_filter: {},
        total_calls: 0,
        completed_calls: 0,
        failed_calls: 0,
        interested_count: 0,
        not_interested_count: 0,
        converted_count: 0,
      });
      if (error) throw error;
      toast.success('Campaign created');
      setShowCreateDialog(false);
      resetForm();
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create campaign');
    } finally {
      setActionLoading(false);
    }
  }

  async function updateCampaignStatus(campaign: AiCallCampaign, status: AiCallCampaignStatus) {
    setActionLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('ai_call_campaigns')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', campaign.id);
      if (error) throw error;
      toast.success(`Campaign ${status}`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update campaign');
    } finally {
      setActionLoading(false);
    }
  }

  async function deleteCampaign() {
    if (!selectedCampaign) return;
    setActionLoading(true);
    try {
      const supabase = createClient();
      await supabase.from('ai_call_records').delete().eq('campaign_id', selectedCampaign.id);
      const { error } = await supabase
        .from('ai_call_campaigns')
        .delete()
        .eq('id', selectedCampaign.id);
      if (error) throw error;
      toast.success('Campaign deleted');
      setSelectedCampaign(null);
      setShowDeleteDialog(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete campaign');
    } finally {
      setActionLoading(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (selectedCampaign) {
    const campaignRecords = records.filter((r) => r.campaign_id === selectedCampaign.id);
    const campaignAnalytics = computeAnalytics(campaignRecords);

    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setSelectedCampaign(null)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{selectedCampaign.name}</h1>
              {selectedCampaign.description && (
                <p className="text-sm text-muted-foreground">{selectedCampaign.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedCampaign.status === 'draft' && (
              <Button
                size="sm"
                onClick={() => updateCampaignStatus(selectedCampaign, 'running')}
                disabled={actionLoading}
              >
                <Play className="h-4 w-4" />
                Start
              </Button>
            )}
            {selectedCampaign.status === 'running' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateCampaignStatus(selectedCampaign, 'paused')}
                disabled={actionLoading}
              >
                <Pause className="h-4 w-4" />
                Pause
              </Button>
            )}
            {selectedCampaign.status === 'paused' && (
              <Button
                size="sm"
                onClick={() => updateCampaignStatus(selectedCampaign, 'running')}
                disabled={actionLoading}
              >
                <RotateCcw className="h-4 w-4" />
                Resume
              </Button>
            )}
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setShowDeleteDialog(true)}
              disabled={actionLoading}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={STATUS_META[selectedCampaign.status]?.variant ?? 'secondary'}>
            {STATUS_META[selectedCampaign.status]?.label ?? selectedCampaign.status}
          </Badge>
          {selectedCampaign.voice_agent_id && (
            <span className="text-xs text-muted-foreground">
              Agent: {selectedCampaign.voice_agent_id}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            Max {selectedCampaign.max_calls} calls, {selectedCampaign.max_retries} retries
          </span>
          <span className="text-xs text-muted-foreground">
            {selectedCampaign.calling_hours_start}–{selectedCampaign.calling_hours_end}
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AnalyticsCard
            icon={<Phone className="h-4 w-4" />}
            iconClass="bg-primary/10 text-primary"
            label="Total Calls"
            value={campaignAnalytics.totalCalls}
          />
          <AnalyticsCard
            icon={<CheckCircle2 className="h-4 w-4" />}
            iconClass="bg-emerald-500/10 text-emerald-500"
            label="Completed"
            value={campaignAnalytics.completedCalls}
          />
          <AnalyticsCard
            icon={<TrendingUp className="h-4 w-4" />}
            iconClass="bg-blue-500/10 text-blue-500"
            label="Interested"
            value={campaignAnalytics.interestedCount}
          />
          <AnalyticsCard
            icon={<Clock className="h-4 w-4" />}
            iconClass="bg-amber-500/10 text-amber-500"
            label="Avg Duration"
            value={formatDuration(campaignAnalytics.avgDuration)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-medium text-muted-foreground">Converted</p>
            <p className="mt-1 text-2xl font-bold text-emerald-500">
              {campaignAnalytics.convertedCount}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-medium text-muted-foreground">Not Interested</p>
            <p className="mt-1 text-2xl font-bold text-red-500">
              {campaignAnalytics.notInterestedCount}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-medium text-muted-foreground">Failed</p>
            <p className="mt-1 text-2xl font-bold text-red-500">
              {campaignAnalytics.failedCalls}
            </p>
          </div>
        </div>

        <Separator />

        <div>
          <h2 className="mb-4 text-lg font-semibold text-foreground">Call Records</h2>
          {campaignRecords.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-12 text-center">
              <PhoneCall className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-foreground">No calls yet</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Start the campaign to begin calling contacts.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3">Contact</th>
                      <th className="px-4 py-3">Phone</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Outcome</th>
                      <th className="px-4 py-3">Duration</th>
                      <th className="px-4 py-3">Sentiment</th>
                      <th className="px-4 py-3">Follow-up</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {campaignRecords.map((record) => {
                      const contact = contacts.find((c) => c.id === record.contact_id);
                      const statusStyle =
                        RECORD_STATUS_STYLES[record.status] ?? RECORD_STATUS_STYLES.queued;
                      const outcomeStyle =
                        OUTCOME_STYLES[record.outcome ?? 'no_outcome'] ?? OUTCOME_STYLES.no_outcome;
                      return (
                        <tr key={record.id} className="transition-colors hover:bg-muted/50">
                          <td className="max-w-[180px] px-4 py-3 font-medium text-foreground">
                            {contact?.name ?? 'Unknown'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                            {record.phone_number}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusStyle}`}
                            >
                              {record.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {record.outcome ? (
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${outcomeStyle}`}
                              >
                                {record.outcome.replace('_', ' ')}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                            {formatDuration(record.duration_seconds)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                            {record.ai_sentiment ?? '—'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {record.followup_required ? (
                              <Badge variant="destructive">Yes</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">No</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {campaignRecords.some((r) => r.transcript || r.ai_summary) && (
            <>
              <Separator className="my-6" />
              <h3 className="mb-4 text-lg font-semibold text-foreground">Transcripts & Summaries</h3>
              <div className="space-y-4">
                {campaignRecords
                  .filter((r) => r.transcript || r.ai_summary)
                  .map((record) => {
                    const contact = contacts.find((c) => c.id === record.contact_id);
                    return (
                      <Card key={record.id}>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-sm">
                            <MessageSquare className="h-4 w-4 text-muted-foreground" />
                            {contact?.name ?? 'Unknown'} — {record.phone_number}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {record.ai_summary && (
                            <div>
                              <p className="mb-1 text-xs font-medium text-muted-foreground">
                                AI Summary
                              </p>
                              <p className="text-sm text-foreground">{record.ai_summary}</p>
                            </div>
                          )}
                          {record.transcript && (
                            <div>
                              <p className="mb-1 text-xs font-medium text-muted-foreground">
                                Transcript
                              </p>
                              <ScrollArea className="max-h-48">
                                <pre className="whitespace-pre-wrap text-xs text-muted-foreground">
                                  {record.transcript}
                                </pre>
                              </ScrollArea>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            </>
          )}
        </div>

        <Dialog open={showDeleteDialog} onOpenChange={(v) => !v && setShowDeleteDialog(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Campaign</DialogTitle>
              <DialogDescription>
                This will permanently delete &quot;{selectedCampaign.name}&quot; and all its call records.
                This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowDeleteDialog(false)}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={deleteCampaign}
                disabled={actionLoading}
              >
                {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <PhoneCall className="h-6 w-6 text-primary" />
            {t('title')}
          </h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4" />
          {t('createCampaign')}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AnalyticsCard
          icon={<BarChart3 className="h-4 w-4" />}
          iconClass="bg-primary/10 text-primary"
          label={t('analytics.totalCalls')}
          value={analytics.totalCalls}
        />
        <AnalyticsCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          iconClass="bg-emerald-500/10 text-emerald-500"
          label={t('analytics.completedCalls')}
          value={analytics.completedCalls}
        />
        <AnalyticsCard
          icon={<XCircle className="h-4 w-4" />}
          iconClass="bg-red-500/10 text-red-500"
          label={t('analytics.failedCalls')}
          value={analytics.failedCalls}
        />
        <AnalyticsCard
          icon={<Clock className="h-4 w-4" />}
          iconClass="bg-amber-500/10 text-amber-500"
          label={t('analytics.avgDuration')}
          value={formatDuration(analytics.avgDuration)}
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="campaigns">{t('tabs.campaigns')}</TabsTrigger>
          <TabsTrigger value="records">{t('tabs.callRecords')}</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="mt-4">
          {campaigns.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
              <PhoneCall className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-foreground">{t('emptyTitle')}</p>
              <p className="max-w-sm text-xs text-muted-foreground">{t('emptyDesc')}</p>
              <Button
                size="sm"
                className="mt-2"
                onClick={() => setShowCreateDialog(true)}
              >
                <Plus className="h-4 w-4" />
                {t('createCampaign')}
              </Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3">{t('table.campaign')}</th>
                      <th className="px-4 py-3">{t('table.status')}</th>
                      <th className="px-4 py-3">{t('table.calls')}</th>
                      <th className="px-4 py-3">{t('table.completed')}</th>
                      <th className="px-4 py-3">{t('table.interested')}</th>
                      <th className="px-4 py-3">{t('table.created')}</th>
                      <th className="px-4 py-3">{t('table.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {campaigns.map((campaign) => {
                      const meta = STATUS_META[campaign.status] ?? STATUS_META.draft;
                      return (
                        <tr key={campaign.id} className="transition-colors hover:bg-muted/50">
                          <td className="max-w-[220px] px-4 py-3">
                            <button
                              onClick={() => setSelectedCampaign(campaign)}
                              className="block truncate text-left font-medium text-foreground hover:text-primary"
                            >
                              {campaign.name}
                            </button>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <Badge variant={meta.variant}>{meta.label}</Badge>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                            {campaign.total_calls}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                            {campaign.completed_calls}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                            {campaign.interested_count}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                            {new Date(campaign.created_at).toLocaleDateString()}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <div className="flex items-center gap-1">
                              {campaign.status === 'draft' && (
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  title={t('actions.start')}
                                  onClick={() => updateCampaignStatus(campaign, 'running')}
                                  disabled={actionLoading}
                                >
                                  <Play className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {campaign.status === 'running' && (
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  title={t('actions.pause')}
                                  onClick={() => updateCampaignStatus(campaign, 'paused')}
                                  disabled={actionLoading}
                                >
                                  <Pause className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {campaign.status === 'paused' && (
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  title={t('actions.resume')}
                                  onClick={() => updateCampaignStatus(campaign, 'running')}
                                  disabled={actionLoading}
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                title={t('actions.delete')}
                                onClick={() => {
                                  setSelectedCampaign(campaign);
                                  setShowDeleteDialog(true);
                                }}
                                disabled={actionLoading}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="records" className="mt-4">
          {records.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
              <PhoneCall className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-foreground">{t('records.emptyTitle')}</p>
              <p className="max-w-sm text-xs text-muted-foreground">{t('records.emptyDesc')}</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3">{t('records.table.campaign')}</th>
                      <th className="px-4 py-3">{t('records.table.contact')}</th>
                      <th className="px-4 py-3">{t('records.table.phone')}</th>
                      <th className="px-4 py-3">{t('records.table.status')}</th>
                      <th className="px-4 py-3">{t('records.table.outcome')}</th>
                      <th className="px-4 py-3">{t('records.table.duration')}</th>
                      <th className="px-4 py-3">{t('records.table.sentiment')}</th>
                      <th className="px-4 py-3">{t('records.table.followUp')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {records.map((record) => {
                      const contact = contacts.find((c) => c.id === record.contact_id);
                      const campaign = campaigns.find((c) => c.id === record.campaign_id);
                      const statusStyle =
                        RECORD_STATUS_STYLES[record.status] ?? RECORD_STATUS_STYLES.queued;
                      const outcomeStyle =
                        OUTCOME_STYLES[record.outcome ?? 'no_outcome'] ?? OUTCOME_STYLES.no_outcome;
                      return (
                        <tr key={record.id} className="transition-colors hover:bg-muted/50">
                          <td className="max-w-[150px] px-4 py-3">
                            <button
                              onClick={() =>
                                campaign && setSelectedCampaign(campaign)
                              }
                              className="block truncate text-left text-foreground hover:text-primary"
                            >
                              {campaign?.name ?? '—'}
                            </button>
                          </td>
                          <td className="max-w-[150px] px-4 py-3">
                            <span className="block truncate text-foreground">
                              {contact?.name ?? 'Unknown'}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                            {record.phone_number}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusStyle}`}
                            >
                              {record.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {record.outcome ? (
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${outcomeStyle}`}
                              >
                                {record.outcome.replace('_', ' ')}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                            {formatDuration(record.duration_seconds)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                            {record.ai_sentiment ?? '—'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {record.followup_required ? (
                              <Badge variant="destructive">Yes</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">No</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showCreateDialog} onOpenChange={(v) => !v && setShowCreateDialog(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('dialog.createTitle')}</DialogTitle>
            <DialogDescription>{t('dialog.createDesc')}</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 px-1 pb-2">
              <div className="space-y-2">
                <Label htmlFor="campaign-name">{t('form.name')} *</Label>
                <Input
                  id="campaign-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={t('form.namePlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="campaign-desc">{t('form.description')}</Label>
                <Textarea
                  id="campaign-desc"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder={t('form.descriptionPlaceholder')}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="voice-agent-id">{t('form.voiceAgentId')}</Label>
                <Input
                  id="voice-agent-id"
                  value={formVoiceAgentId}
                  onChange={(e) => setFormVoiceAgentId(e.target.value)}
                  placeholder={t('form.voiceAgentIdPlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="call-objective">{t('form.callObjective')}</Label>
                <Textarea
                  id="call-objective"
                  value={formCallObjective}
                  onChange={(e) => setFormCallObjective(e.target.value)}
                  placeholder={t('form.callObjectivePlaceholder')}
                  rows={3}
                />
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('form.callingHoursStart')}</Label>
                  <Input
                    type="time"
                    value={formHoursStart}
                    onChange={(e) => setFormHoursStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('form.callingHoursEnd')}</Label>
                  <Input
                    type="time"
                    value={formHoursEnd}
                    onChange={(e) => setFormHoursEnd(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('form.callingDays')}</Label>
                <div className="flex flex-wrap gap-3">
                  {DAY_NAMES.map((day, index) => (
                    <label
                      key={index}
                      className="flex items-center gap-1.5 text-sm text-foreground"
                    >
                      <Checkbox
                        checked={formCallingDays.includes(index)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setFormCallingDays((prev) => [...prev, index]);
                          } else {
                            setFormCallingDays((prev) => prev.filter((d) => d !== index));
                          }
                        }}
                      />
                      {day}
                    </label>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="max-calls">{t('form.maxCalls')}</Label>
                  <Input
                    id="max-calls"
                    type="number"
                    min={1}
                    value={formMaxCalls}
                    onChange={(e) => setFormMaxCalls(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max-retries">{t('form.maxRetries')}</Label>
                  <Input
                    id="max-retries"
                    type="number"
                    min={0}
                    value={formMaxRetries}
                    onChange={(e) => setFormMaxRetries(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="retry-delay">{t('form.retryDelay')}</Label>
                  <Input
                    id="retry-delay"
                    type="number"
                    min={1}
                    value={formRetryDelay}
                    onChange={(e) => setFormRetryDelay(Number(e.target.value))}
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>{t('form.selectContacts')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('form.selectedCount', { count: formContactIds.length })}
                </p>
                {contacts.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    {t('form.noContacts')}
                  </p>
                ) : (
                  <ScrollArea className="h-48 rounded-lg border border-border">
                    <div className="space-y-1 p-2">
                      <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-muted">
                        <Checkbox
                          checked={formContactIds.length === contacts.length}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setFormContactIds(contacts.map((c) => c.id));
                            } else {
                              setFormContactIds([]);
                            }
                          }}
                        />
                        {t('form.selectAll')}
                      </label>
                      {contacts.map((contact) => (
                        <label
                          key={contact.id}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-muted"
                        >
                          <Checkbox
                            checked={formContactIds.includes(contact.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setFormContactIds((prev) => [...prev, contact.id]);
                              } else {
                                setFormContactIds((prev) =>
                                  prev.filter((id) => id !== contact.id),
                                );
                              }
                            }}
                          />
                          <span className="truncate">
                            {contact.name ?? contact.phone}
                          </span>
                        </label>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                resetForm();
              }}
              disabled={actionLoading}
            >
              {t('dialog.cancel')}
            </Button>
            <Button
              onClick={createCampaign}
              disabled={actionLoading || !formName.trim()}
            >
              {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('dialog.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AnalyticsCard({
  icon,
  iconClass,
  label,
  value,
}: {
  icon: React.ReactNode;
  iconClass: string;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconClass}`}>
          {icon}
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-foreground">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  );
}
