"use client";

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import type { Message, ContactNote, Deal, FollowUp } from '@/types';
import {
  FileText,
  DollarSign,
  User,
  Bot,
  Clock,
  Check,
  CheckCheck,
  XCircle,
  Loader2,
  Calendar,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface ConversationMessage extends Message {
  conversation: { id: string; status: string };
}

interface ContactTimelineProps {
  contactId: string;
  contactCreatedAt: string;
  contactName?: string;
}

interface TimelineEntry {
  id: string;
  kind: 'message' | 'note' | 'deal' | 'contact_created' | 'followup';
  timestamp: string;
  data: unknown;
}

export function ContactTimeline({ contactId, contactCreatedAt, contactName }: ContactTimelineProps) {
  const t = useTranslations('Contacts.detailView');
  const { accountId } = useAuth();
  const [events, setEvents] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTimeline = useCallback(async () => {
    if (!contactId || !accountId) return;

    setLoading(true);

    try {
      const supabase = createClient();

      const { data: conversations, error: convErr } = await supabase
        .from('conversations')
        .select('id')
        .eq('contact_id', contactId)
        .eq('account_id', accountId);

      if (convErr) throw convErr;

      const conversationIds = (conversations ?? []).map((c) => c.id);

      const [messagesRes, notesRes, dealsRes, followUpsRes] = await Promise.all([
        conversationIds.length > 0
          ? supabase
              .from('messages')
              .select('*, conversation:conversations(id, status)')
              .in('conversation_id', conversationIds)
              .order('created_at', { ascending: true })
          : { data: [], error: null as null | { message: string } },

        supabase
          .from('contact_notes')
          .select('*, profiles(full_name, avatar_url)')
          .eq('contact_id', contactId)
          .order('created_at', { ascending: true }),

        supabase
          .from('deals')
          .select('*, stage:pipeline_stages(name, color)')
          .eq('contact_id', contactId)
          .order('created_at', { ascending: true }),

        supabase
          .from('follow_ups')
          .select('*')
          .eq('contact_id', contactId)
          .order('created_at', { ascending: true }),
      ]);

      if (messagesRes.error) throw messagesRes.error;
      if (notesRes.error) throw notesRes.error;
      if (dealsRes.error) throw dealsRes.error;
      if (followUpsRes.error) throw followUpsRes.error;

      const timeline: TimelineEntry[] = [];

      timeline.push({
        id: `contact-created-${contactId}`,
        kind: 'contact_created',
        timestamp: contactCreatedAt,
        data: { name: contactName },
      });

      const msgs = (messagesRes.data ?? []) as ConversationMessage[];
      for (const msg of msgs) {
        timeline.push({
          id: `msg-${msg.id}`,
          kind: 'message',
          timestamp: msg.created_at,
          data: msg,
        });
      }

      for (const note of (notesRes.data ?? []) as (ContactNote & { profiles?: { full_name?: string; avatar_url?: string } })[]) {
        timeline.push({
          id: `note-${note.id}`,
          kind: 'note',
          timestamp: note.created_at,
          data: note,
        });
      }

      for (const deal of (dealsRes.data ?? []) as (Deal & { stage?: { name: string; color: string } })[]) {
        timeline.push({
          id: `deal-${deal.id}`,
          kind: 'deal',
          timestamp: deal.created_at,
          data: deal,
        });
      }

      for (const fu of (followUpsRes.data ?? []) as FollowUp[]) {
        timeline.push({
          id: `followup-${fu.id}`,
          kind: 'followup',
          timestamp: fu.created_at,
          data: fu,
        });
      }

      timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      setEvents(timeline);
    } catch (err) {
      console.error('Timeline fetch error:', err);
      toast.error('Failed to load activity timeline');
    } finally {
      setLoading(false);
    }
  }, [contactId, accountId, contactCreatedAt, contactName]);

  useEffect(() => {
    if (contactId) {
      fetchTimeline();
    }
  }, [fetchTimeline, contactId]);

  const formatTime = (dateStr: string) => {
    return format(new Date(dateStr), 'PPp');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 px-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <Clock className="h-6 w-6 text-primary" />
        </div>
        <p className="text-sm font-medium text-foreground">{t('activityTab.noActivity')}</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          No messages, notes, deals, or follow-ups have been recorded for this contact yet.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      <div className="relative">
        <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-border" />

        <div className="space-y-6">
          {events.map((event) => {
            const isAgentMessage =
              event.kind === 'message' &&
              ((event.data as ConversationMessage).sender_type === 'agent' ||
                (event.data as ConversationMessage).sender_type === 'bot');

            return (
              <div key={event.id} className="relative flex gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    event.kind === 'message'
                      ? isAgentMessage
                        ? 'bg-primary/10'
                        : 'bg-muted'
                      : 'bg-muted/40'
                  }`}
                >
                  {event.kind === 'message' ? (
                    (event.data as ConversationMessage).sender_type === 'customer' ? (
                      <User className="h-4 w-4" />
                    ) : (
                      <Bot className="h-4 w-4 text-primary" />
                    )
                  ) : event.kind === 'note' ? (
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  ) : event.kind === 'deal' ? (
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <User className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {event.kind === 'message'
                        ? (event.data as ConversationMessage).sender_type === 'customer'
                          ? t('timeline.customer')
                          : t('timeline.agent')
                        : event.kind === 'note'
                        ? t('timeline.internalNote')
                        : event.kind === 'deal'
                        ? t('timeline.dealCreated')
                        : event.kind === 'followup'
                        ? t('timeline.followUp', { fallback: 'Follow-up' })
                        : t('timeline.contactCreated')}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(event.timestamp)}
                    </span>
                    {event.kind === 'message' &&
                      (event.data as ConversationMessage).ai_generated && (
                        <Badge variant="secondary" className="text-[10px] font-medium">
                          AI
                        </Badge>
                      )}
                  </div>

                  {event.kind === 'message' && renderMessageContent(event.data as ConversationMessage, isAgentMessage)}

                  {event.kind === 'note' && (
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                      {(event.data as ContactNote).note_text}
                    </p>
                  )}

                  {event.kind === 'deal' && (
                    <div className="mt-1 rounded-lg border border-border bg-muted/30 px-3 py-2">
                      <p className="text-sm font-medium text-foreground">
                        {(event.data as Deal & { stage?: { name: string; color: string } }).title}
                      </p>
                      {(event.data as Deal & { stage?: { name: string; color: string } }).stage && (
                        <Badge
                          variant="outline"
                          className="mt-1 text-[10px]"
                          style={{ color: (event.data as Deal & { stage?: { name: string; color: string } }).stage!.color }}
                        >
                          {(event.data as Deal & { stage?: { name: string; color: string } }).stage!.name}
                        </Badge>
                      )}
                    </div>
                  )}

                  {event.kind === 'followup' && (
                    <div className={`mt-1 rounded-lg border border-border px-3 py-2 ${(event.data as FollowUp).status === 'completed' ? 'bg-muted/30 opacity-60' : 'bg-muted/50'}`}>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span className={`text-sm ${(event.data as FollowUp).status === 'completed' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                          {(event.data as FollowUp).title}
                        </span>
                        {(event.data as FollowUp).status === 'completed' && (
                          <Badge variant="secondary" className="text-[10px]">Completed</Badge>
                        )}
                      </div>
                      {(event.data as FollowUp).due_date && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          Due: {format(new Date((event.data as FollowUp).due_date!), 'MMM d, yyyy HH:mm')}
                        </p>
                      )}
                    </div>
                  )}

                  {event.kind === 'contact_created' && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {(event.data as { name?: string }).name
                        ? `${(event.data as { name?: string }).name} was added to the CRM`
                        : 'Contact was added to the CRM'}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function renderMessageContent(
  msg: ConversationMessage,
  isAgent: boolean,
) {
  const bubbleBg = isAgent
    ? 'bg-primary text-primary-foreground'
    : 'bg-muted text-foreground';

  return (
    <div
      className={`mt-1 rounded-2xl px-3 py-2 text-sm ${bubbleBg}`}
    >
      {msg.content_type === 'text' && (
        <p className="whitespace-pre-wrap break-words">{msg.content_text}</p>
      )}
      {msg.content_type === 'image' && msg.media_url && (
        <img
          src={msg.media_url}
          alt={msg.content_text || 'Shared image'}
          className="max-h-32 max-w-48 rounded-lg object-cover"
        />
      )}
      {msg.content_type === 'document' && msg.media_url && (
        <a
          href={msg.media_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-xs underline"
        >
          <FileText className="h-3 w-3" />
          {msg.content_text || 'Document'}
        </a>
      )}
      {msg.content_type === 'audio' && msg.media_url && (
        <audio src={msg.media_url} controls className="max-w-48" />
      )}
      {msg.content_type === 'video' && msg.media_url && (
        <video src={msg.media_url} controls className="max-h-32 max-w-48 rounded-lg" />
      )}
      {msg.content_type === 'template' && (
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="text-[10px]">
            Template
          </Badge>
          <span className="whitespace-pre-wrap break-words">{msg.content_text}</span>
        </div>
      )}
      {msg.content_type === 'interactive' && (
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="text-[10px]">
            Interactive
          </Badge>
          <span className="whitespace-pre-wrap break-words">{msg.content_text}</span>
        </div>
      )}

      {isAgent && (
        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          {msg.status === 'sending' && <Clock className="h-3 w-3" />}
          {msg.status === 'sent' && <Check className="h-3 w-3" />}
          {msg.status === 'delivered' && <CheckCheck className="h-3 w-3" />}
          {(msg.status === 'sent' || msg.status === 'delivered') && (
            <span className="text-xs">{msg.status}</span>
          )}
          {msg.status === 'read' && (
            <>
              <CheckCheck className="h-3 w-3 text-blue-400" />
              <span className="text-blue-400">Read</span>
            </>
          )}
          {msg.status === 'failed' && (
            <>
              <XCircle className="h-3 w-3 text-red-400" />
              <span className="text-red-400">Failed</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
