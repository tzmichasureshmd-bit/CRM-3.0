/**
 * CRM 3.0 — Master Types
 */

// ============================================================
// AI ORCHESTRATOR TYPES
// ============================================================

export type AIProvider = 'openai' | 'anthropic';
export type AIConfidence = 'high' | 'medium' | 'low' | 'unknown';

export interface AIOperation {
  id: string;
  account_id: string;
  user_id?: string;
  operation_type: AIOperationType;
  provider: AIProvider;
  model: string;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  success: boolean;
  error_message?: string;
  created_at: string;
}

export type AIOperationType =
  | 'lead_score'
  | 'lead_qualify'
  | 'next_best_action'
  | 'conversation_summary'
  | 'reply_assist'
  | 'content_generate'
  | 'campaign_analyze'
  | 'customer_intelligence'
  | 'copilot_query'
  | 'agent_run'
  | 'knowledge_query'
  | 'sentiment_analyze'
  | 'intent_detect'
  | 'comment_intent';

// ============================================================
// AI LEAD INTELLIGENCE
// ============================================================

export type LeadIntent = 'low' | 'medium' | 'high' | 'very_high';
export type LeadSentiment = 'positive' | 'neutral' | 'negative';
export type LeadEngagement = 'low' | 'medium' | 'high';

export interface LeadIntelligence {
  contact_id: string;
  account_id: string;
  score: number; // 0-100
  intent: LeadIntent;
  sentiment: LeadSentiment;
  engagement: LeadEngagement;
  score_factors: ScoreFactor[];
  ai_summary: string;
  next_best_action: NextBestAction;
  qualification_status: 'unqualified' | 'qualifying' | 'qualified' | 'disqualified';
  confidence: AIConfidence;
  last_analyzed_at: string;
}

export interface ScoreFactor {
  factor: string;
  weight: number; // -10 to +10
  reason: string;
}

// ============================================================
// NEXT BEST ACTION ENGINE
// ============================================================

export type NBAObjectType = 'lead' | 'deal' | 'customer' | 'campaign' | 'content' | 'conversation';
export type NBAUrgency = 'immediate' | 'today' | 'this_week' | 'low';

export interface NextBestAction {
  id: string;
  account_id: string;
  object_type: NBAObjectType;
  object_id: string;
  action: string;
  reason: string;
  urgency: NBAUrgency;
  confidence: AIConfidence;
  expires_at?: string;
  created_at: string;
  acted_on_at?: string;
}

// ============================================================
// AI COMMAND CENTER
// ============================================================

export interface CommandCenterState {
  hot_leads: HotLeadItem[];
  overdue_followups: OverdueFollowupItem[];
  deals_at_risk: DealAtRiskItem[];
  important_conversations: ImportantConversationItem[];
  ai_recommendations: AIRecommendation[];
  team_workload: TeamWorkloadItem[];
  automation_health: AutomationHealthItem[];
  revenue_opportunities: RevenueOpportunityItem[];
  generated_at: string;
}

export interface HotLeadItem {
  contact_id: string;
  contact_name: string;
  score: number;
  intent: LeadIntent;
  reason: string;
  last_activity: string;
  recommended_action: string;
  channel: string;
}

export interface OverdueFollowupItem {
  followup_id: string;
  contact_id: string;
  contact_name: string;
  due_date: string;
  overdue_hours: number;
  assigned_to?: string;
  title: string;
}

export interface DealAtRiskItem {
  deal_id: string;
  deal_title: string;
  value: number;
  currency: string;
  days_stalled: number;
  stage: string;
  risk_reason: string;
  recommended_action: string;
}

export interface ImportantConversationItem {
  conversation_id: string;
  contact_name: string;
  channel: string;
  last_message: string;
  unanswered_hours: number;
  intent: LeadIntent;
  priority: 'high' | 'medium' | 'low';
}

export interface AIRecommendation {
  id: string;
  what: string;
  why: string;
  action_label: string;
  action_href: string;
  urgency: NBAUrgency;
  category: 'lead' | 'deal' | 'campaign' | 'team' | 'automation' | 'revenue';
}

export interface TeamWorkloadItem {
  user_id: string;
  name: string;
  avatar_url?: string;
  open_conversations: number;
  assigned_leads: number;
  overdue_followups: number;
  avg_response_time_min: number;
}

export interface AutomationHealthItem {
  automation_id: string;
  name: string;
  status: 'healthy' | 'warning' | 'failed';
  last_run?: string;
  failure_count: number;
  message?: string;
}

export interface RevenueOpportunityItem {
  type: 'deal_closing' | 'upsell' | 'reactivation' | 'campaign';
  title: string;
  estimated_value: number;
  currency: string;
  reason: string;
  action_href: string;
}

// ============================================================
// AI BUSINESS COPILOT
// ============================================================

export type CopilotMessageRole = 'user' | 'assistant' | 'system';

export interface CopilotMessage {
  id: string;
  role: CopilotMessageRole;
  content: string;
  tool_calls?: CopilotToolCall[];
  data_source?: 'database' | 'ai_inference' | 'ai_recommendation';
  confidence?: AIConfidence;
  created_at: string;
}

export interface CopilotToolCall {
  tool: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  success: boolean;
}

export interface CopilotSession {
  id: string;
  account_id: string;
  user_id: string;
  messages: CopilotMessage[];
  created_at: string;
  updated_at: string;
}

// ============================================================
// CONTENT STUDIO
// ============================================================

