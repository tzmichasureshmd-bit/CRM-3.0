import { NextResponse } from 'next/server'
import {
  requireRole,
  toErrorResponse,
  type AccountContext,
} from '@/lib/auth/account'
import {
  runAutomationsForTrigger,
  triggerMatches,
  type AutomationContext,
} from '@/lib/automations/engine'
import {
  validateInteractivePayload,
  type InteractiveMessagePayload,
} from '@/lib/whatsapp/interactive'
import { isDeliverableUrl } from '@/lib/webhooks/ssrf'
import type {
  Automation,
  AutomationTriggerType,
  ConditionStepConfig,
  InteractiveReplyTriggerConfig,
  KeywordMatchTriggerConfig,
  TagTriggerConfig,
  WaitStepConfig,
} from '@/types'

/**
 * Manual trigger for testing or for external integrations that want
 * to fire automations. Auth is required — we resolve the caller's
 * account_id and dispatch over the account's automations.
 *
 * With `dry_run: true` the endpoint answers "what would happen?" instead:
 * it loads the automation(s) and evaluates the trigger, conditions and
 * step preconditions with the caller's RLS-scoped client, then returns a
 * per-step plan. A dry run never writes logs, never queues waits and
 * never sends a message. Pass `automation_id` to test one saved workflow
 * (its own trigger_type is used, paused included); omit it to preview
 * every automation listening on `trigger_type`.
 */
export async function POST(request: Request) {
  // Firing automations sends outbound WhatsApp — a write action. Require
  // at least `agent`; a viewer must not be able to trigger sends.
  let ctx: AccountContext
  try {
    ctx = await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  if (!body?.trigger_type) {
    return NextResponse.json({ error: 'trigger_type required' }, { status: 400 })
  }

  if (body.dry_run === true) {
    return dryRun(ctx, body as Record<string, unknown>)
  }

  await runAutomationsForTrigger({
    accountId: ctx.accountId,
    triggerType: body.trigger_type as AutomationTriggerType,
    contactId: body.contact_id ?? null,
    context: body.context ?? {},
  })

  return NextResponse.json({ ok: true })
}

// ------------------------------------------------------------
// Dry run
// ------------------------------------------------------------

type PlanStatus = 'would_run' | 'skipped' | 'blocked'

interface PlanStep {
  step_id: string
  step_type: string
  status: PlanStatus
  detail: string | null
  /** Why a step is skipped or would fail. */
  reason?: string
  /** Condition children — both branches, the untaken one marked skipped. */
  children?: PlanStep[]
}

interface PlanSummary {
  total: number
  would_run: number
  skipped: number
  blocked: number
  would_send: number
}

interface DryRunResult {
  automation: {
    id: string
    name: string
    trigger_type: string
    is_active: boolean
  }
  trigger: { matched: boolean; reason: string }
  steps: PlanStep[]
  summary: PlanSummary
  notes: string[]
}

interface TestContact {
  id: string
  name?: string | null
  phone?: string | null
}

/** Everything a dry run reads through — never the service-role client. */
interface PlanRun {
  ctx: AccountContext
  contact: TestContact | null
  context: AutomationContext
  conversationId?: string | null
}

const NEEDS_CONTACT = 'This step needs a contact — pick a test contact to run it.'
const NO_CONVERSATION =
  'The contact has no conversation yet, so a real run would stop here.'

const SEND_STEPS = new Set<string>([
  'send_message',
  'send_buttons',
  'send_list',
  'send_template',
])

async function dryRun(ctx: AccountContext, body: Record<string, unknown>) {
  const contactId =
    typeof body.contact_id === 'string' && body.contact_id.trim()
      ? body.contact_id.trim()
      : null
  const context = (
    typeof body.context === 'object' && body.context !== null ? body.context : {}
  ) as AutomationContext
  const automationId =
    typeof body.automation_id === 'string' && body.automation_id.trim()
      ? body.automation_id.trim()
      : null

  let contact: TestContact | null = null
  if (contactId) {
    const { data, error } = await ctx.supabase
      .from('contacts')
      .select('id, name, phone')
      .eq('id', contactId)
      .eq('account_id', ctx.accountId)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) {
      return NextResponse.json(
        { error: 'The selected contact does not belong to your account.' },
        { status: 400 },
      )
    }
    contact = data as TestContact
  }

  let query = ctx.supabase
    .from('automations')
    .select('*')
    .eq('account_id', ctx.accountId)
  if (automationId) {
    query = query.eq('id', automationId)
  } else {
    query = query.eq('trigger_type', body.trigger_type as string)
  }
  const { data: automations, error } = await query
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (automationId && (!automations || automations.length === 0)) {
    return NextResponse.json({ error: 'Automation not found.' }, { status: 404 })
  }

  const results: DryRunResult[] = []
  for (const automation of (automations ?? []) as Automation[]) {
    results.push(await planAutomation(ctx, automation, context, contact))
  }

  return NextResponse.json({ dry_run: true, contact, results })
}

