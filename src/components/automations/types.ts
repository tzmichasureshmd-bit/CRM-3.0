export interface Automation {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_config: Record<string, unknown> | null;
  is_active: boolean;
  status: string;
  ai_enabled: boolean;
  execution_count: number;
  success_count: number;
  failure_count: number;
  last_run_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  next_run_at: string | null;
  workflow_version: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationStep {
  id?: string;
  step_type: string;
  position: number;
  config: Record<string, unknown>;
  parent_step_id?: string | null;
  branch?: string | null;
}

export interface AutomationSummary {
  total: number;
  active: number;
  draft: number;
  paused: number;
  archived: number;
  executions: number;
  successes: number;
  failures: number;
}

export interface StepLog {
  step_type: string;
  action?: string;
  status: string;
  detail: string;
  duration_ms?: number;
  executed_at?: string;
}

export interface Execution {
  id: string;
  automation_id: string;
  automation_name?: string | null;
  contact_id: string | null;
  trigger_type: string;
  status: string;
  current_step: number | null;
  total_steps: number | null;
  steps_log: StepLog[] | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  wait_until: string | null;
  duration_ms?: number | null;
}

export interface AgentLite {
  id: string;
  name: string;
  type: string;
  description: string | null;
  status: string;
  enabled: boolean;
  allowed_tools: string[];
  requires_approval: boolean;
  max_actions_per_run: number;
  execution_count: number;
  success_count: number;
  failure_count: number;
  last_run_at: string | null;
}

export interface ConditionClause {
  field: string;
  operator: string;
  value?: string;
}

export interface ConditionConfig {
  match: 'all' | 'any';
  conditions: ConditionClause[];
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const STATUS_META: Record<string, { color: string; bg: string; label: string }> = {
  active:   { color: '#28c99a', bg: 'rgba(40,201,154,0.12)',  label: 'Active' },
  paused:   { color: '#f4c95d', bg: 'rgba(244,201,93,0.12)',  label: 'Paused' },
  draft:    { color: '#8790aa', bg: 'rgba(135,144,170,0.12)', label: 'Draft' },
  error:    { color: '#f46b72', bg: 'rgba(244,107,114,0.12)', label: 'Error' },
  archived: { color: '#8790aa', bg: 'rgba(135,144,170,0.12)', label: 'Archived' },
};

export const EXEC_STATUS_META: Record<string, { color: string; label: string }> = {
  pending:   { color: '#8790aa', label: 'Queued' },
  running:   { color: '#4d7cff', label: 'Running' },
  waiting:   { color: '#f4c95d', label: 'Waiting' },
  completed: { color: '#28c99a', label: 'Completed' },
  failed:    { color: '#f46b72', label: 'Failed' },
  cancelled: { color: '#8790aa', label: 'Cancelled' },
};

/** Build a summary of a step for display in lists / flow diagrams. */
export function stepSummary(step: { step_type: string; config: Record<string, unknown> }): string {
  const cfg = step.config ?? {};
  switch (step.step_type) {
    case 'condition': {
      const c = cfg as { conditions?: ConditionClause[]; match?: string };
      const count = Array.isArray(c.conditions) ? c.conditions.length : 0;
      return `${count} condition${count === 1 ? '' : 's'} (${(c.match ?? 'all').toUpperCase()})`;
    }
    case 'wait':
      return `Wait ${cfg.amount ?? 1} ${cfg.unit ?? 'hours'}`;
    case 'end':
      return 'End';
    case 'send_message':
    case 'send_welcome_message':
      return `${cfg.channel ?? 'channel'}: ${String(cfg.text ?? '').slice(0, 48)}`;
    case 'send_list':
      return `${cfg.channel ?? 'channel'}: list (${String(cfg.list_items ?? '').split('\n').filter(Boolean).length} options)`;
    case 'add_tag':
      return `Add tag "${cfg.tag ?? ''}"`;
    case 'remove_tag':
      return `Remove tag "${cfg.tag ?? ''}"`;
    case 'assign_contact':
      return `Assign to ${cfg.user_id ?? 'user'}`;
    case 'update_lead_status':
      return `Lead status → ${cfg.status ?? ''}`;
    case 'create_follow_up':
      return `Follow-up: ${cfg.title ?? ''}`;
    case 'add_note':
      return `Note: ${String(cfg.note ?? '').slice(0, 40)}`;
    case 'send_notification':
      return `Notify: ${String(cfg.message ?? '').slice(0, 40)}`;
    case 'webhook':
      return `${cfg.method ?? 'POST'} ${cfg.url ?? ''}`;
    default:
      return step.step_type;
  }
}
