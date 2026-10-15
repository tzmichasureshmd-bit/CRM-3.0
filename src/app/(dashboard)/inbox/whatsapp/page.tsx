'use client';
import { useEffect } from 'react';
import InboxPage from '../page';
export default function WhatsAppInboxPage() {
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('channel', 'whatsapp');
    window.history.replaceState({}, '', url.toString());
  }, []);
  return <InboxPage />;
}
