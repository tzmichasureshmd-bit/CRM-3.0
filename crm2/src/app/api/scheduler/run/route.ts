import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { loadAiConfig } from '@/lib/ai/config'
import { buildConversationContext } from '@/lib/ai/context'
import { generateReply } from '@/lib/ai/generate'
import { logAiUsage } from '@/lib/ai/usage'
import { sendMessageToConversation } from '@/lib/whatsapp/send-message'
import { processPendingLeadNotifications } from '@/lib/lead-notifications/process'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * GET /api/scheduler/run  (cron — x-cron-secret required)
 *
 * Drainable cron endpoint that processes four categories:
 *   1. AI follow-up executions (waiting/active with next_action_at <= now)
 *   2. Appointment reminders (24 h / 1 h before the appointment)
 *   3. Hot-lead & unanswered-conversation notifications
 *   4. Pending lead-notification emails (Super Admin two-person alerts)
 *
 * Safe to re-invoke while still running — every claim step is an
 * optimistic UPDATE ... WHERE status = 'expected' so overlapping
 * invocations simply skip already-claimed rows.
 *
 * Pattern mirrors /api/automations/cron (x-cron-secret guard,
 * supabaseAdmin, claim-then-process).
 */
export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
  }
  const supplied = request.headers.get('x-cron-secret') ?? ''
  const suppliedBuf = Buffer.from(supplied)
  const expectedBuf = Buffer.from(expected)
  if (
    suppliedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(suppliedBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = supabaseAdmin()
  const now = new Date()
  const results = {
    followups: { processed: 0, failed: 0 },
    reminders: { sent: 0 },
    notifications: { created: 0 },
    leadNotifications: { sent: 0, retryable: 0, failed: 0, paused: false },
  }

  // ── 1. AI follow-up execution drain ──────────────────────────────
  await drainFollowupExecutions(admin, now, results)

  // ── 2. Appointment reminders ─────────────────────────────────────
  await sendAppointmentReminders(admin, now, results)

  // ── 3. Hot-lead & unanswered-conversation notifications ──────────
  await createSmartNotifications(admin, now, results)

  // ── 4. Pending lead-notification emails (two-person alerts) ──────
  const leadNotifs = await processPendingLeadNotifications()
  results.leadNotifications.sent = leadNotifs.sent
  results.leadNotifications.retryable = leadNotifs.retryable
  results.leadNotifications.failed = leadNotifs.failed
  results.leadNotifications.paused = leadNotifs.paused

  return NextResponse.json({ ok: true, ...results })
}

// ============================================================
// 1. FOLLOW-UP EXECUTION DRAIN
// ============================================================

async function drainFollowupExecutions(
  admin: SupabaseClient,
  now: Date,
  results: { followups: { processed: number; failed: number } },
) {
  // Claim up to 20 waiting executions whose next_action_at has arrived.
  const { data: due, error } = await admin
    .from('ai_followup_executions')
    .select('id, account_id, followup_id, contact_id, current_step, total_steps, status, last_message_id')
    .eq('status', 'active')
    .lte('next_action_at', now.toISOString())
    .order('next_action_at', { ascending: true })
    .limit(20)

  if (error || !due || due.length === 0) return

  for (const exec of due) {
    // Optimistic claim — only one cron runner wins this row.
    const { data: claimed } = await admin
      .from('ai_followup_executions')
      .update({ status: 'running', updated_at: now.toISOString() })
      .eq('id', exec.id)
      .eq('status', 'active')
      .select('id')
      .maybeSingle()

    if (!claimed) continue

    try {
      await processFollowupExecution(admin, exec, now)
      results.followups.processed += 1
    } catch (err) {
      console.error('[scheduler] follow-up exec failed:', exec.id, err)
      results.followups.failed += 1
      // Mark as failed so it doesn't loop forever.
      await admin
        .from('ai_followup_executions')
        .update({
          status: 'failed',
          error_message: err instanceof Error ? err.message : 'Unknown error',
          updated_at: now.toISOString(),
        })
        .eq('id', exec.id)
    }
  }
}

async function processFollowupExecution(
  admin: SupabaseClient,
  exec: {
    id: string
    account_id: string
    followup_id: string
    contact_id: string
    current_step: number
    total_steps: number
    last_message_id: string | null
  },
  now: Date,
) {
  // Load the parent follow-up config.
  const { data: followup } = await admin
    .from('ai_followups')
    .select('*')
    .eq('id', exec.followup_id)
    .maybeSingle()

  if (!followup || followup.status !== 'active') {
    // Follow-up was paused/deleted between claim and process — stop cleanly.
    await admin
      .from('ai_followup_executions')
      .update({ status: 'stopped', stop_reason: 'follow_up_no_longer_active', updated_at: now.toISOString() })
      .eq('id', exec.id)
    return
  }

  // Working-hours guard — defer to the next working window.
  if (followup.working_hours_only) {
    const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes()
    const startParts = (followup.working_hours_start || '09:00').split(':').map(Number)
    const endParts = (followup.working_hours_end || '18:00').split(':').map(Number)
    const startMinutes = (startParts[0] || 9) * 60 + (startParts[1] || 0)
    const endMinutes = (endParts[0] || 18) * 60 + (endParts[1] || 0)

    if (currentMinutes < startMinutes || currentMinutes >= endMinutes) {
      // Requeue for tomorrow's start. Simple: set next_action_at to next start.
      const tomorrow = new Date(now)
      tomorrow.setUTCHours(startParts[0] || 9, startParts[1] || 0, 0, 0)
      if (tomorrow <= now) tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
      await admin
        .from('ai_followup_executions')
        .update({ status: 'active', next_action_at: tomorrow.toISOString(), updated_at: now.toISOString() })
        .eq('id', exec.id)
      return
    }
  }

  // Stop-on-reply check: did the customer reply since the last send?
  if (followup.stop_on_reply && exec.current_step > 0) {
    const { data: lastMsg } = await admin
      .from('messages')
      .select('created_at')
      .eq('conversation_id', await resolveConversationId(admin, exec.account_id, exec.contact_id))
      .eq('sender_type', 'customer')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: lastSentMsg } = await admin
      .from('messages')
      .select('created_at')
      .eq('id', exec.last_message_id)
      .maybeSingle()

    if (lastMsg && lastSentMsg && new Date(lastMsg.created_at) > new Date(lastSentMsg.created_at)) {
      await admin
        .from('ai_followup_executions')
        .update({ status: 'stopped', stop_reason: 'customer_replied', updated_at: now.toISOString() })
        .eq('id', exec.id)
      return
    }
  }

  // Generate the follow-up message.
  let messageText: string

  if (followup.use_template && followup.template_id) {
    // Template-based: load the template body. We can't fill variables yet,
    // so just send the body text. This is the common non-AI path.
    const { data: template } = await admin
      .from('message_templates')
      .select('body_text')
      .eq('id', followup.template_id)
      .maybeSingle()
    messageText = template?.body_text || `Hello, this is a follow-up from our team.`
  } else {
    // AI-generated: build context and generate.
    const conversationId = await resolveConversationId(admin, exec.account_id, exec.contact_id)
    if (!conversationId) throw new Error('No conversation found for contact')

    const messages = await buildConversationContext(admin, conversationId)

    // Try loading the follow-up-specific AI config; fall back to account default.
    let config = await loadAiConfig(admin, exec.account_id).catch(() => null)
    if (!config) throw new Error('AI not configured — cannot generate follow-up')

    // Override with follow-up-specific settings if provided.
    if (followup.ai_provider) {
      config = {
        ...config,
        provider: followup.ai_provider as 'openai' | 'anthropic',
        model: followup.ai_model || config.model,
      }
    }

    const systemPrompt = followup.ai_system_prompt ||
      `You are a WhatsApp follow-up assistant. Write a short, professional follow-up message (step ${exec.current_step + 1} of ${exec.total_steps}). Be concise and respectful. Do not be pushy.`

    const { text, usage } = await generateReply({
      config,
      systemPrompt,
      messages,
    })

    messageText = text

    // Log usage (fire-and-forget).
    try {
      void logAiUsage(admin, {
        accountId: exec.account_id,
        conversationId,
        mode: 'auto_reply',
        provider: config.provider,
        model: config.model,
        usage,
      })
    } catch { /* swallow */ }
  }

  // Send the message.
  const conversationId = await resolveConversationId(admin, exec.account_id, exec.contact_id)
  if (!conversationId) throw new Error('No conversation found for contact')

  const { messageId } = await sendMessageToConversation(admin, exec.account_id, {
    conversationId,
    messageType: 'text',
    contentText: messageText,
  })

  // Update execution state.
  const nextStep = exec.current_step + 1
  const isComplete = nextStep >= exec.total_steps
  const delayMs = (followup.delay_hours || 24) * 60 * 60 * 1000
  const nextActionAt = isComplete ? null : new Date(now.getTime() + delayMs).toISOString()

  await admin
    .from('ai_followup_executions')
    .update({
      status: isComplete ? 'completed' : 'waiting',
      current_step: nextStep,
      last_message_id: messageId,
      last_sent_at: now.toISOString(),
      next_action_at: nextActionAt,
      ai_generated_message: messageText,
      completed_at: isComplete ? now.toISOString() : null,
      updated_at: now.toISOString(),
    })
    .eq('id', exec.id)

  // Create a notification for the agent.
  await createNotification(admin, {
    accountId: exec.account_id,
    type: 'follow_up_sent',
    title: 'Follow-up sent',
    body: `Step ${nextStep}/${exec.total_steps} follow-up sent to a contact.`,
    contactId: exec.contact_id,
    conversationId,
  })
}

