/**
 * Campaign domain types, labels and formatting helpers shared by the
 * Campaigns list, create, detail and edit pages (CRM 2.0 sections 4-8).
 *
 * Column names mirror `supabase/migrations/077_crm20_stabilization.sql`,
 * which is the schema contract for this feature.
 */

export type CampaignType =
  | 'lead_generation'
  | 'product_promotion'
  | 'offer'
  | 'awareness'
  | 'event'
  | 'retention'
  | 're_engagement'
  | 'seasonal_promotion'

export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'active'
  | 'paused'
  | 'completed'
  | 'archived'

export type CampaignAudienceType =
  | 'all'
  | 'tags'
  | 'custom_field'
  | 'csv'
  | 'contacts'

export interface CampaignAudienceFilter {
  type?: CampaignAudienceType
  tagIds?: string[]
  contactIds?: string[]
  excludeTagIds?: string[]
  customField?: {
    fieldId: string
    operator: 'is' | 'is_not' | 'contains'
    value: string
  }
  [key: string]: unknown
}

export interface CampaignTracking {
  views?: unknown
  clicks?: unknown
  messages?: unknown
  leads?: unknown
  conversions?: unknown
  currency?: unknown
  [key: string]: unknown
}

export interface Campaign {
  id: string
  account_id: string
  created_by: string | null
  owner_id: string | null
  name: string
  description: string | null
  type: CampaignType
  objective: string | null
  status: CampaignStatus
  audience: string | null
  audience_filter: CampaignAudienceFilter
  channels: string[]
  start_date: string | null
  end_date: string | null
  budget: number | string | null
  message: string | null
  cta: string | null
  landing_page: string | null
  offer_title: string | null
  offer_summary: string | null
  offer_discount: string | null
  offer_valid_until: string | null
  tags: string[]
  tracking: CampaignTracking
  created_at: string
  updated_at: string
}

export const CAMPAIGN_TYPES: readonly { value: CampaignType; label: string }[] = [
  { value: 'lead_generation', label: 'Lead Generation' },
  { value: 'product_promotion', label: 'Product Promotion' },
  { value: 'offer', label: 'Offer' },
  { value: 'awareness', label: 'Awareness' },
  { value: 'event', label: 'Event' },
  { value: 'retention', label: 'Retention' },
  { value: 're_engagement', label: 'Re-engagement' },
  { value: 'seasonal_promotion', label: 'Seasonal Promotion' },
]

export const CAMPAIGN_STATUSES: readonly { value: CampaignStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
]

export const CHANNEL_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'email', label: 'Email' },
]

export const AUDIENCE_FILTER_TYPES: readonly { value: CampaignAudienceType; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'tags', label: 'Contacts with tags' },
  { value: 'custom_field', label: 'Custom field match' },
  { value: 'contacts', label: 'Selected contacts' },
  { value: 'csv', label: 'Imported list' },
]

export const CUSTOM_FIELD_OPERATORS: readonly { value: 'is' | 'is_not' | 'contains'; label: string }[] = [
  { value: 'is', label: 'is' },
  { value: 'is_not', label: 'is not' },
  { value: 'contains', label: 'contains' },
]

export const TRACKING_METRIC_KEYS = [
  'views',
  'clicks',
  'messages',
  'leads',
  'conversions',
] as const

export const TRACKING_METRIC_LABELS: Record<(typeof TRACKING_METRIC_KEYS)[number], string> = {
  views: 'Views',
  clicks: 'Clicks',
  messages: 'Messages',
  leads: 'Leads',
  conversions: 'Conversions',
}

