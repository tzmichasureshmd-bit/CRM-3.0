/**
 * Meta Graph API helpers for Facebook Messenger + Instagram DMs.
 *
 * These are the send + profile helpers the unified inbox uses for
 * non-WhatsApp channels. Both channels are served by the same
 * Messenger Platform API:
 *
 *   POST /{page-id}/messages   — send a message to a user (JSON),
 *                                page access token, `messaging_type`.
 *
 * The token is ALWAYS the Page access token stored (encrypted) on
 * `meta_page_connections`; for Instagram that Page token doubles as
 * the Instagram account token (an IG Professional account is linked
 * to its business Page).
 *
 * Error handling mirrors `leads-api.ts` (MetaLeadsApiError) so every
 * Meta call in the codebase speaks one error family.
 */

import {
  META_LEADS_API_BASE,
  MetaLeadsApiError,
} from "@/lib/meta/leads-api";

export interface MessengerAttachment {
  type?: string;
  payload?: { url?: string };
}

export interface MessengerMessage {
  mid?: string;
  text?: string;
  attachments?: MessengerAttachment[];
  /** True when the message is an echo of something the Page sent. */
  is_echo?: boolean;
  reply_to?: { mid?: string };
}

/**
 * A single normalized inbound Messenger/IG event (the `entry[].messaging[]`
 * shape, which both channels deliver).
 */
export interface MessagingEvent {
  senderId: string;
  recipientId: string;
  timestamp?: number;
  message?: MessengerMessage;
}

export interface SendMessengerMessageArgs {
  /** Facebook Page id (or Instagram account id) that is sending. */
  pageId: string;
  accessToken: string;
  /** PSID (facebook) or IG-scoped user id (instagram). */
  recipientId: string;
  text?: string;
  /**
   * Attachment to send. `type` is the Messenger attachment type:
   * image | video | audio | file. Maps to our document kind via
   * `file`. Instagram does not support `file`.
   */
  attachment?: { type: string; url: string };
}

export interface SendMessengerMessageResult {
  recipient_id?: string;
  message_id?: string;
}

/**
 * Send a message to a Messenger/IG user from a Page. Returns the
 * Meta `message_id` (mid) on success; throws `MetaLeadsApiError`
 * otherwise. `messaging_type` is always RESPONSE (a reply/thread we
 * already own — the webhook created the conversation from an inbound
 * message, so the send is always within an open messaging session).
 */
export async function sendMessengerMessage(
  args: SendMessengerMessageArgs,
): Promise<string> {
  const { pageId, accessToken, recipientId, text, attachment } = args;

  const messageBody: Record<string, unknown> = attachment
    ? {
        attachment: {
          type: attachment.type,
          payload: { url: attachment.url, is_reusable: false },
        },
      }
    : { text: text ?? "" };

  const body = {
    messaging_type: "RESPONSE",
    recipient: { id: recipientId },
    message: messageBody,
  };

  const params = new URLSearchParams({ access_token: accessToken });
  const res = await fetch(
    `${META_LEADS_API_BASE}/${pageId}/messages?${params.toString()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    let message: string | null = null;
    let code: number | null = null;
    try {
      const data = (await res.json()) as {
        error?: { message?: string; code?: number };
      };
      if (data.error?.message) message = data.error.message;
      if (typeof data.error?.code === "number") code = data.error.code;
    } catch {
      // non-JSON body — fall through to generic error
    }
    throw new MetaLeadsApiError({
      status: res.status,
      code,
      message: message ?? `Meta send failed (HTTP ${res.status})`,
      operation: "send_messenger_message",
    });
  }

  const data = (await res.json()) as SendMessengerMessageResult;
  if (!data.message_id) {
    throw new MetaLeadsApiError({
      status: 200,
      message: "Meta returned no message_id for the send",
      operation: "send_messenger_message",
    });
  }
  return data.message_id;
}

export interface MessengerProfileResult {
  name?: string;
  first_name?: string;
  last_name?: string;
  profile_pic?: string;
}

/**
 * Best-effort fetch of a Messenger sender's public profile for a PSID
 * (`pages_messaging` permission). Falls back to the PSID itself when
 * the profile is unavailable — the caller decides.
 */
export async function fetchMessengerProfile(
  pageId: string,
  psid: string,
  accessToken: string,
): Promise<MessengerProfileResult> {
  const params = new URLSearchParams({
    fields: "name,first_name,last_name,profile_pic",
    access_token: accessToken,
  });
  const res = await fetch(
    `${META_LEADS_API_BASE}/${pageId}/${psid}?${params.toString()}`,
  );
  if (!res.ok) return {};
  const data = (await res.json().catch(() => ({}))) as MessengerProfileResult;
  return data ?? {};
}

export interface InstagramProfileResult {
  username?: string;
  name?: string;
  profile_pic?: string;
}

/**
 * Best-effort fetch of an Instagram DM sender's public profile for an
 * IG-scoped user id (the IG messaging API exposes `name`/`username`
 * via the standard Graph user node with the Page token). Falls back to
 * the sender id when unavailable.
 */
export async function fetchInstagramProfile(
  userId: string,
  accessToken: string,
): Promise<InstagramProfileResult> {
  const params = new URLSearchParams({
    fields: "name,username,profile_pic",
    access_token: accessToken,
  });
  const res = await fetch(
    `${META_LEADS_API_BASE}/${userId}?${params.toString()}`,
  );
  if (!res.ok) return {};
  const data = (await res.json().catch(() => ({}))) as InstagramProfileResult;
  return data ?? {};
}