export const TICKET_STATUSES = [
  "open",
  "in_progress",
  "waiting",
  "resolved",
  "closed",
] as const;

export type AdminTicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export type AdminTicketPriority = (typeof TICKET_PRIORITIES)[number];

export function isTicketStatus(value: unknown): value is AdminTicketStatus {
  return (
    typeof value === "string" && (TICKET_STATUSES as readonly string[]).includes(value)
  );
}

export function isTicketPriority(value: unknown): value is AdminTicketPriority {
  return (
    typeof value === "string" && (TICKET_PRIORITIES as readonly string[]).includes(value)
  );
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export interface AdminAccountRef {
  id: string;
  name: string;
  slug: string | null;
}

export interface AdminProfileRef {
  user_id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
}

export interface AdminContactRef {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface AdminTicketRow {
  id: string;
  account_id: string;
  ticket_number: number;
  contact_id: string | null;
  conversation_id: string | null;
  subject: string;
  description: string | null;
  status: AdminTicketStatus;
  priority: AdminTicketPriority;
  category?: string | null;
  assigned_agent_id: string | null;
  tags: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  closed_at: string | null;
}

export interface AdminTicketListItem extends AdminTicketRow {
  account: AdminAccountRef | null;
  contact: AdminContactRef | null;
  assignee: AdminProfileRef | null;
  requester_name: string | null;
  requester_email: string | null;
}

export interface AdminTicketStats {
  total: number;
  open: number;
  in_progress: number;
  waiting: number;
  resolved: number;
  resolved_today: number;
  resolved_last_7_days: number;
  unassigned: number;
}

export interface AdminTicketListResponse {
  tickets: AdminTicketListItem[];
  total: number;
  page: number;
  pageSize: number;
  nextCursor: string | null;
  stats: AdminTicketStats;
}

export interface AdminTicketBulkResponse {
  updated: number;
  tickets: AdminTicketRow[];
}

export interface AdminTicketDetailRow extends AdminTicketRow {
  account: AdminAccountRef | null;
  contact: AdminContactRef | null;
}

export interface AdminTicketCommentItem {
  id: string;
  account_id: string;
  ticket_id: string;
  user_id: string | null;
  content: string;
  is_internal: boolean;
  created_at: string;
  author: AdminProfileRef | null;
}

export type AdminTicketTimelineKind =
  | "created"
  | "reply"
  | "note"
  | "resolved"
  | "closed"
  | "updated";

export interface AdminTicketTimelineEntry {
  at: string;
  kind: AdminTicketTimelineKind;
  label: string;
}

export interface AdminTicketDetailResponse {
  ticket: AdminTicketDetailRow;
  assignee: AdminProfileRef | null;
  comments: AdminTicketCommentItem[];
  timeline: AdminTicketTimelineEntry[];
  agents: AdminProfileRef[];
}

export interface AdminTicketMutationResponse {
  ticket: AdminTicketRow;
}

export interface AdminTicketCommentResponse {
  comment: AdminTicketCommentItem;
}
