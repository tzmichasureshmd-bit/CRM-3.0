'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Megaphone,
  Plus,
  Search,
  X,
} from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { hasTable } from '@/lib/db/schema'
import { reportError } from '@/lib/errors'
import { EmptyState, PageHeader, SetupRequired } from '@/components/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_TYPES,
  TRACKING_METRIC_KEYS,
  TRACKING_METRIC_LABELS,
  audienceSummary,
  campaignStatusLabel,
  campaignTypeLabel,
  formatBudget,
  formatDateRange,
  formatMetric,
  statusBadgeClass,
  trackingCurrency,
  type Campaign,
  type CampaignStatus,
  type CampaignType,
} from './campaign-shared'

const PAGE_SIZE = 25

const ALL = 'all'

export default function CampaignsPage() {
  const { accountId, loading: authLoading } = useAuth()
  const supabase = createClient()

  const [schemaOk, setSchemaOk] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | typeof ALL>(ALL)
  const [typeFilter, setTypeFilter] = useState<CampaignType | typeof ALL>(ALL)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

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
        console.error('[CampaignsPage] hasTable failed:', err)
        if (cancelled) return
        setSchemaOk(true)
      })
    return () => {
      cancelled = true
    }
  }, [authLoading, supabase])

  useEffect(() => {
    if (authLoading || schemaOk !== true) return
    if (!accountId) {
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        let query = supabase
          .from('campaigns')
          .select('*', { count: 'exact' })
          .eq('account_id', accountId)
          .order('created_at', { ascending: false })
          .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

        if (statusFilter !== ALL) query = query.eq('status', statusFilter)
        if (typeFilter !== ALL) query = query.eq('type', typeFilter)
        if (search.trim()) query = query.ilike('name', `%${search.trim()}%`)

        const { data, error, count } = await query
        if (error) throw error
        if (!cancelled) {
          setCampaigns((data ?? []) as Campaign[])
          setTotal(count ?? 0)
        }
      } catch (err) {
        if (!cancelled) {
          toast.error('Campaigns could not be loaded', {
            description: reportError(
              err,
              'CampaignsPage.load',
              'The campaign list request failed.',
            ),
          })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [authLoading, schemaOk, accountId, supabase, search, statusFilter, typeFilter, page])

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, typeFilter])

  const filtersActive = search.trim() !== '' || statusFilter !== ALL || typeFilter !== ALL
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const busy = authLoading || schemaOk === null || loading

  function clearFilters() {
    setSearch('')
    setStatusFilter(ALL)
    setTypeFilter(ALL)
  }

  const createButton = (
    <Link
      href="/campaigns/new"
      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
    >
      <Plus className="h-4 w-4" />
      Create campaign
    </Link>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        description="Plan, target and measure every marketing campaign."
        action={createButton}
      />

      {schemaOk === false ? (
        <SetupRequired
          feature="Campaigns"
          migration="077_crm20_stabilization.sql"
          missing="Table public.campaigns does not exist yet."
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search campaigns by name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter((v ?? ALL) as CampaignStatus | typeof ALL)}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {CAMPAIGN_STATUSES.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={typeFilter}
              onValueChange={(v) => setTypeFilter((v ?? ALL) as CampaignType | typeof ALL)}
            >
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All types</SelectItem>
                {CAMPAIGN_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filtersActive && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4" />
                Clear
              </Button>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {busy ? (
              <div className="flex flex-col items-center gap-3 py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading campaigns…</p>
              </div>
            ) : campaigns.length === 0 ? (
              filtersActive ? (
                <div className="px-6">
                  <EmptyState
                    icon={Search}
                    title="No campaigns match"
                    description="Try adjusting your search or filters to see more campaigns."
                    action={
                      <Button variant="outline" size="sm" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    }
                  />
                </div>
              ) : (
                <div className="px-6">
                  <EmptyState
                    icon={Megaphone}
                    title="No campaigns yet"
                    description="Create your first campaign to define an audience, pick channels and track how it performs."
                    action={createButton}
                  />
                </div>
              )
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Audience</TableHead>
                      <TableHead>Schedule</TableHead>
                      <TableHead>Budget</TableHead>
                      <TableHead>Performance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border">
                    {campaigns.map((campaign) => (
                      <TableRow key={campaign.id}>
                        <TableCell className="max-w-[240px] align-top">
                          <Link
                            href={`/campaigns/${campaign.id}`}
                            className="block truncate font-medium text-foreground hover:text-primary"
                          >
                            {campaign.name}
                          </Link>
                          {(campaign.tags ?? []).length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {(campaign.tags ?? []).slice(0, 3).map((tag) => (
                                <Badge
                                  key={tag}
                                  variant="secondary"
                                  className="text-[10px]"
                                >
                                  {tag}
                                </Badge>
                              ))}
                              {(campaign.tags ?? []).length > 3 && (
                                <span className="text-[10px] text-muted-foreground">
                                  +{(campaign.tags ?? []).length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap align-top text-muted-foreground">
                          {campaignTypeLabel(campaign.type)}
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge variant="outline" className={statusBadgeClass(campaign.status)}>
                            {campaignStatusLabel(campaign.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[220px] align-top">
                          <p
                            className="truncate text-muted-foreground"
                            title={audienceSummary(campaign)}
                          >
                            {audienceSummary(campaign)}
                          </p>
                        </TableCell>
                        <TableCell className="whitespace-nowrap align-top text-muted-foreground">
                          {formatDateRange(campaign.start_date, campaign.end_date)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap align-top">
                          {formatBudget(campaign.budget, trackingCurrency(campaign.tracking))}
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            {TRACKING_METRIC_KEYS.map((key) => (
                              <span key={key} className="whitespace-nowrap">
                                {TRACKING_METRIC_LABELS[key]}{' '}
                                <span className="font-medium text-foreground">
                                  {formatMetric(campaign.tracking, key)}
                                </span>
                              </span>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {total > PAGE_SIZE && (
              <div className="flex items-center justify-between border-t border-border px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {schemaOk === false && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          Campaign data is unavailable until the migration above is applied.
        </div>
      )}
    </div>
  )
}