export const STATUS_BADGE_CLASSES: Record<CampaignStatus, string> = {
  draft: 'border-slate-500/30 bg-slate-500/10 text-slate-500',
  scheduled: 'border-blue-500/30 bg-blue-500/10 text-blue-500',
  active: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600',
  paused: 'border-amber-500/30 bg-amber-500/10 text-amber-600',
  completed: 'border-violet-500/30 bg-violet-500/10 text-violet-500',
  archived: 'border-border bg-muted text-muted-foreground',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Human label for a campaign type, falling back to the raw value. */
export function campaignTypeLabel(type: string | null | undefined): string {
  if (!type) return '—'
  return CAMPAIGN_TYPES.find((t) => t.value === type)?.label ?? type
}

/** Human label for a campaign status, falling back to the raw value. */
export function campaignStatusLabel(status: string | null | undefined): string {
  if (!status) return '—'
  return CAMPAIGN_STATUSES.find((s) => s.value === status)?.label ?? status
}

/** Badge classes for a status; unknown values render as the muted default. */
export function statusBadgeClass(status: string | null | undefined): string {
  if (status && status in STATUS_BADGE_CLASSES) {
    return STATUS_BADGE_CLASSES[status as CampaignStatus]
  }
  return STATUS_BADGE_CLASSES.draft
}

/**
 * Parse a `YYYY-MM-DD` date column (or an ISO timestamp) into a local
 * date so timezone offsets can never shift the displayed day.
 */
export function parseDateValue(value: string | null | undefined): Date | null {
  if (!value) return null
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** Locale date for a date column / timestamp, or an em dash when absent. */
export function formatDate(value: string | null | undefined): string {
  const date = parseDateValue(value)
  return date ? date.toLocaleDateString() : '—'
}

/** `start – end`, `From …`, `Until …`, or an em dash when both are empty. */
export function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const startDate = parseDateValue(start)
  const endDate = parseDateValue(end)
  if (!startDate && !endDate) return '—'
  if (startDate && endDate) {
    const a = startDate.toLocaleDateString()
    const b = endDate.toLocaleDateString()
    return a === b ? a : `${a} – ${b}`
  }
  if (startDate) return `From ${startDate.toLocaleDateString()}`
  return `Until ${endDate?.toLocaleDateString() ?? ''}`
}

/**
 * Budget with an optional currency code. `budget` is nullable in the
 * schema, so an empty budget renders as an em dash — never as 0.
 */
export function formatBudget(
  budget: number | string | null | undefined,
  currency?: string | null,
): string {
  if (budget === null || budget === undefined || budget === '') return '—'
  const amount = typeof budget === 'number' ? budget : Number(budget)
  if (!Number.isFinite(amount)) return '—'
  const formatted = amount.toLocaleString(undefined, { maximumFractionDigits: 2 })
  const code = typeof currency === 'string' ? currency.trim().toUpperCase() : ''
  return code ? `${formatted} ${code}` : formatted
}

/**
 * A `tracking` JSONB counter. Missing keys render `0` (the spec
 * default); present-but-unreadable values render `—` so nothing is
 * ever invented.
 */
export function formatMetric(tracking: unknown, key: string): string {
  const value = isRecord(tracking) ? tracking[key] : undefined
  if (value === null || value === undefined) return '0'
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN
  if (!Number.isFinite(numeric)) return '—'
  return numeric.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

/** Currency code stored inside `tracking.currency` (there is no column). */
export function trackingCurrency(tracking: unknown): string | null {
  if (!isRecord(tracking)) return null
  const currency = tracking.currency
  if (typeof currency !== 'string') return null
  const trimmed = currency.trim()
  return trimmed ? trimmed : null
}

/** Split a comma separated input into a clean `TEXT[]` value. */
export function parseCsvList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/**
 * One-line, human readable rendering of an `audience_filter` JSONB
 * object, matching the shape the broadcast composer builds.
 */
export function describeAudienceFilter(filter: unknown): string {
  if (!isRecord(filter) || Object.keys(filter).length === 0) return 'No audience filter set'
  const type = typeof filter.type === 'string' ? filter.type : ''
  const tagIds = stringList(filter.tagIds)
  const excludeTagIds = stringList(filter.excludeTagIds)
  const contactIds = stringList(filter.contactIds)

  if (type === 'tags') {
    const base = tagIds.length > 0 ? `Contacts tagged ${tagIds.join(', ')}` : 'Contacts with tags'
    return excludeTagIds.length > 0 ? `${base} (excluding ${excludeTagIds.join(', ')})` : base
  }
  if (type === 'contacts') {
    return contactIds.length > 0
      ? `${contactIds.length} selected contact${contactIds.length === 1 ? '' : 's'}`
      : 'Selected contacts'
  }
  if (type === 'csv') return 'Imported contact list'
  if (type === 'custom_field') {
    const field = isRecord(filter.customField) ? filter.customField : {}
    const fieldId = typeof field.fieldId === 'string' && field.fieldId ? field.fieldId : 'field'
    const operator = typeof field.operator === 'string' ? field.operator : 'is'
    const value = typeof field.value === 'string' ? field.value : ''
    return `Where ${fieldId} ${operator} ${value}`.trim()
  }
  if (type === 'all') return 'Everyone'
  return type ? `Filter: ${type}` : 'Custom audience filter'
}

/** Audience summary for a list row: free text first, then the filter. */
export function audienceSummary(campaign: {
  audience?: string | null
  audience_filter?: CampaignAudienceFilter | null
}): string {
  const text = campaign.audience?.trim()
  if (text) return text
  return describeAudienceFilter(campaign.audience_filter)
}

/** Channels as a comma separated label list, or an em dash when empty. */
export function channelsSummary(channels: string[] | null | undefined): string {
  if (!channels || channels.length === 0) return '—'
  return channels
    .map((channel) => CHANNEL_OPTIONS.find((c) => c.value === channel)?.label ?? channel)
    .join(', ')
}