async function planAutomation(
  ctx: AccountContext,
  automation: Automation,
  context: AutomationContext,
  contact: TestContact | null,
): Promise<DryRunResult> {
  const notes: string[] = [
    'Preview only — no messages were sent and nothing was saved or logged.',
  ]
  const matched = triggerMatches(automation, context)
  const result: DryRunResult = {
    automation: {
      id: automation.id,
      name: automation.name,
      trigger_type: automation.trigger_type,
      is_active: automation.is_active,
    },
    trigger: { matched, reason: triggerReason(automation, context, matched) },
    steps: [],
    summary: { total: 0, would_run: 0, skipped: 0, blocked: 0, would_send: 0 },
    notes,
  }

  if (!matched) {
    notes.push('The trigger does not match the test inputs, so nothing would run.')
    return result
  }
  if (!automation.is_active) {
    notes.push(
      'This automation is paused — it would not fire in production until you activate it.',
    )
  }
  if (!contact) {
    notes.push(
      'No test contact selected — steps that need one are shown as blocked.',
    )
  }

  const run: PlanRun = { ctx, contact, context }
  const loaded = await loadRootSteps(ctx, automation.id)
  if ('error' in loaded) {
    notes.push(`Steps could not be loaded: ${loaded.error}`)
    return result
  }
  if (loaded.roots.length === 0) {
    notes.push('This automation has no steps yet.')
    return result
  }

  const walked = await walkScope(loaded.roots, run)
  result.steps = walked.nodes
  result.summary = summarize(walked.nodes)
  if (result.summary.blocked > 0) {
    notes.push(
      `${result.summary.blocked} step(s) would fail if the automation ran right now.`,
    )
  }
  if (countWaits(walked.nodes) > 0) {
    notes.push('Wait steps pause the run; the rest continues when the wait resumes.')
  }
  return result
}

/**
 * Why the trigger does or does not match the test inputs. The verdict
 * itself comes from `triggerMatches` — the same function the live
 * dispatch loop uses — so preview and production cannot disagree.
 */
function triggerReason(
  automation: Automation,
  context: AutomationContext,
  matched: boolean,
): string {
  switch (automation.trigger_type) {
    case 'keyword_match': {
      const cfg = automation.trigger_config as KeywordMatchTriggerConfig
      const keywords = cfg?.keywords ?? []
      if (keywords.length === 0) return 'no keywords are configured on this trigger'
      const text = (context.message_text ?? '').toString()
      if (!text) return 'the test has no message text to match against'
      if (!matched) return 'none of the configured keywords appear in the message'
      const hit = keywords.find((k) => {
        const haystack = cfg.case_sensitive ? text : text.toLowerCase()
        const key = cfg.case_sensitive ? k : k.toLowerCase()
        return cfg.match_type === 'exact' ? haystack === key : haystack.includes(key)
      })
      return `the message matches the keyword “${hit ?? keywords[0]}”`
    }
    case 'interactive_reply': {
      const cfg = automation.trigger_config as InteractiveReplyTriggerConfig
      const replyId = context.interactive_reply_id
      if (!replyId) return 'the test has no button or list reply id'
      if (!matched) return `the reply id “${replyId}” is not on this trigger`
      const ids = (cfg?.reply_ids ?? []).join('”, “')
      return `the reply id “${replyId}” is one of “${ids}”`
    }
    case 'tag_added': {
      const cfg = automation.trigger_config as TagTriggerConfig
      const tagId = context.tag_id
      if (!tagId) return 'the test has no tag id'
      if (!matched) return `this trigger listens for tag ${cfg?.tag_id || '(not set)'}`
      return `tag “${tagId}” was added to the contact`
    }
    default:
      return 'this trigger type fires for every matching event'
  }
}

interface FlatStep {
  id: string
  step_type: string
  step_config: Record<string, unknown>
  branch: 'yes' | 'no' | null
  children: FlatStep[]
}

