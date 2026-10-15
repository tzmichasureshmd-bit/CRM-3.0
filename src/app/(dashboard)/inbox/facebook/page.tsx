'use client';
import { useEffect } from 'react';
import InboxPage from '../page';
export default function FacebookInboxPage() {
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('channel', 'facebook');
    window.history.replaceState({}, '', url.toString());
  }, []);
  return <InboxPage />;
}
