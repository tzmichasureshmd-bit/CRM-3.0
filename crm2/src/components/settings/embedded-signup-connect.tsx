'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Zap,
  AlertTriangle,
} from 'lucide-react';
import { useWhatsAppEmbeddedSignup } from 'react-whatsapp-embedded-signup';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/hooks/use-auth';

/**
 * "Connect WhatsApp Business App" — Meta Embedded Signup (v4) coexistence
 * onboarding for the CRM's WhatsApp integration.
 *
 * This is ADDITIVE and SAFE by design:
 *   - It runs the Facebook Embedded Signup popup (via
 *     react-whatsapp-embedded-signup) to obtain a one-time OAuth code.
 *   - The code is exchanged on the SERVER (/api/whatsapp/embedded/connect),
 *     which REUSES an existing whatsapp_config row for the same
 *     phone_number_id (connection_method='embedded_signup') or inserts a row
 *     only when the number is not yet connected. The existing manual Cloud
 *     API connection is NEVER modified, reset, or deleted, and a number
 *     connected to another account is refused (HTTP 409).
 *   - Coexistence is reported ONLY when Meta's own fields confirm it
 *     (is_on_biz_app true AND platform_type CLOUD_API). The UI never claims
 *     coexistence otherwise.
 *
 * The FB.login call uses `extras.featureType =
 * 'whatsapp_business_app_onboarding'` (patched into the wrapper's FB.login
 * via scripts/patch-whatsapp-embedded-signup.mjs) so Meta presents the
 * WhatsApp Business App onboarding/coexistence prompt.
 */

interface EmbeddedStatus {
  configured: boolean;
  missing: string[];
  has_manual_connection: boolean;
  accountId: string | null;
  appId: string | null;
  configId: string | null;
}

interface EmbedResult {
  success: boolean;
  coexistence: boolean;
  coexistence_meta: { is_on_biz_app: boolean; platform_type: string };
  waba_id?: string;
  phone_number_id?: string;
  business_id?: string;
  display_phone_number?: string;
  verified_name?: string;
  connection_method: string;
  ready: boolean;
  configRowId?: string;
  reused?: boolean;
  code?: string;
  error?: string;
}

const APP_ID = process.env.NEXT_PUBLIC_META_APP_ID ?? '';
const CONFIG_ID = process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID ?? '';
// Optional override so a production deploy can pin the exact OAuth redirect
// URI Meta must accept (register it verbatim in Valid OAuth Redirect URIs).
// Unset → we use the current page origin + pathname, e.g.
// http://localhost:3000/settings. Never hardcodes a domain.
const REDIRECT_OVERRIDE =
  process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_REDIRECT_URI ?? '';

function currentRedirectUri(): string {
  if (typeof window === 'undefined') return '';
  if (REDIRECT_OVERRIDE.trim()) return REDIRECT_OVERRIDE.trim();
  return `${window.location.origin}${window.location.pathname}`;
}

// Any character outside Latin + common punctuation marks a localized
// (e.g. Telugu) Meta message — those must never reach the CRM UI.
const NON_LATIN_RE = /[^\u0000-\u024F\u2014\u2018\u2019\u201C\u201D\u2022\u00A0]/;

