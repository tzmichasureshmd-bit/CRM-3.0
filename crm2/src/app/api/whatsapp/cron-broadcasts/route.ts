import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { sendTemplateMessage } from '@/lib/whatsapp/meta-api'
import { decrypt } from '@/lib/whatsapp/encryption'
import {
  sanitizePhoneForMeta,
  isValidE164,
  phoneVariants,
  isRecipientNotAllowedError,
} from '@/lib/whatsapp/phone-utils'
import { isMessageTemplate } from '@/lib/whatsapp/template-row-guard'
import type { MessageTemplate } from '@/types'

/**
 * Server-side scheduler for scheduled broadcasts.
 * Finds broadcasts with status='scheduled' where scheduled_at <= now(),
 * delivers them via Meta API, updates recipient/status, and persists
 * outbound messages to the conversation inbox.
 *
 * Auth: x-cron-secret header must match AUTOMATION_CRON_SECRET.
 * Limits: max 5 broadcasts per invocation.
 */

type VariableMapping =
  | { type: 'static'; value: string }
  | { type: 'field'; value: string }
  | { type: 'custom_field'; value: string }

function resolveVars(
  vars: Record<string, VariableMapping>,
  contact: { name?: string; phone?: string; email?: string; company?: string },
  customVals?: Map<string, string>,
): string[] {
  const keys = Object.keys(vars).sort((a, b) => {
    const an = Number(a)
    const bn = Number(b)
    if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn
    return a.localeCompare(b)
  })
  return keys.map((k) => {
    const v = vars[k]
    if (v.type === 'static') return v.value
    if (v.type === 'field') {
      const fieldMap: Record<string, string | undefined> = {
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        company: contact.company,
      }
      return fieldMap[v.value] ?? ''
    }
    return customVals?.get(v.value) ?? ''
  })
}

function renderBody(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, raw) => {
    const idx = Number(raw) - 1
    const value = params[idx]
    return value && value.trim().length > 0 ? value : `{{${raw}}}`
  })
}

