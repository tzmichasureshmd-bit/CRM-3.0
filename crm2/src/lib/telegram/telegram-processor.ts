/**
 * Telegram inbound message processor.
 *
 * Mirrors the pattern of messaging-processor.ts (Messenger/Instagram).
 * Uses the existing contacts / conversations / messages tables.
 * platform = 'telegram' on all rows created here.
 *
 * Contact deduplication: contacts.telegram_chat_id (migration 072).
 * Conversation deduplication: (account_id, contact_id, 'telegram').
 */

import { supabaseAdmin } from '@/lib/automations/admin-client'
import { isUniqueViolation } from '@/lib/contacts/dedupe'
import { generateFallbackPhone } from '@/lib/meta/lead-processor'
import { runAutomationsForTrigger } from '@/lib/automations/engine'
import { dispatchInboundToFlows } from '@/lib/flows/engine'
import { dispatchInboundToAiReply } from '@/lib/ai/auto-reply'
import { dispatchWebhookEvent } from '@/lib/webhooks/deliver'
import type { TelegramUpdate, TelegramMessage } from '@/lib/telegram/telegram-api'

interface TelegramBotRow {
  id: string
  account_id: string
  user_id: string
  bot_token: string
  bot_id: number | null
  bot_username: string | null
}

/**
 * Process a single Telegram update from the webhook.
 * Idempotent — duplicate update_ids are silently skipped.
 */
