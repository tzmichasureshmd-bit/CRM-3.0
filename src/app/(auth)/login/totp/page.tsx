'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, Shield, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

const TOTP_LENGTH = 6;

export default function TOTPVerifyPage() {
  const [code, setCode] = useState<string[]>(Array(TOTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // FIX-008: Use a ref instead of state so handleSubmit always reads the current
  // token synchronously — avoids the race condition where paste auto-submit fires
  // before the state update from setPartialToken has been committed.
  const partialTokenRef = useRef('');
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const token = localStorage.getItem('crm_partial_token');
    if (!token) {
      window.location.replace('/login');
      return;
    }
    partialTokenRef.current = token;
  }, []);

  const handleChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newCode = [...code];
    newCode[index] = digit;
    setCode(newCode);

    // Auto-focus next input
    if (digit && index < TOTP_LENGTH - 1) {
      refs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, TOTP_LENGTH);
    if (pastedText.length === TOTP_LENGTH) {
      setCode(pastedText.split(''));
      refs.current[TOTP_LENGTH - 1]?.focus();
      // Auto-submit after paste
      setTimeout(() => handleSubmit(pastedText), 100);
    }
  };

  const handleSubmit = async (codeOverride?: string) => {
    const fullCode = codeOverride || code.join('');
    if (fullCode.length !== TOTP_LENGTH) {
      setError('Please enter all 6 digits');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
      const res = await fetch(`${BACKEND}/api/v1/auth/totp/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${partialTokenRef.current}`,
        },
        body: JSON.stringify({ code: fullCode }),
      });

      const data = await res.json() as Record<string, string>;

      if (!res.ok || !data.access_token) {
        setError(data.detail ?? 'Invalid code. Please try again.');
        setCode(Array(TOTP_LENGTH).fill(''));
        refs.current[0]?.focus();
        setLoading(false);
        return;
      }

      // Clear partial token and save full access token
      localStorage.removeItem('crm_partial_token');
      localStorage.setItem('crm_token', data.access_token);
      localStorage.setItem('crm_user', JSON.stringify({
        user_id:       data.user_id    ?? '',
        account_id:    data.account_id ?? '',
        role:          data.role       ?? 'agent',
        email:         data.email      ?? '',
        full_name:     data.full_name  ?? '',
        avatar_url:    data.avatar_url ?? '',
        auth_provider: 'email',
      }));

      window.location.replace('/dashboard');
    } catch (err) {
      setError('Cannot connect to server. Check your connection.');
      setLoading(false);
    }
  };

  const handleCancel = () => {
    localStorage.removeItem('crm_partial_token');
    window.location.replace('/login');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9ff', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 440, background: 'white', borderRadius: 20, padding: '40px 36px', boxShadow: '0 8px 40px rgba(10,14,30,0.12)', border: '1px solid rgba(130,145,190,0.15)' }}>
        
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ 
            width: 64, height: 64, margin: '0 auto 16px',
            borderRadius: 16, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(79,109,245,0.35)',
          }}>
            <Shield size={32} color="white" />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f1117', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
            Two-Factor Authentication
          </h1>
          <p style={{ fontSize: 14, color: '#8790aa', margin: 0, lineHeight: 1.6 }}>
            Enter the 6-digit code from your authenticator app
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div style={{ 
            padding: '12px 16px', borderRadius: 12, marginBottom: 24,
            background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.25)',
            color: '#f46b72', fontSize: 13, fontWeight: 500,
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* TOTP Input */}
        <div style={{ marginBottom: 28 }}>
          <div 
            style={{ 
              display: 'flex', 
              gap: 10, 
              justifyContent: 'center',
              marginBottom: 12,
            }}
            onPaste={handlePaste}
          >
            {code.map((digit, index) => (
              <input
                key={index}
                ref={el => { refs.current[index] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={e => handleChange(index, e.target.value)}
                onKeyDown={e => handleKeyDown(index, e)}
                disabled={loading}
                autoFocus={index === 0}
                style={{
                  width: 52,
                  height: 60,
                  fontSize: 24,
                  fontWeight: 700,
                  textAlign: 'center',
                  border: '2px solid',
                  borderColor: digit ? '#4f6df5' : 'rgba(130,145,190,0.25)',
                  borderRadius: 12,
                  outline: 'none',
                  transition: 'all 0.2s',
                  color: '#0f1117',
                  background: loading ? 'rgba(130,145,190,0.05)' : 'white',
                  cursor: loading ? 'not-allowed' : 'text',
                }}
              />
            ))}
          </div>
          <p style={{ fontSize: 12, color: '#8790aa', textAlign: 'center', margin: 0 }}>
            Paste code or type digit by digit
          </p>
        </div>

        {/* Submit Button */}
        <button
          onClick={() => void handleSubmit()}
          disabled={loading || code.filter(d => d).length !== TOTP_LENGTH}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: 12,
            border: 'none',
            background: loading || code.filter(d => d).length !== TOTP_LENGTH 
              ? 'rgba(130,145,190,0.25)' 
              : 'linear-gradient(135deg,#4f6df5,#8b5cf6)',
            color: 'white',
            fontSize: 15,
            fontWeight: 700,
            cursor: loading || code.filter(d => d).length !== TOTP_LENGTH ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            marginBottom: 16,
            transition: 'all 0.2s',
          }}
        >
          {loading ? (
            <>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              Verifying...
            </>
          ) : (
            '🔓 Continue to CRM'
          )}
        </button>

        {/* Cancel Link */}
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={handleCancel}
            disabled={loading}
            style={{
              background: 'none',
              border: 'none',
              color: '#8790aa',
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 12px',
              borderRadius: 8,
              transition: 'all 0.2s',
            }}
          >
            <ArrowLeft size={14} />
            Back to login
          </button>
        </div>

        {/* Help Text */}
        <div style={{ 
          marginTop: 28, 
          paddingTop: 24, 
          borderTop: '1px solid rgba(130,145,190,0.15)',
          textAlign: 'center',
        }}>
          <p style={{ fontSize: 12, color: '#8790aa', margin: '0 0 8px', lineHeight: 1.6 }}>
            Don't have access to your authenticator?
          </p>
          <Link 
            href="/forgot-password" 
            style={{ 
              color: '#4f6df5', 
              fontSize: 12, 
              fontWeight: 600, 
              textDecoration: 'none',
            }}
          >
            Reset your password instead
          </Link>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        input:focus {
          border-color: #4f6df5 !important;
          box-shadow: 0 0 0 3px rgba(79,109,245,0.1);
        }
      `}</style>
    </div>
  );
}
