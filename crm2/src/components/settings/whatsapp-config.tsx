'use client';

import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  Eye,
  EyeOff,
  Copy,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Zap,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SettingsPanelHead } from './settings-panel-head';
import { EmbeddedSignupConnectCard } from './embedded-signup-connect';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import type { WhatsAppConfig as WhatsAppConfigType } from '@/types';

const MASKED_TOKEN = '••••••••••••••••';

// next-intl rich-text tags used by the WhatsApp setup steps (step3_*/step4_*).
// Messages carry tag-only <strong>…</strong>; t.rich renders them with the
// foreground color instead of t() + dangerouslySetInnerHTML (which throws
// INVALID_MESSAGE: INVALID_TAG on tagged messages).
const richStrong = {
  strong: (chunks: ReactNode) => <strong className="text-foreground">{chunks}</strong>,
};

type ConnectionStatus = 'connected' | 'disconnected' | 'unknown';
type ResetReason = 'token_corrupted' | 'meta_api_error' | null;

export function WhatsAppConfig() {
  const t = useTranslations('Settings.whatsapp');
  const supabase = createClient();
  // After multi-user, whatsapp_config is one-row-per-account, not
  // one-row-per-user. We pull `accountId` straight off the auth
  // context and key every read off it — so a teammate who just
  // joined an account sees the inviter's saved config without
  // having to re-enter anything.
  const { user, accountId, loading: authLoading, profileLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [config, setConfig] = useState<WhatsAppConfigType | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('unknown');
  const [resetReason, setResetReason] = useState<ResetReason>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  // Guards against re-hydrating the form when the load effect below
  // re-runs for reasons unrelated to actually switching accounts —
  // e.g. Supabase's onAuthStateChange fires a token refresh (new
  // `user` object, profileLoading flips true/false) when the browser
  // tab regains focus. Without this, that churn calls fetchConfig()
  // again and overwrites whatever the user typed but hadn't saved yet.
  const loadedAccountIdRef = useRef<string | null>(null);

  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [pin, setPin] = useState('');
  const [tokenEdited, setTokenEdited] = useState(false);

  // True once /register has succeeded on Meta's side (timestamp set
  // in the row). When false, the saved config is metadata-only and
  // Meta will silently drop every inbound event — that's the
  // multi-number bug that prompted this work.
  const lastRegistrationError = config?.last_registration_error ?? null;

  // Connection diagnostics surfaced from the whatsapp_config row.
  const lastWebhookAt = config?.last_webhook_at ?? null;
  const lastInboundAt = config?.last_inbound_at ?? null;
  const webhookVerifiedAt = config?.webhook_verified_at ?? null;
  const lastApiError = config?.last_api_error ?? null;
  const lastApiErrorAt = config?.last_api_error_at ?? null;

  // Structured result from /api/whatsapp/verify ("Verified with Meta").
  type VerifyCheck = {
    key: string;
    label: string;
    status: 'ok' | 'fail' | 'warning' | 'skipped';
    detail: string | null;
    error?: {
      status?: number;
      code?: string;
      type?: string;
      message?: string;
      operation?: string;
    } | null;
  };
  type VerifyResult = {
    ready: boolean;
    partial: boolean;
    registeredAt?: string | null;
    registered_at?: string | null;
    requiresRegistration: boolean;
    last_registration_error?: string | null;
    checks: VerifyCheck[];
    registrationState?: string | null;
    persisted_registration_state?: string | null;
    last_inbound_at?: string | null;
    last_webhook_at?: string | null;
    webhook_verified_at?: string | null;
    webhook_signature_configured?: boolean;
  };
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);

  // Real registration state — live-determined by the /register probe on
  // save and by "Verify with Meta". Prefer the fresh probe from a verify
  // when present, else the persisted column, else unknown.
  const registrationState =
    verifyResult?.registrationState ??
    config?.registration_state ??
    'REGISTRATION_UNKNOWN';
  // If we have actually stored inbound messages, the number demonstrably
  // delivers to this app — never ask for a PIN on a working number.
  const inboundWorking = Boolean(config?.last_inbound_at || verifyResult?.last_inbound_at);
  const webhookSignatureConfigured =
    verifyResult?.webhook_signature_configured ?? true;

  // Registration card derived styling.
  const regOk = registrationState === 'REGISTERED' || inboundWorking;
  const regNeedsPin =
    registrationState === 'REGISTRATION_REQUIRED' ||
    registrationState === 'REGISTERED_ELSEWHERE';
  const regTitle = regOk
    ? inboundWorking
      ? 'Inbound Active — messages are being delivered'
      : 'Registered — inbound ready'
    : regNeedsPin
      ? 'Registration Required'
      : 'Registration Not Confirmed';
  const regError = registrationState === 'REGISTRATION_ERROR';
  const regCardStyle = regOk
    ? 'bg-emerald-950/30 border-emerald-700/50'
    : regError
      ? 'bg-red-950/30 border-red-700/50'
      : 'bg-amber-950/30 border-amber-700/50';
  const regAccent = regOk
    ? 'text-emerald-400'
    : regError
      ? 'text-red-400'
      : 'text-amber-400';
  const regTitleColor = regOk
    ? 'text-emerald-200'
    : regError
      ? 'text-red-200'
      : 'text-amber-200';

  // The "connection" card must never contradict "Inbound Active". It is
  // connected when the credential ping succeeded OR the number demonstrably
  // delivers inbound (registration confirmed / a message was actually
  // received) — a live webhook with delivered messages is proof the
  // connection is real even if the stored token can't be re-pinged right now.
  const credsConnected = connectionStatus === 'connected';
  const effectivelyConnected =
    credsConnected || Boolean(config && (regOk || inboundWorking));

  // Track a pending PIN the admin is about to submit for registration.
  const [registrationPin, setRegistrationPin] = useState('');
  const [sendingPin, setSendingPin] = useState(false);

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/whatsapp/webhook`
      : '';

  const fetchConfig = useCallback(async (acctId: string) => {
    setLoading(true);
    try {
      // Load form values from Supabase (shows what's in DB).
      // Switched from `user_id` (which would only match the row's
      // original author) to `account_id` so every member of the
      // account sees the same saved configuration. The table supports
      // one row per phone_number_id (migration 053 dropped the
      // UNIQUE(account_id) constraint), so we load the most-recently
      // updated row deterministically instead of `.maybeSingle()` —
      // `.maybeSingle()` would return PGRST116 for an account with
      // more than one number, which previously surfaced as the
      // "Failed to load your current configuration" error.
      const { data, error } = await supabase
        .from('whatsapp_config')
        .select('*')
        .eq('account_id', acctId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Failed to load config row:', error);
      }

      if (data) {
        setConfig(data);
        setPhoneNumberId(data.phone_number_id || '');
        setWabaId(data.waba_id || '');
        setAccessToken(MASKED_TOKEN);
        setVerifyToken('');
        setPin('');
        setTokenEdited(false);
      } else {
        setConfig(null);
        setPhoneNumberId('');
        setWabaId('');
        setAccessToken('');
        setVerifyToken('');
        setPin('');
        setTokenEdited(false);
      }
      // Clear any stale probe result when reloading the row.
      setVerifyResult(null);

      // Then verify health via the API (decrypts token + pings Meta)
      if (data) {
        try {
          const res = await fetch('/api/whatsapp/config', { method: 'GET' });
          const payload = await res.json().catch(() => ({}));

          // A real API error should be surfaced, not silently shown as
          // "Not Connected" — otherwise a transient backend failure looks
          // like the credentials are wrong.
          if (!res.ok && payload.error) {
            setConnectionStatus('disconnected');
            setResetReason(null);
            setStatusMessage(payload.error);
            console.error('Health check returned an error:', {
              status: res.status,
              code: payload.code || null,
              message: payload.error,
            });
          } else if (payload.connected) {
            setConnectionStatus('connected');
            setResetReason(null);
            setStatusMessage('');
          } else {
            setConnectionStatus('disconnected');
            setResetReason(payload.needs_reset ? 'token_corrupted' : payload.reason === 'meta_api_error' ? 'meta_api_error' : null);
            setStatusMessage(payload.message || '');
          }
        } catch (err) {
          console.error('Health check failed:', err);
          setConnectionStatus('disconnected');
          setStatusMessage('Unable to verify connection with Meta.');
        }
      } else {
        setConnectionStatus('disconnected');
        setResetReason(null);
        setStatusMessage('');
      }
    } catch (err) {
      console.error('fetchConfig error:', err);
      toast.error('Unable to load WhatsApp configuration. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    // Need both the auth session (`!authLoading`) AND the profile
    // (`!profileLoading`, which carries `accountId`). Without the
    // second guard, the effect would fire with `accountId === null`
    // for the first render window and bail without ever retrying
    // once the profile arrives.
    if (authLoading || profileLoading) return;
    if (!user || !accountId) {
      loadedAccountIdRef.current = null;
      setLoading(false);
      return;
    }
    if (loadedAccountIdRef.current === accountId) return;
    loadedAccountIdRef.current = accountId;
    fetchConfig(accountId);
  }, [authLoading, profileLoading, user?.id, accountId, fetchConfig]);

  async function handleSave() {
    // Prevent duplicate submissions while a save is in flight.
    if (saving) return;

    setSaveError(null);

    if (!phoneNumberId.trim()) {
      toast.error('Phone Number ID is required');
      return;
    }
    if (!config && (!accessToken.trim() || !tokenEdited)) {
      toast.error('Access Token is required for initial setup');
      return;
    }

    try {
      setSaving(true);

      // Always POST through the API — it verifies with Meta and encrypts
      // the access_token server-side with ENCRYPTION_KEY. Skipping this
      // and writing direct to Supabase stores the token in plaintext,
      // which then fails decryption on every subsequent health check.
      const payload: Record<string, unknown> = {
        phone_number_id: phoneNumberId.trim(),
        waba_id: wabaId.trim() || null,
        verify_token: verifyToken.trim() || null,
        // Optional — only sent when the user filled it in. The server
        // requires it on first save or when registering a brand-new
        // number. For an existing number, leaving it blank tells the
        // server to reuse the stored (encrypted) token — which is exactly
        // what a PIN-only re-register needs to finish inbound wiring.
        pin: pin.trim() || null,
      };

      if (tokenEdited && accessToken !== MASKED_TOKEN && accessToken.trim()) {
        payload.access_token = accessToken.trim();
      } else if (!config) {
        // Brand-new connection always needs a real access token.
        toast.error('Access Token is required for initial setup');
        setSaveError('Access Token is required for initial setup');
        setSaving(false);
        return;
      }
      // Existing config with no fresh token → server reuses the stored
      // (encrypted) token. This lets the user re-send the 2FA PIN to
      // complete registration without re-entering the whole token.

      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Surface the real server error (400/401/403/409/500) instead of
        // swallowing it — never claim success on a failed save.
        const message = data.error || data.message || `Failed to save configuration (HTTP ${res.status})`;
        console.error('WhatsApp config save failed:', {
          status: res.status,
          code: data.code || null,
          message: message,
          detail: data.meta_error || data.details || null,
        });
        toast.error(message, { duration: 12000 });
        setSaveError(message);
        setSaving(false);
        return;
      }

      // Save succeeded (the database operation completed) — only now do
      // we show success feedback. Credentials being valid is NOT the same
      // as the number being registered for inbound — never claim success
      // when registration is not confirmed. Use the REAL registration
      // state determined by the live /register probe, never a guess.
      const credentialsOk = Boolean(data.phone_info || data.config?.connection_status === 'connected');
      const regState = data.registration_state ?? 'REGISTRATION_UNKNOWN';
      if (regState === 'REGISTERED' || data.registered) {
        toast.success(
          data.phone_info?.verified_name
            ? `WhatsApp Connected — Inbound Ready (${data.phone_info.verified_name}).`
            : 'WhatsApp Connected — Inbound Ready.',
        );
        setPin('');
      } else if (
        regState === 'REGISTRATION_REQUIRED' ||
        regState === 'REGISTERED_ELSEWHERE'
      ) {
        toast.warning(
          `${credentialsOk ? 'Credentials connected. ' : ''}Inbound is not active — this phone number requires registration. Enter the two-step verification PIN below.${
            data.registration_error ? ` Meta: ${data.registration_error}` : ''
          }`,
          { duration: 14000 },
        );
        setSaveError(null);
        setPin('');
      } else {
        // UNKNOWN / ERROR — do not hard-require a PIN.
        toast.warning(
          `${credentialsOk ? 'Credentials connected. ' : ''}Inbound registration is not confirmed yet. Click "Verify with Meta" to see the exact state.${
            data.registration_error ? ` Meta: ${data.registration_error}` : ''
          }`,
          { duration: 14000 },
        );
        setSaveError(null);
        setPin('');
      }

      if (accountId) await fetchConfig(accountId);
    } catch (err) {
      console.error('Save error:', err);
      const message = err instanceof Error ? err.message : 'Failed to save configuration';
      toast.error(message, { duration: 12000 });
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    try {
      setTesting(true);
      // Real Meta Cloud API test: the backend loads the tenant's stored
      // (encrypted) credentials and calls Meta with them. The browser only
      // ever sees the safe result — never the token.
      const res = await fetch('/api/whatsapp/test', { method: 'POST' });
      const payload = await res.json().catch(() => ({}));

      if (payload.connected) {
        setConnectionStatus('connected');
        setResetReason(null);
        setStatusMessage('');
        toast.success(
          payload.phone?.verified_name
            ? `Meta API connection successful (${payload.phone.verified_name}).`
            : 'Meta API connection successful.'
        );
      } else {
        // Distinguish a corrupted stored token (needs re-entry) from a
        // plain Meta rejection so the reset path is offered correctly.
        const resetReason =
          payload.reason === 'token_corrupted'
            ? 'token_corrupted'
            : payload.reason === 'missing_access_token'
              ? 'token_corrupted'
              : null;
        setConnectionStatus('disconnected');
        setResetReason(resetReason);
        setStatusMessage(payload.reason || payload.message || 'WhatsApp API connection failed.');
        toast.error(payload.reason || payload.message || 'WhatsApp API connection failed.', {
          duration: 12000,
        });
      }
    } catch (err) {
      console.error('Test connection error:', err);
      setConnectionStatus('disconnected');
      toast.error('Connection test failed. Check network and try again.');
    } finally {
      setTesting(false);
    }
  }

  async function handleVerifyRegistration() {
    setVerifyLoading(true);
    setVerifyResult(null);
    try {
      const res = await fetch('/api/whatsapp/verify', { method: 'GET' });
      const data = (await res.json()) as VerifyResult;
      setVerifyResult(data);
      if (data.ready) {
        toast.success('Verified with Meta — every check passed.');
      } else {
        const failed = (data.checks ?? []).filter(
          (c) => c.status === 'fail' || c.status === 'warning',
        );
        const labels = failed.map((c) => c.label).join(', ') || 'some checks';
        toast.error(`Not fully ready. Failing: ${labels}`, { duration: 8000 });
      }
      if (accountId) await fetchConfig(accountId);
    } catch (err) {
      console.error('verify failed:', err);
      toast.error('Could not reach the verification endpoint.');
    } finally {
      setVerifyLoading(false);
    }
  }

  // Submit the two-step verification PIN to finish registration on Meta.
  // Sends ONLY the PIN to our dedicated backend /api/whatsapp/register —
  // the access token is resolved and used server-side, never sent to the
  // browser. The user's entered fields are preserved on any failure.
  async function handleSubmitPin() {
    if (!registrationPin || !/^\d{6}$/.test(registrationPin)) {
      toast.error('Enter the 6-digit WhatsApp two-step verification PIN.');
      return;
    }
    setSendingPin(true);
    try {
      const res = await fetch('/api/whatsapp/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: registrationPin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Preserve the user's PIN + other fields; never blame them for a
        // server/meta error with a generic message.
        const msg =
          data.message || data.details || data.error || `Registration failed (HTTP ${res.status})`;
        toast.error(msg, { duration: 12000 });
        return;
      }
      if (data.registered) {
        if (data.already_registered) {
          toast.success(
            'The WhatsApp number is already registered with Meta. Connection refreshed.',
          );
        } else {
          toast.success(
            'Phone number registered — inbound messages will now reach the CRM inbox.',
          );
        }
        setRegistrationPin('');
        setPin('');
      }
      if (accountId) await fetchConfig(accountId);
      await handleVerifyRegistration();
    } catch (err) {
      console.error('PIN submit failed:', err);
      toast.error('Failed to complete registration. Please try again.');
    } finally {
      setSendingPin(false);
    }
  }

  async function handleReset() {
    if (!confirm('This will delete the current WhatsApp config so you can re-enter it. Continue?')) {
      return;
    }

    try {
      setResetting(true);
      const res = await fetch('/api/whatsapp/config', { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to reset configuration');
        return;
      }

      toast.success('Configuration cleared. You can now re-enter your credentials.');
      setConfig(null);
      setPhoneNumberId('');
      setWabaId('');
      setAccessToken('');
      setVerifyToken('');
      setTokenEdited(false);
      setConnectionStatus('disconnected');
      setResetReason(null);
      setStatusMessage('');
    } catch (err) {
      console.error('Reset error:', err);
      toast.error('Failed to reset configuration');
    } finally {
      setResetting(false);
    }
  }

  function handleCopyWebhookUrl() {
    navigator.clipboard.writeText(webhookUrl);
    toast.success('Webhook URL copied to clipboard');
  }

  if (loading) {
    return (
      <section className="animate-in fade-in-50 duration-200">
        <SettingsPanelHead
          title={t("title")}
          description={t("description")}
        />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  const showResetBanner = resetReason === 'token_corrupted';

  return (
    <section className="animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title={t("title")}
        description={t("description")}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      {/* Main config form */}
      <div className="space-y-6">
        {/* Corrupted-token reset banner */}
        {showResetBanner && (
          <Alert className="bg-amber-950/40 border-amber-600/40">
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-5 text-amber-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <AlertTitle className="text-amber-200 mb-1">
                  Stored token can&apos;t be decrypted
                </AlertTitle>
                <AlertDescription className="text-amber-100/80 text-sm">
                  {statusMessage}
                </AlertDescription>
                <Button
                  onClick={handleReset}
                  disabled={resetting}
                  size="sm"
                  className="mt-3 bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {resetting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {t('resetting')}
                    </>
                  ) : (
                    <>
                      <RotateCcw className="size-4" />
                      {t('resetConfig')}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Alert>
        )}

        {/* Save error — the real API error surfaced inline so it isn't
            lost on a transient toast. */}
        {saveError && (
          <Alert className="bg-red-950/40 border-red-600/40">
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-5 text-red-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <AlertTitle className="text-red-200 mb-1">
                  {t('saveFailed')}
                </AlertTitle>
                <AlertDescription className="text-red-100/90 text-sm">
                  {saveError}
                </AlertDescription>
              </div>
            </div>
          </Alert>
        )}

        {/* Connection Status */}
        <Alert className="bg-card border-border">
          <div className="flex items-center gap-2">
            {effectivelyConnected ? (
              <CheckCircle2 className="size-4 text-primary" />
            ) : (
              <XCircle className="size-4 text-red-500" />
            )}
            <AlertTitle className="text-foreground mb-0">
              {effectivelyConnected ? t('credentialsValid') : t('notConnected')}
            </AlertTitle>
          </div>
          <AlertDescription className="text-muted-foreground">
            {effectivelyConnected ? (
              <>
                {t('connectedDesc')}
                {!credsConnected && config && (regOk || inboundWorking) && (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Inbound messages are active for this number, so the
                    connection is live. The stored credential could not be
                    re-verified with Meta on this check — use “Verify with
                    Meta” for the exact state.
                  </span>
                )}
              </>
            ) : (
              statusMessage || t('notConnectedDesc')
            )}
            {/* Identity reported by Meta on the last successful
                verification — lets users confirm they wired the right
                number/business without leaving the page. */}
            {(config?.business_name || config?.display_phone_number) &&
             effectivelyConnected && (
              <span className="mt-1 block text-xs">
                {[config.business_name, config.display_phone_number]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
            {/* Connection method + coexistence — only rendered for an
                Embedded-Signup-connected number, and only when Meta has
                actually confirmed coexistence (never inferred). */}
            {config?.connection_method === 'embedded_signup' &&
              effectivelyConnected && (
                <span className="mt-1.5 block rounded border border-emerald-800/40 bg-emerald-950/30 px-2 py-1 text-xs text-emerald-200">
                  {config.coexistence_status === 'active'
                    ? `Coexistence active — this number is live on both the WhatsApp Business App and the Cloud API (Meta-confirmed ${config.coexistence_confirmed_at ? new Date(config.coexistence_confirmed_at).toLocaleDateString() : ''}).`
                    : 'Connected via WhatsApp Business App (Embedded Signup). Coexistence not yet confirmed by Meta.'}
                </span>
              )}
          </AlertDescription>
        </Alert>

        {/* Registration Status — the "is it actually live?" check.
            Credentials being valid is necessary but not sufficient;
            registration + webhook determine whether inbound actually
            flows. Show the REAL registration state determined by the
            live /register probe, never a guessed status. */}
        {config && (
          <Alert className={regCardStyle}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                {regOk ? (
                  <CheckCircle2 className={'size-4 ' + regAccent} />
                ) : (
                  <AlertTriangle className={'size-4 ' + regAccent} />
                )}
                <AlertTitle className={'mb-0 ' + regTitleColor}>
                  {regTitle}
                </AlertTitle>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleVerifyRegistration}
                disabled={verifyLoading}
                className="border-border bg-transparent text-foreground hover:bg-muted h-7"
              >
                {verifyLoading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Zap className="size-3.5" />
                )}
                {t('verifyWithMeta')}
              </Button>
            </div>
            <AlertDescription className="text-muted-foreground mt-2 text-xs leading-relaxed">
              {registrationState === 'REGISTERED' || inboundWorking ? (
                <span>
                  Phone number is registered to this app
                  {config.registered_at
                    ? ` since ${new Date(config.registered_at).toLocaleString()}`
                    : ''}
                  . Inbound messages will reach the CRM inbox.
                </span>
              ) : registrationState === 'REGISTRATION_REQUIRED' ||
                registrationState === 'REGISTERED_ELSEWHERE' ? (
                <span>
                  This phone number requires registration to receive inbound
                  messages.
                  {lastRegistrationError ? (
                    <>
                      {' '}
                      Meta said:{' '}
                      <span className="text-red-300">&quot;{lastRegistrationError}&quot;</span>
                    </>
                  ) : (
                    ' Enter the two-step verification PIN below to complete it.'
                  )}
                </span>
              ) : (
                <span>
                  Registration is not confirmed for this number. If it was set
                  up through Google/Facebook Business Manager or Embedded
                  Signup it may already be registered — the issue may instead
                  be the webhook. Use &quot;Verify with Meta&quot; to see the
                  real state.
                  {lastRegistrationError ? (
                    <>
                      {' '}
                      Last attempt:{' '}
                      <span className="text-red-300">&quot;{lastRegistrationError}&quot;</span>
                    </>
                  ) : null}
                </span>
              )}
            </AlertDescription>

            {!webhookSignatureConfigured && (
              <div className="mt-2 rounded border border-red-700/50 bg-red-950/30 px-3 py-2 text-xs text-red-200">
                The webhook &quot;META_APP_SECRET&quot; is not configured. The
                inbound endpoint rejects every request (401), so no messages
                will ever reach the CRM — even though Meta receives them. Set it
                in your production environment variables.
              </div>
            )}

            {verifyResult && (
              <div className="mt-3 rounded border border-border bg-card/60 px-3 py-2 space-y-1.5 text-[11px]">
                <p className="font-medium text-foreground">
                  {t('diagnosticLastRun')}
                  <span
                    className={
                      verifyResult.ready
                        ? 'text-emerald-400'
                        : verifyResult.requiresRegistration
                          ? 'text-amber-400'
                          : 'text-red-400'
                    }
                  >
                    {verifyResult.ready
                      ? 'Ready'
                      : verifyResult.requiresRegistration
                        ? 'Registration required'
                        : 'Not ready'}
                  </span>
                </p>
                <ul className="space-y-0.5 text-muted-foreground">
                  {(verifyResult.checks ?? []).map((c) => (
                    <li key={c.key} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5">
                        {c.status === 'ok' ? (
                          <CheckCircle2 className="size-3 text-emerald-400 shrink-0" />
                        ) : c.status === 'fail' ? (
                          <XCircle className="size-3 text-red-400 shrink-0" />
                        ) : c.status === 'warning' ? (
                          <AlertTriangle className="size-3 text-amber-400 shrink-0" />
                        ) : (
                          <span className="size-3 rounded-full border border-border shrink-0" />
                        )}
                        <span className="font-medium text-foreground">{c.label}</span>
                      </span>
                      <span className="text-right text-muted-foreground truncate max-w-[55%]">
                        {c.detail || c.error?.message || c.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* PIN input — shown ONLY when inbound isn't already working and
                registration isn't confirmed. For REQUIRED / ELSEWHERE states
                it's a hard step; for UNKNOWN / ERROR it's an optional,
                accurately-framed action. Never shown on a working number. */}
            {!inboundWorking &&
              registrationState !== 'REGISTERED' && (
                <div className="mt-2 pt-2 border-t border-border space-y-2">
                  <p className="text-muted-foreground">
                    {registrationState === 'REGISTRATION_REQUIRED' ||
                    registrationState === 'REGISTERED_ELSEWHERE'
                      ? 'Enter the 6-digit WhatsApp two-step verification PIN to register the number and start receiving inbound messages.'
                      : 'Enter the 6-digit WhatsApp two-step verification PIN (from Meta WhatsApp Manager → Two-step verification) to register the number.'}
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="6-digit PIN"
                      autoComplete="off"
                      value={registrationPin}
                      onChange={(e) =>
                        setRegistrationPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                      }
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground max-w-[180px] tracking-widest"
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={sendingPin || !/^\d{6}$/.test(registrationPin)}
                      onClick={handleSubmitPin}
                    >
                      {sendingPin ? <Loader2 className="size-3.5 animate-spin" /> : null}
                      {sendingPin ? 'Registering…' : 'Register'}
                    </Button>
                  </div>
                </div>
              )}
          </Alert>
        )}

        {/* Connect WhatsApp Business App — Meta Embedded Signup (v4)
            coexistence onboarding. ADDITIVE: it connects an additional
            phone number through Meta's Embedded Signup popup and stores a
            NEW whatsapp_config row; it never modifies, resets, or deletes
            the manual Cloud API connection above. */}
        <EmbeddedSignupConnectCard />

        {/* Connection diagnostics */}
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Connection diagnostics</CardTitle>
            <CardDescription className="text-muted-foreground">
              Live lifecycle timestamps recorded from the Meta webhook and API.
              If inbound messages aren&apos;t showing up, these tell you the
              last time anything actually reached this app.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <DiagRow
              label="Webhooks received"
              value={verifyResult?.last_webhook_at ?? lastWebhookAt}
            />
            <DiagRow
              label="Inbound messages stored"
              value={verifyResult?.last_inbound_at ?? lastInboundAt}
            />
            <DiagRow
              label="Webhook challenge verified"
              value={verifyResult?.webhook_verified_at ?? webhookVerifiedAt}
            />
            <DiagRow
              label="Last API error"
              value={lastApiErrorAt}
              suffix={lastApiError ?? undefined}
              isError={Boolean(lastApiError)}
            />
            <DiagRow
              label="Webhook signature (META_APP_SECRET)"
              value={null}
              suffix={
                webhookSignatureConfigured
                  ? 'Configured — inbound POSTs will verify'
                  : 'NOT configured — inbound POSTs are rejected (401)'
              }
              isError={!webhookSignatureConfigured}
            />
          </CardContent>
        </Card>

        {/* API Credentials */}
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">{t('apiCredentialsTitle')}</CardTitle>
            <CardDescription className="text-muted-foreground">
              {t('apiCredentialsDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">{t('phoneNumberId')}</Label>
              <Input
                placeholder="e.g. 100234567890123"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">{t('wabaId')}</Label>
              <Input
                placeholder="e.g. 100234567890456"
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value)}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">{t('accessToken')}</Label>
              <div className="relative">
                <Input
                  type={showToken ? 'text' : 'password'}
                  placeholder={t('accessTokenPlaceholder')}
                  value={accessToken}
                  onChange={(e) => {
                    setAccessToken(e.target.value);
                    setTokenEdited(true);
                  }}
                  onFocus={() => {
                    if (accessToken === MASKED_TOKEN) {
                      setAccessToken('');
                      setTokenEdited(true);
                    }
                  }}
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {config && !tokenEdited && (
                <p className="text-xs text-muted-foreground">
                  {t('tokenHidden')}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">{t('webhookVerifyToken')}</Label>
              <Input
                placeholder={t('webhookVerifyTokenPlaceholder')}
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">
                {t('webhookVerifyTokenHint')}
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">
                {t('twoStepPin')}
                <span className="ml-1 text-muted-foreground">{t('optional')}</span>
              </Label>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder={t('pinPlaceholder')}
                value={pin}
                onChange={(e) =>
                  setPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground tracking-widest"
              />
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span dangerouslySetInnerHTML={{ __html: t('pinHint') }} />
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Webhook URL */}
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">{t('webhookTitle')}</CardTitle>
            <CardDescription className="text-muted-foreground">
              {t('webhookDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label className="text-muted-foreground">{t('webhookUrl')}</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={webhookUrl}
                  className="bg-muted border-border text-muted-foreground font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyWebhookUrl}
                  className="shrink-0 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('saving')}
              </>
            ) : (
              t('saveConfig')
            )}
          </Button>
          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={testing || !config}
            className="border-border text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            {testing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('testing')}
              </>
            ) : (
              <>
                <Zap className="size-4" />
                {t('testConnection')}
              </>
            )}
          </Button>
          {config && (
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={resetting}
              className="border-red-900 text-red-400 hover:text-red-300 hover:bg-red-950/40"
            >
              {resetting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('resetting')}
                </>
              ) : (
                <>
                  <RotateCcw className="size-4" />
                  {t('resetConfig')}
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Setup Instructions Sidebar */}
      <div>
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground text-base">{t('setupInstructions')}</CardTitle>
            <CardDescription className="text-muted-foreground">
              {t('setupInstructionsDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion>
              <AccordionItem className="border-border">
                <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
                    {t('step1')}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li dangerouslySetInnerHTML={{ __html: t('step1_1') }} />
                    <li>{t('step1_2')}</li>
                    <li>{t('step1_3')}</li>
                    <li>{t('step1_4')}</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem className="border-border">
                <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
                    {t('step2')}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>{t('step2_1')}</li>
                    <li>{t('step2_2')}</li>
                    <li>{t('step2_3')}</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem className="border-border">
                <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
                    {t('step3')}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>{t('step3_1')}</li>
                    <li>{t.rich('step3_2', richStrong)}</li>
                    <li>{t.rich('step3_3', richStrong)}</li>
                    <li>{t.rich('step3_4', richStrong)}</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem className="border-border">
                <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">4</span>
                    {t('step4')}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>{t('step4_1')}</li>
                    <li>{t('step4_2')}</li>
                    <li>{t.rich('step4_3', richStrong)}</li>
                    <li>{t.rich('step4_4', richStrong)}</li>
                    <li>{t('step4_5')}</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div className="mt-4 pt-4 border-t border-border">
              <a
                href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
              >
                <ExternalLink className="size-3.5" />
                {t('metaDocs')}
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
    </section>
  );
}

function fmtDiagTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function DiagRow({
  label,
  value,
  suffix,
  isError,
}: {
  label: string;
  value: string | null | undefined;
  suffix?: string;
  isError?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-2 border-b border-border/60 last:border-0 pb-1.5 last:pb-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right">
        <span className={isError ? 'text-red-300' : 'text-foreground'}>
          {fmtDiagTime(value)}
        </span>
        {suffix ? (
          <span className="block text-[11px] text-muted-foreground max-w-[260px] truncate" title={suffix}>
            {suffix}
          </span>
        ) : null}
      </span>
    </div>
  );
}