export async function processTelegramUpdate(
  update: TelegramUpdate,
  botRow: TelegramBotRow,
): Promise<void> {
  const message = update.message ?? update.edited_message
  if (!message) return

  // Only handle private messages (DMs). Group/channel messages are out of scope.
  if (message.chat.type !== 'private') return

  const admin = supabaseAdmin()
  const accountId = botRow.account_id
  const userId = botRow.user_id

  const chatId = String(message.chat.id)
  const senderId = message.from?.id ? String(message.from.id) : chatId

  // Idempotency: skip if we already stored this message_id
  const messageIdStr = `tg:${botRow.id}:${update.update_id}`
  const { data: existing } = await admin
    .from('messages')
    .select('id')
    .eq('message_id', messageIdStr)
    .limit(1)
    .maybeSingle()
  if (existing) {
    console.log('[telegram] duplicate update ignored:', update.update_id)
    return
  }

  // ── Contact name ─────────────────────────────────────────────
  const parts = [message.from?.first_name, message.from?.last_name].filter(Boolean)
  const contactName = parts.length > 0
    ? parts.join(' ')
    : message.from?.username ?? senderId

  // ── Find/create contact ───────────────────────────────────────
  const contact = await findOrCreateTelegramContact(
    admin, accountId, userId, chatId, contactName,
    message.from?.username ?? null,
  )
  if (!contact) return

  // ── Find/create conversation ──────────────────────────────────
  const conversation = await findOrCreateTelegramConversation(
    admin, accountId, userId, contact.id, chatId,
    contactName,
    message.from?.username ?? null,
  )
  if (!conversation) return

  if (conversation.created) {
    await dispatchWebhookEvent(admin, accountId, 'conversation.created', {
      conversation_id: conversation.id,
      contact_id: contact.id,
    })
  }

  // ── Parse content ─────────────────────────────────────────────
  const { contentText, mediaUrl, contentType } = parseTelegramMessage(message)

  // ── Count prior customer messages ────────────────────────────
  const { count: priorCount } = await admin
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversation.id)
    .eq('sender_type', 'customer')
  const isFirstInboundMessage = (priorCount ?? 0) === 0

  // ── Insert message ────────────────────────────────────────────
  const { error: msgError } = await admin.from('messages').insert({
    conversation_id: conversation.id,
    sender_type: 'customer',
    content_type: contentType,
    content_text: contentText,
    media_url: mediaUrl,
    message_id: messageIdStr,
    status: 'delivered',
    created_at: new Date(message.date * 1000).toISOString(),
  })

  if (msgError) {
    console.error('[telegram] error inserting message:', msgError)
    return
  }

  // ── Update contact recency ────────────────────────────────────
  void admin
    .from('contacts')
    .update({
      last_customer_reply_at: new Date(message.date * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', contact.id)
    .then(({ error }: { error: unknown }) => {
      if (error) console.warn('[telegram] contact recency update skipped:', error)
    })

  // ── Update conversation ───────────────────────────────────────
  await admin
    .from('conversations')
    .update({
      last_message_text: contentText || `[${contentType}]`,
      last_message_at: new Date(message.date * 1000).toISOString(),
      unread_count: (conversation.unread_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id)

  // ── Update bot diagnostics ────────────────────────────────────
  void admin
    .from('telegram_bots')
    .update({ last_inbound_at: new Date().toISOString() })
    .eq('id', botRow.id)
    .then(({ error }: { error: unknown }) => {
      if (error) console.warn('[telegram] bot diagnostics update skipped:', error)
    })

  // ── Dispatch rail ─────────────────────────────────────────────
  const text = contentText ?? ''
  const flowResult = await dispatchInboundToFlows({
    accountId,
    userId,
    contactId: contact.id,
    conversationId: conversation.id,
    message: { kind: 'text', text, meta_message_id: messageIdStr },
    isFirstInboundMessage,
  })

  const flowConsumed = flowResult.consumed
  const triggers: (
    | 'new_contact_created'
    | 'first_inbound_message'
    | 'new_message_received'
    | 'keyword_match'
  )[] = []
  if (!flowConsumed) triggers.push('new_message_received', 'keyword_match')
  if (contact.wasCreated) triggers.unshift('new_contact_created')
  if (isFirstInboundMessage) triggers.unshift('first_inbound_message')

  for (const triggerType of triggers) {
    runAutomationsForTrigger({
      accountId,
      triggerType,
      contactId: contact.id,
      context: { message_text: text, conversation_id: conversation.id },
    }).catch((err) => console.error('[automations] dispatch failed:', err))
  }

  if (!flowConsumed && text.trim()) {
    await dispatchInboundToAiReply({
      accountId,
      conversationId: conversation.id,
      contactId: contact.id,
      configOwnerUserId: userId,
    })
  }

  await dispatchWebhookEvent(admin, accountId, 'message.received', {
    conversation_id: conversation.id,
    contact_id: contact.id,
    whatsapp_message_id: messageIdStr,
    content_type: contentType as 'text' | 'image' | 'document' | 'audio' | 'video' | 'location',
    text,
  })
}

// ── Helpers ───────────────────────────────────────────────────

function parseTelegramMessage(msg: TelegramMessage): {
  contentText: string | null
  mediaUrl: string | null
  contentType: string
} {
  if (msg.text) return { contentText: msg.text, mediaUrl: null, contentType: 'text' }
  if (msg.photo?.length) {
    // file_id requires a getFile API call to resolve a URL — stored as null for now.
    // The largest photo's file_id is available via msg.photo for future retrieval.
    return { contentText: msg.caption ?? null, mediaUrl: null, contentType: 'image' }
  }
  if (msg.document) return { contentText: msg.caption ?? msg.document.file_name ?? null, mediaUrl: null, contentType: 'document' }
  if (msg.audio) return { contentText: null, mediaUrl: null, contentType: 'audio' }
  if (msg.video) return { contentText: msg.caption ?? null, mediaUrl: null, contentType: 'video' }
  if (msg.voice) return { contentText: null, mediaUrl: null, contentType: 'audio' }
  if (msg.location) {
    const loc = msg.location
    return { contentText: `${loc.latitude},${loc.longitude}`, mediaUrl: null, contentType: 'location' }
  }
  if (msg.sticker) return { contentText: '[Sticker]', mediaUrl: null, contentType: 'image' }
  return { contentText: '[Unsupported message type]', mediaUrl: null, contentType: 'text' }
}

async function findOrCreateTelegramContact(
  admin: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  userId: string,
  chatId: string,
  contactName: string,
  username: string | null,
): Promise<{ id: string; wasCreated: boolean } | null> {
  const { data: existing } = await admin
    .from('contacts')
    .select('id')
    .eq('account_id', accountId)
    .eq('telegram_chat_id', chatId)
    .maybeSingle()
  if (existing) {
    // Update name/username if they changed
    void admin
      .from('contacts')
      .update({ name: contactName, updated_at: new Date().toISOString() })
      .eq('id', existing.id as string)
      .then(() => {})
    return { id: existing.id as string, wasCreated: false }
  }

  const { data: created, error: createErr } = await admin
    .from('contacts')
    .insert({
      account_id: accountId,
      user_id: userId,
      phone: generateFallbackPhone(),
      name: contactName,
      source: 'Telegram',
      source_platform: 'telegram',
      telegram_chat_id: chatId,
      lead_status: 'new',
    })
    .select('id')
    .single()

  if (createErr) {
    if (isUniqueViolation(createErr)) {
      const { data: raced } = await admin
        .from('contacts')
        .select('id')
        .eq('account_id', accountId)
        .eq('telegram_chat_id', chatId)
        .maybeSingle()
      if (raced) return { id: raced.id as string, wasCreated: false }
    }
    console.error('[telegram] contact create error:', createErr)
    return null
  }

  // Auto-tag
  void tagTelegramContact(admin, accountId, userId, created.id as string)

  return { id: created.id as string, wasCreated: true }
}

async function findOrCreateTelegramConversation(
  admin: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  userId: string,
  contactId: string,
  chatId: string,
  contactName: string,
  username: string | null,
): Promise<{ id: string; unread_count: number; created: boolean } | null> {
  const { data: existingRows, error: findError } = await admin
    .from('conversations')
    .select('*')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .eq('platform', 'telegram')
    .order('created_at', { ascending: true })
    .limit(1)

  if (findError) {
    console.error('[telegram] conversation lookup error:', findError)
    return null
  }
  if (existingRows && existingRows.length > 0) {
    // Update channel_username if username changed
    if (username) {
      void admin
        .from('conversations')
        .update({ channel_username: username })
        .eq('id', existingRows[0].id as string)
        .then(() => {})
    }
    return {
      id: existingRows[0].id as string,
      unread_count: (existingRows[0].unread_count as number) ?? 0,
      created: false,
    }
  }

  const { data: newConv, error: createError } = await admin
    .from('conversations')
    .insert({
      account_id: accountId,
      user_id: userId,
      contact_id: contactId,
      platform: 'telegram',
      channel_recipient_id: chatId,
      // Store @username if available, otherwise contact name
      channel_username: username ?? contactName,
    })
    .select()
    .single()

  if (createError) {
    if (isUniqueViolation(createError)) {
      const { data: raced } = await admin
        .from('conversations')
        .select('*')
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .eq('platform', 'telegram')
        .order('created_at', { ascending: true })
        .limit(1)
      if (raced && raced.length > 0) {
        return {
          id: raced[0].id as string,
          unread_count: (raced[0].unread_count as number) ?? 0,
          created: false,
        }
      }
    }
    console.error('[telegram] conversation create error:', createError)
    return null
  }

  return { id: newConv.id as string, unread_count: 0, created: true }
}

async function tagTelegramContact(
  admin: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  userId: string,
  contactId: string,
): Promise<void> {
  const { data: existing } = await admin
    .from('tags')
    .select('id')
    .eq('account_id', accountId)
    .ilike('name', 'Telegram')
    .maybeSingle()
  let tagId = existing?.id as string | undefined
  if (!tagId) {
    const { data: created, error } = await admin
      .from('tags')
      .insert({ user_id: userId, account_id: accountId, name: 'Telegram', color: '#2AABEE' })
      .select('id')
      .single()
    if (error) return
    tagId = created.id as string
  }
  await admin
    .from('contact_tags')
    .upsert(
      { contact_id: contactId, tag_id: tagId },
      { onConflict: 'contact_id,tag_id', ignoreDuplicates: true },
    )
}