// ============================================================
// 2. APPOINTMENT REMINDERS (notification-only)
// ============================================================

async function sendAppointmentReminders(
  admin: SupabaseClient,
  now: Date,
  results: { reminders: { sent: number } },
) {
  // Find appointments in the next 25 hours that need reminders.
  const { data: upcoming } = await admin
    .from('appointments')
    .select('id, account_id, contact_id, conversation_id, agent_id, title, appointment_date, appointment_time, reminder_24h_sent, reminder_1h_sent, status')
    .in('status', ['scheduled', 'confirmed', 'rescheduled'])
    .gte('appointment_date', now.toISOString().slice(0, 10))
    .lte('appointment_date', new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString().slice(0, 10))
    .limit(50)

  if (!upcoming || upcoming.length === 0) return

  for (const appt of upcoming) {
    // Compute datetime of the appointment.
    const apptDateTime = new Date(`${appt.appointment_date}T${appt.appointment_time || '09:00'}:00`)
    const diffMs = apptDateTime.getTime() - now.getTime()
    const diffHours = diffMs / (1000 * 60 * 60)

    // 24-hour reminder.
    if (diffHours <= 24 && diffHours > 1 && !appt.reminder_24h_sent) {
      await admin
        .from('appointments')
        .update({ reminder_24h_sent: true, updated_at: now.toISOString() })
        .eq('id', appt.id)

      await createNotification(admin, {
        accountId: appt.account_id,
        type: 'appointment_reminder_24h',
        title: 'Appointment tomorrow',
        body: `Reminder: "${appt.title}" is in ${Math.round(diffHours)} hours.`,
        contactId: appt.contact_id,
        conversationId: appt.conversation_id,
        userId: appt.agent_id,
      })
      results.reminders.sent += 1
    }

    // 1-hour reminder.
    if (diffHours <= 1 && diffHours > 0 && !appt.reminder_1h_sent) {
      await admin
        .from('appointments')
        .update({ reminder_1h_sent: true, updated_at: now.toISOString() })
        .eq('id', appt.id)

      await createNotification(admin, {
        accountId: appt.account_id,
        type: 'appointment_reminder_1h',
        title: 'Appointment soon',
        body: `Reminder: "${appt.title}" starts in ${Math.max(1, Math.round(diffHours * 60))} minutes.`,
        contactId: appt.contact_id,
        conversationId: appt.conversation_id,
        userId: appt.agent_id,
      })
      results.reminders.sent += 1
    }
  }
}

