// Shared result shapes the dashboard components consume. Centralised
// here so each component stays thin and the page-level loader wires
// them up without type gymnastics.

export interface MetricDelta {
  /** Value for the current day/period. */
  current: number
  /** Value for the day/period being compared against (yesterday, etc.). */
  previous: number
}

export interface MetricsBundle {
  /** Conversations currently open, right now. */
  activeConversations: number
  /** Conversations created today vs yesterday. */
  newConversations: MetricDelta
  newContactsToday: MetricDelta
  openDealsValue: number
  openDealsCount: number
  messagesSentToday: MetricDelta
  followUpsToday: MetricDelta
}

/** Range-scoped totals for the dashboard's period summary. */
export interface RangeSummary {
  messages: number
  newContacts: number
  newConversations: number
  newDeals: number
  dealValue: number
}

export interface ConversationsSeriesPoint {
  day: string // YYYY-MM-DD local
  incoming: number
  outgoing: number
}

export interface PipelineStageSlice {
  id: string
  name: string
  color: string
  dealCount: number
  totalValue: number
}

export interface PipelineDonutData {
  stages: PipelineStageSlice[]
  totalValue: number
}

export interface ResponseTimeBucket {
  /** 0 = Mon … 6 = Sun (Monday-first). */
  dow: number
  /** Average first-response time in minutes. Null means no samples. */
  avgMinutes: number | null
  samples: number
}

export interface ResponseTimeSummary {
  buckets: ResponseTimeBucket[]
  thisWeekAvg: number | null
  lastWeekAvg: number | null
}

export type ActivityKind =
  | 'message'
  | 'deal'
  | 'broadcast'
  | 'automation'
  | 'contact'

export interface ActivityItem {
  id: string
  kind: ActivityKind
  /** Primary line of text rendered in the feed. Pre-formatted. */
  text: string
  /** ISO timestamp the item happened at, drives relative-time + sort. */
  at: string
  /** Optional deep-link for the whole row (not all items have a target). */
  href?: string
}

export interface RecentConversation {
  id: string
  status: 'open' | 'pending' | 'closed'
  assigned_agent_id?: string | null
  last_message_text?: string
  last_message_at?: string
  unread_count: number
  platform?: string | null
  contact: {
    id: string
    name?: string | null
    phone: string
    avatar_url?: string | null
  } | null
}

export interface PlatformChannelCounts {
  whatsapp: number
  instagram: number
  facebook: number
  telegram: number
}

// --- 7. Sales overview (dashboard "Sales Overview" section) -----------

export interface SalesSource {
  key: string
  count: number
}

export interface DealsByMonthPoint {
  label: string
  open: number
  won: number
  lost: number
  wonValue: number
}

export interface SalesOverviewResponse {
  cards: {
    totalLeads: number
    qualifiedLeads: number
    openDealsValue: number
    wonDealsValue: number
    openCount: number
    wonCount: number
    lostCount: number
    winRate: number | null
  }
  sources: SalesSource[]
  dealsByMonth: DealsByMonthPoint[]
}