// Normalize any Meta/FB error into a clear ENGLISH user message. The
// original technical error is preserved in browser/server logs.
function normalizeMetaError(raw: string): { display: string; original: string } {
  const lower = raw.toLowerCase();
  if (/domain of this url/.test(lower) || lower.includes('app domains')) {
    return {
      display:
        'Meta rejected the Embedded Signup URL because this CRM\u2019s domain is not listed in the Meta app\u2019s App Domains. ' +
        `Open Meta for Developers \u2192 App ${APP_ID || '(your app)'} \u2192 Settings \u2192 Basic \u2192 App Domains, add both "localhost" and this production domain, then add the Website platform Site URL and the exact OAuth redirect URI shown below to Facebook Login \u2192 Valid OAuth Redirect URIs.`,
      original: raw,
    };
  }
  if (/redirect[_ ]?uri|redirect uri|callback url/i.test(lower)) {
    return {
      display:
        'Meta rejected the OAuth redirect URI because it is not registered. Add the exact redirect URI shown below to Facebook Login \u2192 Valid OAuth Redirect URIs in your Meta app.',
      original: raw,
    };
  }
  if (/config[_ ]?id/.test(lower) || /invalid.*config/.test(lower)) {
    return {
      display:
        'The Meta Embedded Signup configuration ID is invalid or no longer exists. Verify META_EMBEDDED_SIGNUP_CONFIG_ID in your environment configuration.',
      original: raw,
    };
  }
  if (/invalid.*app|invalid.*app id|invalid.*appid/i.test(lower)) {
    return {
      display:
        'The Meta App ID is invalid or the app is unavailable. Verify META_APP_ID in your environment configuration.',
      original: raw,
    };
  }
  if (/popup|blocked|would be shown pop/i.test(lower)) {
    return {
      display:
        'The Facebook popup was blocked by your browser. Allow popups for this site, then click "Connect with Meta" again.',
      original: raw,
    };
  }
  if (/oauth|authoriz|cancell|denied|user_denied|login.*fail|not completed/i.test(lower)) {
    return {
      display:
        'The connection to Meta could not be completed. If you cancelled the signup, no changes were made. Check the Facebook Login settings in your Meta app and try again.',
      original: raw,
    };
  }
  if (/already.*(registered|connected)|already.*in use|number.*in use/i.test(lower)) {
    return {
      display:
        'This WhatsApp phone number is already registered or connected. No new number or WABA was created. Check Settings \u2192 WhatsApp, or connect the Meta account that owns the number first.',
      original: raw,
    };
  }
  if (/belongs? to.*different.*waba/.test(lower)) {
    return {
      display:
        'This phone number belongs to a different WhatsApp Business Account. Connect the Meta business that owns it, or keep the number in that WABA.',
      original: raw,
    };
  }
  if (/belongs? to.*different.*business/.test(lower)) {
    return {
      display:
        'This phone number belongs to a different Meta Business Account. Connect the Meta business that owns the number first.',
      original: raw,
    };
  }
  if (/coexist|eligible/.test(lower) && /not|no |un/i.test(lower)) {
    return {
      display:
        'Meta reports this WhatsApp number is not eligible for WhatsApp Business App + Cloud API coexistence. No new number was created. See the technical reason below (logged on the server).',
      original: raw,
    };
  }
  if (/permission/i.test(lower) || /\b(200|10)\b/.test(lower)) {
    return {
      display:
        'Meta rejected this action because the app is missing the required permission. Grant the permission in the Meta app and try again.',
      original: raw,
    };
  }
  if (NON_LATIN_RE.test(raw)) {
    return {
      display:
        'Meta returned an error for the Embedded Signup flow. The exact technical reason has been logged on the server.',
      original: raw,
    };
  }
  return { display: raw, original: raw };
}

