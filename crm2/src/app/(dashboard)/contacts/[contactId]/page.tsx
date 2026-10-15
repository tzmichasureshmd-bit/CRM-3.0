'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

// Contact detail is rendered by the contacts page's detail drawer
// (shared UI, no duplicated backend). This route keeps
// /contacts/[contactId] addressable — e.g. from pipeline cards and
// notification links — and hands off to /contacts?contact=<id>.

export default function ContactDetailRedirect() {
  const { contactId } = useParams<{ contactId: string }>();
  const router = useRouter();

  useEffect(() => {
    if (contactId) {
      router.replace(`/contacts?contact=${contactId}`);
    }
  }, [contactId, router]);

  return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
