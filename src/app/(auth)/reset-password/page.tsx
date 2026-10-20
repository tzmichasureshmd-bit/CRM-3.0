'use client';

/**
 * FIX-010: This page previously called supabase.auth.updateUser({ password })
 * which cannot update the CRM's internal password_hash in the profiles table.
 *
 * The correct password reset flow is the 3-step OTP flow at /forgot-password:
 *   Step 1: Enter email → POST /api/v1/auth/otp/send
 *   Step 2: Enter 6-digit OTP → POST /api/v1/auth/otp/verify
 *   Step 3: Set new password → PATCH /api/v1/auth/password
 *
 * This page redirects there immediately to avoid user confusion.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function ResetPasswordPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/forgot-password');
  }, [router]);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(circle at 10% 10%, rgba(106,125,255,0.20), transparent 32%), #eef2ff',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <Loader2 size={32} color="#4f6df5" style={{ animation: 'spin 1s linear infinite' }} />
        <p style={{ fontSize: 14, color: '#8790aa' }}>Redirecting to password reset…</p>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