// ============================================================
// 3. SMART NOTIFICATIONS (hot leads + unanswered conversations)
// ============================================================

async function createSmartNotifications(
  admin: SupabaseClient,
  now: Date,
  results: { notifications: { created: number } },
) {
  // Hot-lead notifications: contacts with high score who recently replied
  // but haven't been notified in the last 6 hours.
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString()

  const { data: hotLeads } = await admin
    .from('contacts')
    .select('id, account_id, name, phone, lead_score, lead_score_tier')
    .eq('lead_score_tier', 'hot')
    .gte('lead_score', 60)
    .not('last_customer_reply_at', 'is', null)
    .gte('last_customer_reply_at', sixHoursAgo)
    .limit(20)

  if (hotLeads) {
    for (const lead of hotLeads) {
      // Dedupe: skip if we already created a hot_lead notification for this contact in the last 6 hours.
      const { data: existing } = await admin
        .from('notifications')
        .select('id')
        .eq('account_id', lead.account_id)
        .eq('contact_id', lead.id)
        .eq('type', 'hot_lead')
        .gte('created_at', sixHoursAgo)
        .limit(1)
        .maybeSingle()

      if (existing) continue

      // Find the conversation for this contact to link the notification.
      const convId = await resolveConversationId(admin, lead.account_id, lead.id)

      await createNotification(admin, {
        accountId: lead.account_id,
        type: 'hot_lead',
        title: 'Hot lead active',
        body: `${lead.name || lead.phone || 'A contact'} (score: ${lead.lead_score}) just replied.`,
        contactId: lead.id,
        conversationId: convId,
      })
      results.notifications.created += 1
    }
  }

  // Unanswered conversations: messages from customers that haven't been
  // replied to in the last 4 hours.
  const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString()

  const { data: unanswered } = await admin
    .from('conversations')
    .select('id, account_id, contact_id, assigned_agent_id, last_message_text, last_message_at')
    .eq('status', 'open')
    .not('unread_count', 'eq', 0)
    .gte('last_message_at', fourHoursAgo)
    .limit(20)

  if (unanswered) {
    for (const conv of unanswered) {
      const { data: existing } = await admin
        .from('notifications')
        .select('id')
        .eq('account_id', conv.account_id)
        .eq('conversation_id', conv.id)
        .eq('type', 'unanswered_conversation')
        .gte('created_at', fourHoursAgo)
        .limit(1)
        .maybeSingle()

      if (existing) continue

      await createNotification(admin, {
        accountId: conv.account_id,
        type: 'unanswered_conversation',
        title: 'Unanswered message',
        body: `A conversation has been waiting for a reply.`,
        contactId: conv.contact_id,
        conversationId: conv.id,
        userId: conv.assigned_agent_id,
      })
      results.notifications.created += 1
    }
  }
}

// ============================================================
// HELPERS
// ============================================================

async function resolveConversationId(
  admin: SupabaseClient,
  accountId: string,
  contactId: string,
): Promise<string | null> {
  const { data } = await admin
    .from('conversations')
    .select('id')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

async function createNotification(
  admin: SupabaseClient,
  opts: {
    accountId: string
    type: string
    title: string
    body: string
    contactId?: string | null
    conversationId?: string | null
    userId?: string | null
  },
) {
  // Find the owner (admin) of the account to deliver the notification to,
  // unless a specific userId was given.
  let targetUserId = opts.userId
  if (!targetUserId) {
    const { data: owner } = await admin
      .from('profiles')
      .select('user_id')
      .eq('account_id', opts.accountId)
      .eq('account_role', 'owner')
      .limit(1)
      .maybeSingle()
    targetUserId = owner?.user_id
  }
  if (!targetUserId) return

  const { error } = await admin.from('notifications').insert({
    account_id: opts.accountId,
    user_id: targetUserId,
    type: opts.type,
    title: opts.title,
    body: opts.body,
    contact_id: opts.contactId ?? null,
    conversation_id: opts.conversationId ?? null,
  })
  if (error) {
    console.error('[scheduler] notification insert failed:', error.message)
  }
}
