import { supabaseAdmin } from '@/lib/automations/admin-client';
import type { NotificationType } from '@/types';

export interface CreateNotificationOpts {
  accountId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  conversationId?: string | null;
  contactId?: string | null;
  actorUserId?: string | null;
}

export async function createNotification(opts: CreateNotificationOpts): Promise<void> {
  const { accountId, userId, type, title, body, conversationId, contactId, actorUserId } = opts;

  const { error } = await supabaseAdmin()
    .from('notifications')
    .insert({
      account_id: accountId,
      user_id: userId,
      type,
      title,
      body,
      conversation_id: conversationId ?? null,
      contact_id: contactId ?? null,
      actor_user_id: actorUserId ?? null,
    });

  if (error) {
    console.error('[notifications] Failed to create notification:', error);
  }
}

export async function createAssignmentNotifications(
  account_id: string,
  conversationId: string,
  contactName: string | null | undefined,
  assignedAgentId: string,
  actorUserId?: string | null,
): Promise<void> {
  const displayName = contactName || 'a customer';
  await createNotification({
    accountId: account_id,
    userId: assignedAgentId,
    type: 'conversation_assigned',
    title: 'Conversation assigned',
    body: `You were assigned a conversation with ${displayName}.`,
    conversationId,
    actorUserId: actorUserId ?? null,
  });
}
