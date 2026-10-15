/**
 * X (Twitter) outbound message send.
 *
 * X Free/Basic tier: text-only tweet replies.
 * DMs require Pro ($5,000/mo) — not implemented.
 *
 * The conversation's channel_recipient_id holds the tweet id to reply to
 * (set when the conversation was created from an inbound mention/tweet).
 * If absent, the tweet is posted as a standalone tweet mentioning the
 * contact's x_user_id.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { decrypt } from '@/lib/whatsapp/encryption'
import { postTweet, XApiError } from '@/lib/x/x-api'
import { SendMessageError } from '@/lib/whatsapp/send-message'

export interface XSendParams {
  messageType: string
  contentText?: string | null
}

export interface XSendResult {
  messageId: string
  externalMessageId: string
}

export async function sendXMessage(
  db: SupabaseClient,
  accountId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  conversation: any,
  params: XSendParams,
): Promise<XSendResult> {
  const { messageType, contentText } = params

  if (messageType !== 'text' || !contentText?.trim()) {
    throw new SendMessageError(
      'bad_request',
      'X (Twitter) only supports text messages on Free/Basic tier.',
      400,
    )
  }

  // Load the connected X integration for this account
  const { data: integration, error: intErr } = await db
    .from('channel_integrations')
    .select('id, access_token, metadata')
    .eq('account_id', accountId)
    .eq('platform', 'x')
    .eq('status', 'connected')
    .maybeSingle()

  if (intErr || !integration?.access_token) {
    throw new SendMessageError(
      'x_not_configured',
      'X account not connected. Connect it in Integrations.',
      400,
    )
  }

  const accessToken = decrypt(integration.access_token as string)

  // Reply to the tweet that started this conversation, if available
  const replyToTweetId = (conversation.channel_recipient_id as string | null) ?? undefined

  let tweetId: string
  try {
    const tweet = await postTweet(accessToken, contentText.trim(), replyToTweetId)
    tweetId = tweet.id
  } catch (err) {
    const msg = err instanceof XApiError ? err.message : String(err)
    throw new SendMessageError('x_api_error', `X API error: ${msg}`, 502)
  }

  // Persist the outbound message
  const { data: msgRow, error: msgErr } = await db
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      sender_type: 'agent',
      content_type: 'text',
      content_text: contentText.trim(),
      message_id: tweetId,
      status: 'sent',
    })
    .select('id')
    .single()

  if (msgErr || !msgRow) {
    console.error('[x-send] message persist error:', msgErr?.message)
    throw new SendMessageError(
      'db_error',
      `Tweet sent but failed to save: ${msgErr?.message}`,
      500,
    )
  }

  await db
    .from('conversations')
    .update({
      last_message_text: contentText.trim(),
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id)

  return { messageId: msgRow.id as string, externalMessageId: tweetId }
}
