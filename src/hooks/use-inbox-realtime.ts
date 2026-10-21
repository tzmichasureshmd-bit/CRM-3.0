'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface RealtimeEvent<T> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: T;
  old: Partial<T>;
}

interface UseInboxRealtimeOptions {
  accountId: string;
  onMessageEvent?: (event: RealtimeEvent<Record<string, unknown>>) => void;
  onConversationEvent?: (event: RealtimeEvent<Record<string, unknown>>) => void;
  enabled?: boolean;
}

export function useInboxRealtime({
  accountId,
  onMessageEvent,
  onConversationEvent,
  enabled = true,
}: UseInboxRealtimeOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const onMessageRef = useRef(onMessageEvent);
  const onConversationRef = useRef(onConversationEvent);
  useEffect(() => {
    onMessageRef.current = onMessageEvent;
    onConversationRef.current = onConversationEvent;
  });

  useEffect(() => {
    if (!enabled || !accountId) return;
    const supabase = createClient();

    // Filter by account_id at the Postgres replication level so cross-tenant
    // rows are never delivered to this client even if RLS is misconfigured.
    const channel = supabase
      .channel(`crm3-inbox-${accountId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `account_id=eq.${accountId}` },
        (payload) => {
          onMessageRef.current?.({
            eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
            new: payload.new as Record<string, unknown>,
            old: payload.old as Partial<Record<string, unknown>>,
          });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `account_id=eq.${accountId}` },
        (payload) => {
          onConversationRef.current?.({
            eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
            new: payload.new as Record<string, unknown>,
            old: payload.old as Partial<Record<string, unknown>>,
          });
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setIsConnected(false);
          // Probe auth — if 401, the JWT has expired; redirect to login.
          const token = typeof window !== 'undefined' ? localStorage.getItem('crm_token') : null;
          if (token) {
            fetch('/api/v3/profile', { headers: { Authorization: `Bearer ${token}` } })
              .then(r => { if (r.status === 401) window.location.href = '/login'; })
              .catch(() => { /* network error — stay on page */ });
          }
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      setIsConnected(false);
    };
  }, [enabled, accountId]);

  const unsubscribe = useCallback(() => {
    if (channelRef.current) {
      const supabase = createClient();
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
      setIsConnected(false);
    }
  }, []);

  return { isConnected, unsubscribe };
}
