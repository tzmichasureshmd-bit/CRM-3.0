'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff, Loader2, CheckCircle2, ArrowRight, Zap, Brain, MessageSquare, TrendingUp, Users, Bot } from 'lucide-react';
import Link from 'next/link';

const FEATURES = [
  { icon: <Brain size={18} />,        title: 'AI Lead Scoring',       desc: 'Explainable 0–100 scores with intent detection' },
  { icon: <MessageSquare size={18} />, title: 'Unified Inbox',         desc: 'WhatsApp, Instagram, Facebook, Email in one place' },
  { icon: <TrendingUp size={18} />,   title: 'Revenue Intelligence',  desc: 'Content → Lead → Deal attribution tracking' },
  { icon: <Bot size={18} />,          title: 'AI Agents',             desc: 'Autonomous agents with human approval gates' },
  { icon: <Users size={18} />,        title: 'Customer 360',          desc: 'Full timeline, deals, and AI insights per contact' },
];

export default function RegisterPage() {
  const [step, setStep]                   = useState<1 | 2>(1);
  const [fullName, setFullName]           = useState('');
  const [accountName, setAccountName]     = useState('');
  const [email, setEmail]                 = useState('');
  const [password, setPassword]           = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword]   = useState(false);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');
  const [activeFeature, setActiveFeature] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActiveFeature(i => (i + 1) % FEATURES.length), 3000);
    return () => clearInterval(id);
  }, []);

  const pwStrength = password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : 3;
  const pwColor    = ['transparent', '#f46b72', '#f4c95d', '#28c99a'][pwStrength];
  const pwLabel    = ['', 'Weak', 'Fair', 'Strong'][pwStrength];
  const step1Valid = fullName.trim().length > 0 && accountName.trim().length > 0;
  const step2Valid = email.trim().length > 0 && pwStrength >= 2 && password === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!step2Valid) return;
    setError('');
    setLoading(true);
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();

      // 1. Sign up with Supabase Auth
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim(), account_name: accountName.trim() } },
      });

      if (signUpError || !data.user) {
        setError(signUpError?.message ?? 'Registration failed. Please try again.');
        setLoading(false);
        return;
      }

      // 2. If email confirmation is disabled, session is available immediately
      if (data.session) {
        // Auth trigger (migration 008) auto-creates account + profile + pipeline stages
        // Wait briefly for trigger to complete
        await new Promise(r => setTimeout(r, 800));

        const { data: profile } = await supabase
          .from('profiles')
          .select('account_id, role')
          .eq('user_id', data.user.id)
          .single();

        // Store Supabase JWT as crm_token so FastAPI backend can verify it
        localStorage.setItem('crm_token', data.session.access_token);
        localStorage.setItem('crm_user', JSON.stringify({
          user_id: data.user.id,
          account_id: profile?.account_id ?? '',
          role: profile?.role ?? 'owner',
          email: email.trim(),
          full_name: fullName.trim(),
        }));

        window.location.replace('/dashboard');
      } else {
        // Email confirmation required
        setError('Check your email to confirm your account, then sign in.');
        setLoading(false);
      }
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#0f1117' }}>
      {/* Left Panel */}
      <div style={{ width: '45%', flexShrink: 0, display: 'flex', flexDirection: 'column', padding: '48px 52px', background: 'linear-gradient(145deg,#0f1117 0%,#1a1f2e 50%,#0f1117 100%)', borderRight: '1px solid rgba(255,255,255,0.06)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -100, left: -100, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle,rgba(79,109,245,0.15) 0%,transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -80, right: -80, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle,rgba(139,92,246,0.12) 0%,transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 64, position: 'relative' }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(79,109,245,0.40)' }}>
            <Zap size={18} color="white" />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 750, color: 'white' }}>TZMICHA CRM</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.40)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Intelligent Growth OS</div>
          </div>
        </div>

        <div style={{ position: 'relative', marginBottom: 48 }}>
          <h2 style={{ fontSize: 32, fontWeight: 800, color: 'white', margin: '0 0 12px', lineHeight: 1.2, letterSpacing: '-0.03em' }}>
            Turn every customer<br />
            <span style={{ background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>into growth.</span>
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.50)', margin: 0, lineHeight: 1.6 }}>The AI-powered CRM built for modern sales teams.</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'relative' }}>
          {FEATURES.map((f, i) => (
            <div key={i} onClick={() => setActiveFeature(i)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 14, cursor: 'pointer', transition: 'all 300ms ease', background: activeFeature === i ? 'rgba(79,109,245,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${activeFeature === i ? 'rgba(79,109,245,0.40)' : 'rgba(255,255,255,0.06)'}`, transform: activeFeature === i ? 'translateX(4px)' : 'none' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: activeFeature === i ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: activeFeature === i ? 'white' : 'rgba(255,255,255,0.40)', flexShrink: 0, transition: 'all 300ms' }}>
                {f.icon}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: activeFeature === i ? 'white' : 'rgba(255,255,255,0.60)', marginBottom: 2 }}>{f.title}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.4 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'auto', paddingTop: 40, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex' }}>
            {['#f46b72','#f4c95d','#28c99a','#4f6df5'].map((c, i) => (
              <div key={i} style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: '2px solid #0f1117', marginLeft: i > 0 ? -8 : 0 }} />
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)' }}>Join <strong style={{ color: 'rgba(255,255,255,0.70)' }}>500+</strong> businesses growing with TZMICHA</div>
        </div>
      </div>

      {/* Right Panel */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 48px', background: '#f8f9ff', overflowY: 'auto' }}>
        <div style={{ width: '100%', maxWidth: 420 }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 32 }}>
            {[1, 2].map(s => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: step > s ? '#28c99a' : step === s ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(130,145,190,0.15)', color: step >= s ? 'white' : '#8790aa' }}>
                  {step > s ? <CheckCircle2 size={14} /> : s}
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: step === s ? '#4f6df5' : step > s ? '#28c99a' : '#8790aa' }}>{s === 1 ? 'Your Info' : 'Account Setup'}</span>
                {s < 2 && <div style={{ width: 32, height: 2, borderRadius: 1, background: step > 1 ? '#28c99a' : 'rgba(130,145,190,0.20)' }} />}
              </div>
            ))}
          </div>

          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f1117', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
            {step === 1 ? 'Create your account' : 'Set up your workspace'}
          </h1>
          <p style={{ fontSize: 14, color: '#8790aa', margin: '0 0 28px' }}>
            {step === 1 ? 'Start your free CRM in 30 seconds' : 'Almost there — just your login details'}
          </p>

          {error && (
            <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.25)', color: '#f46b72', fontSize: 13, marginBottom: 20 }}>
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={e => void handleSubmit(e)}>
            {step === 1 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334e68', marginBottom: 6 }}>Your Full Name</label>
                  <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="e.g. Rahul Sharma" autoFocus
                    style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1.5px solid rgba(130,145,190,0.25)', background: 'white', fontSize: 14, color: '#0f1117', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334e68', marginBottom: 6 }}>Company / Workspace Name</label>
                  <input type="text" value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="e.g. Acme Corp"
                    style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1.5px solid rgba(130,145,190,0.25)', background: 'white', fontSize: 14, color: '#0f1117', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <button type="button" disabled={!step1Valid} onClick={() => setStep(2)}
                  style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: step1Valid ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(130,145,190,0.20)', color: step1Valid ? 'white' : '#8790aa', fontSize: 14, fontWeight: 700, cursor: step1Valid ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 }}>
                  Continue <ArrowRight size={16} />
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334e68', marginBottom: 6 }}>Email Address</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" autoFocus
                    style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1.5px solid rgba(130,145,190,0.25)', background: 'white', fontSize: 14, color: '#0f1117', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334e68', marginBottom: 6 }}>Password</label>
                  <div style={{ position: 'relative' }}>
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 6 characters"
                      style={{ width: '100%', padding: '12px 44px 12px 16px', borderRadius: 12, border: '1.5px solid rgba(130,145,190,0.25)', background: 'white', fontSize: 14, color: '#0f1117', outline: 'none', boxSizing: 'border-box' }} />
                    <button type="button" onClick={() => setShowPassword(p => !p)}
                      style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#8790aa', display: 'flex' }}>
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {pwStrength > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {[1,2,3].map(i => <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: pwStrength >= i ? pwColor : 'rgba(130,145,190,0.15)' }} />)}
                      </div>
                      <div style={{ fontSize: 11, color: pwColor, marginTop: 4, fontWeight: 600 }}>{pwLabel} password</div>
                    </div>
                  )}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334e68', marginBottom: 6 }}>Confirm Password</label>
                  <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat your password"
                    style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: `1.5px solid ${confirmPassword && confirmPassword !== password ? '#f46b72' : confirmPassword && confirmPassword === password ? '#28c99a' : 'rgba(130,145,190,0.25)'}`, background: 'white', fontSize: 14, color: '#0f1117', outline: 'none', boxSizing: 'border-box' }} />
                  {confirmPassword && confirmPassword === password && (
                    <div style={{ fontSize: 11, color: '#28c99a', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle2 size={11} /> Passwords match
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <button type="button" onClick={() => { setStep(1); setError(''); }}
                    style={{ flex: 1, padding: '13px', borderRadius: 12, border: '1.5px solid rgba(130,145,190,0.25)', background: 'white', color: '#627d98', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                    Back
                  </button>
                  <button type="submit" disabled={loading || !step2Valid}
                    style={{ flex: 2, padding: '13px', borderRadius: 12, border: 'none', background: step2Valid && !loading ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(130,145,190,0.20)', color: step2Valid && !loading ? 'white' : '#8790aa', fontSize: 14, fontWeight: 700, cursor: step2Valid && !loading ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    {loading ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Creating…</> : <>Create Account <ArrowRight size={15} /></>}
                  </button>
                </div>
              </div>
            )}
          </form>

          <p style={{ textAlign: 'center', fontSize: 13, color: '#8790aa', marginTop: 24 }}>
            Already have an account?{' '}
            <Link href="/login" style={{ color: '#4f6df5', fontWeight: 700, textDecoration: 'none' }}>Sign in</Link>
          </p>
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
