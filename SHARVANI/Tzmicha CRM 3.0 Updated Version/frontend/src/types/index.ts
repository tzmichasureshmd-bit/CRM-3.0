// ============================================================
// TZMICHA CRM 3.0 — Master Types
// ============================================================

// ── Auth & Users ─────────────────────────────────────────────
export type AccountRole = "owner" | "admin" | "agent" | "viewer";

export interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  account_id: string;
  account_role: AccountRole;
  created_at: string;
}

// ── Contacts & Leads ─────────────────────────────────────────
export type LeadStatus = "new" | "contacted" | "qualified" | "proposal" | "negotiation" | "won" | "lost";
export type LeadIntent = "low" | "medium" | "high" | "very_high";
export type LeadSentiment = "positive" | "neutral" | "negative";
export type LeadScoreTier = "cold" | "warm" | "hot";

export interface Contact {
  id: string;
  account_id: string;
  name?: string;
  phone: string;
  email?: string;
  company?: string;
  avatar_url?: string;
  lead_status?: LeadStatus;
  lead_score?: number;
  lead_score_tier?: LeadScoreTier;
  lead_score_reason?: string;
  lead_score_updated_at?: string;
  source?: string;
  source_platform?: string;
  last_customer_reply_at?: string;
  messaging_opt_out?: boolean;
  tags?: Tag[];
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

// ── Lead Intelligence ─────────────────────────────────────────
export interface ScoreFactor {
  factor: string;
  weight: number;
  reason: string;
}

export interface LeadIntelligence {
  contact_id: string;
  score: number;
  intent: LeadIntent;
  sentiment: LeadSentiment;
  engagement: "low" | "medium" | "high";
  score_factors: ScoreFactor[];
  ai_summary: string;
  next_best_action: NextBestAction;
  qualification_status: "unqualified" | "qualifying" | "qualified" | "disqualified";
  confidence: AIConfidence;
  last_analyzed_at: string;
}

// ── Next Best Action ──────────────────────────────────────────
export type NBAUrgency = "immediate" | "today" | "this_week" | "low";
export type AIConfidence = "high" | "medium" | "low" | "unknown";

export interface NextBestAction {
  id: string;
  object_type: "lead" | "deal" | "customer" | "campaign" | "content" | "conversation";
  object_id: string;
  action: string;
  reason: string;
  urgency: NBAUrgency;
  confidence: AIConfidence;
  created_at: string;
}

// ── Conversations ─────────────────────────────────────────────
export type ConversationPlatform = "whatsapp" | "instagram" | "facebook" | "telegram" | "email" | "x" | "threads";
export type ConversationStatus = "open" | "pending" | "closed";

export interface Conversation {
  id: string;
  account_id: string;
  contact_id: string;
  platform: ConversationPlatform;
  status: ConversationStatus;
  assigned_agent_id?: string;
  last_message_text?: string;
  last_message_at?: string;
  unread_count: number;
  ai_autoreply_disabled?: boolean;
  contact?: Contact;
  created_at: string;
  updated_at: string;
}

export type MessageSender = "customer" | "agent" | "bot";
export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: MessageSender;
  content_text?: string;
  media_url?: string;
  status: MessageStatus;
  ai_generated?: boolean;
  created_at: string;
}

// ── Deals & Pipeline ──────────────────────────────────────────
export type DealStatus = "open" | "won" | "lost";

export interface Deal {
  id: string;
  account_id: string;
  pipeline_id: string;
  stage_id: string;
  contact_id?: string;
  title: string;
  value: number;
  currency: string;
  status: DealStatus;
  probability?: number;
  expected_close_date?: string;
  notes?: string;
  contact?: Contact;
  stage?: PipelineStage;
  created_at: string;
  updated_at: string;
}

export interface Pipeline {
  id: string;
  account_id: string;
  name: string;
  stages: PipelineStage[];
  created_at: string;
}

export interface PipelineStage {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
  color: string;
}

// ── Content Studio ────────────────────────────────────────────
export type ContentPlatform = "instagram" | "facebook" | "whatsapp" | "telegram" | "email";
export type ContentType = "image" | "video" | "carousel" | "text" | "reel" | "story" | "document";
export type ContentStatus = "draft" | "ai_generated" | "in_review" | "approved" | "scheduled" | "published" | "failed";

export interface ContentItem {
  id: string;
  account_id: string;
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
  campaign_id?: string;
  reach?: number;
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

export interface GeneratedContent {
  headline: string;
  caption: string;
  cta: string;
  hashtags: string[];
  variants: {
    instagram?: string;
    facebook?: string;
    whatsapp?: string;
    short?: string;
    long?: string;
  };
}

// ── AI Command Center ─────────────────────────────────────────
export interface AIRecommendation {
  id: string;
  what: string;
  why: string;
  action_label: string;
  action_href: string;
  urgency: NBAUrgency;
  category: "lead" | "deal" | "campaign" | "team" | "automation" | "revenue";
}

export interface CommandCenterState {
  hot_leads: HotLeadItem[];
  overdue_followups: OverdueFollowupItem[];
  deals_at_risk: DealAtRiskItem[];
  important_conversations: ImportantConversationItem[];
  ai_recommendations: AIRecommendation[];
  team_workload: TeamWorkloadItem[];
  revenue_snapshot: RevenueSnapshot;
  generated_at: string;
}

export interface HotLeadItem {
  contact_id: string;
  contact_name: string;
  score: number;
  intent: LeadIntent;
  reason: string;
  last_activity: string;
  channel: string;
}

export interface OverdueFollowupItem {
  followup_id: string;
  contact_id: string;
  contact_name: string;
  title: string;
  due_date: string;
  overdue_hours: number;
}

export interface DealAtRiskItem {
  deal_id: string;
  deal_title: string;
  value: number;
  currency: string;
  days_stalled: number;
  stage: string;
  risk_reason: string;
}

export interface ImportantConversationItem {
  conversation_id: string;
  contact_name: string;
  channel: string;
  last_message: string;
  unanswered_hours: number;
  intent: LeadIntent;
}

export interface TeamWorkloadItem {
  user_id: string;
  name: string;
  avatar_url?: string;
  open_conversations: number;
  assigned_leads: number;
  overdue_followups: number;
}

export interface RevenueSnapshot {
  pipeline_value: number;
  won_this_month: number;
  open_deals: number;
  currency: string;
}

// ── AI Copilot ────────────────────────────────────────────────
export type CopilotRole = "user" | "assistant";

export interface CopilotMessage {
  id: string;
  role: CopilotRole;
  content: string;
  data_source?: "database" | "ai_inference" | "ai_recommendation";
  confidence?: AIConfidence;
  created_at: string;
}

// ── AI Agents ─────────────────────────────────────────────────
export type AgentType = "lead_qualification" | "sales_assistant" | "followup" | "customer_support" | "content" | "campaign" | "reporting" | "knowledge";
export type AgentStatus = "idle" | "running" | "paused" | "error";

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
  execution_count: number;
  last_run_at?: string;
  created_at: string;
}

// ── Notifications ─────────────────────────────────────────────
export type NotificationType = "hot_lead" | "overdue_followup" | "deal_risk" | "unanswered_conversation" | "automation_failed" | "appointment_reminder";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body?: string;
  read_at?: string;
  action_href?: string;
  created_at: string;
}

// ── Platform Health ───────────────────────────────────────────
export type HealthStatus = "healthy" | "warning" | "error" | "unknown";

export interface HealthCheck {
  service: string;
  status: HealthStatus;
  latency_ms?: number;
  message?: string;
  last_checked_at: string;
}
