'use client';
import { useEffect } from 'react';
import InboxPage from '../page';
export default function InstagramInboxPage() {
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('channel', 'instagram');
    window.history.replaceState({}, '', url.toString());
  }, []);
  return <InboxPage />;
}
