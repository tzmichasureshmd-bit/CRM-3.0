'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertCircle, Archive, ArrowLeft, Copy, Loader2, Pencil, Plus, Radio } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { hasColumn, hasTable } from '@/lib/db/schema'
import { reportError } from '@/lib/errors'
import { EmptyState, SetupRequired } from '@/components/shared'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_TYPES,
  CHANNEL_OPTIONS,
  TRACKING_METRIC_KEYS,
  TRACKING_METRIC_LABELS,
  campaignStatusLabel,
  campaignTypeLabel,
  channelsSummary,
  describeAudienceFilter,
  formatBudget,
  formatDate,
  formatDateRange,
  formatMetric,
  statusBadgeClass,
  trackingCurrency,
  type Campaign,
  type CampaignStatus,
  type CampaignType,
} from '../campaign-shared'

interface LinkedBroadcast {
  id: string
  name: string
  status: string
  scheduled_at: string | null
  created_at: string
  total_recipients: number | null
  sent_count: number | null
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'â€”'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'â€”' : date.toLocaleString()
}

function Info({
  label,
  children,
  wide,
}: {
  label: string
  children?: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className={cn('space-y-1', wide && 'sm:col-span-2')}>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm leading-relaxed text-foreground">{children ?? 'â€”'}</dd>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">{value}</p>
    </div>
  )
}

