/**
 * Telegram outbound send.
 * Called by the unified send route when conversation.platform === 'telegram'.
 * Uses the official Telegram Bot API only.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { decrypt } from '@/lib/whatsapp/encryption'
import { SendMessageError, persistOutboundMessage } from '@/lib/whatsapp/send-message'
import { sendText, sendPhoto, sendDocument, sendAudio, sendVideo, TelegramApiError } from '@/lib/telegram/telegram-api'

export interface TelegramSendParams {
  messageType: string
  contentText?: string | null
  mediaUrl?: string | null
  filename?: string | null
  replyToMessageId?: string | null
}

export interface TelegramSendResult {
  messageId: string
  telegramMessageId: string
}

interface TelegramConversation {
  id: string
  platform?: string | null
  channel_recipient_id?: string | null
  contact?: { id: string } | null
}

export async function sendTelegramMessage(
  db: SupabaseClient,
  accountId: string,
  conversation: TelegramConversation,
  params: TelegramSendParams,
  aiGenerated = false,
): Promise<TelegramSendResult> {
  if (conversation.platform !== 'telegram') {
    throw new SendMessageError('bad_request', 'sendTelegramMessage called for non-telegram conversation', 400)
  }

  const chatId = conversation.channel_recipient_id
  if (!chatId) {
    throw new SendMessageError('channel_not_configured', 'Conversation has no Telegram chat id.', 400)
  }

  // Resolve bot for this account
  const { data: bot, error: botError } = await db
    .from('telegram_bots')
    .select('*')
    .eq('account_id', accountId)
    .eq('status', 'connected')
    .maybeSingle()

  if (botError || !bot) {
    throw new SendMessageError(
      'channel_not_configured',
      'Telegram bot not connected. Connect it in Settings → Integrations.',
      400,
    )
  }

  let botToken: string
  try {
    botToken = decrypt(bot.bot_token as string)
  } catch {
    throw new SendMessageError('channel_not_configured', 'Could not decrypt Telegram bot token. Reconnect the bot.', 400)
  }

  // Validate message type
  if (params.messageType === 'template' || params.messageType === 'interactive') {
    throw new SendMessageError('not_supported', `"${params.messageType}" messages are not supported on Telegram.`, 400)
  }
  if (params.messageType === 'text' && !params.contentText) {
    throw new SendMessageError('bad_request', 'content_text is required for text messages', 400)
  }
  const mediaKinds = ['image', 'video', 'audio', 'document'] as const
  if ((mediaKinds as readonly string[]).includes(params.messageType) && !params.mediaUrl) {
    throw new SendMessageError('bad_request', `media_url is required for ${params.messageType} messages`, 400)
  }

  // Send via Telegram Bot API
  let telegramMessageId: string
  try {
    let result
    switch (params.messageType) {
      case 'text':
        result = await sendText({ botToken, chatId, text: params.contentText! })
        break
      case 'image':
        result = await sendPhoto({ botToken, chatId, photoUrl: params.mediaUrl!, caption: params.contentText ?? undefined })
        break
      case 'document':
        result = await sendDocument({ botToken, chatId, documentUrl: params.mediaUrl!, caption: params.contentText ?? undefined })
        break
      case 'audio':
        result = await sendAudio({ botToken, chatId, audioUrl: params.mediaUrl! })
        break
      case 'video':
        result = await sendVideo({ botToken, chatId, videoUrl: params.mediaUrl!, caption: params.contentText ?? undefined })
        break
      default:
        result = await sendText({ botToken, chatId, text: params.contentText ?? `[${params.messageType}]` })
    }
    telegramMessageId = `tg:${bot.id}:${result.message_id}`
  } catch (err) {
    const msg = err instanceof TelegramApiError ? err.message : err instanceof Error ? err.message : 'Unknown Telegram error'
    console.error('[telegram-send] send failed:', msg)
    throw new SendMessageError('meta_error', `Telegram API error: ${msg}`, 502)
  }

  const contactId = conversation.contact?.id
  if (!contactId) {
    throw new SendMessageError('not_found', 'Conversation has no contact', 404)
  }

  const { messageId } = await persistOutboundMessage(db, accountId, conversation.id, contactId, {
    contentType: params.messageType,
    contentText: params.contentText ?? null,
    mediaUrl: params.mediaUrl ?? null,
    replyToMessageId: params.replyToMessageId ?? null,
    metaMessageId: telegramMessageId,
    aiGenerated,
  })

  return { messageId, telegramMessageId }
}