interface DbStep {
  id: string
  parent_step_id: string | null
  branch: 'yes' | 'no' | null
  step_type: string
  step_config: Record<string, unknown>
}

/** Load the step tree through the caller's RLS — account members can
 *  read steps of automations in their own account (migration 045). */
async function loadRootSteps(
  ctx: AccountContext,
  automationId: string,
): Promise<{ roots: FlatStep[] } | { error: string }> {
  const { data, error } = await ctx.supabase
    .from('automation_steps')
    .select('*')
    .eq('automation_id', automationId)
    .order('position', { ascending: true })
  if (error) return { error: error.message }

  const byId = new Map<string, FlatStep>()
  for (const row of (data ?? []) as DbStep[]) {
    byId.set(row.id, {
      id: row.id,
      step_type: row.step_type,
      step_config: row.step_config ?? {},
      branch: row.branch,
      children: [],
    })
  }
  const roots: FlatStep[] = []
  for (const row of (data ?? []) as DbStep[]) {
    const node = byId.get(row.id)
    if (!node) continue
    const parent = row.parent_step_id ? byId.get(row.parent_step_id) : null
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return { roots }
}

interface WalkOutcome {
  nodes: PlanStep[]
}

/**
 * Simulate one execution scope (root steps, or one branch of a
 * condition). Mirrors the engine's control flow: a failed step stops
 * its scope, a wait stops its scope until the cron resumes it, and a
 * condition evaluates then walks only the branch it took — the other
 * branch is reported as skipped. Branch outcomes never stop the parent.
 */
async function walkScope(steps: FlatStep[], run: PlanRun): Promise<WalkOutcome> {
  const nodes: PlanStep[] = []
  let halt: string | null = null

  for (const step of steps) {
    if (halt) {
      nodes.push(skipTree(step, halt))
      continue
    }

    if (step.step_type === 'condition') {
      const cfg = step.step_config as unknown as ConditionStepConfig
      const verdict = await evaluateCondition(cfg, run)
      const yesKids = step.children.filter((c) => c.branch !== 'no')
      const noKids = step.children.filter((c) => c.branch === 'no')
      const takenKids = verdict.taken === 'yes' ? yesKids : noKids
      const otherKids = verdict.taken === 'yes' ? noKids : yesKids
      const inner = await walkScope(takenKids, run)
      const children = [
        ...inner.nodes,
        ...otherKids.map((c) =>
          skipTree(c, `the condition went “${verdict.taken}”, so this path stays idle`),
        ),
      ]
      nodes.push({
        step_id: step.id,
        step_type: 'condition',
        status: 'would_run',
        detail: `branch=${verdict.taken} — ${verdict.detail}`,
        children,
      })
      continue
    }

    if (step.step_type === 'wait') {
      const cfg = step.step_config as unknown as WaitStepConfig
      nodes.push({
        step_id: step.id,
        step_type: 'wait',
        status: 'would_run',
        detail: `would pause the run for ${cfg.amount} ${cfg.unit}, then resume`,
      })
      halt = 'these steps run after the wait resumes'
      continue
    }

    const verdict = await describeAction(step, run)
    if (verdict.blocked) {
      nodes.push({
        step_id: step.id,
        step_type: step.step_type,
        status: 'blocked',
        detail: verdict.detail,
        reason: verdict.blocked,
      })
      halt = 'the run stops at the failed step above'
      continue
    }
    nodes.push({
      step_id: step.id,
      step_type: step.step_type,
      status: 'would_run',
      detail: verdict.detail,
    })
  }

  return { nodes }
}

function skipTree(step: FlatStep, reason: string): PlanStep {
  return {
    step_id: step.id,
    step_type: step.step_type,
    status: 'skipped',
    detail: null,
    reason,
    ...(step.children.length > 0
      ? { children: step.children.map((c) => skipTree(c, reason)) }
      : {}),
  }
}

/**
 * Would this action step run, and what would it do? Config problems
 * (the automation's own fault) and test-setup problems (no contact
 * picked) both come back as `blocked`, with a reason that says which.
 */
async function describeAction(
  step: FlatStep,
  run: PlanRun,
): Promise<{ detail: string | null; blocked?: string }> {
  const cfg = step.step_config ?? {}

  switch (step.step_type) {
    case 'send_message': {
      const text = interpolate(String(cfg.text ?? ''), run.context)
      if (!text.trim()) return { detail: null, blocked: 'The message text is empty.' }
      if (!run.contact) return { detail: null, blocked: NEEDS_CONTACT }
      if (!(await hasConversation(run))) return { detail: null, blocked: NO_CONVERSATION }
      return { detail: `would send: “${clip(text)}”` }
    }

    case 'send_buttons':
    case 'send_list': {
      const check = validateInteractivePayload(cfg as unknown as InteractiveMessagePayload)
      if (!check.ok) return { detail: null, blocked: check.error }
      if (!run.contact) return { detail: null, blocked: NEEDS_CONTACT }
      if (!(await hasConversation(run))) return { detail: null, blocked: NO_CONVERSATION }
      return {
        detail:
          step.step_type === 'send_buttons'
            ? 'would send a message with reply buttons'
            : 'would send a list menu',
      }
    }

    case 'send_template': {
      const name = String(cfg.template_name ?? '').trim()
      if (!name) return { detail: null, blocked: 'No template chosen.' }
      if (!run.contact) return { detail: null, blocked: NEEDS_CONTACT }
      if (!(await hasConversation(run))) return { detail: null, blocked: NO_CONVERSATION }
      return { detail: `would send template “${name}”` }
    }

    case 'add_tag':
    case 'remove_tag': {
      const tagId = String(cfg.tag_id ?? '').trim()
      if (!tagId) return { detail: null, blocked: 'No tag chosen for this step.' }
      if (!run.contact) return { detail: null, blocked: NEEDS_CONTACT }
      return {
        detail: step.step_type === 'add_tag' ? `would add tag ${tagId}` : `would remove tag ${tagId}`,
      }
    }

    case 'assign_conversation': {
      if (cfg.mode === 'specific' && !String(cfg.agent_id ?? '').trim()) {
        return { detail: null, blocked: 'No agent chosen.' }
      }
      if (!run.contact) return { detail: null, blocked: NEEDS_CONTACT }
      return {
        detail:
          cfg.mode === 'round_robin'
            ? 'would hand the conversation to the next available agent'
            : `would assign the conversation to ${String(cfg.agent_id)}`,
      }
    }

    case 'update_contact_field': {
      const field = String(cfg.field ?? '').trim()
      if (!field) return { detail: null, blocked: 'No field chosen.' }
      if (cfg.value === undefined || cfg.value === null || cfg.value === '') {
        return { detail: null, blocked: 'No value to write.' }
      }
      if (!run.contact) return { detail: null, blocked: NEEDS_CONTACT }
      const value = interpolate(String(cfg.value), run.context)
      return { detail: `would set ${field} to “${clip(value)}”` }
    }

    case 'create_deal': {
      if (!cfg.pipeline_id) return { detail: null, blocked: 'No pipeline chosen.' }
      if (!cfg.stage_id) return { detail: null, blocked: 'No stage chosen.' }
      if (!cfg.title) return { detail: null, blocked: 'The deal needs a name.' }
      if (!run.contact) return { detail: null, blocked: NEEDS_CONTACT }
      return { detail: `would create the deal “${clip(String(cfg.title))}”` }
    }

    case 'send_webhook': {
      const url = String(cfg.url ?? '').trim()
      if (!url) return { detail: null, blocked: 'No URL set.' }
      if (!(await isDeliverableUrl(url))) {
        return {
          detail: null,
          blocked: 'That URL is not allowed — private or internal addresses are blocked.',
        }
      }
      return { detail: `would POST to ${url}` }
    }

    case 'close_conversation': {
      if (!run.contact) return { detail: null, blocked: NEEDS_CONTACT }
      if (!(await hasConversation(run))) {
        return { detail: null, blocked: 'The contact has no conversation to close.' }
      }
      return { detail: 'would mark the conversation closed' }
    }

    default:
      return {
        detail: null,
        blocked: `This build has no handler for “${step.step_type}”, so nothing would happen.`,
      }
  }
}

/**
 * Read-only port of the engine's condition evaluation: same subjects
 * and same results, queried through the caller's RLS client with no
 * writes. Returns the branch the engine would take plus a sentence
 * explaining why, for the preview.
 */
async function evaluateCondition(
  cfg: ConditionStepConfig,
  run: PlanRun,
): Promise<{ taken: 'yes' | 'no'; detail: string }> {
  switch (cfg.subject) {
    case 'tag_presence': {
      if (!cfg.operand) return { taken: 'no', detail: 'the condition has no tag set' }
      if (!run.contact) {
        return { taken: 'no', detail: 'no test contact was picked to check' }
      }
      const { count, error } = await run.ctx.supabase
        .from('contact_tags')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', run.contact.id)
        .eq('tag_id', cfg.operand)
      if (error) return { taken: 'no', detail: `tag lookup failed: ${error.message}` }
      const has = (count ?? 0) > 0
      return {
        taken: has ? 'yes' : 'no',
        detail: has
          ? `the contact has tag ${cfg.operand}`
          : `the contact does not have tag ${cfg.operand}`,
      }
    }

    case 'contact_field': {
      if (!cfg.operand) return { taken: 'no', detail: 'the condition has no field set' }
      if (!run.contact) {
        return { taken: 'no', detail: 'no test contact was picked to check' }
      }
      const { data, error } = await run.ctx.supabase
        .from('contacts')
        .select(cfg.operand)
        .eq('id', run.contact.id)
        .eq('account_id', run.ctx.accountId)
        .maybeSingle()
      if (error) {
        return { taken: 'no', detail: `cannot read contact field “${cfg.operand}”` }
      }
      const value = (data as Record<string, unknown> | null)?.[cfg.operand]
      const equals = value != null && String(value) === String(cfg.value ?? '')
      return {
        taken: equals ? 'yes' : 'no',
        detail: `${cfg.operand} is ${
          value == null ? 'empty' : `“${clip(String(value))}”`
        }, compared against “${cfg.value ?? ''}”`,
      }
    }

    case 'message_content': {
      const text = (run.context.message_text ?? '').toString()
      if (!text) return { taken: 'no', detail: 'the test has no message text' }
      const has = text.toLowerCase().includes((cfg.value ?? '').toLowerCase())
      return {
        taken: has ? 'yes' : 'no',
        detail: has
          ? `the message contains “${cfg.value ?? ''}”`
          : `the message does not contain “${cfg.value ?? ''}”`,
      }
    }

    case 'time_of_day': {
      const [from, to] = (cfg.operand ?? '').split('-')
      if (!from || !to) return { taken: 'no', detail: 'the time range is not set' }
      const now = new Date()
      const mins = now.getHours() * 60 + now.getMinutes()
      const parse = (s: string) => {
        const [h, m] = s.split(':').map(Number)
        return (h || 0) * 60 + (m || 0)
      }
      const f = parse(from)
      const t = parse(to)
      const inside = f <= t ? mins >= f && mins < t : mins >= f || mins < t
      const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      return {
        taken: inside ? 'yes' : 'no',
        detail: `now is ${clock}, ${inside ? 'inside' : 'outside'} ${cfg.operand}`,
      }
    }

    default:
      return { taken: 'no', detail: `unknown condition subject “${String(cfg.subject)}”` }
  }
}

async function hasConversation(run: PlanRun): Promise<boolean> {
  if (!run.contact) return false
  if (run.conversationId !== undefined) return run.conversationId !== null
  const { data } = await run.ctx.supabase
    .from('conversations')
    .select('id')
    .eq('account_id', run.ctx.accountId)
    .eq('contact_id', run.contact.id)
    .maybeSingle()
  run.conversationId = data?.id ?? null
  return run.conversationId !== null
}

/** Same variable resolution as the engine's interpolate(). */
function interpolate(s: string, context: AutomationContext): string {
  return s.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const [ns, prop] = String(key).split('.')
    if (ns === 'message' && prop === 'text') return String(context.message_text ?? '')
    if (ns === 'vars' && prop) return String(context.vars?.[prop] ?? '')
    return ''
  })
}

function clip(s: string, max = 80): string {
  const flat = s.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

function summarize(nodes: PlanStep[]): PlanSummary {
  const summary: PlanSummary = {
    total: 0,
    would_run: 0,
    skipped: 0,
    blocked: 0,
    would_send: 0,
  }
  const walk = (list: PlanStep[]) => {
    for (const node of list) {
      summary.total++
      if (node.status === 'would_run') {
        summary.would_run++
        if (SEND_STEPS.has(node.step_type)) summary.would_send++
      } else if (node.status === 'skipped') {
        summary.skipped++
      } else {
        summary.blocked++
      }
      if (node.children) walk(node.children)
    }
  }
  walk(nodes)
  return summary
}

function countWaits(nodes: PlanStep[]): number {
  let count = 0
  for (const node of nodes) {
    if (node.step_type === 'wait' && node.status === 'would_run') count++
    if (node.children) count += countWaits(node.children)
  }
  return count
}