export default function CampaignDetailPage() {
  const { campaignId } = useParams<{ campaignId: string }>()
  const router = useRouter()
  const { accountId, loading: authLoading } = useAuth()
  const supabase = createClient()

  const [schemaOk, setSchemaOk] = useState<boolean | null>(null)
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')
  const [saveField, setSaveField] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

  const [linked, setLinked] = useState<LinkedBroadcast[]>([])
  const [linkedSupported, setLinkedSupported] = useState<boolean | null>(null)
  const [linkedLoading, setLinkedLoading] = useState(false)
  const [linkedError, setLinkedError] = useState<string | null>(null)

  const [archiveOpen, setArchiveOpen] = useState(false)
  const [duplicateOpen, setDuplicateOpen] = useState(false)
  const [actionBusy, setActionBusy] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return
    let cancelled = false
    hasTable(supabase, 'campaigns')
      .then((ok) => {
        if (cancelled) return
        setSchemaOk(ok)
        if (!ok) setLoading(false)
      })
      .catch((err) => {
        console.error('[CampaignDetailPage] hasTable failed:', err)
        if (cancelled) return
        setSchemaOk(true)
      })
    return () => {
      cancelled = true
    }
  }, [authLoading, supabase])

  const loadCampaign = useCallback(async () => {
    if (!accountId || !campaignId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', campaignId)
        .eq('account_id', accountId)
        .maybeSingle()
      if (error) throw error
      if (data) setCampaign(data as Campaign)
      else setNotFound(true)
    } catch (err) {
      toast.error('Campaign could not be loaded', {
        description: reportError(
          err,
          'CampaignDetailPage.load',
          'The campaign could not be loaded.',
        ),
      })
    } finally {
      setLoading(false)
    }
  }, [accountId, campaignId, supabase])

  useEffect(() => {
    if (schemaOk !== true) return
    loadCampaign()
  }, [schemaOk, loadCampaign])

  const loadLinked = useCallback(async () => {
    if (!campaign || !accountId) return
    setLinkedLoading(true)
    setLinkedError(null)
    try {
      const supported = await hasColumn(supabase, 'broadcasts', 'campaign_id')
      setLinkedSupported(supported)
      if (!supported) {
        setLinked([])
        return
      }
      const { data, error } = await supabase
        .from('broadcasts')
        .select('id, name, status, scheduled_at, created_at, total_recipients, sent_count')
        .eq('account_id', accountId)
        .eq('campaign_id', campaign.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      setLinked((data ?? []) as LinkedBroadcast[])
    } catch (err) {
      setLinkedError(
        reportError(
          err,
          'CampaignDetailPage.linked',
          'Linked broadcasts could not be loaded.',
        ),
      )
    } finally {
      setLinkedLoading(false)
    }
  }, [campaign, accountId, supabase])

  useEffect(() => {
    if (schemaOk === true && campaign) loadLinked()
  }, [schemaOk, campaign, loadLinked])

  async function patchCampaign(
    fields: Record<string, unknown>,
    fieldKey: string,
  ): Promise<Campaign | null> {
    if (!campaign) return null
    setSaveField(fieldKey)
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', campaign.id)
        .eq('account_id', campaign.account_id)
        .select('*')
        .single()
      if (error) throw error
      const saved = data as Campaign
      setCampaign(saved)
      return saved
    } catch (err) {
      toast.error('Could not save changes', {
        description: reportError(
          err,
          'CampaignDetailPage.patch',
          'The campaign update was rejected.',
        ),
      })
      return null
    } finally {
      setSaveField(null)
    }
  }

  async function handleStatusChange(next: CampaignStatus) {
    if (!campaign || next === campaign.status) return
    const saved = await patchCampaign({ status: next }, 'status')
    if (saved) {
      toast.success('Status updated', {
        description: `${saved.name} is now ${campaignStatusLabel(next)}.`,
      })
    }
  }

  async function handleTypeChange(next: CampaignType) {
    if (!campaign || next === campaign.type) return
    const saved = await patchCampaign({ type: next }, 'type')
    if (saved) {
      toast.success('Type updated', {
        description: `${saved.name} is now a ${campaignTypeLabel(next)} campaign.`,
      })
    }
  }

  async function saveName() {
    if (!campaign) return
    const trimmed = nameDraft.trim()
    if (!trimmed) {
      toast.error('Name is required', { description: 'A campaign must have a name.' })
      return
    }
    if (trimmed === campaign.name) {
      setRenaming(false)
      return
    }
    const saved = await patchCampaign({ name: trimmed }, 'name')
    if (saved) {
      setRenaming(false)
      toast.success('Campaign renamed', { description: `Now called ${saved.name}.` })
    }
  }

  async function handleDuplicate() {
    if (!campaign || !accountId) return
    setActionBusy('duplicate')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id ?? null
      const status: CampaignStatus = 'draft'
      const { data, error } = await supabase
        .from('campaigns')
        .insert({
          account_id: campaign.account_id || accountId,
          created_by: userId,
          owner_id: userId,
          name: `Copy of ${campaign.name}`,
          description: campaign.description,
          type: campaign.type,
          objective: campaign.objective,
          status,
          audience: campaign.audience,
          audience_filter: campaign.audience_filter ?? {},
          channels: campaign.channels ?? [],
          start_date: campaign.start_date,
          end_date: campaign.end_date,
          budget: campaign.budget,
          message: campaign.message,
          cta: campaign.cta,
          landing_page: campaign.landing_page,
          offer_title: campaign.offer_title,
          offer_summary: campaign.offer_summary,
          offer_discount: campaign.offer_discount,
          offer_valid_until: campaign.offer_valid_until,
          tags: campaign.tags ?? [],
          tracking: campaign.tracking ?? {},
        })
        .select('*')
        .single()
      if (error) throw error
      const copy = data as Campaign
      setDuplicateOpen(false)
      toast.success('Campaign duplicated', {
        description: `Draft copy â€œ${copy.name}â€ created.`,
      })
      router.push(`/campaigns/${copy.id}`)
    } catch (err) {
      toast.error('Could not duplicate campaign', {
        description: reportError(
          err,
          'CampaignDetailPage.duplicate',
          'The campaign could not be duplicated.',
        ),
      })
    } finally {
      setActionBusy(null)
    }
  }

  async function handleArchive() {
    if (!campaign) return
    setActionBusy('archive')
    const saved = await patchCampaign({ status: 'archived' }, 'archive')
    if (saved) {
      setArchiveOpen(false)
      toast.success('Campaign archived', {
        description: `${saved.name} moved to the archived status.`,
      })
    }
    setActionBusy(null)
  }

  if (schemaOk === false) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Campaign</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Campaign detail is unavailable until the migration is applied.
          </p>
        </div>
        <SetupRequired
          feature="Campaigns"
          migration="077_crm20_stabilization.sql"
          missing="Table public.campaigns does not exist yet."
        />
        <Link
          href="/campaigns"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to campaigns
        </Link>
      </div>
    )
  }

  if (loading || authLoading || schemaOk === null) {
    return (
      <div className="flex flex-col items-center gap-3 py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading campaignâ€¦</p>
      </div>
    )
  }

  if (notFound || !campaign) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Link
          href="/campaigns"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to campaigns
        </Link>
        <EmptyState
          icon={Radio}
          title="Campaign not found"
          description="This campaign does not exist, or it belongs to another account."
          action={
            <Link
              href="/campaigns"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Back to campaigns
            </Link>
          }
        />
      </div>
    )
  }

  const currency = trackingCurrency(campaign.tracking)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/campaigns"
          className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to campaigns
        </Link>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            {renaming ? (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      saveName()
                    }
                    if (e.key === 'Escape') {
                      setRenaming(false)
                      setNameDraft(campaign.name)
                    }
                  }}
                  className="h-9 max-w-md text-lg font-bold"
                  autoFocus
                  disabled={saveField !== null}
                  aria-label="Campaign name"
                />
                <Button
                  size="sm"
                  onClick={saveName}
                  disabled={saveField !== null || !nameDraft.trim()}
                >
                  {saveField === 'name' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Save'
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setRenaming(false)
                    setNameDraft(campaign.name)
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="truncate text-2xl font-bold tracking-tight text-foreground">
                  {campaign.name}
                </h1>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Rename campaign"
                  disabled={saveField !== null}
                  onClick={() => {
                    setNameDraft(campaign.name)
                    setRenaming(true)
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={campaign.status}
                onValueChange={(v) => handleStatusChange(v as CampaignStatus)}
              >
                <SelectTrigger className="w-[150px]" disabled={saveField !== null}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_STATUSES.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={campaign.type}
                onValueChange={(v) => handleTypeChange(v as CampaignType)}
              >
                <SelectTrigger className="w-[200px]" disabled={saveField !== null}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge variant="outline" className={statusBadgeClass(campaign.status)}>
                {campaignStatusLabel(campaign.status)}
              </Badge>
              {saveField && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Created {formatDateTime(campaign.created_at)} Â· Updated{' '}
              {formatDateTime(campaign.updated_at)}
            </p>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="audience">Audience</TabsTrigger>
          <TabsTrigger value="channels">Channels</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="broadcasts">Broadcasts</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Info label="Objective">{campaign.objective}</Info>
                <Info label="Call to action">{campaign.cta}</Info>
                <Info label="Landing page">
                  {campaign.landing_page ? (
                    <a
                      href={campaign.landing_page}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-primary hover:underline"
                    >
                      {campaign.landing_page}
                    </a>
                  ) : (
                    'â€”'
                  )}
                </Info>
                <Info label="Schedule">
                  {formatDateRange(campaign.start_date, campaign.end_date)}
                </Info>
                <Info label="Budget">
                  {formatBudget(campaign.budget, currency)}
                </Info>
                <Info label="Description">{campaign.description}</Info>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Message</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/30 p-3 text-sm leading-relaxed text-foreground">
                {campaign.message || 'â€”'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Offer</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Info label="Offer title">{campaign.offer_title}</Info>
                <Info label="Discount">{campaign.offer_discount}</Info>
                <Info label="Valid until">{formatDate(campaign.offer_valid_until)}</Info>
                <Info label="Summary">{campaign.offer_summary}</Info>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tags</CardTitle>
            </CardHeader>
            <CardContent>
              {(campaign.tags ?? []).length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {(campaign.tags ?? []).map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">â€”</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audience" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Audience description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-foreground">
                {campaign.audience || 'â€”'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Audience filter</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-foreground">{describeAudienceFilter(campaign.audience_filter)}</p>
              <pre className="overflow-x-auto rounded-lg border border-border/60 bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
                {JSON.stringify(campaign.audience_filter ?? {}, null, 2)}
              </pre>
              <p className="text-xs text-muted-foreground">
                This filter is handed to the broadcast composer when a broadcast is created for
                this campaign.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="channels" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Channels</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(campaign.channels ?? []).length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {(campaign.channels ?? []).map((channel) => (
                    <Badge key={channel} variant="outline">
                      {CHANNEL_OPTIONS.find((c) => c.value === channel)?.label ?? channel}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No channels selected yet.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Configured as: {channelsSummary(campaign.channels)}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4 pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {TRACKING_METRIC_KEYS.map((key) => (
              <MetricCard
                key={key}
                label={TRACKING_METRIC_LABELS[key]}
                value={formatMetric(campaign.tracking, key)}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Counters are read from the campaign&apos;s <code>tracking</code> JSON. Missing values
            render as 0 â€” nothing is estimated. Budget currency:{' '}
            {currency ? currency : 'not set'}.
          </p>
        </TabsContent>

        <TabsContent value="broadcasts" className="space-y-4 pt-4">
          {linkedSupported === null || linkedLoading ? (
            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading linked broadcastsâ€¦</p>
            </div>
          ) : linkedSupported === false ? (
            <SetupRequired
              feature="Linked broadcasts"
              migration="077_crm20_stabilization.sql"
              missing="Column broadcasts.campaign_id does not exist yet, so broadcasts cannot be linked to this campaign."
              compact
            />
          ) : linkedError ? (
            <div className="flex flex-col items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {linkedError}
              </div>
              <Button variant="outline" size="sm" onClick={loadLinked}>
                Retry
              </Button>
            </div>
          ) : linked.length === 0 ? (
            <EmptyState
              icon={Plus}
              title="No broadcasts linked yet"
              description="Broadcasts launched for this campaign appear here with their delivery counts."
              action={
                <Link
                  href="/broadcasts/new"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" />
                  New broadcast
                </Link>
              }
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <ul className="divide-y divide-border">
                {linked.map((broadcast) => (
                  <li
                    key={broadcast.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/broadcasts/${broadcast.id}`}
                        className="block truncate text-sm font-medium text-foreground hover:text-primary"
                      >
                        {broadcast.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(broadcast.created_at)}
                        {broadcast.scheduled_at
                          ? ` Â· scheduled ${formatDateTime(broadcast.scheduled_at)}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>
                        Sent {(broadcast.sent_count ?? 0).toLocaleString()} of{' '}
                        {(broadcast.total_recipients ?? 0).toLocaleString()}
                      </span>
                      <Badge variant="outline">{broadcast.status}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </TabsContent>

        <TabsContent value="actions" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <Link
                  href={`/campaigns/${campaign.id}/edit`}
                  className={cn(buttonVariants({ variant: 'outline' }), 'gap-1.5')}
                >
                  <Pencil className="h-4 w-4" />
                  Edit campaign
                </Link>
                <Button
                  variant="outline"
                  className="gap-1.5"
                  disabled={actionBusy !== null}
                  onClick={() => setDuplicateOpen(true)}
                >
                  <Copy className="h-4 w-4" />
                  Duplicate as draft
                </Button>
                <Button
                  variant="destructive"
                  className="gap-1.5"
                  disabled={actionBusy !== null || campaign.status === 'archived'}
                  onClick={() => setArchiveOpen(true)}
                >
                  <Archive className="h-4 w-4" />
                  Archive campaign
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Duplicating creates a draft copy for this account. Archiving only changes the
                status to <code>archived</code> â€” nothing is deleted.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={duplicateOpen}
        onOpenChange={(open) => {
          if (!open && actionBusy) return
          setDuplicateOpen(open)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate this campaign?</DialogTitle>
            <DialogDescription>
              A new draft copy of â€œ{campaign.name}â€ is created for this account, including
              audience, channels, offer and budget.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDuplicateOpen(false)}
              disabled={actionBusy !== null}
            >
              Cancel
            </Button>
            <Button onClick={handleDuplicate} disabled={actionBusy !== null}>
              {actionBusy === 'duplicate' && <Loader2 className="h-4 w-4 animate-spin" />}
              {actionBusy === 'duplicate' ? 'Duplicatingâ€¦' : 'Duplicate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={archiveOpen}
        onOpenChange={(open) => {
          if (!open && actionBusy) return
          setArchiveOpen(open)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive â€œ{campaign.name}â€?</DialogTitle>
            <DialogDescription>
              The campaign status changes to archived. Linked broadcasts and history are kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setArchiveOpen(false)}
              disabled={actionBusy !== null}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleArchive}
              disabled={actionBusy !== null}
            >
              {actionBusy === 'archive' && <Loader2 className="h-4 w-4 animate-spin" />}
              {actionBusy === 'archive' ? 'Archivingâ€¦' : 'Archive'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