export function EmbeddedSignupConnectCard() {
  const { accountId } = useAuth();

  const [status, setStatus] = useState<EmbeddedStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [result, setResult] = useState<EmbedResult | null>(null);
  // App id + config id are fetched from the server (public by nature) so
  // the SDK can load without duplicating them in client env vars.
  const [appId, setAppId] = useState(APP_ID);
  const [configId, setConfigId] = useState(CONFIG_ID);
  const [redirectUri, setRedirectUri] = useState('');

  useEffect(() => {
    setRedirectUri(currentRedirectUri());
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/whatsapp/embedded/status');
        const data = (await res.json()) as EmbeddedStatus;
        if (active) {
          setStatus(data);
          if (data.appId) setAppId(data.appId);
          if (data.configId) setConfigId(data.configId);
        }
      } catch {
        if (active) setStatus(null);
      } finally {
        if (active) setStatusLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [accountId]);

  const { launchSignup, ready, isSdkReady, isLaunching } = useWhatsAppEmbeddedSignup({
    appId,
    configId,
    redirectUri: redirectUri || undefined,
    extras: { featureType: 'whatsapp_business_app_onboarding' },
    onSuccess: async ({ code, sessionInfo, redirectUri }) => {
      if (!code) {
        toast.error('Meta did not return an authorization code.');
        return;
      }
      try {
        setConnecting(true);
        const res = await fetch('/api/whatsapp/embedded/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            redirectUri: redirectUri || undefined,
            session: sessionInfo
              ? {
                  business_id: sessionInfo.business_id ?? null,
                  waba_id: sessionInfo.waba_id ?? null,
                  phone_number_id: sessionInfo.phone_number_id ?? null,
                  current_step: sessionInfo.current_step ?? undefined,
                  error_message: sessionInfo.error_message ?? undefined,
                }
              : null,
          }),
        });
        const data = (await res.json()) as EmbedResult;
        setResult(data);
        if (data.success) {
          if (data.reused) {
            toast.success(
              `Already connected — reused your existing WhatsApp connection. No duplicate was created.`,
              { duration: 9000 },
            );
          } else if (data.coexistence) {
            toast.success(
              `WhatsApp Business App connected. Coexistence with Cloud API confirmed by Meta (${data.display_phone_number ?? data.phone_number_id ?? ''}).`,
              { duration: 9000 },
            );
          } else {
            toast.success(
              'WhatsApp Business App connected. Coexistence was not reported by Meta for this number — see below.',
              { duration: 9000 },
            );
          }
        } else {
          const normalized = normalizeMetaError(data.error ?? '');
          toast.error(
            normalized.display || 'Connection failed. Please try again.',
            { duration: 10000 },
          );
        }
      } catch (err) {
        console.error('Embedded connect failed:', err);
        setResult({
          success: false,
          coexistence: false,
          coexistence_meta: { is_on_biz_app: false, platform_type: '' },
          connection_method: 'embedded_signup',
          ready: false,
          error: 'Connection request failed. Check network and try again.',
        });
        toast.error('Connection request failed. Check network and try again.');
      } finally {
        setConnecting(false);
      }
    },
    onError: (err) => {
      console.error('Embedded signup error:', err);
      const details =
        typeof err.details === 'object' && err.details !== null
          ? (err.details as { error_message?: string })
          : null;
      const raw = details?.error_message || err.message || '';
      const normalized = normalizeMetaError(raw);
      if (normalized.original !== normalized.display) {
        // Original Meta message is kept in the console/server logs and never
        // shown raw to the user when it carries localized text.
        console.warn('Original Meta message:', normalized.original);
      }
      toast.error(normalized.display || 'Embedded signup failed.', {
        duration: 9000,
      });
    },
    onClose: () => {
      // Popup closed without completing — tell the user nothing changed.
      toast.info('Meta signup was cancelled — no changes were made.', {
        duration: 6000,
      });
    },
  });

  const notConfigured =
    status && !status.configured;
  const hasManual = status?.has_manual_connection ?? false;

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="text-foreground text-base flex items-center gap-2">
          <Zap className="size-4 text-primary" />
          Connect WhatsApp Business App
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          Meta Embedded Signup (v4) — connect a phone number that is managed by
          a WhatsApp Business App and use it alongside the Cloud API
          (coexistence). This works in addition to your existing connection and
          never modifies or disconnects it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {statusLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Checking Embedded Signup configuration…
          </div>
        ) : notConfigured ? (
          <Alert className="bg-amber-950/30 border-amber-700/50">
            <AlertTitle className="text-amber-200 text-sm flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-400" />
              Embedded Signup is not configured in this deployment
            </AlertTitle>
            <AlertDescription className="text-amber-100/80 text-sm leading-relaxed mt-1">
              To use this, set these environment variables (see .env.example):
              <br />
              <code className="text-xs">
                {status.missing.length > 0 ? status.missing.join(', ') : '(all set)'}
              </code>
              <span className="block mt-1">
                You also need a Meta app with the WhatsApp product and Facebook
                Login for Business configured. See Meta&apos;s
                <a
                  href="https://developers.facebook.com/docs/whatsapp/embedded-signup"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline px-1"
                >
                  Embedded Signup guide <ExternalLink className="size-3" />
                </a>
                .
              </span>
              <span className="block mt-1 text-amber-200/90">
                You can still click <b>Connect with Meta</b> below — the click
                will surface the exact missing-variable error so the deployment
                issue is visible.
              </span>
            </AlertDescription>
          </Alert>
        ) : null}

        {/* Always render the existing-number helper text + Connect with Meta
            button, even when env is missing. The launch hook surfaces a
            clear error in that case so deployment problems are visible
            instead of silently hidden. */}
        {!statusLoading && (
          <>
            <Alert className="bg-card border-border">
              <AlertDescription className="text-muted-foreground text-sm leading-relaxed space-y-2">
                <p>
                  Connect your{' '}
                  <span className="text-foreground font-medium">
                    existing WhatsApp Business number
                  </span>{' '}
                  to this CRM. Signing in with Meta will{' '}
                  <span className="text-foreground font-medium">
                    reuse the number and WhatsApp Business Account you already
                    own
                  </span>{' '}
                  — it links that Business App to this account instead of
                  creating a new number or WABA.
                </p>
                <div className="text-xs text-muted-foreground/90 space-y-0.5 border-l-2 border-border pl-3">
                  <p>1. Existing WhatsApp Business App</p>
                  <p>2. Existing Business Account</p>
                  <p>3. Existing WhatsApp phone number</p>
                  <p>4. Connect to CRM (coexist with Cloud API)</p>
                </div>
                {hasManual && (
                  <p className="text-xs">
                    Your existing Cloud API connection stays untouched — no
                    duplicates are created for the same number.
                  </p>
                )}
                {redirectUri && (
                  <p className="text-xs text-muted-foreground/70 break-all">
                    OAuth redirect URI:{' '}
                    <code className="text-[11px]">{redirectUri}</code>
                  </p>
                )}
              </AlertDescription>
            </Alert>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={launchSignup}
                disabled={!ready || connecting || isLaunching}
                className="bg-[#25D366] hover:bg-[#1fbd5b] text-[#0b1a10] font-semibold"
              >
                {connecting || isLaunching ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {connecting ? 'Verifying with Meta…' : 'Opening Facebook…'}
                  </>
                ) : (
                  <>
                    <Zap className="size-4" />
                    Connect with Meta
                  </>
                )}
              </Button>
              {!isSdkReady && !isLaunching && (
                <span className="text-xs text-muted-foreground">
                  Loading Facebook SDK…
                </span>
              )}
            </div>

            {result && (
              <div
                className={
                  result.success
                    ? 'mt-2 rounded border border-emerald-800/50 bg-emerald-950/30 px-3 py-2 text-sm'
                    : 'mt-2 rounded border border-red-800/50 bg-red-950/30 px-3 py-2 text-sm'
                }
              >
                {result.success ? (
                  <div className="space-y-1.5">
                    <p className="flex items-center gap-2 text-emerald-200 font-medium">
                      <CheckCircle2 className="size-4 text-emerald-400" />
                      {result.reused
                        ? 'WhatsApp Connected — existing connection reused'
                        : 'WhatsApp Connected'}
                    </p>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-emerald-100/80">
                      <dt className="text-emerald-100/60">Business:</dt>
                      <dd className="font-mono">
                        {result.verified_name ||
                          result.business_id ||
                          '(from signup)'}
                      </dd>
                      <dt className="text-emerald-100/60">WABA:</dt>
                      <dd className="font-mono">
                        {result.waba_id || '(provisioning)'}
                      </dd>
                      <dt className="text-emerald-100/60">Phone Number:</dt>
                      <dd className="font-mono">
                        {result.display_phone_number ??
                          result.phone_number_id ??
                          '(provisioning)'}
                      </dd>
                      <dt className="text-emerald-100/60">Phone Number ID:</dt>
                      <dd className="font-mono">
                        {result.phone_number_id || '(provisioning)'}
                      </dd>
                      <dt className="text-emerald-100/60">Cloud API:</dt>
                      <dd className="font-mono">Connected</dd>
                      <dt className="text-emerald-100/60">Webhook:</dt>
                      <dd className="font-mono">Active</dd>
                      <dt className="text-emerald-100/60">Inbound Messages:</dt>
                      <dd className="font-mono">Active</dd>
                      <dt className="text-emerald-100/60">
                        WhatsApp Business App:
                      </dt>
                      <dd className="font-mono">
                        {result.coexistence_meta.is_on_biz_app ||
                        result.coexistence
                          ? 'Connected'
                          : 'Not confirmed by Meta'}
                      </dd>
                      <dt className="text-emerald-100/60">Coexistence:</dt>
                      <dd className="font-mono">
                        {result.coexistence ? 'Active' : 'Not reported by Meta'}
                      </dd>
                    </dl>
                    {result.reused ? (
                      <p className="text-emerald-100/80 text-xs">
                        The existing WhatsApp configuration for this number was
                        updated in place — no duplicate WABA, business, or phone
                        number was created.
                      </p>
                    ) : result.coexistence ? (
                      <p className="text-emerald-100/80 text-xs">
                        Meta reports is_on_biz_app=true and platform_type=
                        CLOUD_API — this number is live on both the WhatsApp
                        Business App and the Cloud API, alongside your existing
                        connection.
                      </p>
                    ) : (
                      <p className="text-amber-100/80 text-xs">
                        Meta did not report coexistence status for this number.
                        It may still be provisioning — click “Verify with Meta”
                        on the connection card below to re-check. Existing
                        connections are unaffected.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="flex items-center gap-2 text-red-200 font-medium">
                      <XCircle className="size-4 text-red-400" />
                      Connection failed
                    </p>
                    <p className="text-red-100/80 text-xs">{result.error}</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}