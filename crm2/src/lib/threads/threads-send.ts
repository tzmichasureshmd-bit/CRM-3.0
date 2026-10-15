/**
 * Threads outbound message send.
 *
 * Threads API supports: publish posts, reply to posts.
 * DMs are NOT supported by the Threads API — this module only handles
 * text replies to existing Threads posts.
 *
 * The conversation's channel_recipient_id holds the Threads post id
 * to reply to (set when the conversation was created from an inbound reply).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { decrypt } from '@/lib/whatsapp/encryption'
import { replyToPost, publishTextPost, ThreadsApiError } from '@/lib/threads/threads-api'
import { SendMessageError } from '@/lib/whatsapp/send-message'

export interface ThreadsSendParams {
  messageType: string
  contentText?: string | null
}

export interface ThreadsSendResult {
  messageId: string
  externalMessageId: string
}

export async function sendThreadsMessage(
  db: SupabaseClient,
  accountId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  conversation: any,
  params: ThreadsSendParams,
): Promise<ThreadsSendResult> {
  const { messageType, contentText } = params

  if (messageType !== 'text' || !contentText?.trim()) {
    throw new SendMessageError(
      'bad_request',
      'Threads only supports text messages.',
      400,
    )
  }

  // Load the connected Threads integration for this account
  const { data: integration, error: intErr } = await db
    .from('channel_integrations')
    .select('id, access_token, external_account_id, metadata')
    .eq('account_id', accountId)
    .eq('platform', 'threads')
    .eq('status', 'connected')
    .maybeSingle()

  if (intErr || !integration?.access_token) {
    throw new SendMessageError(
      'threads_not_configured',
      'Threads account not connected. Connect it in Integrations.',
      400,
    )
  }

  const accessToken = decrypt(integration.access_token as string)
  const threadsUserId = integration.external_account_id as string

  if (!threadsUserId) {
    throw new SendMessageError(
      'threads_not_configured',
      'Threads user ID not found. Please reconnect your Threads account.',
      400,
    )
  }

  const replyToPostId = (conversation.channel_recipient_id as string | null) ?? undefined

  let postId: string
  try {
    if (replyToPostId) {
      const result = await replyToPost(threadsUserId, accessToken, replyToPostId, contentText.trim())
      postId = result.id
    } else {
      const result = await publishTextPost(threadsUserId, accessToken, contentText.trim())
      postId = result.id
    }
  } catch (err) {
    const msg = err instanceof ThreadsApiError ? err.message : String(err)
    throw new SendMessageError('threads_api_error', `Threads API error: ${msg}`, 502)
  }

  // Persist the outbound message
  const { data: msgRow, error: msgErr } = await db
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      sender_type: 'agent',
      content_type: 'text',
      content_text: contentText.trim(),
      message_id: postId,
      status: 'sent',
    })
    .select('id')
    .single()

  if (msgErr || !msgRow) {
    console.error('[threads-send] message persist error:', msgErr?.message)
    throw new SendMessageError(
      'db_error',
      `Threads post sent but failed to save: ${msgErr?.message}`,
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

  return { messageId: msgRow.id as string, externalMessageId: postId }
}
