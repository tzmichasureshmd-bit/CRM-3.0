/**
 * Inbound Messenger / Instagram DM ingestion (migration 070).
 *
 * Both channels deliver through the same Page webhook (`object: "page"`)
 * as `entry[].messaging[]` events, keyed by `recipient.id` — which for
 * Facebook is the Page id and for Instagram is the linked Instagram
 * account id. That recipient id is how we resolve the tenant: it must
 * match a stored `meta_page_connections` row (never a frontend-supplied
 * id), whose Page access token we decrypt and use for best-effort
 * sender-profile fetches.
 *
 * Contact/conversation creation mirrors the WhatsApp webhook exactly:
 * same account-scoped tenancy, same user_id audit split, same race-safe
 * unique-index re-resolution, same dispatch rail (flows → automations →
 * AI auto-reply → webhook events) so a Messenger/IG DM behaves like a
 * WhatsApp inbound to a human agent.
 *
 * Contacts have no phone — dedupe is via `contacts.messenger_psid`
 * (facebook) or `contacts.instagram_user_id` (instagram), with a
 * `generateFallbackPhone()` placeholder for the NOT NULL phone column.
 */

import { supabaseAdmin } from '@/lib/automations/admin-client';
import { decrypt } from '@/lib/whatsapp/encryption';
import { isUniqueViolation } from '@/lib/contacts/dedupe';
import { runAutomationsForTrigger } from '@/lib/automations/engine';
import { dispatchInboundToFlows } from '@/lib/flows/engine';
import { dispatchInboundToAiReply } from '@/lib/ai/auto-reply';
import { dispatchWebhookEvent } from '@/lib/webhooks/deliver';
import { generateFallbackPhone } from '@/lib/meta/lead-processor';
import {
  fetchMessengerProfile,
  fetchInstagramProfile,
} from '@/lib/meta/messenger-api';

/** Same bucket + account-scoped path convention as migration 023. */
const CHAT_MEDIA_BUCKET = 'chat-media';

export interface MessengerInboundMessage {
  mid?: string;
  text?: string;
  attachments?: Array<{ type?: string; payload?: { url?: string } }>;
  is_echo?: boolean;
  reply_to?: { mid?: string };
}

export interface MessengerWebhookMessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: MessengerInboundMessage;
}

interface ChannelConnection {
  id: string;
  account_id: string;
  user_id: string;
  page_id?: string | null;
  page_name?: string | null;
  access_token: string;
  platform?: string | null;
  instagram_account_id?: string | null;
  instagram_username?: string | null;
}

/**
 * Process a batch of `entry[].messaging[]` events for both channels.
 * Sequential + idempotent (per-mid guard); a single bad event never
 * fails the batch.
 */
export async function processMessagingEvents(
  events: MessengerWebhookMessagingEvent[],
): Promise<void> {
  for (const event of events) {
    try {
      await processMessagingEvent(event);
    } catch (err) {
      console.error(
        '[messaging] event processing failed:',
        err instanceof Error ? err.message : err,
      );
    }
  }
}