export type ContentPlatform = 'instagram' | 'facebook' | 'whatsapp' | 'telegram' | 'email';
export type ContentType = 'image' | 'video' | 'carousel' | 'text' | 'reel' | 'story' | 'document';
export type ContentStatus =
  | 'draft'
  | 'ai_generated'
  | 'in_review'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'failed';

export interface ContentItem {
  id: string;
  account_id: string;
  user_id: string;
  campaign_id?: string;
  title: string;
  caption: string;
  cta?: string;
  hashtags: string[];
  platform: ContentPlatform;
  content_type: ContentType;
  media_urls: string[];
  status: ContentStatus;
  scheduled_at?: string;
  published_at?: string;
  failure_reason?: string;
  ai_generated: boolean;
  // Attribution metrics (populated after publishing)
  reach?: number;
  impressions?: number;
  engagement?: number;
  clicks?: number;
  messages_generated?: number;
  leads_generated?: number;
  qualified_leads?: number;
  deals_attributed?: number;
  revenue_attributed?: number;
  currency?: string;
  created_at: string;
  updated_at: string;
}

export interface ContentVariant {
  id: string;
  content_id: string;
  platform: ContentPlatform;
  caption: string;
  hashtags: string[];
  cta?: string;
  created_at: string;
}

// ============================================================
// CONTENT → REVENUE ATTRIBUTION
// ============================================================

export interface AttributionChain {
  content_id?: string;
  campaign_id?: string;
  engagement_event_id?: string;
  conversation_id?: string;
  contact_id?: string;
  lead_created_at?: string;
  deal_id?: string;
  deal_value?: number;
  revenue_amount?: number;
  currency?: string;
  attribution_confidence: AIConfidence;
  attribution_method: 'direct' | 'last_touch' | 'first_touch' | 'inferred';
  created_at: string;
}

// ============================================================
// CUSTOMER JOURNEY
// ============================================================

export type JourneyStage =
  | 'discovery'
  | 'engagement'
  | 'conversation'
  | 'qualification'
  | 'sales'
  | 'conversion'
  | 'retention'
  | 'expansion';

export interface CustomerJourneyEvent {
  id: string;
  account_id: string;
  contact_id: string;
  stage: JourneyStage;
  event_type: string;
  event_description: string;
  source_type: 'content' | 'campaign' | 'conversation' | 'deal' | 'automation' | 'manual';
  source_id?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

// ============================================================
// AI AGENTS
// ============================================================

export type AgentType =
  | 'lead_qualification'
  | 'sales_assistant'
  | 'followup'
  | 'customer_support'
  | 'content'
  | 'campaign'
  | 'reporting'
  | 'knowledge';

export type AgentStatus = 'idle' | 'running' | 'paused' | 'error';

export interface AIAgent {
  id: string;
  account_id: string;
  name: string;
  type: AgentType;
  description: string;
  status: AgentStatus;
  instructions: string;
  allowed_tools: string[];
  requires_approval: boolean;
  max_actions_per_run: number;
  execution_count: number;
  last_run_at?: string;
  created_at: string;
  updated_at: string;
}

export interface AIAgentRun {
  id: string;
  account_id: string;
  agent_id: string;
  triggered_by: string; // user_id or 'automation'
  status: 'running' | 'completed' | 'failed' | 'awaiting_approval';
  actions_taken: AgentAction[];
  result_summary?: string;
  error_message?: string;
  tokens_used: number;
  started_at: string;
  completed_at?: string;
}

export interface AgentAction {
  tool: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  approved: boolean;
  executed_at: string;
}

// ============================================================
// SMART SEGMENTATION
// ============================================================

export type SegmentType = 'manual' | 'rule_based' | 'ai_assisted';

export interface ContactSegment {
  id: string;
  account_id: string;
  name: string;
  description?: string;
  type: SegmentType;
  rules?: SegmentRule[];
  ai_criteria?: string;
  contact_count: number;
  last_computed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface SegmentRule {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'gt' | 'lt' | 'is_null' | 'is_not_null';
  value?: string | number | boolean;
}

// ============================================================
// REVENUE INTELLIGENCE
// ============================================================

export interface RevenueIntelligence {
  account_id: string;
  period_start: string;
  period_end: string;
  total_revenue: number;
  pipeline_value: number;
  weighted_pipeline: number;
  forecast: number;
  forecast_confidence: AIConfidence;
  won_deals: number;
  lost_deals: number;
  win_rate: number;
  avg_deal_value: number;
  avg_sales_cycle_days: number;
  top_channels: ChannelRevenue[];
  top_campaigns: CampaignRevenue[];
  currency: string;
  generated_at: string;
}

export interface ChannelRevenue {
  channel: string;
  leads: number;
  deals: number;
  revenue: number;
  conversion_rate: number;
}

export interface CampaignRevenue {
  campaign_id: string;
  campaign_name: string;
  leads: number;
  qualified_leads: number;
  deals: number;
  revenue: number;
  roi?: number;
}

// ============================================================
// PLATFORM HEALTH
// ============================================================

export type HealthStatus = 'healthy' | 'warning' | 'error' | 'unknown';

export interface PlatformHealthCheck {
  service: string;
  status: HealthStatus;
  latency_ms?: number;
  message?: string;
  last_checked_at: string;
}

export interface PlatformHealth {
  overall: HealthStatus;
  checks: PlatformHealthCheck[];
  generated_at: string;
}
