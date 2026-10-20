'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

// The inbox reads `?c=<conversationId>` to auto-open a thread (see
// inbox/page.tsx). This route keeps /inbox/[conversationId] addressable
// for deep links from reports/notifications and hands off to it.

export default function ConversationRedirect() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const router = useRouter();

  useEffect(() => {
    if (conversationId) {
      router.replace(`/inbox?c=${conversationId}`);
    }
  }, [conversationId, router]);

  return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
