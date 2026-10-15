/**
 * Platform-aware outbound sender for Facebook Messenger + Instagram DMs.
 *
 * Called by the unified send core (`sendMessageToConversation` in
 * `@/lib/whatsapp/send-message.ts`) whenever the conversation's
 * `platform` is not WhatsApp, and by the AI auto-reply path via
 * `engineSendText`. WhatsApp keeps its own Cloud API path; this module
 * owns the Graph API path (Page access token + PSID/IG-scoped id).
 *
 * It resolves the Page connection from `conversation.channel_page_id`
 * (never trusts a tenant id from the caller), decrypts the stored Page
 * token, sends through `messenger-api.ts`, then persists via the shared
 * `persistOutboundMessage` tail so every channel writes identical rows.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { decrypt } from '@/lib/whatsapp/encryption';
import {
  SendMessageError,
  persistOutboundMessage,
} from '@/lib/whatsapp/send-message';
import { sendMessengerMessage } from '@/lib/meta/messenger-api';

export interface MessagingSendParams {
  messageType: string;
  contentText?: string | null;
  mediaUrl?: string | null;
  filename?: string | null;
  replyToMessageId?: string | null;
}

export interface MessagingSendResult {
  /** Our `messages.id` (the persisted row). */
  messageId: string;
  /** Meta's `mid` for the delivered message. */
  metaMessageId: string;
}

interface MessagingConversation {
  id: string;
  platform?: string | null;
  channel_recipient_id?: string | null;
  channel_page_id?: string | null;
  contact?: { id: string } | null;
}

/**
 * Send a message to a Messenger/IG conversation and persist it.
 *
 * `db` may be an RLS-scoped user client (dashboard) or the service-role
 * client (public API / flow engine) — every query scopes by
 * `accountId` either way. Throws `SendMessageError` for a shape error or
 * a Meta failure (so callers map one error family).
 */
export async function sendMessagingToConversation(
  db: SupabaseClient,
  accountId: string,
  conversation: MessagingConversation,
  params: MessagingSendParams,
  aiGenerated = false,
): Promise<MessagingSendResult> {
  const platform = conversation.platform ?? 'whatsapp';
  if (platform === 'whatsapp') {
    throw new SendMessageError(
      'bad_request',
      'sendMessagingToConversation is for Messenger/Instagram only',
      400,
    );
  }

  // ---- Validate the shape before touching Meta -----------------
  // Templates / interactive components are WhatsApp Cloud API
  // primitives; Messenger/IG have no equivalent.
  if (params.messageType === 'template' || params.messageType === 'interactive') {
    throw new SendMessageError(
      'not_supported',
      `"${params.messageType}" messages are only supported on WhatsApp.`,
      400,
    );
  }
  if (params.messageType === 'text' && !params.contentText) {
    throw new SendMessageError(
      'bad_request',
      'content_text is required for text messages',
      400,
    );
  }
  const mediaKinds = ['image', 'video', 'audio', 'document'] as const;
  if ((mediaKinds as readonly string[]).includes(params.messageType) && !params.mediaUrl) {
    throw new SendMessageError(
      'bad_request',
      `media_url is required for ${params.messageType} messages`,
      400,
    );
  }
  if (
    (mediaKinds as readonly string[]).includes(params.messageType) &&
    params.messageType !== 'audio' &&
    typeof params.contentText === 'string' &&
    params.contentText.length > 1024
  ) {
    throw new SendMessageError(
      'bad_request',
      'Caption exceeds the 1024-character limit',
      400,
    );
  }
  if (params.messageType === 'document' && platform === 'instagram') {
    throw new SendMessageError(
      'not_supported',
      'Document attachments are not supported on Instagram DMs.',
      400,
    );
  }

  // ---- Resolve the Page connection (tenant from DB, never input) --
  const channelKey = platform === 'facebook' ? 'page_id' : 'instagram_account_id';
  const channelValue = conversation.channel_page_id;
  if (!channelValue) {
    throw new SendMessageError(
      'channel_not_configured',
      'This conversation has no channel page id; reconnect the channel in Settings.',
      400,
    );
  }

  const { data: conn, error: connError } = await db
    .from('meta_page_connections')
    .select('*')
    .eq('account_id', accountId)
    .eq('platform', platform)
    .eq(channelKey, channelValue)
    .eq('status', 'active')
    .maybeSingle();

  if (connError || !conn) {
    console.error(
      `[messaging-send] no active connection for ${platform} ${channelValue}:`,
      connError?.message ?? 'not found',
    );
    throw new SendMessageError(
      'channel_not_configured',
      'This channel is not connected. Connect it in Settings to send messages here.',
      400,
    );
  }

  let accessToken: string;
  try {
    accessToken = decrypt(conn.access_token);
  } catch {
    throw new SendMessageError(
      'channel_not_configured',
      'Could not decrypt the channel access token. Reconnect the channel in Settings.',
      400,
    );
  }

  const senderPageId =
    platform === 'facebook'
      ? String(conn.page_id)
      : String(conn.instagram_account_id ?? conn.page_id);

  const recipientId = conversation.channel_recipient_id;
  if (!recipientId) {
    throw new SendMessageError(
      'channel_not_configured',
      'This conversation has no recipient on the channel.',
      400,
    );
  }

  // ---- Send via Graph API ---------------------------------------
  let metaMessageId: string;
  try {
    if (params.messageType === 'text') {
      metaMessageId = await sendMessengerMessage({
        pageId: senderPageId,
        accessToken,
        recipientId,
        text: params.contentText!,
      });
    } else {
      const messengerType =
        params.messageType === 'document' ? 'file' : params.messageType;
      metaMessageId = await sendMessengerMessage({
        pageId: senderPageId,
        accessToken,
        recipientId,
        attachment: { type: messengerType, url: params.mediaUrl! },
      });
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unknown Meta API error';
    console.error(`[messaging-send] ${platform} send failed:`, message);
    throw new SendMessageError('meta_error', `Meta API error: ${message}`, 502);
  }

  const contactId = conversation.contact?.id;
  if (!contactId) {
    throw new SendMessageError(
      'not_found',
      'Conversation has no contact',
      404,
    );
  }

  const { messageId } = await persistOutboundMessage(db, accountId, conversation.id, contactId, {
    contentType: params.messageType,
    contentText: params.contentText ?? null,
    mediaUrl: params.mediaUrl ?? null,
    replyToMessageId: params.replyToMessageId ?? null,
    metaMessageId,
    aiGenerated,
  });

  return { messageId, metaMessageId };
}