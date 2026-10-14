'use client';

// Realtime disabled — FastAPI migration in progress
// Will be re-enabled with WebSocket support later

interface RealtimeEvent<T> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: T;
  old: Partial<T>;
}

interface UseInboxRealtimeOptions {
  onMessageEvent?: (event: RealtimeEvent<Record<string, unknown>>) => void;
  onConversationEvent?: (event: RealtimeEvent<Record<string, unknown>>) => void;
  enabled?: boolean;
}

export function useInboxRealtime(_options: UseInboxRealtimeOptions) {
  return { isConnected: false, unsubscribe: () => {} };
}
