'use client';

import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function AuthCallbackPage() {
  useEffect(() => {
    const handle = async () => {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();

      // Exchange the code in the URL for a session
      const { data, error } = await supabase.auth.exchangeCodeForSession(window.location.href);

      if (error || !data.session || !data.user) {
        window.location.replace('/login?error=oauth_failed');
        return;
      }

      const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
      let accountId = (meta.account_id as string) ?? '';
      let role      = (meta.role as string) ?? 'owner';
      let fullName  = (meta.full_name as string) ?? (data.user.email ?? '').split('@')[0];

      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('account_id, role, full_name')
          .eq('user_id', data.user.id)
          .maybeSingle();
        if (profile?.account_id) accountId = profile.account_id as string;
        if (profile?.role)       role      = profile.role as string;
        if ((profile as Record<string, unknown>)?.full_name) fullName = (profile as Record<string, unknown>).full_name as string;
      } catch { /* best-effort */ }

      localStorage.setItem('crm_token', data.session.access_token);
      localStorage.setItem('crm_user', JSON.stringify({
        user_id:    data.user.id,
        account_id: accountId,
        role,
        email:      data.user.email ?? '',
        full_name:  fullName,
        avatar_url: (meta.avatar_url as string) ?? '',
      }));

      window.location.replace('/dashboard');
    };

    void handle();
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at 10% 10%, rgba(106,125,255,0.20), transparent 32%), #eef2ff', gap: 16 }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, overflow: 'hidden' }}>
        <img src="/logo.png" alt="Tzmicha" style={{ width: 48, height: 48, objectFit: 'contain' }} />
      </div>
      <Loader2 size={28} color="#4f6df5" style={{ animation: 'spin 1s linear infinite' }} />
      <p style={{ fontSize: 14, color: '#8790aa', margin: 0 }}>Signing you in…</p>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