async function processMessagingEvent(event: MessengerWebhookMessagingEvent) {
  const senderId = event.sender?.id;
  const recipientId = event.recipient?.id;
  const message = event.message;

  if (!senderId || !recipientId) {
    console.warn('[messaging] event missing sender/recipient id; skipping');
    return;
  }
  // Echoes are our own outbound messages bouncing back — the send path
  // already persisted them. Message-less events (postbacks, reactions)
  // are out of scope for DMs; ignore both cleanly.
  if (!message || message.is_echo) return;

  const mid = message.mid;
  if (!mid) {
    console.warn('[messaging] message without mid; skipping');
    return;
  }

  console.log('[messaging] RECEIVED platform=unknown sender=', senderId, 'recipient=', recipientId, 'mid=', mid);

  const admin = supabaseAdmin();

  // ---- Resolve the connection (tenant) by recipient.id ----------
  const { data: conns, error: connError } = await admin
    .from('meta_page_connections')
    .select('*')
    .eq('status', 'active');

  if (connError || !conns || conns.length === 0) {
    console.error(`[messaging] CONNECTION_NOT_FOUND: no active meta_page_connections exist. recipientId=${recipientId}`);
    return;
  }

  // Instagram: require instagram_account_id to be non-null and match.
  // Facebook: match by page_id.
  const fbConn = (conns as ChannelConnection[]).find(
    (c) => c.platform === 'facebook' && c.page_id === recipientId,
  );
  const igConn = (conns as ChannelConnection[]).find(
    (c) =>
      c.platform === 'instagram' &&
      c.instagram_account_id != null &&
      c.instagram_account_id === recipientId,
  );
  const conn: ChannelConnection | null = fbConn ?? igConn ?? null;

  if (!conn) {
    // Log all active connections to help diagnose mismatches
    const connSummary = (conns as ChannelConnection[]).map(
      (c) => `{platform=${c.platform} page_id=${c.page_id ?? 'null'} ig_account_id=${c.instagram_account_id ?? 'null'} account=${c.account_id}}`
    ).join(', ');
    console.error(
      `[messaging] CONNECTION_NOT_FOUND recipientId=${recipientId} — active connections: [${connSummary}]`,
    );
    return;
  }

  const platform: 'facebook' | 'instagram' =
    conn.platform === 'instagram' ? 'instagram' : 'facebook';

  console.log('[messaging] MATCHED platform=', platform, 'account_id=', conn.account_id, 'connection_id=', conn.id);
  if (platform === 'instagram') {
    console.log('[messaging] instagram_account_id=', conn.instagram_account_id);
  } else {
    console.log('[messaging] page_id=', conn.page_id);
  }
  const accountId = conn.account_id;
  const userId = conn.user_id;

  let accessToken: string;
  try {
    accessToken = decrypt(conn.access_token);
  } catch {
    console.error('[messaging] could not decrypt page token; skipping');
    return;
  }

  // ---- Sender profile (best-effort, never fatal) -----------------
  let profileName: string | null = null;
  let profilePic: string | null = null;
  try {
    if (platform === 'facebook' && conn.page_id) {
      const profile = await fetchMessengerProfile(
        conn.page_id,
        senderId,
        accessToken,
      );
      profileName = profile.name ?? null;
      profilePic = profile.profile_pic ?? null;
    } else {
      const profile = await fetchInstagramProfile(senderId, accessToken);
      profileName = profile.name ?? profile.username ?? null;
      profilePic = profile.profile_pic ?? null;
    }
  } catch (err) {
    console.warn('[messaging] profile fetch skipped:', String(err));
  }
  const contactName = profileName?.trim() || senderId;

  // ---- Contact find-or-create (dedupe by channel id) -------------
  const dedupeColumn =
    platform === 'facebook' ? 'messenger_psid' : 'instagram_user_id';
  const contact = await findOrCreateMessagingContact(
    admin,
    accountId,
    userId,
    conn,
    platform,
    senderId,
    contactName,
    dedupeColumn,
    profilePic,
  );
  if (!contact) return;
  if (contact.wasCreated) {
    await tagChannelContact(admin, accountId, userId, contact.id, platform);
  }

  // ---- Conversation find-or-create -------------------------------
  const conversation = await findOrCreateMessagingConversation(
    admin,
    accountId,
    userId,
    contact.id,
    platform,
    senderId,
    recipientId,
    conn,
    contactName,
  );
  if (!conversation) return;

  // ---- Idempotency guard (Meta redelivers events) ----------------
  const { data: existing } = await admin
    .from('messages')
    .select('id')
    .eq('message_id', mid)
    .limit(1)
    .maybeSingle();
  if (existing) {
    console.log('[messaging] duplicate message ignored:', mid);
    return;
  }

  console.log('[messaging] message id', mid);

  // ---- Parse content ----------------------------------------------
  const { contentText, mediaUrl } = await resolveInboundContent(
    message,
    accessToken,
    accountId,
    mid,
  );

  const ALLOWED_CONTENT_TYPES = new Set([
    'text', 'image', 'document', 'audio', 'video', 'location',
  ]);
  const hasAttachment = (message.attachments?.length ?? 0) > 0;
  const rawType = hasAttachment ? (message.attachments![0]?.type ?? '') : 'text';
  const contentType = ALLOWED_CONTENT_TYPES.has(rawType) ? rawType : 'text';

  let isFirstInboundMessage = false;
  const { count: priorCount } = await admin
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversation.id)
    .eq('sender_type', 'customer');
  isFirstInboundMessage = (priorCount ?? 0) === 0;

  // Emit conversation.created as soon as the thread is opened.
  if (conversation.created) {
    await dispatchWebhookEvent(admin, accountId, 'conversation.created', {
      conversation_id: conversation.id,
      contact_id: contact.id,
    });
  }

  const timestampMs = event.timestamp
    ? new Date(event.timestamp * 1000)
    : new Date();

  const { error: msgError } = await admin.from('messages').insert({
    conversation_id: conversation.id,
    sender_type: 'customer',
    content_type:
      message.text || !message.attachments?.length ? 'text' : contentType,
    content_text: contentText,
    media_url: mediaUrl,
    message_id: mid,
    status: 'delivered',
    created_at: timestampMs.toISOString(),
  });

  if (msgError) {
    console.error('[messaging] ERROR inserting message mid=', mid, 'error=', msgError.message);
    return;
  }

  console.log('[messaging] PERSISTED platform=', platform, 'mid=', mid, 'conversation_id=', conversation.id, 'contact_id=', contact.id, 'account_id=', accountId);

  // Contact recency + conversation state (lifted from broadcast/lead
  // scoring signals — same updates the WhatsApp webhook makes).
  void admin
    .from('contacts')
    .update({
      last_customer_reply_at: timestampMs.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', contact.id)
    .then(({ error }: { error: unknown }) => {
      if (error) {
        console.warn(
          '[messaging] contacts.last_customer_reply_at update skipped:',
          (error as { message?: string }).message ?? error,
        );
      }
    });

  const { error: convError } = await admin
    .from('conversations')
    .update({
      last_message_text: contentText || `[${contentType}]`,
      last_message_at: timestampMs.toISOString(),
      unread_count: (conversation.unread_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id);
  if (convError) {
    console.error('[messaging] error updating conversation:', convError);
  }

  // ---- Dispatch rail (mirrors the WhatsApp webhook) --------------
  const text = contentText ?? '';
  const flowResult = await dispatchInboundToFlows({
    accountId,
    userId,
    contactId: contact.id,
    conversationId: conversation.id,
    message: { kind: 'text', text, meta_message_id: mid },
    isFirstInboundMessage,
  });

  const flowConsumed = flowResult.consumed;
  const automationTriggers: (
    | 'new_contact_created'
    | 'first_inbound_message'
    | 'new_message_received'
    | 'keyword_match'
  )[] = [];
  if (!flowConsumed) {
    automationTriggers.push('new_message_received', 'keyword_match');
  }
  if (contact.wasCreated) automationTriggers.unshift('new_contact_created');
  if (isFirstInboundMessage) automationTriggers.unshift('first_inbound_message');
  for (const triggerType of automationTriggers) {
    runAutomationsForTrigger({
      accountId,
      triggerType,
      contactId: contact.id,
      context: {
        message_text: text,
        conversation_id: conversation.id,
      },
    }).catch((err) => console.error('[automations] dispatch failed:', err));
  }

  // AI auto-reply for plain text the flow runner did not consume.
  if (!flowConsumed && text.trim()) {
    await dispatchInboundToAiReply({
      accountId,
      conversationId: conversation.id,
      contactId: contact.id,
      configOwnerUserId: userId,
    });
  }

  await dispatchWebhookEvent(admin, accountId, 'message.received', {
    conversation_id: conversation.id,
    contact_id: contact.id,
    whatsapp_message_id: mid,
    content_type:
      (message.text ? 'text' : contentType) as
        | 'text' | 'image' | 'document' | 'audio' | 'video' | 'location',
    text,
  });
}

async function findOrCreateMessagingContact(
  admin: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  userId: string,
  conn: ChannelConnection,
  platform: 'facebook' | 'instagram',
  senderId: string,
  contactName: string,
  dedupeColumn: 'messenger_psid' | 'instagram_user_id',
  profilePic: string | null = null,
): Promise<{ id: string; wasCreated: boolean } | null> {
  const { data: existing } = await admin
    .from('contacts')
    .select('id')
    .eq('account_id', accountId)
    .eq(dedupeColumn, senderId)
    .maybeSingle();
  if (existing) {
    // Update name and avatar on repeat messages (best-effort)
    void admin
      .from('contacts')
      .update({
        name: contactName,
        ...(profilePic ? { avatar_url: profilePic } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id as string)
      .then(() => {})
    return { id: existing.id as string, wasCreated: false };
  }

  const pageId = String(conn.page_id ?? '');
  const { data: created, error: createErr } = await admin
    .from('contacts')
    .insert({
      account_id: accountId,
      user_id: userId,
      phone: generateFallbackPhone(),
      name: contactName,
      source: 'Meta',
      source_platform: platform,
      source_page_id: pageId,
      source_page_name: conn.page_name ?? null,
      [dedupeColumn]: senderId,
      ...(profilePic ? { avatar_url: profilePic } : {}),
      lead_status: 'new',
    })
    .select('id')
    .single();

  if (createErr) {
    if (isUniqueViolation(createErr)) {
      // Another delivery raced us; the partial unique index rejected the
      // duplicate. Re-resolve and return the winner.
      const { data: raced } = await admin
        .from('contacts')
        .select('id')
        .eq('account_id', accountId)
        .eq(dedupeColumn, senderId)
        .maybeSingle();
      if (raced) return { id: raced.id as string, wasCreated: false };
    }
    console.error('[messaging] contact create error:', createErr);
    return null;
  }
  return { id: created.id as string, wasCreated: true };
}

async function findOrCreateMessagingConversation(
  admin: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  userId: string,
  contactId: string,
  platform: 'facebook' | 'instagram',
  senderId: string,
  recipientId: string,
  conn: ChannelConnection,
  contactName: string,
): Promise<{ id: string; unread_count: number; created: boolean } | null> {
  const { data: existingRows, error: findError } = await admin
    .from('conversations')
    .select('*')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .eq('platform', platform)
    .order('created_at', { ascending: true })
    .limit(1);
  if (findError) {
    console.error('[messaging] conversation lookup error:', findError);
    return null;
  }
  if (existingRows && existingRows.length > 0) {
    return {
      id: existingRows[0].id as string,
      unread_count: (existingRows[0].unread_count as number) ?? 0,
      created: false,
    };
  }

  const channelPageId =
    platform === 'facebook' ? recipientId : String(conn.instagram_account_id ?? recipientId);
  const { data: newConv, error: createError } = await admin
    .from('conversations')
    .insert({
      account_id: accountId,
      user_id: userId,
      contact_id: contactId,
      platform,
      channel_recipient_id: senderId,
      channel_page_id: channelPageId,
      channel_username: contactName,
    })
    .select()
    .single();

  if (createError) {
    if (isUniqueViolation(createError)) {
      const { data: raced } = await admin
        .from('conversations')
        .select('*')
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .eq('platform', platform)
        .order('created_at', { ascending: true })
        .limit(1);
      if (raced && raced.length > 0) {
        return {
          id: raced[0].id as string,
          unread_count: (raced[0].unread_count as number) ?? 0,
          created: false,
        };
      }
    }
    console.error('[messaging] conversation create error:', createError);
    return null;
  }
  return {
    id: newConv.id as string,
    unread_count: 0,
    created: true,
  };
}

async function resolveInboundContent(
  message: MessengerInboundMessage,
  accessToken: string,
  accountId: string,
  mid: string,
): Promise<{ contentText: string | null; mediaUrl: string | null }> {
  if (message.text) {
    return { contentText: message.text, mediaUrl: null };
  }
  const attachment = message.attachments?.find((a) => a?.payload?.url);
  if (!attachment?.payload?.url) {
    return { contentText: null, mediaUrl: null };
  }
  const url = attachment.payload.url;

  // Persist media bytes to the account-scoped chat bucket so the inbox
  // has a durable URL (the CDN url Meta hands us expires). Best-effort:
  // a failed download/upload degrades to storing the original URL.
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return { contentText: null, mediaUrl: url };
    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    const ext = contentType.startsWith('image/')
      ? 'jpg'
      : contentType.startsWith('video/')
        ? 'mp4'
        : contentType.startsWith('audio/')
          ? 'mp3'
          : 'bin';
    const buffer = Buffer.from(await res.arrayBuffer());
    const path = `account-${accountId}/${Date.now()}-messenger-${mid}.${ext}`;
    const { error: upErr } = await supabaseAdmin()
      .storage.from(CHAT_MEDIA_BUCKET)
      .upload(path, buffer, {
        contentType,
        cacheControl: '3600',
        upsert: false,
      });
    if (upErr) return { contentText: null, mediaUrl: url };

    const { data: pub } = supabaseAdmin()
      .storage.from(CHAT_MEDIA_BUCKET)
      .getPublicUrl(path);
    return { contentText: null, mediaUrl: pub.publicUrl };
  } catch (err) {
    console.warn('[messaging] media persist skipped:', String(err));
    return { contentText: null, mediaUrl: url };
  }
}

async function tagChannelContact(
  admin: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  userId: string,
  contactId: string,
  platform: 'facebook' | 'instagram',
): Promise<void> {
  const tagName = platform === 'facebook' ? 'Messenger' : 'Instagram';
  const { data: existing } = await admin
    .from('tags')
    .select('id')
    .eq('account_id', accountId)
    .ilike('name', tagName)
    .maybeSingle();
  let tagId = existing?.id as string | undefined;
  if (!tagId) {
    const { data: created, error: createErr } = await admin
      .from('tags')
      .insert({
        user_id: userId,
        account_id: accountId,
        name: tagName,
        color: platform === 'facebook' ? '#0866ff' : '#e1306c',
      })
      .select('id')
      .single();
    if (createErr) return;
    tagId = created.id as string;
  }
  await admin
    .from('contact_tags')
    .upsert(
      { contact_id: contactId, tag_id: tagId },
      { onConflict: 'contact_id,tag_id', ignoreDuplicates: true },
    );
}