export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
  }
  const supplied = request.headers.get('x-cron-secret') ?? ''
  const supBuf = Buffer.from(supplied)
  const expBuf = Buffer.from(expected)
  if (supBuf.length !== expBuf.length || !timingSafeEqual(supBuf, expBuf)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = supabaseAdmin()
  const now = new Date().toISOString()

  // Claim up to 5 due scheduled broadcasts
  const { data: due, error } = await admin
    .from('broadcasts')
    .select('id, account_id, user_id, name, template_name, template_language, template_variables')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(5)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!due || due.length === 0) return NextResponse.json({ processed: 0 })

  let processed = 0

  for (const bcast of due) {
    // Claim: flip to 'sending' only if still 'scheduled'
    const { data: claimed } = await admin
      .from('broadcasts')
      .update({ status: 'sending', updated_at: now })
      .eq('id', bcast.id)
      .eq('status', 'scheduled')
      .select('id')
      .maybeSingle()
    if (!claimed) continue

    try {
      // Load WhatsApp config
      const { data: config } = await admin
        .from('whatsapp_config')
        .select('*')
        .eq('account_id', bcast.account_id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!config) {
        await admin.from('broadcasts').update({ status: 'failed' }).eq('id', bcast.id)
        continue
      }
      const accessToken = decrypt(config.access_token)

      // Load template row
      const { data: rawTemplateRow } = await admin
        .from('message_templates')
        .select('*')
        .eq('account_id', bcast.account_id)
        .eq('name', bcast.template_name)
        .eq('language', bcast.template_language ?? 'en_US')
        .maybeSingle()
      if (rawTemplateRow && !isMessageTemplate(rawTemplateRow)) {
        await admin.from('broadcasts').update({ status: 'failed' }).eq('id', bcast.id)
        continue
      }
      const templateRow = (rawTemplateRow as MessageTemplate | null) ?? null

      const vars = (bcast.template_variables ?? {}) as Record<string, VariableMapping>
      const hasCustom = Object.values(vars).some((v) => v.type === 'custom_field')

      // Load pending recipients + contacts
      const { data: recipients } = await admin
        .from('broadcast_recipients')
        .select('id, contact_id, contact:contacts(*)')
        .eq('broadcast_id', bcast.id)
        .eq('status', 'pending')
      if (!recipients || recipients.length === 0) {
        await admin
          .from('broadcasts')
          .update({ status: 'sent', updated_at: new Date().toISOString() })
          .eq('id', bcast.id)
        processed++
        continue
      }

      // Pre-fetch custom values if any variable uses them
      const customIndex = new Map<string, Map<string, string>>()
      if (hasCustom) {
        const contactIds = recipients
          .map((r) => (r.contact as unknown as { id?: string })?.id)
          .filter((id): id is string => Boolean(id))
        const PAGE = 500
        for (let i = 0; i < contactIds.length; i += PAGE) {
          const slice = contactIds.slice(i, i + PAGE)
          const { data } = await admin
            .from('contact_custom_values')
            .select('contact_id, custom_field_id, value')
            .in('contact_id', slice)
          for (const row of data ?? []) {
            const bucket = customIndex.get(row.contact_id) ?? new Map<string, string>()
            bucket.set(row.custom_field_id, row.value ?? '')
            customIndex.set(row.contact_id, bucket)
          }
        }
      }

      let sentCount = 0

      for (const rec of recipients) {
        const contact = rec.contact as {
          id?: string
          phone?: string
          name?: string
          email?: string
          company?: string
        } | null

        if (!contact?.phone) {
          await admin
            .from('broadcast_recipients')
            .update({ status: 'failed', error_message: 'No phone number' })
            .eq('id', rec.id)
          continue
        }

        const sanitized = sanitizePhoneForMeta(contact.phone)
        if (!isValidE164(sanitized)) {
          await admin
            .from('broadcast_recipients')
            .update({ status: 'failed', error_message: 'Invalid phone format' })
            .eq('id', rec.id)
          continue
        }

        const params = resolveVars(
          vars,
          contact,
          contact.id ? customIndex.get(contact.id) : undefined,
        )

        const variants = phoneVariants(sanitized)
        let sentMessageId: string | null = null
        let lastError: string | null = null

        for (const variant of variants) {
          try {
            const result = await sendTemplateMessage({
              phoneNumberId: config.phone_number_id,
              accessToken,
              to: variant,
              templateName: bcast.template_name,
              language: bcast.template_language ?? 'en_US',
              template: templateRow ?? undefined,
              params,
            })
            sentMessageId = result.messageId
            lastError = null
            break
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unknown error'
            lastError = msg
            if (!isRecipientNotAllowedError(msg)) break
          }
        }

        if (sentMessageId) {
          sentCount++
          await admin
            .from('broadcast_recipients')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              whatsapp_message_id: sentMessageId,
              error_message: null,
            })
            .eq('id', rec.id)

          // Persist outbound message to conversation inbox (best-effort)
          if (contact.id) {
            try {
              let convId: string | null = null
              const { data: existing } = await admin
                .from('conversations')
                .select('id')
                .eq('account_id', bcast.account_id)
                .eq('contact_id', contact.id)
                .maybeSingle()
              convId = existing?.id ?? null
              if (!convId) {
                const { data: c } = await admin
                  .from('conversations')
                  .insert({
                    account_id: bcast.account_id,
                    user_id: bcast.user_id,
                    contact_id: contact.id,
                  })
                  .select('id')
                  .single()
                convId = c?.id ?? null
              }
              if (convId) {
                const rendered = renderBody(templateRow?.body_text ?? '', params)
                await admin.from('messages').insert({
                  conversation_id: convId,
                  sender_type: 'agent',
                  sender_id: bcast.user_id,
                  content_type: 'template',
                  content_text: rendered,
                  template_name: bcast.template_name,
                  message_id: sentMessageId,
                  status: 'sent',
                })
                await admin
                  .from('conversations')
                  .update({
                    last_message_text: rendered,
                    last_message_at: new Date().toISOString(),
                  })
                  .eq('id', convId)
                await admin
                  .from('contacts')
                  .update({ last_contacted_at: new Date().toISOString() })
                  .eq('id', contact.id)
              }
            } catch {
              /* best-effort inbox persistence */
            }
          }
        } else {
          await admin
            .from('broadcast_recipients')
            .update({
              status: 'failed',
              error_message: lastError ?? 'Unknown error',
            })
            .eq('id', rec.id)
        }
      }

      await admin
        .from('broadcasts')
        .update({ status: sentCount > 0 ? 'sent' : 'failed', updated_at: new Date().toISOString() })
        .eq('id', bcast.id)
      processed++
    } catch (err) {
      console.error(`[cron-broadcasts] Failed broadcast ${bcast.id}:`, err)
      await admin
        .from('broadcasts')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', bcast.id)
    }
  }

  return NextResponse.json({ processed })
}
